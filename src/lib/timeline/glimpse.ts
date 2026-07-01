// ── Character glimpse ───────────────────────────────────────────────────────
// The timeline associates *character pages* with moments and acts. Like the
// Character Card, it treats a character page's Character Studio as the single
// source of truth — it stores only the page id and reads the page's studio on
// render. These pure helpers distill a page body into the compact "glimpse" the
// timeline shows: a portrait, a name, a tier, a one-line blurb, and a couple of
// headline stats. Reused by the node portraits, the hover card, and the shelf.
//
// Pure and server-safe — no React, no 'use client'. Depends only on the studio
// resolver and the (zod-only) studio model.

import { studioFromBody } from '@/lib/studio/card';
import { clampStat, TIER_LABELS, type Section, type StudioCharacter } from '@/lib/studio/types';

export type GlimpseStat = { label: string; read: string };

export type CharacterGlimpse = {
  /** Concept-art data URL, or '' when the studio has no portrait yet. */
  portrait: string;
  /** Codename if set, else the studio title. */
  name: string;
  /** Tier label (e.g. "Tier 2") when the studio carries a tier section. */
  tier: string | null;
  /** First note's text — a one-line characterization. */
  blurb: string;
  /** Up to three headline stats, read-only. */
  stats: GlimpseStat[];
};

/** A stat rendered to a short read string, mirroring the card's read-only stats. */
function statRead(stat: Section['stats'][number]): string {
  switch (stat.type) {
    case 'bar':
      return `${clampStat(stat.value, stat.max)}/${stat.max}`;
    case 'number':
      return `${stat.value}${stat.unit ? ` ${stat.unit}` : ''}`;
    case 'toggle':
      return stat.on ? 'ON' : 'OFF';
    case 'tag':
      return stat.choice || '—';
    case 'text':
      return stat.text || '—';
    case 'pips':
    default:
      return `${clampStat(stat.value, stat.max)}/${stat.max}`;
  }
}

/** Distill a healed studio into a glimpse. */
function glimpseFromStudio(studio: StudioCharacter): CharacterGlimpse {
  const portrait = studio.sections.find((s) => s.kind === 'art' && s.art)?.art ?? '';
  const codename = studio.sections.find((s) => s.kind === 'codename')?.text?.trim();
  const tierSection = studio.sections.find((s) => s.kind === 'tier');
  const note = studio.sections.find((s) => s.kind === 'note' && s.text.trim());
  const statsSection = studio.sections.find((s) => s.kind === 'stats' && s.stats.length);

  return {
    portrait,
    name: codename || studio.title || 'Unnamed',
    tier: tierSection ? TIER_LABELS[tierSection.tier] ?? null : null,
    blurb: note?.text.trim() ?? '',
    stats: (statsSection?.stats ?? []).slice(0, 3).map((s) => ({ label: s.label, read: statRead(s) })),
  };
}

/** Resolve a page body into a character glimpse, or null when the page carries no
 *  Character Studio (so it can't act as a character source). */
export function characterGlimpse(body: string): CharacterGlimpse | null {
  const studio = studioFromBody(body);
  return studio ? glimpseFromStudio(studio) : null;
}

/** Initials fallback for a character with no portrait yet (e.g. "EK" for
 *  "Elijah Kamski") — drawn as a monogram chip. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
