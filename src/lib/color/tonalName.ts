// Rule-based, human-readable names for any hex color, using the *tonal* scheme.
//
// A name is a lookup in a 3-D table: hue family × saturation tier × lightness
// index. Saturation classifies the color's *character* (Neon → Smoke); the hue
// family and lightness index pick the row. Minor hue families redirect onto a
// neighbor's table (see `resolveName`), so e.g. a desaturated vermillion reads
// as an Orange-table name while a vivid one reads as Red.
//
// Used by the Color palette widget to auto-label swatches as the user picks
// colors. Output is deterministic — the same hex always yields the same name.

export type Hsl = { h: number; s: number; l: number };

/** Parse `#rrggbb` (case-insensitive) to HSL with s/l as 0–100 percentages. */
export function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

// ── Saturation tiers ────────────────────────────────────────────────────────
// Below 4% saturation the color is achromatic (Gray table, no tier).
export type Tier = 'Neon' | 'Vivid' | 'True' | 'Soft' | 'Smoke';

/** Saturation tier for an s in 0–100. Assumes s ≥ 4 (else the color is Gray). */
export function saturationTier(s: number): Tier {
  if (s >= 80) return 'Neon';
  if (s >= 55) return 'Vivid';
  if (s >= 30) return 'True';
  if (s >= 12) return 'Soft';
  return 'Smoke';
}

// ── Hue families ──────────────────────────────────────────────────────────────
// Hue angle → family. Ranges are inclusive of the lower bound; the lookup walks
// the table and takes the first row whose upper bound the hue falls under. Minor
// families (Vermillion, Amber, Chartreuse, …) are resolved onto a tabled
// neighbor in `resolveName`.
export type Family =
  | 'Red' | 'Vermillion' | 'Orange' | 'Amber' | 'Yellow' | 'Lime' | 'Chartreuse'
  | 'Green' | 'Emerald' | 'Teal' | 'Aquamarine' | 'Cyan' | 'Cerulean' | 'Blue'
  | 'Indigo' | 'Violet' | 'Purple' | 'Magenta' | 'Rose' | 'Crimson';

const HUE_FAMILIES: ReadonlyArray<readonly [max: number, name: Family]> = [
  [14, 'Red'],
  [29, 'Vermillion'],
  [44, 'Orange'],
  [59, 'Amber'],
  [74, 'Yellow'],
  [89, 'Lime'],
  [104, 'Chartreuse'],
  [134, 'Green'],
  [149, 'Emerald'],
  [164, 'Teal'],
  [179, 'Aquamarine'],
  [194, 'Cyan'],
  [209, 'Cerulean'],
  [239, 'Blue'],
  [254, 'Indigo'],
  [269, 'Violet'],
  [299, 'Purple'],
  [314, 'Magenta'],
  [329, 'Rose'],
  [360, 'Crimson'],
];

/** Raw hue family for a hue angle (before any redirect onto a tabled family). */
export function hueFamily(h: number): Family {
  const hue = ((h % 360) + 360) % 360;
  for (const [max, name] of HUE_FAMILIES) if (hue <= max) return name;
  return 'Crimson';
}

// ── Lightness stops ───────────────────────────────────────────────────────────
// 11 stops, index 0 (lightest, label 50) → index 10 (darkest, label 950).
const STOP_LIGHTNESS = [96, 90, 82, 72, 61, 50, 39, 28, 20, 13, 7];

/** Index (0 = lightest, 10 = darkest) of the stop closest to this lightness. */
export function tonalStopIndex(l: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < STOP_LIGHTNESS.length; i++) {
    const dist = Math.abs(STOP_LIGHTNESS[i] - l);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

// ── Name tables ───────────────────────────────────────────────────────────────
// NAMES[family][tier][lightnessIndex]. Each tier array runs index 0 → 10.
type TierTable = Record<Tier, readonly string[]>;

const NAMES: Record<string, TierTable> = {
  Red: {
    Neon:  ['Glare', 'Flash', 'Flush', 'Hot Coral', 'Flame', 'Fire', 'Crimson', 'Blood', 'Ember', 'Claret', 'Pitch'],
    Vivid: ['Petal', 'Blush', 'Rose', 'Salmon', 'Coral', 'Scarlet', 'Cherry', 'Crimson', 'Ruby', 'Burgundy', 'Garnet'],
    True:  ['Lace', 'Pink Blush', 'Ballet', 'Dusty Rose', 'Terra Cotta', 'Brick', 'Oxide', 'Rust', 'Sienna', 'Maroon', 'Mahogany'],
    Soft:  ['White Rose', 'Pale Blush', 'Antique Rose', 'Mauve', 'Muted Rose', 'Faded Rose', 'Old Rose', 'Aged Brick', 'Dusty Maroon', 'Deep Ash', 'Void'],
    Smoke: ['Shell', 'Eggshell', 'Chalk', 'Plaster', 'Blush Ash', 'Rose Smoke', 'Haze', 'Shadow', 'Cinder', 'Soot', 'Char'],
  },
  Orange: {
    Neon:  ['Flash', 'Hi-Vis', 'Day-Glo', 'Signal', 'Neon', 'Blaze', 'Torch', 'Inferno', 'Sear', 'Scorched', 'Char'],
    Vivid: ['Cream', 'Peach', 'Apricot', 'Tangerine', 'Citrus', 'Flame', 'Pumpkin', 'Ember', 'Sienna', 'Burnt Sienna', 'Cinder'],
    True:  ['Seashell', 'Blush', 'Apricot', 'Sandy', 'Warm Beige', 'Terra Cotta', 'Brick', 'Rust', 'Burnt', 'Mahogany', 'Ebony'],
    Soft:  ['Linen', 'Pale Peach', 'Sand', 'Warm Sand', 'Dusty Peach', 'Muted Peach', 'Warm Tan', 'Warm Taupe', 'Dark Taupe', 'Umber', 'Pitch'],
    Smoke: ['Bone', 'Chalk', 'Plaster', 'Pale Stone', 'Stone', 'Flint', 'Pebble', 'Carbon', 'Graphite', 'Soot', 'Ash'],
  },
  Yellow: {
    Neon:  ['Phosphor', 'Flash', 'Acid Yellow', 'Sulfur', 'Neon', 'Electric', 'Solar', 'Flare', 'Scorch', 'Burn', 'Char'],
    Vivid: ['Cream', 'Butter', 'Lemon', 'Canary', 'Sunflower', 'Gold', 'Goldenrod', 'Marigold', 'Bronze', 'Copper', 'Burnt Bronze'],
    True:  ['Ivory', 'Cream', 'Wheat', 'Straw', 'Honey', 'Amber', 'Ochre', 'Mustard', 'Caramel', 'Umber', 'Dark Ebony'],
    Soft:  ['Linen', 'Pale Cream', 'Vanilla', 'Champagne', 'Parchment', 'Flax', 'Latte', 'Khaki', 'Warm Gray', 'Drab', 'Bark'],
    Smoke: ['Eggshell', 'Chalk', 'Plaster', 'Fog', 'Haze', 'Dust', 'Sand', 'Tan', 'Driftwood', 'Pumice', 'Flint'],
  },
  Lime: {
    Neon:  ['Phosphor', 'Flash Green', 'Acid Lime', 'Toxic Lime', 'Neon Lime', 'Electric Lime', 'Venom Lime', 'Deep Neon', 'Scorch', 'Char Green', 'Void'],
    Vivid: ['Honeydew', 'Pale Lime', 'Lime', 'Grass', 'Apple', 'Spring Green', 'Fern', 'Basil', 'Deep Lime', 'Dark Fern', 'Abyss'],
    True:  ['Ivory Green', 'Pale Fern', 'Sage Lime', 'Fern', 'Soft Fern', 'Herb', 'Basil', 'Dill', 'Dark Herb', 'Olive', 'Dark Olive'],
    Soft:  ['Chalk', 'Fog Green', 'Pale Tea', 'Tea Green', 'Soft Sage', 'Muted Fern', 'Dusty Fern', 'Warm Sage', 'Drab', 'Dark Drab', 'Bark'],
    Smoke: ['Bone', 'Haze', 'Pale Khaki', 'Khaki', 'Army Light', 'Army', 'Olive Drab', 'Dark Army', 'Carbon', 'Soot', 'Char'],
  },
  Green: {
    Neon:  ['Phosphor', 'Slime', 'Acid', 'Toxic', 'Neon', 'Radioactive', 'Venom', 'Acid Dark', 'Deep Toxic', 'Plasma', 'Void'],
    Vivid: ['Honeydew', 'Mint', 'Seafoam', 'Chartreuse', 'Lime', 'Viridian', 'Emerald', 'Hunter', 'Forest', 'Jungle', 'Abyss'],
    True:  ['Dew', 'Pale Sage', 'Pistachio', 'Sage', 'Fern', 'Meadow', 'Garden', 'Basil', 'Moss', 'Dark Moss', 'Dark Earth'],
    Soft:  ['Chalk', 'Pale Sage', 'Sage', 'Herb', 'Eucalyptus', 'Muted Sage', 'Olive', 'Dark Sage', 'Drab', 'Deep Drab', 'Void'],
    Smoke: ['Bone', 'Haze', 'Fog', 'Pale Khaki', 'Khaki', 'Army', 'Olive Drab', 'Dark Khaki', 'Carbon', 'Soot', 'Char'],
  },
  Teal: {
    Neon:  ['Crystal', 'Prism', 'Laser', 'Neon Aqua', 'Electric', 'Phosphor', 'Terminal', 'Deep Laser', 'Neon Abyss', 'Deep Plasma', 'Void'],
    Vivid: ['Frost', 'Ice', 'Aqua', 'Turquoise', 'Aquamarine', 'Peacock', 'Viridian', 'Jungle', 'Deep Jade', 'Midnight Teal', 'Abyss'],
    True:  ['Mist', 'Haze', 'Pale Seafoam', 'Seafoam', 'Light Lagoon', 'Lagoon', 'Teal', 'Deep Teal', 'Petrol', 'Deep Petrol', 'Pitch'],
    Soft:  ['Chalk', 'Pale Seafoam', 'Dusty Aqua', 'Sage Teal', 'Dusty Teal', 'Eucalyptus', 'Verdigris', 'Dark Sage', 'Shadow Teal', 'Void Teal', 'Void'],
    Smoke: ['Bone', 'Ash', 'Pebble', 'Pewter', 'Patina', 'Aged', 'Slate Teal', 'Gunmetal', 'Carbon', 'Cinder', 'Char'],
  },
  Cyan: {
    Neon:  ['Crystal', 'Prism', 'Laser', 'Neon Aqua', 'Electric Aqua', 'Terminal', 'Deep Terminal', 'Abyss Glow', 'Neon Void', 'Void Plasma', 'Void'],
    Vivid: ['Ice', 'Crystal Blue', 'Aqua Crystal', 'Powder Blue', 'Aqua', 'Turquoise', 'Deep Aqua', 'Lagoon', 'Deep Lagoon', 'Petrol', 'Abyss'],
    True:  ['Mist', 'Haze', 'Pale Aqua', 'Aqua Tint', 'Light Lagoon', 'Lagoon Blue', 'Pacific', 'Deep Pacific', 'Petrol', 'Dark Petrol', 'Void'],
    Soft:  ['Chalk', 'Pale Ice', 'Dusty Aqua', 'Steel Aqua', 'Dusty Teal', 'Blue Gray', 'Steel Teal', 'Gunmetal', 'Dark Steel', 'Shadow', 'Pitch'],
    Smoke: ['Bone', 'Ash', 'Pebble', 'Slate', 'Pewter', 'Flint', 'Carbon', 'Soot', 'Cinder', 'Void', 'Char'],
  },
  Blue: {
    Neon:  ['Crystal', 'Prism', 'Opal', 'Electric', 'Neon', 'Ultramarine', 'Cobalt', 'Sapphire', 'Deep Sapphire', 'Deep Space', 'Abyss'],
    Vivid: ['Ice', 'Powder', 'Periwinkle', 'Cornflower', 'Sky', 'Azure', 'Cerulean', 'Royal', 'Prussian', 'Navy', 'Midnight'],
    True:  ['Cloud', 'Haze', 'Pale Denim', 'Chambray', 'Denim', 'Ocean', 'Deep Ocean', 'Storm', 'Petrol', 'Dark Petrol', 'Void'],
    Soft:  ['Chalk', 'Fog', 'Dusty', 'Steel Blue', 'Pewter', 'Storm', 'Gunmetal', 'Iron', 'Dark Slate', 'Obsidian', 'Pitch'],
    Smoke: ['Bone', 'Ash', 'Pebble', 'Slate', 'Flint', 'Carbon', 'Graphite', 'Soot', 'Cinder', 'Void', 'Char'],
  },
  Purple: {
    Neon:  ['UV Crystal', 'UV Prism', 'UV Flash', 'Plasma', 'Neon Violet', 'Electric Violet', 'Ultraviolet', 'Deep Plasma', 'UV Abyss', 'Void Glow', 'Abyss'],
    Vivid: ['Pale Lilac', 'Lavender', 'Wisteria', 'Lilac', 'Orchid', 'Violet', 'Amethyst', 'Byzantium', 'Royal Purple', 'Dark Violet', 'Dark Plum'],
    True:  ['Lace', 'Pale Lavender', 'Lavender', 'Thistle', 'Heather', 'Mauve', 'Muted Purple', 'Plum', 'Aubergine', 'Dark Plum', 'Void'],
    Soft:  ['Whisper', 'Pale Mist', 'Dusty Lavender', 'Muted Lavender', 'Dusty Mauve', 'Faded Violet', 'Antique Violet', 'Taupe Violet', 'Shadow Mauve', 'Deep Shadow', 'Pitch'],
    Smoke: ['Bone', 'Ash', 'Haze', 'Pebble', 'Flint', 'Carbon', 'Graphite', 'Soot', 'Cinder', 'Ash Void', 'Char'],
  },
  Magenta: {
    Neon:  ['Flash Pink', 'Hot Flash', 'Neon Rose', 'Electric Pink', 'Hot Pink', 'Fuchsia Electric', 'Deep Fuchsia', 'Plasma Pink', 'Deep Plasma', 'Berry Void', 'Pitch'],
    Vivid: ['Pale Pink', 'Petal', 'Blush Pink', 'Flamingo', 'Hot Pink', 'Fuchsia', 'Magenta', 'Berry', 'Deep Berry', 'Wine', 'Noir'],
    True:  ['White', 'Lace', 'Petal', 'Blush', 'Rose Pink', 'Pink', 'Orchid', 'Dusty Orchid', 'Muted Orchid', 'Plum Rose', 'Deep Plum'],
    Soft:  ['Shell', 'Pale Rose', 'Pale Blush', 'Antique Blush', 'Dusty Pink', 'Muted Pink', 'Faded Pink', 'Ash Rose', 'Dark Ash Rose', 'Shadow Rose', 'Void'],
    Smoke: ['Bone', 'Chalk', 'Plaster', 'Ash Blush', 'Pale Smoke', 'Blush Smoke', 'Rose Ash', 'Dark Ash', 'Carbon', 'Soot', 'Char'],
  },
};

// Achromatic ramp (S < 4%). A single 11-stop table; no saturation tiers apply.
const GRAY = ['White', 'Snow', 'Ivory', 'Silver', 'Pale Gray', 'Ash', 'Stone', 'Slate', 'Charcoal', 'Graphite', 'Onyx'];

/**
 * Resolve a (raw family, tier, lightness index) to a name, applying the
 * minor-family redirects: tier-dependent splits for Vermillion/Amber, the
 * Indigo lightness split (Blue → Indigo → Purple), and the Emerald override.
 */
function resolveName(family: Family, tier: Tier, idx: number): string {
  const warm = tier === 'Neon' || tier === 'Vivid';
  switch (family) {
    case 'Red':
    case 'Crimson':
      return NAMES.Red[tier][idx];
    case 'Vermillion':
      return warm ? NAMES.Red[tier][idx] : NAMES.Orange[tier][idx];
    case 'Orange':
      return NAMES.Orange[tier][idx];
    case 'Amber':
      return warm ? NAMES.Yellow[tier][idx] : NAMES.Orange[tier][idx];
    case 'Yellow':
      return NAMES.Yellow[tier][idx];
    case 'Lime':
    case 'Chartreuse':
      return NAMES.Lime[tier][idx];
    case 'Green':
      return NAMES.Green[tier][idx];
    case 'Emerald':
      if (tier === 'Vivid' && idx === 5) return 'Emerald';
      return NAMES.Green[tier][idx];
    case 'Teal':
    case 'Aquamarine':
      return NAMES.Teal[tier][idx];
    case 'Cyan':
      return NAMES.Cyan[tier][idx];
    case 'Cerulean':
    case 'Blue':
      return NAMES.Blue[tier][idx];
    case 'Indigo':
      if (idx <= 4) return NAMES.Blue[tier][idx];
      if (idx === 5) return 'Indigo';
      return NAMES.Purple[tier][idx];
    case 'Violet':
    case 'Purple':
      return NAMES.Purple[tier][idx];
    case 'Magenta':
    case 'Rose':
      return NAMES.Magenta[tier][idx];
  }
}

/**
 * The tonal name for a hex color — e.g. `#1d4ed8` → "Royal", `#9ca3af` → "Ash".
 * Returns an empty string for un-parseable input so callers can fall back.
 */
export function tonalName(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return '';
  const idx = tonalStopIndex(hsl.l);
  if (hsl.s < 4) return GRAY[idx];
  return resolveName(hueFamily(hsl.h), saturationTier(hsl.s), idx);
}
