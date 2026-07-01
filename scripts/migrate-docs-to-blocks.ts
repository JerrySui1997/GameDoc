/**
 * migrate-docs-to-blocks.ts
 * Run once: npx tsx scripts/migrate-docs-to-blocks.ts
 *
 * One-time migration for the "unified page" overhaul. Folds every specialized
 * page (DocNode with templateId + data) into the single page model: each field
 * value becomes a custom widget block appended to the page's BlockNote `body`,
 * and templateId/data are dropped. Free-form pages are left untouched.
 *
 * Self-contained (raw fs + relative paths, no @/ alias) because it must read the
 * legacy templateId/data BEFORE the new schema — which no longer declares them —
 * would strip them away.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const DOCS = 'src/data/docs/content.json';
const TEMPLATES = 'src/data/templates/content.json';

type Field = { key: string; label: string; kind: string; toneMap?: Record<string, string>; tagsTone?: string; highlight?: boolean };
type Template = { id: string; fields: Field[] };
type LegacyDoc = { id: string; title: string; parentId: string | null; order: number; body: string; templateId?: string | null; data?: Record<string, unknown> };

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Build one widget block (id + type + props) for a field/value pair. */
function blockFor(field: Field, value: unknown): { id: string; type: string; props: Record<string, unknown> } | null {
  const id = randomUUID();
  const label = field.label;
  switch (field.kind) {
    case 'text':
      return { id, type: 'labeled', props: { label, value: str(value), highlight: !!field.highlight, multiline: false } };
    case 'longtext':
      return { id, type: 'labeled', props: { label, value: str(value), highlight: !!field.highlight, multiline: true } };
    case 'select': {
      const v = str(value);
      if (!v) return null;
      return { id, type: 'statusBadge', props: { label, value: v, tone: field.toneMap?.[v] ?? 'slate' } };
    }
    case 'badges':
      return { id, type: 'badges', props: { label, badgesJson: JSON.stringify(arr(value)) } };
    case 'tags':
      return { id, type: 'tags', props: { label, tagsJson: JSON.stringify(arr(value)), tone: field.tagsTone ?? 'slate' } };
    case 'refs':
      return { id, type: 'refs', props: { label, refsJson: JSON.stringify(arr(value)) } };
    case 'collection':
      return { id, type: 'collection', props: { label, collectionId: str(value) } };
    default:
      return null;
  }
}

function main() {
  const templates: Template[] = JSON.parse(readFileSync(TEMPLATES, 'utf8'));
  const docs: LegacyDoc[] = JSON.parse(readFileSync(DOCS, 'utf8'));
  const byId = new Map(templates.map((t) => [t.id, t]));

  let migrated = 0;
  for (const doc of docs) {
    const data = doc.data;
    if (!doc.templateId || !data || Object.keys(data).length === 0) {
      delete doc.templateId;
      delete doc.data;
      continue;
    }
    const template = byId.get(doc.templateId);
    if (!template) {
      console.warn(`! ${doc.id}: template "${doc.templateId}" not found — keeping body, dropping data`);
      delete doc.templateId;
      delete doc.data;
      continue;
    }

    // Preserve any existing prose blocks, then append the widget blocks in field order.
    let existing: unknown[] = [];
    try {
      const parsed = JSON.parse(doc.body || '[]');
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      /* non-JSON legacy body → start fresh */
    }
    const widgets = template.fields
      .filter((f) => f.key in data)
      .map((f) => blockFor(f, data[f.key]))
      .filter((b): b is NonNullable<typeof b> => b !== null);

    doc.body = JSON.stringify([...existing, ...widgets]);
    delete doc.templateId;
    delete doc.data;
    migrated++;
    console.log(`✓ ${doc.id}: ${widgets.length} widget blocks`);
  }

  writeFileSync(DOCS, JSON.stringify(docs, null, 2) + '\n', 'utf8');
  console.log(`\nMigrated ${migrated} specialized page(s). Wrote ${DOCS}.`);
}

main();
