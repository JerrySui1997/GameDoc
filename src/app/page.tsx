import { redirect } from 'next/navigation';

// The site root now leads with the game overview rather than the legacy
// nightmare-design-system landing page. The old ladder/glossary tools still
// exist at their own routes for reference, but they're no longer the front door.
export default function HomePage() {
  redirect('/docs/overview');
}
