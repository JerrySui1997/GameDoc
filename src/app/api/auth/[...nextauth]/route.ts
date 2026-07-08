import { handlers } from '@/auth';

// OAuth callback + magic-link verification endpoint itself — must stay
// reachable with no gate (neither the legacy SITE_PASSWORD check nor the new
// personal-space session check). src/middleware.ts exempts /api/auth/* first,
// before any other branch.
export const { GET, POST } = handlers;
