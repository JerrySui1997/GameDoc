import { z } from 'zod';

// ── Tones ─────────────────────────────────────────────────────────────────
// A fixed palette so Tailwind can see every class literally at build time.
// Never build class names dynamically (e.g. `bg-${tone}-100`) — they won't
// be emitted. Look the tone up here instead.

export const TONES = [
  'slate', 'green', 'yellow', 'orange', 'red', 'amber', 'purple', 'sky', 'blue',
] as const;
export type Tone = (typeof TONES)[number];

export const TONE_STYLE: Record<string, string> = {
  slate:  'bg-slate-100  text-slate-700  border-slate-200',
  green:  'bg-green-100  text-green-800  border-green-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  red:    'bg-red-100    text-red-800    border-red-200',
  amber:  'bg-amber-100  text-amber-800  border-amber-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  sky:    'bg-sky-100    text-sky-800    border-sky-200',
  blue:   'bg-blue-100   text-blue-800   border-blue-200',
};

export function toneStyle(tone: string | undefined): string {
  return TONE_STYLE[tone ?? 'slate'] ?? TONE_STYLE.slate;
}

// ── Field kinds ───────────────────────────────────────────────────────────
// Each kind is one reusable widget + the shape of the value it stores.
//   text     -> string            single-line value rendered as a labeled row
//   longtext -> string            multi-line value (callout/paragraph)
//   select   -> string            one option; can carry a colored chip
//   badges   -> Badge[]           list of small colored badges
//   tags     -> string[]          list of plain chips (e.g. contract / free)
//   refs     -> string[]          links to other tree nodes by id
//   collection -> string          id of a Collection, rendered as a live table

export const FIELD_KINDS = ['text', 'longtext', 'select', 'badges', 'tags', 'refs', 'collection'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_KIND_LABEL: Record<FieldKind, string> = {
  text:       'Text',
  longtext:   'Long text',
  select:     'Select (one of)',
  badges:     'Badge list',
  tags:       'Tag list',
  refs:       'References',
  collection: 'Collection',
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BadgeSchema = z.object({
  label: z.string().min(1),
  tone: z.string().optional(),
});
export type Badge = z.infer<typeof BadgeSchema>;

export const TemplateFieldSchema = z.object({
  /** Data key this field reads/writes in a page's `data` record. */
  key: z.string().regex(SLUG, 'Key must be slug format (e.g. fail-looks-like)'),
  label: z.string().min(1),
  kind: z.enum(FIELD_KINDS),
  /** Allowed values for a `select` field. */
  options: z.array(z.string()).optional(),
  /** Optional value→tone map, colors a `select` chip or the header badge. */
  toneMap: z.record(z.string()).optional(),
  /** Render emphasized (amber callout styling). */
  highlight: z.boolean().optional(),
  /** Tone applied to every chip of a `tags` field. */
  tagsTone: z.string().optional(),
  description: z.string().optional(),
});
export type TemplateField = z.infer<typeof TemplateFieldSchema>;

export const PageTemplateSchema = z.object({
  id: z.string().regex(SLUG, 'ID must be slug format (e.g. character)'),
  name: z.string().min(1),
  description: z.string().optional(),
  /** Field key whose value renders as the header status badge (optional). */
  badgeKey: z.string().nullable().default(null),
  /** Optional visual flavor for a style preset (a Tone from TONES). */
  accent: z.string().optional(),
  fields: z.array(TemplateFieldSchema).default([]),
});
export type PageTemplate = z.infer<typeof PageTemplateSchema>;

export const TemplateCollectionSchema = z.array(PageTemplateSchema);
export type TemplateCollection = z.infer<typeof TemplateCollectionSchema>;

// ── Value helpers ─────────────────────────────────────────────────────────
// Page data is stored loosely (Record<string, unknown>) on the DocNode so a
// template can evolve without migrating every page. These coerce a raw value
// into the shape a given field kind expects, tolerating missing/old data.

export function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function asBadges(value: unknown): Badge[] {
  if (!Array.isArray(value)) return [];
  const out: Badge[] = [];
  for (const v of value) {
    const parsed = BadgeSchema.safeParse(v);
    if (parsed.success) out.push(parsed.data);
    else if (typeof v === 'string') out.push({ label: v });
  }
  return out;
}

/** Default empty value for a freshly created field of the given kind. */
export function emptyValue(kind: FieldKind): unknown {
  switch (kind) {
    case 'text':
    case 'longtext':
    case 'select':
    case 'collection': // stores a single Collection id
      return '';
    case 'badges':
    case 'tags':
    case 'refs':
      return [];
  }
}
