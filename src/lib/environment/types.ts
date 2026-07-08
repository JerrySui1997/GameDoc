import { z } from 'zod';
import { makeStat, StatSchema, type Stat } from '@/lib/studio/types';

// ── Environment Studio data model ───────────────────────────────────────────
// Sibling of Character Studio (see studio/types.ts) for locations/environments
// instead of characters. Same section-list sheet engine, same self-healing
// "loose-but-validated" flat shape — only the section-kind vocabulary and seed
// data differ. The generic Stat model (StatSchema/makeStat/clampStat/PIP_MAX)
// is reused as-is from studio/types.ts, not redefined.

export const ENV_SECTION_KINDS = [
  'placename',
  'code',
  'tier',
  'flag',
  'note',
  'stats',
  'atmosphere',
  'art',
  'contract',
  'rule',
] as const;
export type EnvSectionKind = (typeof ENV_SECTION_KINDS)[number];

export const ENV_SECTION_TITLES: Record<EnvSectionKind, string> = {
  placename: 'Place name',
  code: 'Code',
  tier: 'Tier',
  flag: 'Flag',
  note: 'Note',
  stats: 'Stats',
  atmosphere: 'Atmosphere',
  art: 'Reference art',
  contract: 'Design contract',
  rule: 'Section divider',
};

// ── Section layout ──────────────────────────────────────────────────────────
export const ENV_SECTION_WIDTHS = ['full', 'half', 'third'] as const;
export type EnvSectionWidth = (typeof ENV_SECTION_WIDTHS)[number];
export const ENV_SECTION_ALIGNS = ['top', 'center', 'bottom'] as const;
export type EnvSectionAlign = (typeof ENV_SECTION_ALIGNS)[number];

// An atmosphere stamp — a named, colored tag, same shape as Character Studio's
// personality stamp. Each atmosphere section owns its own editable list.
export const AtmosphereStampSchema = z.object({
  key: z.string().catch('TAG'),
  color: z.string().catch('#5B6B73'),
  hint: z.string().catch(''),
});
export type AtmosphereStamp = z.infer<typeof AtmosphereStampSchema>;

export const EnvSectionSchema = z.object({
  id: z.string().catch(''), // healed to a fresh id by coerce if blank
  kind: z.enum(ENV_SECTION_KINDS).catch('note'),
  width: z.enum(ENV_SECTION_WIDTHS).catch('full'), // fraction of the sheet width
  align: z.enum(ENV_SECTION_ALIGNS).catch('top'), // vertical position within its row
  label: z.string().catch(''), // editable heading (note / stats / atmosphere / rule) or flag name
  text: z.string().catch(''), // note body — also holds place name / code text
  stats: z.array(StatSchema).catch([]), // stats kind
  atmosphere: z.string().catch('SAFE'), // atmosphere kind — selected stamp key
  stamps: z.array(AtmosphereStampSchema).catch([]), // atmosphere kind — the editable stamp vocabulary
  art: z.string().catch(''), // art kind — reference-art webp data URL (inline)
  locked: z.string().catch(''), // contract kind — fixed half
  open: z.string().catch(''), // contract kind — open half
  tier: z.number().int().min(1).max(3).catch(1), // tier kind — chosen tier
  on: z.boolean().catch(false), // flag kind — toggle state
});
export type EnvSection = z.infer<typeof EnvSectionSchema>;

// A whole sheet is an ordered list of sections — identity included, same as
// Character Studio. No fixed header chrome; the designer owns section order.
export const StudioEnvironmentSchema = z.object({
  brand: z.string().catch('Location Codex'), // editable titlebar eyebrow
  title: z.string().catch('Environment Studio'), // editable titlebar title
  sections: z.array(EnvSectionSchema).catch([]),
});
export type StudioEnvironment = z.infer<typeof StudioEnvironmentSchema>;

// ── Controlled vocabulary ───────────────────────────────────────────────────
export const ENV_TIER_COLORS: Record<number, string> = { 1: '#4A6B7C', 2: '#C9A24B', 3: '#8C2E2E' };
export const ENV_TIER_LABELS: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

export type AtmosphereOption = { key: string; color: string; hint: string };
export const ATMOSPHERE_OPTIONS: AtmosphereOption[] = [
  { key: 'SAFE', color: '#4A6B7C', hint: 'No active threat' },
  { key: 'TENSE', color: '#C9A24B', hint: 'Something is off' },
  { key: 'HOSTILE', color: '#8C2E2E', hint: 'Active danger' },
  { key: 'SACRED', color: '#6B7A53', hint: 'Reverent / untouchable' },
];

// The stamps a fresh Atmosphere section starts with — an editable seed.
export const DEFAULT_ATMOSPHERE_STAMPS: AtmosphereStamp[] = ATMOSPHERE_OPTIONS.map((o) => ({ key: o.key, color: o.color, hint: o.hint }));

// Colors offered when adding / recoloring a custom stamp (click-to-cycle).
export const ATMOSPHERE_STAMP_PALETTE: string[] = ['#4A6B7C', '#C9A24B', '#8C2E2E', '#5B6B73', '#6B7A53', '#7C5B7C'];

export const DEFAULT_ENV_STATS: Stat[] = [
  { ...makeStat('pips'), label: 'Ambient light', value: 2 },
  { ...makeStat('pips'), label: 'Hazard density', value: 1 },
  { ...makeStat('bar'), label: 'Traversal difficulty', value: 40, max: 100 },
  { ...makeStat('pips'), label: 'Points of interest', value: 3 },
];

let envSectionSeq = 0;
/** Unique-enough id for an environment section within one sheet. */
export function makeEnvSectionId(): string {
  envSectionSeq += 1;
  return `es-${Date.now().toString(36)}-${envSectionSeq.toString(36)}`;
}

/** A blank section of the given kind, seeded with that kind's useful defaults. */
export function makeEnvSection(kind: EnvSectionKind): EnvSection {
  const base = EnvSectionSchema.parse({ id: makeEnvSectionId(), kind });
  switch (kind) {
    case 'placename':
      return { ...base, text: '' };
    case 'code':
      return { ...base, text: 'L-XX' };
    case 'tier':
      return { ...base, tier: 1 };
    case 'flag':
      return { ...base, label: 'FLAG', on: false };
    case 'stats':
      return { ...base, label: 'Stats', stats: DEFAULT_ENV_STATS };
    case 'atmosphere':
      return { ...base, label: 'Atmosphere', atmosphere: 'SAFE', stamps: DEFAULT_ATMOSPHERE_STAMPS };
    case 'rule':
      return { ...base, label: 'Section' };
    case 'note':
      return { ...base, label: 'Note' };
    default:
      return base;
  }
}

/** The starter layout for a freshly inserted panel — lean but immediately useful. */
function defaultEnvSections(): EnvSection[] {
  return [
    makeEnvSection('placename'),
    makeEnvSection('tier'),
    { ...makeEnvSection('flag'), label: 'REQUIRES LIGHT SOURCE' },
    makeEnvSection('atmosphere'),
    makeEnvSection('stats'),
    { ...makeEnvSection('note'), label: 'Design intent' },
    { ...makeEnvSection('note'), label: 'Appearance' },
    makeEnvSection('art'),
    makeEnvSection('contract'),
  ];
}

/** A blank, valid environment sheet for a freshly inserted panel. */
export function emptyEnvironment(): StudioEnvironment {
  return { brand: 'Location Codex', title: 'Environment Studio', sections: defaultEnvSections() };
}

// ── Coercion ─────────────────────────────────────────────────────────────────
// No legacy fixed-field format to migrate from (this widget is new) — coercion
// is just self-healing + the fresh-insert default, unlike asStudioCharacter's
// legacy path.
export function asStudioEnvironment(value: unknown): StudioEnvironment {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const parsed = StudioEnvironmentSchema.safeParse(raw);
  const base = parsed.success ? parsed.data : emptyEnvironment();

  if (Array.isArray(raw.sections)) {
    const sections = base.sections.length
      ? base.sections.map((s) => {
          const healed = s.id ? s : { ...s, id: makeEnvSectionId() };
          return healed.kind === 'atmosphere' && healed.stamps.length === 0
            ? { ...healed, stamps: DEFAULT_ATMOSPHERE_STAMPS }
            : healed;
        })
      : defaultEnvSections();
    return { brand: base.brand, title: base.title, sections };
  }
  // No data at all (freshly inserted panel) — or any other unrecognized shape —
  // both resolve to the lean starter layout; there's no legacy format to rescue.
  return emptyEnvironment();
}
