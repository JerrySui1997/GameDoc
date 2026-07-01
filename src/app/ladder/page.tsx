import type { Metadata } from 'next';
import { ALL_NIGHTMARES } from '@/data/nightmares';
import { NightmareGrid } from '@/components/NightmareGrid';

export const metadata: Metadata = { title: 'Teaching Ladder' };

export default function LadderPage() {
  const tiers = [
    { label: 'Tier 1 — Baseline',      color: 'border-green-200  bg-green-50',  items: ALL_NIGHTMARES.filter(n => n.tier === 1) },
    { label: 'Tier 2 — Wait or Commit', color: 'border-yellow-200 bg-yellow-50', items: ALL_NIGHTMARES.filter(n => n.tier === 2 || n.tier === '2-3') },
    { label: 'Tier 3 — Curveball',      color: 'border-red-200    bg-red-50',    items: ALL_NIGHTMARES.filter(n => n.tier === 3) },
  ];

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Teaching Ladder</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Nightmares are ordered by teaching intent. Each tier extends the prior one — no rule is ever reversed.
        </p>
      </div>

      {tiers.map(tier => (
        <section key={tier.label}>
          <div className={`inline-block px-3 py-1 rounded-lg border text-sm font-semibold mb-4 ${tier.color}`}>
            {tier.label}
          </div>
          {tier.items.length === 0
            ? <p className="text-gray-400 text-sm">No nightmares at this tier yet.</p>
            : <NightmareGrid nightmares={tier.items} />
          }
        </section>
      ))}
    </div>
  );
}
