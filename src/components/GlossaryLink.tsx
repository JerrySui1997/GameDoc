import Link from 'next/link';

interface GlossaryLinkProps {
  term: string;
  children?: React.ReactNode;
}

/** Wraps any vocabulary term with a link to its glossary entry. */
export function GlossaryLink({ term, children }: GlossaryLinkProps) {
  return (
    <Link
      href={`/glossary#${term.toLowerCase()}`}
      className="text-sky-600 underline decoration-dotted hover:decoration-solid hover:text-sky-800 transition-colors"
    >
      {children ?? term}
    </Link>
  );
}
