import { NightmareCard } from './NightmareCard';
import type { NightmareRecord } from '@/lib/schema/nightmare';

interface NightmareGridProps {
  nightmares: NightmareRecord[];
}

export function NightmareGrid({ nightmares }: NightmareGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {nightmares.map(n => (
        <NightmareCard key={n.id} record={n} linked />
      ))}
    </div>
  );
}
