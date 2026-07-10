import { DocView } from '@/components/docs/DocView';
import { readDocs } from '@/lib/docs/store';

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docId = decodeURIComponent(id);
  // The layout ships the docs tree body-less, so this route supplies the one
  // body the first paint actually needs: this page's own, for StaticDocBody.
  // readDocs is mtime-memoized, so this is a cache hit right after the layout.
  const doc = (await readDocs()).find((d) => d.id === docId);
  // key by docId so DocView (and its static-paint → live-editor swap state)
  // remounts fresh on every navigation instead of carrying `live` across pages.
  return <DocView key={docId} docId={docId} initialBody={doc?.body ?? null} />;
}
