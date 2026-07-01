// ── Character Card resolution ────────────────────────────────────────────────
// The Character Card widget treats a *character page's* Character Studio panel as
// the single source of truth: it never stores character data itself, it points at
// a page (by id) and reads that page's `studioPanel` block on render. These pure
// helpers do the page-body → StudioCharacter resolution so the widget, the MCP,
// SSR, and scripts can all share one definition of "the studio on this page."
//
// Pure and server-safe — no React, no 'use client'. Only depends on the block
// parser and the (zod-only) studio schema.

import { parseBody, isWidgetBlock, type DocBlock } from '@/lib/docs/blocks';
import { asStudioCharacter, type Section, type StudioCharacter } from './types';

/** The first studioPanel block in a page body, or null. */
function findStudioBlock(body: string): DocBlock | null {
  for (const block of parseBody(body)) {
    if (isWidgetBlock(block) && block.type === 'studioPanel') return block;
  }
  return null;
}

/** True when a page body carries a Character Studio — used to populate the
 *  Character Card's "source page" picker (only studio-bearing pages qualify). */
export function pageHasStudio(body: string): boolean {
  return findStudioBlock(body) !== null;
}

/** Resolve a page body's Character Studio into a healed StudioCharacter, or null
 *  when the page has no studio at all. A studio panel with empty/blank data heals
 *  to its default sheet (asStudioCharacter), so a freshly-inserted panel still
 *  reads as a (default) source of truth rather than nothing. */
export function studioFromBody(body: string): StudioCharacter | null {
  const block = findStudioBlock(body);
  if (!block || !isWidgetBlock(block)) return null;
  const dataJson = typeof block.props.dataJson === 'string' ? block.props.dataJson : '';
  let raw: unknown = {};
  if (dataJson) {
    try {
      raw = JSON.parse(dataJson);
    } catch {
      raw = {};
    }
  }
  return asStudioCharacter(raw);
}

/** The studio's sections with the designer's hidden ids removed, order preserved.
 *  This is the exact list a Character Card displays — the card never reorders the
 *  source, it only filters it, so what the studio shows top-to-bottom is what the
 *  card shows. Unknown hidden ids (a section since deleted) are simply ignored. */
export function visibleSections(studio: StudioCharacter, hideIds: readonly string[]): Section[] {
  if (hideIds.length === 0) return studio.sections;
  const hidden = new Set(hideIds);
  return studio.sections.filter((s) => !hidden.has(s.id));
}

/** Parse the widget's stored `hideJson` prop into an id list (self-healing). */
export function parseHideIds(hideJson: unknown): string[] {
  if (typeof hideJson !== 'string' || !hideJson) return [];
  try {
    const v: unknown = JSON.parse(hideJson);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** A short, human label for one section, for the card's field-picker checkboxes:
 *  the section's own heading/text when it has one, else its kind title. */
export function sectionPickerLabel(section: Section, kindTitle: string): string {
  const own = section.label.trim() || (section.kind === 'codename' || section.kind === 'code' ? section.text.trim() : '');
  return own ? `${kindTitle} · ${own}` : kindTitle;
}
