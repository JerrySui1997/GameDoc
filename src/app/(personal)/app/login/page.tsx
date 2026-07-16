import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { auth, signIn } from '@/auth';
import { EmailLoginForm, type EmailState } from './EmailLoginForm';

// Force dynamic for the same reason as the legacy (site)/login page: auth()
// reads cookies, so this must never be statically prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function PersonalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/app');

  const { next } = await searchParams;
  // Only ever hand the OAuth/email flow a same-space redirect target — never an
  // arbitrary open redirect from the query string.
  const redirectTo = next && next.startsWith('/app') ? next : '/app';

  async function withGoogle() {
    'use server';
    await signIn('google', { redirectTo });
  }

  async function withGitHub() {
    'use server';
    await signIn('github', { redirectTo });
  }

  async function withEmail(prevState: EmailState, formData: FormData): Promise<EmailState> {
    'use server';
    const email = String(formData.get('email') || '').trim();
    if (!email) {
      return { status: 'error', message: 'Enter your email address to continue.' };
    }
    try {
      // signIn throws a NEXT_REDIRECT to drive the verify-request navigation;
      // re-throw it so the framework completes the redirect instead of
      // collapsing it into the catch's generic error message.
      await signIn('nodemailer', { email, redirectTo });
    } catch (err) {
      if (isRedirectError(err)) throw err;
      // Configuration / dispatch failure (e.g. missing secret, no EMAIL_SERVER
      // in production). Surface a concise generic message — never the raw
      // cause, which may include server-internal details.
      return {
        status: 'error',
        message: 'Could not send a sign-in link. If this keeps happening, contact the site owner.',
      };
    }
    // Reached only when signIn resolved without a redirect (defensive): treat
    // as success since Auth.js has accepted the magic-link dispatch.
    return {
      status: 'sent',
      message: 'Check your inbox for a sign-in link.',
    };
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">Game Design</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Sign in to your workspace</h1>
          <p className="mt-2 text-sm text-muted">
            A private space for your own docs, collections, and templates — separate from the main site.
          </p>
        </div>

        <div className="space-y-2.5">
          <form action={withGoogle}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-canvas px-4 py-2.5 text-sm font-semibold text-ink hover:bg-brass-soft"
            >
              Continue with Google
            </button>
          </form>
          <form action={withGitHub}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-canvas px-4 py-2.5 text-sm font-semibold text-ink hover:bg-brass-soft"
            >
              Continue with GitHub
            </button>
          </form>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />
          or
          <div className="h-px flex-1 bg-line" />
        </div>

        <EmailLoginForm action={withEmail} />

        <p className="text-xs text-muted">
          Blocked in mainland China? Google and GitHub are both behind the Great Firewall — use email sign-in instead.
        </p>
      </div>
    </main>
  );
}
