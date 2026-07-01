import { DocView } from '@/components/docs/DocView';

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocView docId={decodeURIComponent(id)} />;
}
