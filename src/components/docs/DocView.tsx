'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useDocs } from './DocsProvider';
import { InlinePrompt, slugify } from './inline';
import { RelatedPanel } from './RelatedPanel';

// The collaborative editor talks to the y-websocket relay from the browser only,
// so it must never run on the server. Loading it ssr:false keeps DocView (and the
// SSR pass) free of any Yjs/WebSocket imports.
const LiveEditor = dynamic(
  () => import('./LiveEditor').then((m) => m.LiveEditor),
  {
    ssr: false,
    loading: () => <div className="min-h-[50vh] animate-pulse rounded-lg bg-line-soft" aria-hidden />,
  },
);

/** The one page editor: prose + structured widget blocks, for every page. */
export function DocView({ docId }: { docId: string }) {
  const { getById, docs, createDoc, deleteDoc, editing } = useDocs();
  const router = useRouter();
  const doc = getById(docId);
  const agentLabel = editing[docId];

  const [error, setError] = useState<string | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!doc) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-muted">
        No documentation page found for <code className="text-ink">{docId}</code>.
      </div>
    );
  }

  const children = docs.filter((d) => d.parentId === doc.id);

  async function addChild(childTitle: string) {
    const id = slugify(childTitle);
    if (!id) { setError('Enter a title with at least one letter or number'); return; }
    try {
      const created = await createDoc({ id, title: childTitle, parentId: doc!.id, body: '' });
      setAddingChild(false);
      router.push(`/docs/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add child');
    }
  }

  async function remove() {
    try {
      const parentId = doc!.parentId;
      await deleteDoc(doc!.id);
      router.push(parentId ? `/docs/${parentId}` : '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <article className="w-full space-y-4">
      {agentLabel && (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-brass/40 bg-brass-soft px-3 py-2 text-sm font-medium text-brass"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brass" />
          </span>
          <span>✨ {agentLabel} is editing this page…</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-4">
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => { setAddingChild((v) => !v); setError(null); }}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-canvas"
          >
            Add child
          </button>
          <button
            onClick={() => { setConfirmDelete(true); setError(null); }}
            className="rounded-lg border border-oxblood/30 px-3 py-1.5 text-sm font-semibold text-oxblood hover:bg-oxblood-soft"
          >
            Delete
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-oxblood-soft px-3 py-2 text-sm text-oxblood">{error}</p>}

      {addingChild && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">New child page</p>
          <InlinePrompt
            placeholder="Child page title"
            submitLabel="Create"
            onSubmit={addChild}
            onCancel={() => { setAddingChild(false); setError(null); }}
          />
        </div>
      )}

      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-oxblood/30 bg-oxblood-soft p-3">
          <p className="text-sm text-oxblood">
            Delete <span className="font-semibold">{doc.title}</span>? Child pages move up one level.
          </p>
          <div className="flex gap-2">
            <button
              onClick={remove}
              className="rounded-lg bg-oxblood px-3 py-1.5 text-sm font-semibold text-white hover:bg-oxblood/90"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <LiveEditor docId={doc.id} />

      <RelatedPanel docId={doc.id} />

      {children.length > 0 && (
        <section className="pt-6">
          <h2 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">Child pages</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {children
              .sort((a, b) => a.order - b.order)
              .map((child) => (
                <li key={child.id}>
                  <a
                    href={`/docs/${child.id}`}
                    className="block rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink hover:border-brass hover:bg-brass-soft"
                  >
                    {child.title}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
    </article>
  );
}
