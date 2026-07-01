import { clsx } from 'clsx';
import type { EvidenceEntry } from '@/lib/schema/nightmare';

const RELIABILITY_STYLE: Record<string, string> = {
  reliable:     'border-solid   bg-white',
  inconsistent: 'border-dashed  bg-amber-50',
  variable:     'border-dotted  bg-purple-50',
};

const RELIABILITY_COLOR: Record<string, string> = {
  reliable:     'text-slate-700',
  inconsistent: 'text-amber-700',
  variable:     'text-purple-700',
};

function evidenceLabel(e: EvidenceEntry): string {
  if (e.type === 'Glint' || e.type === 'Temperature') {
    return `${e.type} (${e.variant})`;
  }
  return e.type;
}

interface EvidenceBadgeProps {
  entry: EvidenceEntry;
}

export function EvidenceBadge({ entry }: EvidenceBadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
      RELIABILITY_STYLE[entry.reliability],
      RELIABILITY_COLOR[entry.reliability],
    )}>
      {evidenceLabel(entry)}
      {entry.reliability !== 'reliable' && (
        <span className="opacity-60 text-[10px]">({entry.reliability})</span>
      )}
    </span>
  );
}
