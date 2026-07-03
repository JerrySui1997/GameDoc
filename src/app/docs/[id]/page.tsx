import { DocView } from '@/components/docs/DocView';

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docId = decodeURIComponent(id);
  // key by docId so DocView (and its static-paint → live-editor swap state)
  // remounts fresh on every navigation instead of carrying `live` across pages.
  return <DocView key={docId} docId={docId} />;
}
