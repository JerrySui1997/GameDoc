import { auth } from '@/auth';

// Every /api/app/* route resolves the session's userId this way and 401s if
// absent. Middleware (src/middleware.ts) already blocks unauthenticated
// requests from reaching these routes, but it has no way to inject the
// userId itself — each handler needs it to scope its readDocs/writeDocs (etc.)
// call, so it re-resolves the session here.
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
