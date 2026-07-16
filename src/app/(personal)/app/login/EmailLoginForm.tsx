'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

// Client component for the email magic-link form. The server action lives in
// the page (page.tsx) and is passed in; this component only renders the
// submitting / success-verify-request / error states, so a configuration or
// dispatch failure is never a silent no-op. The successful path is a redirect
// to Auth.js's verify-request page, which `signIn('nodemailer', …)` issues by
// throwing a NEXT_REDIRECT error from the server action — `useActionState`
// surfaces that to the framework so the navigation is not swallowed. Any
// *other* thrown error collapses to the generic message below; raw server
// causes are never shipped to the browser.

export type EmailState = {
  status: 'idle' | 'sent' | 'error';
  message?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Sending magic link…' : 'Continue with email'}
    </button>
  );
}

export function EmailLoginForm({
  action,
}: {
  action: (state: EmailState, formData: FormData) => Promise<EmailState>;
}) {
  const [state, formAction] = useActionState<EmailState, FormData>(action, {
    status: 'idle',
  });

  return (
    <form action={formAction} className="space-y-2.5">
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        aria-invalid={state.status === 'error'}
        className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-brass focus:outline-none"
      />
      {state.status === 'sent' && (
        <p className="text-sm text-brass" role="status">
          {state.message ?? 'Check your inbox for a sign-in link.'}
        </p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-oxblood" role="alert">
          {state.message ?? 'Could not send sign-in link. Please try again.'}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
