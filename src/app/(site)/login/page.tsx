import { redirect } from 'next/navigation';

// Retired (Plan 06 Phase 1): the shared-password login lived here before the
// site moved to real NextAuth sessions. Kept as a redirect so old bookmarks
// and links still land somewhere useful, since /app/login is now the one
// login page for both the flagship site and /app/*.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : undefined;
  redirect(next ? `/app/login?next=${encodeURIComponent(next)}` : '/app/login');
}
