import Link from 'next/link';

interface NightmareLinkProps {
  id: string;
  label?: string;
}

/** Renders a linked pill referencing another nightmare by its stable ID. */
export function NightmareLink({ id, label }: NightmareLinkProps) {
  const display = label ?? id.toUpperCase();
  return (
    <Link
      href={`/nightmare/${id}`}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold
                 bg-slate-100 text-slate-600 border border-slate-300
                 hover:bg-slate-200 hover:text-slate-800 transition-colors"
    >
      {display}
    </Link>
  );
}
