'use server';

import { redirect } from 'next/navigation';
import { auth, unstable_update } from '@/auth';
import { updateDisplayName } from '@/lib/auth/account';

export async function updateDisplayNameAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect('/app/login');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  await updateDisplayName(session.user.id, name);
  // Refreshes the JWT cookie so the new name shows up in every
  // ProfileMenu-bearing layout (site/personal/workspace), not just after a
  // later sign-in — see auth.config.ts's jwt callback for the merge side.
  await unstable_update({ user: { name } });

  // A plain <form action> auto-refresh re-renders using the cookies already
  // attached to *this* request, before the Set-Cookie above reaches the
  // browser — so layouts (sidebar ProfileMenu) would show the previous name
  // for one cycle. redirect() forces a real follow-up GET that carries the
  // new cookie, so every surface is in sync after a single save.
  redirect('/app/account');
}
