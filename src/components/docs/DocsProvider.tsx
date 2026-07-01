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
  updateDoc: (id: string, patch: Partial<Omit<DocNode, 'id'>>) => Promise<DocNode>;
  /** Structural, body-preserving update via PATCH. Unlike updateDoc this never
   *  sends `body`, so it can edit sidebar metadata (e.g. the hierarchy `hue`)
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
  children,
}: {
  initialDocs: DocNode[];
  children: React.ReactNode;
}) {
  const [docs, setDocs] = useState<DocNode[]>(initialDocs);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [agentRevisions, setAgentRevisions] = useState<Record<string, number>>({});

  const getById = useCallback((id: string) => docs.find((d) => d.id === id), [docs]);

  // Apply a doc change pushed by an out-of-band writer (the MCP) into local
  // state. Mirrors the setDocs shapes used by create/update/deleteDoc below so
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
  useEffect(() => {
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
          fetch('/api/docs')
            .then((res) => (res.ok ? res.json() : null))
            .then((fresh: DocNode[] | null) => { if (fresh) setDocs(fresh); })
            .catch(() => { /* transient; next change or reload recovers */ });
          break;
      }
    };
    return () => source.close();
  }, [applyCommit]);

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

    const res = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseError(res));

    const created: DocNode = await res.json();
    setDocs((prev) => [...prev, created]);
    return created;
  }, [docs]);

  const updateDoc = useCallback<DocsContextValue['updateDoc']>(async (id, patch) => {
    const current = docs.find((d) => d.id === id);
    if (!current) throw new Error(`Doc "${id}" not found`);
    const { id: _ignore, ...rest } = { ...current, ...patch };

    const res = await fetch(`/api/docs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    });
    if (!res.ok) throw new Error(await parseError(res));

    const updated: DocNode = await res.json();
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, [docs]);

  const patchDoc = useCallback<DocsContextValue['patchDoc']>(async (id, patch) => {
    const res = await fetch(`/api/docs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await parseError(res));

    const updated: DocNode = await res.json();
    setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, []);

  const patchLocalDoc = useCallback<DocsContextValue['patchLocalDoc']>((id, patch) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const deleteDoc = useCallback<DocsContextValue['deleteDoc']>(async (id) => {
    const res = await fetch(`/api/docs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseError(res));

    const target = docs.find((d) => d.id === id);
    setDocs((prev) =>
      prev
        .filter((d) => d.id !== id)
        .map((d) => (d.parentId === id ? { ...d, parentId: target?.parentId ?? null } : d)),
    );
  }, [docs]);

  const value = useMemo<DocsContextValue>(
    () => ({ docs, tree: buildDocTree(docs), getById, createDoc, updateDoc, patchDoc, patchLocalDoc, deleteDoc, editing, agentRevisions }),
    [docs, getById, createDoc, updateDoc, patchDoc, patchLocalDoc, deleteDoc, editing, agentRevisions],
  );

  return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error('useDocs must be used within a DocsProvider');
  return ctx;
}
