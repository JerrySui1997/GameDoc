'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { createWorkspace } from '@/lib/workspaces/access';
import { writeDocs } from '@/lib/docs/store';
import { serializeBlocks, emptyProse } from '@/lib/docs/blocks';

export async function createWorkspaceAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect('/app/login');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const ws = await createWorkspace(session.user.id, name);
  await writeDocs(
    [
      {
        id: 'welcome',
        title: 'Welcome',
        parentId: null,
        order: 0,
        body: serializeBlocks([
          emptyProse('heading1', `Welcome to ${name}`),
          emptyProse('paragraph', 'Use the + button in the sidebar to create your first page.'),
        ]),
      },
    ],
    { workspaceId: ws.id },
  );

  redirect(`/w/${ws.id}`);
}
