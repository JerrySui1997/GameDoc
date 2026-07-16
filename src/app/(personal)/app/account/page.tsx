import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getAccountProfile, listLinkedProviders } from '@/lib/auth/account';
import { updateDisplayNameAction } from './actions';

const CARD_CLASS = 'rounded-xl border border-line bg-surface p-4';

function initialsFor(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || '?';
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return source[0].toUpperCase();
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  nodemailer: 'Email link',
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect('/app/login');

  const profile = await getAccountProfile(session.user.id);
  if (!profile) redirect('/app/login');

  const providers = await listLinkedProviders(session.user.id);

  const AVATAR_CLASS =
    'flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-line bg-canvas text-lg font-semibold text-ink';

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brass">Account</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Settings</h1>
      </header>

      <section className={`${CARD_CLASS} mb-6`}>
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Profile</h2>
        <div className="flex items-center gap-4">
          {profile.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.image} alt="" className={AVATAR_CLASS} />
          ) : (
            <span className={AVATAR_CLASS}>{initialsFor(profile.name, profile.email)}</span>
          )}
          <form action={updateDisplayNameAction} className="flex flex-1 flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-muted">Display name</span>
              <input
                type="text"
                name="name"
                required
                defaultValue={profile.name ?? ''}
                placeholder="Your name"
                className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brass focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Save
            </button>
          </form>
        </div>

        <div className="mt-4 border-t border-line-soft pt-3">
          <span className="mb-1 block text-xs font-medium text-muted">Email</span>
          <div className="flex items-center gap-2">
            <p className="text-sm text-ink">{profile.email ?? 'No email on file'}</p>
            {profile.email && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  profile.emailVerified ? 'bg-teal/15 text-teal' : 'bg-oxblood/15 text-oxblood'
                }`}
              >
                {profile.emailVerified ? 'Verified' : 'Unverified'}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className={`${CARD_CLASS} mb-6`}>
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Connected accounts</h2>
        {providers.length === 0 ? (
          <p className="text-sm text-muted">No connected sign-in providers.</p>
        ) : (
          <ul className="space-y-2">
            {providers.map((p) => (
              <li
                key={`${p.provider}:${p.providerAccountId}`}
                className="rounded-lg border border-line-soft px-3 py-2 text-sm text-ink"
              >
                {PROVIDER_LABELS[p.provider] ?? p.provider}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Billing</h2>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink">Free plan</p>
            <p className="text-xs text-muted">Payment details coming soon.</p>
          </div>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg border border-line px-3 py-1.5 text-sm text-muted opacity-60"
          >
            Add payment method
          </button>
        </div>
      </section>
    </div>
  );
}
