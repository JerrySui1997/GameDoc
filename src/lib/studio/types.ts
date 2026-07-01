import { z } from 'zod';

// ── Character Studio data model ─────────────────────────────────────────────
// The Studio panel is a single full-width widget block that stores one whole
// character sheet as JSON in its block prop. The sheet is a fixed identity
// header (codename / tier / code) plus an *ordered, fully editable list of
// sections* — the designer adds, removes, and reorders sections at will, the
// same way page blocks work. Like the other widget blocks this is
// "loose-but-validated" body data: every field self-heals with `.catch(...)`
// so a partial or hand-edited value still parses, and the panel can gain
// section kinds without migrating existing pages. Types are derived with
// z.infer — never hand written.

// A stat is a labeled datum. `type` picks how it reads and which fields are
// meaningful — the same loose-but-validated flat-shape trick the Section model
// uses (see SectionSchema): every field self-heals with `.catch(...)`, unused
// fields stay at their defaults, and a pre-types stat (only label/value/max)
// heals to a `pips` stat with no migration.
export const STAT_TYPES = ['pips', 'bar', 'number', 'toggle', 'tag', 'text'] as const;
export type StatType = (typeof STAT_TYPES)[number];
export const STAT_TYPE_LABELS: Record<StatType, string> = {
  pips: 'Pips',
  bar: 'Bar',
  number: 'Number',
  toggle: 'Toggle',
  tag: 'Tag',
  text: 'Text',
};

export const StatSchema = z.object({
  label: z.string().catch('Stat'),
  type: z.enum(STAT_TYPES).catch('pips'),
  value: z.number().int().catch(0), // pips / bar / number — the numeric value
  max: z.number().int().min(1).max(9999).catch(5), // pips / bar — the ceiling
  unit: z.string().catch(''), // number — suffix shown after the value (kg, XP…)
  on: z.boolean().catch(false), // toggle — boolean state
  choice: z.string().catch(''), // tag — selected option
  options: z.array(z.string()).catch([]), // tag — the pick-one vocabulary
  text: z.string().catch(''), // text — freeform descriptor
});
export type Stat = z.infer<typeof StatSchema>;

/** Largest pip count we'll actually draw — `bar` is for anything bigger. */
export const PIP_MAX = 12;

/** A blank stat of the given type, seeded with that type's useful defaults. */
export function makeStat(type: StatType = 'pips'): Stat {
  const base = StatSchema.parse({ label: 'New stat', type });
  switch (type) {
    case 'bar':
      return { ...base, value: 50, max: 100 };
    case 'number':
      return { ...base, value: 0, unit: '' };
    case 'toggle':
      return { ...base, on: false };
    case 'tag':
      return { ...base, options: ['Option A', 'Option B'], choice: 'Option A' };
    case 'text':
      return { ...base, text: '' };
    case 'pips':
    default:
      return { ...base, value: 0, max: 5 };
  }
}

// A personality stamp — a named, colored tag. Each personality section owns its
// own list, so the designer adds / removes / renames stamps freely.
export const StampSchema = z.object({
  key: z.string().catch('TAG'),
  color: z.string().catch('#5B6B73'),
  hint: z.string().catch(''),
});
export type Stamp = z.infer<typeof StampSchema>;

// ── Sections ────────────────────────────────────────────────────────────────
// Every body element is a Section. `kind` picks which fields are meaningful;
// unused fields stay at their defaults (loose-but-validated, so one flat shape
// keeps migration and hand-editing painless). The designer owns existence and
// order of these entirely.

// Identity kinds (codename / code / tier / flag) used to be a fixed header; they
// are now ordinary sections so the designer can move, remove, or add them like
// anything else. The panel keeps no fixed identity chrome.
export const SECTION_KINDS = [
  'codename',
  'code',
  'tier',
  'flag',
  'note',
  'stats',
  'personality',
  'art',
  'contract',
  'rule',
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
const IDENTITY_KINDS: SectionKind[] = ['codename', 'code', 'tier', 'flag'];

export const SECTION_TITLES: Record<SectionKind, string> = {
  codename: 'Codename',
  code: 'Code',
  tier: 'Tier',
  flag: 'Flag',
  note: 'Note',
  stats: 'Stats',
  personality: 'Personality',
  art: 'Concept art',
  contract: 'Design contract',
  rule: 'Section divider',
};

// ── Section layout ──────────────────────────────────────────────────────────
// A section can occupy a fraction of the sheet's width so designers arrange the
// sheet as a grid, and choose how it sits vertically beside taller neighbours.
// Both are controlled vocabularies that self-heal to the historical full-width,
// top-aligned default, so existing sheets need no migration.
export const SECTION_WIDTHS = ['full', 'half', 'third'] as const;
export type SectionWidth = (typeof SECTION_WIDTHS)[number];
export const SECTION_ALIGNS = ['top', 'center', 'bottom'] as const;
export type SectionAlign = (typeof SECTION_ALIGNS)[number];

export const SectionSchema = z.object({
  id: z.string().catch(''), // healed to a fresh id by coerce if blank
  kind: z.enum(SECTION_KINDS).catch('note'),
  width: z.enum(SECTION_WIDTHS).catch('full'), // fraction of the sheet width
  align: z.enum(SECTION_ALIGNS).catch('top'), // vertical position within its row
  label: z.string().catch(''), // editable heading (note / stats / personality / rule) or flag name
  text: z.string().catch(''), // note body — also holds codename / code text
  stats: z.array(StatSchema).catch([]), // stats kind
  personality: z.string().catch('SHY'), // personality kind — selected stamp key
  stamps: z.array(StampSchema).catch([]), // personality kind — the editable stamp vocabulary
  art: z.string().catch(''), // art kind — concept-art webp data URL (inline)
  locked: z.string().catch(''), // contract kind — fixed half
  open: z.string().catch(''), // contract kind — open half
  tier: z.number().int().min(1).max(3).catch(1), // tier kind — chosen tier
  on: z.boolean().catch(false), // flag kind — toggle state
});
export type Section = z.infer<typeof SectionSchema>;

// A whole sheet is now nothing but an ordered list of sections — identity
// included. (Old sheets stored codename/tier/code/fearOfLight at the top level;
// those are read only as migration inputs, never written back — see
// asStudioCharacter — so a removed identity section can't resurrect itself.)
export const StudioCharacterSchema = z.object({
  brand: z.string().catch('Nightmare Menagerie'), // editable titlebar eyebrow
  title: z.string().catch('Character Studio'), // editable titlebar title
  sections: z.array(SectionSchema).catch([]),
});
export type StudioCharacter = z.infer<typeof StudioCharacterSchema>;

// ── Controlled vocabulary ───────────────────────────────────────────────────
// Colors live here as literal hex (the panel styles with inline color, not
// Tailwind, so the warm palette is fully custom and not build-time constrained).

export const TIER_COLORS: Record<number, string> = { 1: '#4A6B7C', 2: '#C9A24B', 3: '#8C2E2E' };
export const TIER_LABELS: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

export type PersonalityOption = { key: string; color: string; hint: string };
export const PERSONALITY_OPTIONS: PersonalityOption[] = [
  { key: 'SHY', color: '#4A6B7C', hint: 'Flees conflict' },
  { key: 'MISCHIEF', color: '#C9A24B', hint: 'Interacts & retreats' },
  { key: 'AGGRESSIVE', color: '#8C2E2E', hint: 'Pursues on sight' },
  { key: 'ANY', color: '#5B6B73', hint: 'Variable' },
];

export const DEFAULT_STATS: Stat[] = [
  { ...makeStat('pips'), label: 'Speed', value: 2 },
  { ...makeStat('pips'), label: 'Aggression', value: 1 },
  { ...makeStat('bar'), label: 'Haunt intensity', value: 70, max: 100 },
  { ...makeStat('pips'), label: 'Stealth', value: 3 },
];

// The stamps a fresh Personality section starts with — the old fixed vocabulary,
// now just an editable seed.
export const DEFAULT_STAMPS: Stamp[] = PERSONALITY_OPTIONS.map((o) => ({ key: o.key, color: o.color, hint: o.hint }));

// Colors offered when adding / recoloring a custom stamp (click-to-cycle).
export const STAMP_PALETTE: string[] = ['#4A6B7C', '#C9A24B', '#8C2E2E', '#5B6B73', '#6B7A53', '#7C5B7C'];

let sectionSeq = 0;
/** Unique-enough id for a section within one sheet. */
export function makeSectionId(): string {
  sectionSeq += 1;
  return `s-${Date.now().toString(36)}-${sectionSeq.toString(36)}`;
}

/** A blank section of the given kind, seeded with that kind's useful defaults. */
export function makeSection(kind: SectionKind): Section {
  const base = SectionSchema.parse({ id: makeSectionId(), kind });
  switch (kind) {
    case 'codename':
      return { ...base, text: '' };
    case 'code':
      return { ...base, text: 'T-XX' };
    case 'tier':
      return { ...base, tier: 1 };
    case 'flag':
      return { ...base, label: 'FLAG', on: false };
    case 'stats':
      return { ...base, label: 'Stats', stats: DEFAULT_STATS };
    case 'personality':
      return { ...base, label: 'Personality', personality: 'SHY', stamps: DEFAULT_STAMPS };
    case 'rule':
      return { ...base, label: 'Section' };
    case 'note':
      return { ...base, label: 'Note' };
    default:
      return base;
  }
}

/** The starter layout for a freshly inserted panel — lean but immediately useful. */
function defaultSections(): Section[] {
  return [
    makeSection('codename'),
    makeSection('tier'),
    { ...makeSection('flag'), label: 'FEAR OF LIGHT' },
    makeSection('personality'),
    makeSection('stats'),
    { ...makeSection('note'), label: 'Dream origin' },
    { ...makeSection('note'), label: 'Appearance' },
    makeSection('art'),
    makeSection('contract'),
  ];
}

/** A blank, valid character sheet for a freshly inserted panel. */
export function emptyCharacter(): StudioCharacter {
  return { brand: 'Nightmare Menagerie', title: 'Character Studio', sections: defaultSections() };
}

// ── Migration ───────────────────────────────────────────────────────────────
// Old sheets stored every field at the top level in a fixed layout (no
// `sections`). Rebuild them into an equivalent ordered section list so existing
// pages keep all their content, now fully reorderable/removable.

const LEGACY_NOTES: Array<[string, string]> = [
  ['dreamOrigin', 'Dream origin'],
  ['theme', 'Theme'],
  ['sounds', 'Sound design'],
  ['appearance', 'Visual description'],
  ['colorPalette', 'Color palette'],
  ['huntBehavior', 'Hunt behavior'],
  ['hauntManifestation', 'Haunt manifestation'],
  ['teaches', 'Teaches'],
  ['states', 'States & behavior'],
  ['signature', 'Signature mechanic'],
  ['capture', 'Capture method'],
  ['fail', 'Fail state'],
];

/** Build the identity sections (codename / tier / code / flag) from old top-level
 *  fields — used both for legacy sheets and the one-time v2 upgrade. */
function identitySectionsFromRaw(raw: Record<string, unknown>): Section[] {
  const codename = typeof raw.codename === 'string' ? raw.codename : '';
  const code = typeof raw.code === 'string' ? raw.code : 'T-XX';
  const tier = z.number().int().min(1).max(3).catch(1).parse(raw.tier);
  const out: Section[] = [
    { ...makeSection('codename'), text: codename },
    { ...makeSection('tier'), tier },
    { ...makeSection('code'), text: code },
  ];
  if (raw.fearOfLight === true) out.push({ ...makeSection('flag'), label: 'FEAR OF LIGHT', on: true });
  return out;
}

function legacyToSections(raw: Record<string, unknown>): Section[] {
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '');
  const sections: Section[] = identitySectionsFromRaw(raw);
  sections.push({ ...makeSection('art'), art: str('art') });
  sections.push({ ...makeSection('personality'), personality: str('personality') || 'SHY' });
  const stats = z.array(StatSchema).catch([]).parse(raw.stats);
  sections.push({ ...makeSection('stats'), stats: stats.length ? stats : DEFAULT_STATS });
  // Identity / appearance notes come before the contract; mechanics/narrative after.
  for (const [key, label] of LEGACY_NOTES.slice(0, 5)) sections.push({ ...makeSection('note'), label, text: str(key) });
  sections.push({ ...makeSection('contract'), locked: str('contractLocked'), open: str('contractOpen') });
  for (const [key, label] of LEGACY_NOTES.slice(5)) sections.push({ ...makeSection('note'), label, text: str(key) });
  return sections;
}

/** Coerce loosely-stored block data into a valid character (self-healing). */
export function asStudioCharacter(value: unknown): StudioCharacter {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const parsed = StudioCharacterSchema.safeParse(raw);
  const base = parsed.success ? parsed.data : emptyCharacter();

  // New format already carries sections — heal ids and seed pre-stamps personality.
  if (Array.isArray(raw.sections)) {
    let sections = base.sections.length
      ? base.sections.map((s) => {
          const healed = s.id ? s : { ...s, id: makeSectionId() };
          return healed.kind === 'personality' && healed.stamps.length === 0
            ? { ...healed, stamps: DEFAULT_STAMPS }
            : healed;
        })
      : defaultSections();
    // One-time upgrade: pre-identity-section sheets kept codename/tier/code/fearOfLight
    // at the top level. If no identity section exists yet but those fields are still
    // present, fold them in front. Fires only while the old fields are present — once a
    // commit rewrites the sheet as { sections } they're gone, so a removed identity
    // section never resurrects.
    const hasIdentity = sections.some((s) => IDENTITY_KINDS.includes(s.kind));
    const hasLegacyIdentity = 'codename' in raw || 'tier' in raw || 'code' in raw || 'fearOfLight' in raw;
    if (!hasIdentity && hasLegacyIdentity) sections = [...identitySectionsFromRaw(raw), ...sections];
    return { brand: base.brand, title: base.title, sections };
  }
  // No data at all (freshly inserted panel) → the lean starter layout.
  if (Object.keys(raw).length === 0) return emptyCharacter();
  // Legacy fixed-field sheet → rebuild the section list from its old fields.
  return { brand: base.brand, title: base.title, sections: legacyToSections(raw) };
}

/** Clamp a raw stat value into [0, max]. */
export function clampStat(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}
