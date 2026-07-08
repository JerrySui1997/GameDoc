import { LoginForm } from './LoginForm';

// Force dynamic so this route is never statically prerendered with the app shell
// at build time (when the gate is off, the layout would otherwise bake the
// sidebar's doc tree into a static /login). At runtime the root layout re-runs
// its auth check per request and renders the bare shell around this form, so the
// login screen can't leak the doc tree to logged-out visitors.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <LoginForm />
    </main>
  );
}
