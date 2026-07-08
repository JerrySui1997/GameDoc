import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ALL_NIGHTMARES, getNightmareById } from '@/data/nightmares';
import { NightmareCard } from '@/components/NightmareCard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return ALL_NIGHTMARES.map(n => ({ id: n.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const record = getNightmareById(id);
  if (!record) return { title: 'Not Found' };
  return { title: `${record.id.toUpperCase()} ${record.codename}` };
}

export default async function NightmareDetailPage({ params }: Props) {
  const { id } = await params;
  const record = getNightmareById(id);
  if (!record) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs text-slate-400 font-mono mb-1">{record.id}</p>
        <h1 className="text-2xl font-bold text-slate-900">{record.codename}</h1>
      </div>
      <NightmareCard record={record} />
    </div>
  );
}
