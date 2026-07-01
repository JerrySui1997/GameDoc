import { z } from 'zod';

// ── Narrative Timeline data model ───────────────────────────────────────────
// A narrativeTimeline is one full-width widget block that stores a whole story
// spine as JSON in its block prop (`dataJson`), exactly like the Character
// Studio panel. A spine is an ordered list of *acts* (color-coded story
// chapters) and an ordered list of *moments* (the beats that flow along the
// ribbon). A moment can be assigned to an act and can reference character pages
// (by id — the cross-reference rule) and one environment token.
//
// Like the other widget blocks this is "loose-but-validated" body data: every
// field self-heals with `.catch(...)` so a partial or hand-edited value still
// parses, and the model can gain fields without migrating existing pages. Types
// are derived with z.infer — never hand written.

// ── Controlled vocabulary ───────────────────────────────────────────────────

export const TIMELINE_LAYOUTS = ['serpentine', 'wave', 'free'] as const;
export type TimelineLayout = (typeof TIMELINE_LAYOUTS)[number];
export const TIMELINE_LAYOUT_LABELS: Record<TimelineLayout, string> = {
  serpentine: 'Serpentine',
  wave: 'Wave',
  free: 'Free',
};
export const TIMELINE_LAYOUT_HINTS: Record<TimelineLayout, string> = {
  serpentine: 'A winding boustrophedon ribbon — best for many beats.',
  wave: 'A single flowing sine row — best for a short throughline.',
  free: 'Place every moment by hand — drag nodes anywhere.',
};

// Act accent colors live here as literal hex (the timeline styles with inline
// color, not Tailwind, so the warm palette is fully custom and not build-time
// constrained — same approach as the studio's TIER_COLORS).
export const ACT_PALETTE = [
  '#3d8fb8', // open blue
  '#8c2e2e', // lock red
  '#c9a24b', // amber
  '#4a6b7c', // slate teal
  '#6b7a53', // moss
  '#7c5b7c', // plum
  '#b5683c', // ember
  '#2f6f5e', // pine
] as const;

// Environment tokens ship with a small starter vocabulary; the designer adds,
// renames, and recolors them like personality stamps in the studio.
export const ENV_GLYPHS = ['◆', '▲', '●', '✦', '⬢', '☾', '⚑', '✷', '⌂', '☗'] as const;

// ── Act ─────────────────────────────────────────────────────────────────────

export const ActSchema = z.object({
  id: z.string().catch(''), // healed to a fresh id by asTimeline if blank
  title: z.string().catch('Act'),
  color: z.string().catch('#3d8fb8'),
  summary: z.string().catch(''),
  /** Recurring cast for the whole act — character page ids (cross-ref by id). */
  characters: z.array(z.string()).catch([]),
});
export type Act = z.infer<typeof ActSchema>;

// ── Moment ──────────────────────────────────────────────────────────────────

// A normalized canvas position used only by the `free` layout: x/y in [0,1].
export const PosSchema = z.object({
  x: z.number().catch(0.5),
  y: z.number().catch(0.5),
});
export type Pos = z.infer<typeof PosSchema>;

export const MomentSchema = z.object({
  id: z.string().catch(''), // healed to a fresh id by asTimeline if blank
  title: z.string().catch('Untitled moment'),
  beat: z.string().catch(''), // a short time/beat label, e.g. "02 · Dawn"
  summary: z.string().catch(''),
  actId: z.string().catch(''), // ref to an Act.id ('' = unassigned)
  /** Characters featured in this moment — page ids (cross-ref by id). */
  characters: z.array(z.string()).catch([]),
  environment: z.string().catch(''), // ref to an EnvToken.id ('' = none)
  /** Hand-placed canvas position for the `free` layout; null = auto-placed. */
  pos: PosSchema.nullable().catch(null),
});
export type Moment = z.infer<typeof MomentSchema>;

// ── Environment token ───────────────────────────────────────────────────────

export const EnvTokenSchema = z.object({
  id: z.string().catch(''),
  label: z.string().catch('Place'),
  color: z.string().catch('#4a6b7c'),
  glyph: z.string().catch('◆'),
});
export type EnvToken = z.infer<typeof EnvTokenSchema>;

// ── Whole spine ─────────────────────────────────────────────────────────────

export const TimelineSchema = z.object({
  title: z.string().catch('Narrative Timeline'),
  subtitle: z.string().catch(''),
  layout: z.enum(TIMELINE_LAYOUTS).catch('serpentine'),
  /** Moments per row in the serpentine layout. */
  density: z.number().int().min(2).max(6).catch(4),
  /** Ribbon waviness, 0–100 (wave amplitude / serpentine arc). */
  amplitude: z.number().int().min(0).max(100).catch(45),
  acts: z.array(ActSchema).catch([]),
  moments: z.array(MomentSchema).catch([]),
  environments: z.array(EnvTokenSchema).catch([]),
});
export type Timeline = z.infer<typeof TimelineSchema>;

// ── Id minting ──────────────────────────────────────────────────────────────

let idSeq = 0;
/** Unique-enough id within one spine (prefixed by entity kind). */
export function mintId(prefix: 'a' | 'm' | 'e'): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

// ── Factories ───────────────────────────────────────────────────────────────

/** A fresh act, colored by where it lands in the current list. */
export function makeAct(index = 0): Act {
  return {
    id: mintId('a'),
    title: `Act ${index + 1}`,
    color: ACT_PALETTE[index % ACT_PALETTE.length],
    summary: '',
    characters: [],
  };
}

/** A fresh moment, optionally assigned to an act and a hand-placed position. */
export function makeMoment(actId = '', pos: Pos | null = null): Moment {
  return {
    id: mintId('m'),
    title: 'New moment',
    beat: '',
    summary: '',
    actId,
    characters: [],
    environment: '',
    pos,
  };
}

/** A fresh environment token, glyph/color chosen by where it lands. */
export function makeEnv(index = 0): EnvToken {
  return {
    id: mintId('e'),
    label: 'New place',
    color: ACT_PALETTE[(index + 3) % ACT_PALETTE.length],
    glyph: ENV_GLYPHS[index % ENV_GLYPHS.length],
  };
}

// ── Seed ────────────────────────────────────────────────────────────────────
// A freshly-inserted timeline ships with a small, evocative example spine so the
// widget reads as a finished thing immediately (the same philosophy as the
// studio's default sheet). Character bindings start empty — the designer drags
// real character pages on from the shelf.

/** A blank, valid, immediately-useful story spine. */
export function emptyTimeline(): Timeline {
  const a1 = makeAct(0);
  const a2 = makeAct(1);
  const a3 = makeAct(2);
  a1.title = 'Awakening';
  a1.summary = 'The ordinary world cracks; the protagonist first feels the pull.';
  a2.title = 'Uprising';
  a2.summary = 'Lines are drawn. Allies and costs reveal themselves.';
  a3.title = 'Reckoning';
  a3.summary = 'The convergence — every thread pays off, for better or worse.';

  const city = { ...makeEnv(0), label: 'The City', glyph: '⌂', color: '#4a6b7c' };
  const safehouse = { ...makeEnv(1), label: 'Safehouse', glyph: '☾', color: '#6b7a53' };
  const lab = { ...makeEnv(2), label: 'The Lab', glyph: '⬢', color: '#7c5b7c' };
  const streets = { ...makeEnv(3), label: 'Streets', glyph: '▲', color: '#b5683c' };

  const m = (actId: string, beat: string, title: string, summary: string, env: string): Moment => ({
    ...makeMoment(actId),
    beat,
    title,
    summary,
    environment: env,
  });

  return {
    title: 'Story Spine',
    subtitle: 'A living map of acts, moments, and the cast that moves through them.',
    layout: 'serpentine',
    density: 4,
    amplitude: 45,
    acts: [a1, a2, a3],
    environments: [city, safehouse, lab, streets],
    moments: [
      m(a1.id, '01 · Cold open', 'The Signal', 'A message no one was meant to receive arrives at 3 a.m.', city.id),
      m(a1.id, '02 · Dawn', 'First Contact', 'Two strangers cross paths and nothing is ordinary again.', streets.id),
      m(a1.id, '03', 'The Choice', 'A door opens. Walking through it cannot be undone.', safehouse.id),
      m(a2.id, '04', 'Going Loud', 'The quiet plan fails; improvisation becomes survival.', streets.id),
      m(a2.id, '05 · Midpoint', 'The Reveal', 'The real shape of the conspiracy snaps into focus.', lab.id),
      m(a2.id, '06', 'Fracture', 'An ally breaks ranks; trust is the first casualty.', safehouse.id),
      m(a3.id, '07', 'Convergence', 'Every thread is pulled taut toward one place, one hour.', city.id),
      m(a3.id, '08 · Climax', 'The Reckoning', 'The cost comes due and the world tips on its axis.', lab.id),
    ],
  };
}

// ── Healing ─────────────────────────────────────────────────────────────────

/** Coerce loosely-stored block data into a valid, fully-id'd timeline. A blank /
 *  empty value heals to the seeded example so a freshly inserted widget is never
 *  empty; ids are minted for any act/moment/env that lacks one. */
export function asTimeline(value: unknown): Timeline {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (Object.keys(raw).length === 0) return emptyTimeline();

  const parsed = TimelineSchema.safeParse(raw);
  const base = parsed.success ? parsed.data : emptyTimeline();

  const acts = base.acts.map((a) => (a.id ? a : { ...a, id: mintId('a') }));
  const environments = base.environments.map((e) => (e.id ? e : { ...e, id: mintId('e') }));
  // Drop dangling references so render code never chases a deleted act/env.
  const actIds = new Set(acts.map((a) => a.id));
  const envIds = new Set(environments.map((e) => e.id));
  const moments = base.moments.map((mm) => ({
    ...mm,
    id: mm.id || mintId('m'),
    actId: actIds.has(mm.actId) ? mm.actId : '',
    environment: envIds.has(mm.environment) ? mm.environment : '',
  }));

  return { ...base, acts, environments, moments };
}

/** Serialize a timeline back to the string stored in the block prop. */
export function serializeTimeline(tl: Timeline): string {
  return JSON.stringify(tl);
}
