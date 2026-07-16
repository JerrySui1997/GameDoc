import { redirect } from 'next/navigation';

// Every custom workspace is seeded with a 'welcome' doc at creation time (see
// dashboard/actions.ts's createWorkspaceAction) — mirrors (personal)/app's
// redirect to its own seeded 'welcome' doc.
export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${workspaceId}/docs/welcome`);
}
