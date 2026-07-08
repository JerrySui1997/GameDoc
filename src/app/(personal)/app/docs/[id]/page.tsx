import { DocView } from '@/components/docs/DocView';
import { readDocs } from '@/lib/docs/store';
import { auth } from '@/auth';

export default async function PersonalDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docId = decodeURIComponent(id);
  // The layout above already gates on session presence, so `session.user.id`
  // is always populated here.
  const session = await auth();
  const userId = session!.user.id;

  const doc = (await readDocs({ userId })).find((d) => d.id === docId);
  return (
    <DocView
      key={docId}
      docId={docId}
      initialBody={doc?.body ?? null}
      basePath="/app/docs"
      rootHref="/app"
      roomId={`user:${userId}:${docId}`}
    />
  );
}
