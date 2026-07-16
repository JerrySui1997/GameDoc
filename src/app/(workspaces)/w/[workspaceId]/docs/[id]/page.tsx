import { DocView } from '@/components/docs/DocView';
import { readDocs } from '@/lib/docs/store';
import { getWorkspace } from '@/lib/workspaces/access';
import { docsScopeFor, roomIdFor } from '@/lib/workspaces/constants';
import { notFound } from 'next/navigation';

export default async function WorkspaceDocPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>;
}) {
  const { workspaceId, id } = await params;
  const docId = decodeURIComponent(id);

  // Access is already gated by the parent layout (canAccess check there) —
  // this just needs the workspace row to resolve the right scope/room.
  const ws = await getWorkspace(workspaceId);
  if (!ws) notFound();

  const doc = (await readDocs(docsScopeFor(ws))).find((d) => d.id === docId);

  return (
    <DocView
      key={docId}
      docId={docId}
      initialBody={doc?.body ?? null}
      basePath={`/w/${workspaceId}/docs`}
      rootHref={`/w/${workspaceId}`}
      roomId={roomIdFor(ws, docId)}
    />
  );
}
