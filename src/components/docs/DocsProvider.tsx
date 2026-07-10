'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { DocNode } from '@/lib/schema/doc';
import { buildDocTree, type DocTreeNode } from '@/lib/schema/doc';
import type { ServerMessage } from '@/lib/agent/bus';

type DocsContextValue = {
  docs: DocNode[];
  tree: DocTreeNode[];
  getById: (id: string) => DocNode | undefined;
  createDoc: (input: Pick<DocNode, 'id' | 'title' | 'parentId'> & Partial<DocNode>) => Promise<DocNode>;
  /** Structural, body-preserving update via PATCH. This never sends `body`, so
   *  it can edit sidebar metadata (e.g. the hierarchy `hue` or drag-reorder)
   *  even on a page being live-edited via Yjs without reverting its text. */
  patchDoc: (id: string, patch: Partial<Omit<DocNode, 'id' | 'body'>>) => Promise<DocNode>;
  /** Update the in-memory snapshot only (no fetch). Reflects a live,
   *  collaboratively-edited field (e.g. title) in this client's own sidebar
   *  without PUTting a now-stale `body` back over the Yjs-managed page. */
  patchLocalDoc: (id: string, patch: Partial<Omit<DocNode, 'id'>>) => void;
  deleteDoc: (id: string) => Promise<void>;
  /** docId → agent label, for pages an AI agent is currently editing via the MCP. */
  editing: Record<string, string>;
  /** docId → counter, bumped on each agent commit so open editors can remount (agent wins). */
  agentRevisions: Record<string, number>;
};

const DocsContext = createContext<DocsContextValue | null>(null);

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error ?? data);
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function DocsProvider({
  initialDocs,
  apiBase = '/api/docs',
  enableAgentStream = true,
  children,
}: {
  initialDocs: DocNode[];
  /** Personal spaces (src/app/(personal)/app) point this at /api/app/docs. */
  apiBase?: string;
  /** The agent-edit SSE stream (src/lib/agent/bus.ts) is a flat, unscoped
   *  singleton with no per-user concept — personal spaces disable it rather
   *  than leak into the owner's/other users' streams. */
  enableAgentStream?: boolean;
  children: React.ReactNode;
}) {
  const [docs, setDocs] = useState<DocNode[]>(initialDocs);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [agentRevisions, setAgentRevisions] = useState<Record<string, number>>({});

  const getById = useCallback((id: string) => docs.find((d) => d.id === id), [docs]);

  // Hydrate page bodies in the background. The server layout deliberately ships
  // `initialDocs` with empty bodies — 40 pages of body text on every full load
  // was the single largest chunk of the HTML/RSC payload, and only cross-page
  // consumers (related panel, @mention excerpts, character/timeline widgets)
  // need other pages' bodies. One fetch fills them in a beat after first paint.
  // Fill-only merge: a doc that already has a body (created or agent-committed
  // since mount) keeps it, and docs deleted since mount are not resurrected.
  useEffect(() => {
    let cancelled = false;
    fetch(apiBase)
      .then((res) => (res.ok ? res.json() : null))
      .then((fresh: DocNode[] | null) => {
        if (!fresh || cancelled) return;
        const byId = new Map(fresh.map((d) => [d.id, d]));
        setDocs((prev) => prev.map((d) => (d.body === '' ? { ...d, body: byId.get(d.id)?.body ?? '' } : d)));
      })
      .catch(() => { /* transient; the tree.changed refetch or a reload recovers */ });
    return () => { cancelled = true; };
  }, [apiBase]);

  // Apply a doc change pushed by an out-of-band writer (the MCP) into local
  // state. Mirrors the setDocs shapes used by create/patch/deleteDoc below so
  // the tree, sidebar, and open page all stay consistent.
  const applyCommit = useCallback((action: 'created' | 'updated' | 'deleted', docId: string, doc?: DocNode) => {
    if (action === 'deleted') {
      setDocs((prev) => {
        const target = prev.find((d) => d.id === docId);
        return prev
          .filter((d) => d.id !== docId)
          .map((d) => (d.parentId === docId ? { ...d, parentId: target?.parentId ?? null } : d));
      });
    } else if (doc) {
      setDocs((prev) => (prev.some((d) => d.id === doc.id) ? prev.map((d) => (d.id === doc.id ? doc : d)) : [...prev, doc]));
    }
    // Bump the per-doc revision so an editor open on this page remounts with the
    // agent's body — the agent-wins policy, even over unsaved local edits.
    setAgentRevisions((prev) => ({ ...prev, [docId]: (prev[docId] ?? 0) + 1 }));
  }, []);

  // Subscribe to the live agent-edit stream. Best-effort: if the endpoint is
  // unavailable the EventSource simply keeps retrying; the app works without it.
  // Personal spaces disable this — see enableAgentStream's doc comment above.
  useEffect(() => {
    if (!enableAgentStream) return;
    const source = new EventSource('/api/agent/stream');
    source.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'presence':
          setEditing(Object.fromEntries(msg.editing.map((p) => [p.docId, p.agent])));
          break;
        case 'edit.start':
          setEditing((prev) => ({ ...prev, [msg.docId]: msg.agent }));
          break;
        case 'edit.commit':
          setEditing((prev) => ({ ...prev, [msg.docId]: msg.agent }));
          applyCommit(msg.action, msg.docId, msg.doc);
          break;
        case 'edit.stop':
          setEditing((prev) => {
            if (!(msg.docId in prev)) return prev;
            const next = { ...prev };
            delete next[msg.docId];
            return next;
          });
          break;
        case 'tree.changed':
          // A peer created/deleted/reparented a page via REST — refetch the tree
          // so this client's sidebar reflects it live. (Page *content* and title
          // sync through Yjs, not here.)
          fetch(apiBase)
            .then((res) => (res.ok ? res.json() : null))
            .then((fresh: DocNode[] | null) => { if (fresh) setDocs(fresh); })
            .catch(() => { /* transient; next change or reload recovers */ });
          break;
      }
    };
    return () => source.close();
  }, [applyCommit, apiBase, enableAgentStream]);

  const createDoc = useCallback<DocsContextValue['createDoc']>(async (input) => {
    const siblings = docs.filter((d) => d.parentId === input.parentId);
    const order = input.order ?? siblings.length;
    const payload: DocNode = {
      id: input.id,
      title: input.title,
      parentId: input.parentId,
      order,
      body: input.body ?? '',
    };

    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));

    const created: DocNode = await res.json();
    setDocs((prev) => [...prev, created]);
    return created;
  }, [docs, apiBase]);

  const patchDoc = useCallback<DocsContextValue['patchDoc']>(async (id, patch) => {
    const res = await fetch(`${apiBase}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await parseError(res));

    const updated: DocNode = await res.json();
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, [apiBase]);

  const patchLocalDoc = useCallback<DocsContextValue['patchLocalDoc']>((id, patch) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const deleteDoc = useCallback<DocsContextValue['deleteDoc']>(async (id) => {
    const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseError(res));

    const target = docs.find((d) => d.id === id);
    setDocs((prev) =>
      prev
        .filter((d) => d.id !== id)
        .map((d) => (d.parentId === id ? { ...d, parentId: target?.parentId ?? null } : d)),
    );
  }, [docs, apiBase]);

  const value = useMemo<DocsContextValue>(
    () => ({ docs, tree: buildDocTree(docs), getById, createDoc, patchDoc, patchLocalDoc, deleteDoc, editing, agentRevisions }),
    [docs, getById, createDoc, patchDoc, patchLocalDoc, deleteDoc, editing, agentRevisions],
  );

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error('useDocs must be used within a DocsProvider');
  return ctx;
}
