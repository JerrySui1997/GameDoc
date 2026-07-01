import { clsx } from 'clsx';
import { toneStyle, type Badge } from '@/lib/templates/types';
import { itemPrimary, LABEL_COLUMN, type Collection } from '@/lib/collections/types';

// ── Reusable presentational widgets ───────────────────────────────────────
// These are the building blocks extracted from the original NightmareCard.
// They are pure and generic: a template binds each one to a data field, and
// the same set composes any "specialized page" (character, map, item, …).

/** Card header: node id, title, and an optional colored status badge. */
export function PageHeader({
  id,
  title,
  badge,
}: {
  id?: string;
  title: string;
  badge?: Badge | null;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-ink text-white rounded-t-xl">
      <div className="flex items-center gap-2">
        {id && <span className="font-mono text-xs text-white/50">{id.toUpperCase()}</span>}
        <span className="text-base font-bold tracking-wide">{title}</span>
      </div>
      {badge?.label && (
        <span className={clsx('px-2 py-0.5 rounded border text-xs font-semibold', toneStyle(badge.tone))}>
          {badge.label}
        </span>
      )}
    </div>
  );
}

/** A labeled single-value row. Highlight renders it as an amber callout. */
export function LabeledRow({
  label,
  highlight = false,
  children,
}: {
  label: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col sm:flex-row gap-1 sm:gap-3 px-4 py-2.5 border-t border-line-soft',
        highlight && 'bg-brass-soft',
      )}
    >
      <dt className="w-28 shrink-0 font-mono text-xs font-semibold uppercase tracking-wide text-muted pt-0.5">
        {label}
      </dt>
      <dd className={clsx('flex-1 text-sm text-ink', highlight && 'font-medium')}>{children}</dd>
    </div>
  );
}

/** A single colored badge. */
export function WidgetBadge({ badge }: { badge: Badge }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
        toneStyle(badge.tone),
      )}
    >
      {badge.label}
    </span>
  );
}

/** A wrapping list of colored badges, rendered inside a labeled row. */
export function BadgeList({ label, badges }: { label: string; badges: Badge[] }) {
  return (
    <LabeledRow label={label}>
      {badges.length === 0 ? (
        <span className="text-muted">—</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <WidgetBadge key={i} badge={b} />
          ))}
        </div>
      )}
    </LabeledRow>
  );
}

/** A labeled banner of plain chips (e.g. contract values, design space). */
export function TagList({
  label,
  tags,
  tone = 'slate',
}: {
  label: string;
  tags: string[];
  tone?: string;
}) {
  return (
    <div className="px-4 py-2.5 border-t border-line-soft bg-canvas">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted mb-1">{label}</p>
      {tags.length === 0 ? (
        <span className="text-xs text-muted">—</span>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <li key={i} className={clsx('text-xs px-2 py-0.5 rounded border bg-surface', toneStyle(tone))}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A live collection embedded in a page. A single-column (list/inline)
 * collection renders as wrapping chips; a multi-column (table) collection
 * renders as a compact table. The collection is resolved by id elsewhere and
 * passed in — this widget stays purely presentational.
 */
export function CollectionView({
  label,
  collection,
}: {
  label: string;
  collection: Collection | null;
}) {
  if (!collection) {
    return (
      <LabeledRow label={label}>
        <span className="text-muted">Collection not found</span>
      </LabeledRow>
    );
  }

  const isSingle = collection.columns.length === 1 && collection.columns[0] === LABEL_COLUMN;

  return (
    <div className="px-4 py-2.5 border-t border-line-soft">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
        <span className="font-mono text-[10px] text-muted">{collection.name}</span>
      </div>

      {collection.items.length === 0 ? (
        <span className="text-xs text-muted">—</span>
      ) : isSingle ? (
        <ul className="flex flex-wrap gap-1.5">
          {collection.items.map((item) => (
            <li key={item.id} className="rounded border border-line bg-surface px-2 py-0.5 text-xs text-muted">
              {itemPrimary(item, collection.columns)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-canvas">
                {collection.columns.map((col) => (
                  <th key={col} className="px-2.5 py-1.5 font-semibold text-muted">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {collection.items.map((item) => (
                <tr key={item.id} className="border-t border-line-soft">
                  {collection.columns.map((col) => (
                    <td key={col} className="px-2.5 py-1.5 text-ink">{item.values[col] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A list of links to other tree nodes by id. */
export function RefList({
  label,
  refs,
  resolve,
}: {
  label: string;
  refs: string[];
  /** Resolve a node id to a display title (falls back to the id). */
  resolve: (id: string) => string | undefined;
}) {
  if (refs.length === 0) return null;
  return (
    <div className="px-4 py-2.5 border-t border-line-soft">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {refs.map((id) => (
          <a
            key={id}
            href={`/docs/${id}`}
            className="text-xs px-2 py-0.5 rounded border border-line bg-surface text-ink hover:border-brass hover:bg-canvas"
          >
            {resolve(id) ?? id}
          </a>
        ))}
      </div>
    </div>
  );
}
