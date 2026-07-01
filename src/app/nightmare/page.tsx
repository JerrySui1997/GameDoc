import type { Metadata } from 'next';
import { NightmareRecordsView } from '@/components/NightmareRecordsView';

export const metadata: Metadata = { title: 'Nightmare' };

export default function NightmarePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Specialized Page</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Nightmare</h1>
        <p className="mt-1 text-sm text-gray-500">
          Design and browse nightmare creature records. Filter by tier, evidence, and personality.
        </p>
      </div>

      <NightmareRecordsView />
    </div>
  );
}
