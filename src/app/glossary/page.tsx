import type { Metadata } from 'next';
import { EVIDENCE_TYPES, GLOSSARY } from '@/lib/schema/vocabulary';

export const metadata: Metadata = { title: 'Vocabulary Glossary' };

export default function GlossaryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Vocabulary Glossary</h1>
        <p className="text-gray-500 mt-1 text-sm max-w-2xl">
          The 8-member evidence vocabulary. These are the only valid evidence types —
          every nightmare is identified by a unique 3-evidence fingerprint drawn from this set.
          Link to any term with <code className="text-xs bg-gray-100 px-1 rounded">/glossary#{'{term}'}</code>.
        </p>
      </div>

      <dl className="space-y-4">
        {EVIDENCE_TYPES.map(term => (
          <div
            key={term}
            id={term.toLowerCase()}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 scroll-mt-4"
          >
            <dt className="font-bold text-slate-900 text-base flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400 select-none">#</span>
              {term}
            </dt>
            <dd className="mt-1.5 text-sm text-gray-600">{GLOSSARY[term]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
