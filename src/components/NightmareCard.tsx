import { clsx } from 'clsx';
import type { NightmareRecord } from '@/lib/schema/nightmare';
import { EvidenceBadge }  from './EvidenceBadge';
import { NightmareLink }  from './NightmareLink';
import { getNightmareById } from '@/data/nightmares';

// ── Tier badge styling ────────────────────────────────────────────────────

const TIER_STYLE: Record<string, string> = {
  '1':   'bg-green-100  text-green-800  border-green-200',
  '2':   'bg-yellow-100 text-yellow-800 border-yellow-200',
  '3':   'bg-red-100    text-red-800    border-red-200',
  '2-3': 'bg-orange-100 text-orange-800 border-orange-200',
};

function tierLabel(tier: NightmareRecord['tier']): string {
  return `Tier ${tier}`;
}

// ── Row helpers ───────────────────────────────────────────────────────────

function Row({ label, children, highlight = false }: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={clsx(
      'flex flex-col sm:flex-row gap-1 sm:gap-3 px-4 py-2.5 border-t border-gray-100',
      highlight && 'bg-amber-50',
    )}>
      <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400 pt-0.5">
        {label}
      </dt>
      <dd className="flex-1 text-sm text-gray-700">{children}</dd>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────

interface NightmareCardProps {
  record: NightmareRecord;
  /** When true, wraps the card header in an <a> linking to the detail page */
  linked?: boolean;
}

export function NightmareCard({ record, linked = false }: NightmareCardProps) {
  const {
    id, codename, tier, teaches, evidence,
    personality, fearOfLight, hunt, haunt,
    states, signature, capture, failLooksLike,
    personaFixed, personaFree, recombines,
  } = record;

  const tierKey = String(tier);

  const header = (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white rounded-t-xl">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-400">{id.toUpperCase()}</span>
        <span className="text-base font-bold tracking-wide">{codename}</span>
      </div>
      <span className={clsx(
        'px-2 py-0.5 rounded border text-xs font-semibold',
        TIER_STYLE[tierKey] ?? 'bg-gray-100 text-gray-700 border-gray-200',
      )}>
        {tierLabel(tier)}
      </span>
    </div>
  );

  return (
    <article className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      {linked
        ? <a href={`/nightmare/${id}`} className="block hover:bg-slate-800 transition-colors">{header}</a>
        : header
      }

      {/* Teaches */}
      <div className="px-4 py-2 bg-slate-50 border-t border-gray-100">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Teaches</p>
        <p className="text-sm text-slate-700 mt-0.5">{teaches}</p>
      </div>

      <dl className="divide-y divide-gray-100">
        {/* Evidence */}
        <Row label="Evidence">
          <div className="flex flex-wrap gap-1.5">
            {evidence.map((e, i) => (
              <EvidenceBadge key={i} entry={e} />
            ))}
          </div>
        </Row>

        {/* Behavior */}
        <Row label="Behavior">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="font-medium">{personality}</span>
            {fearOfLight && (
              <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-200 font-medium">
                Fear of Light
              </span>
            )}
            <span className="text-gray-500">Hunt: {hunt.join(' → ')}</span>
            {haunt !== 'none' && (
              <span className="text-gray-500">Haunt: {haunt}</span>
            )}
          </div>
        </Row>

        {/* States */}
        <Row label="States">
          {states}
        </Row>

        {/* Signature — highlighted */}
        <Row label="Signature" highlight>
          <span className="font-medium">{signature}</span>
        </Row>

        {/* Capture */}
        <Row label="Capture">
          {capture}
        </Row>

        {/* Fail */}
        <Row label="Fail looks like">
          <span className="italic text-gray-500">{failLooksLike}</span>
        </Row>

        {/* Persona fixed (contract) */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-slate-50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            Persona-Fixed — Contract (do not change)
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {personaFixed.map((f, i) => (
              <li key={i} className="text-xs px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600">
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Persona free */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-sky-50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 mb-1">
            Persona-Free — Design Space
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {personaFree.map((f, i) => (
              <li key={i} className="text-xs px-2 py-0.5 rounded border border-sky-200 bg-white text-sky-700">
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Recombines */}
        {recombines.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
              Recombines lessons from
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recombines.map(refId => {
                const ref = getNightmareById(refId);
                return (
                  <NightmareLink
                    key={refId}
                    id={refId}
                    label={ref ? `${refId.toUpperCase()} ${ref.codename}` : refId.toUpperCase()}
                  />
                );
              })}
            </div>
          </div>
        )}
      </dl>
    </article>
  );
}
