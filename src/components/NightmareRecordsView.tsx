'use client';

import { useState, useMemo } from 'react';
import { ALL_NIGHTMARES } from '@/data/nightmares';
import { NightmareGrid } from '@/components/NightmareGrid';
import { EVIDENCE_TYPES, PERSONALITY_VALUES } from '@/lib/schema/vocabulary';

/** Filterable Nightmare records view — the core of the Nightmare specialized page. */
export function NightmareRecordsView() {
  const [tier, setTier] = useState<string>('all');
  const [evidence, setEvidence] = useState<string>('all');
  const [personality, setPersonality] = useState<string>('all');

  const filtered = useMemo(
    () =>
      ALL_NIGHTMARES.filter((n) => {
        if (tier !== 'all' && String(n.tier) !== tier) return false;
        if (evidence !== 'all' && !n.evidence.some((e) => e.type === evidence)) return false;
        if (personality !== 'all' && n.personality !== personality) return false;
        return true;
      }),
    [tier, evidence, personality],
  );

  const selectCls =
    'text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400';

  return (
    <div className="space-y-6">
      <p className="text-gray-500 text-sm">
        {filtered.length} of {ALL_NIGHTMARES.length} skeletons
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={selectCls}>
          <option value="all">All tiers</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="2-3">Tier 2-3</option>
          <option value="3">Tier 3</option>
        </select>
        <select value={evidence} onChange={(e) => setEvidence(e.target.value)} className={selectCls}>
          <option value="all">All evidence</option>
          {EVIDENCE_TYPES.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <select value={personality} onChange={(e) => setPersonality(e.target.value)} className={selectCls}>
          <option value="all">All personalities</option>
          {PERSONALITY_VALUES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {(tier !== 'all' || evidence !== 'all' || personality !== 'all') && (
          <button
            onClick={() => {
              setTier('all');
              setEvidence('all');
              setPersonality('all');
            }}
            className="text-sm text-slate-500 hover:text-slate-800 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400 py-8 text-center">No nightmares match the current filters.</p>
      ) : (
        <NightmareGrid nightmares={filtered} />
      )}
    </div>
  );
}
