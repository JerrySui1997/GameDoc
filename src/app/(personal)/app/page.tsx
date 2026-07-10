import { redirect } from 'next/navigation';

// Every personal space is seeded with a 'welcome' doc on first sign-in (see
// events.createUser in src/auth.ts) — mirrors (site)/page.tsx's redirect to
// the owner's /docs/overview.
export default function PersonalHomePage() {
  redirect('/app/docs/welcome');
}
