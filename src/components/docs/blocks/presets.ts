import { makeBlockId, type WidgetBlock } from '@/lib/docs/blocks';
import type { PageTemplate, TemplateField } from '@/lib/templates/types';

// A "page style" preset is just a PageTemplate reused as a starting arrangement
// of widget blocks. These pure helpers turn a preset into empty widget blocks
// (apply-once: the page then owns them), each with its own stable block id.

/** One preset field → an empty widget block seeded with default props. */
export function fieldToWidget(field: TemplateField): WidgetBlock {
  const id = makeBlockId();
  const label = field.label;
  switch (field.kind) {
    case 'longtext': return { id, type: 'labeled', props: { label, value: '', highlight: !!field.highlight, multiline: true } };
    case 'select': return { id, type: 'statusBadge', props: { label, value: '', tone: 'slate' } };
    case 'badges': return { id, type: 'badges', props: { label, badgesJson: '[]' } };
    case 'tags': return { id, type: 'tags', props: { label, tagsJson: '[]', tone: field.tagsTone ?? 'slate' } };
    case 'refs': return { id, type: 'refs', props: { label, refsJson: '[]' } };
    case 'collection': return { id, type: 'collection', props: { label, collectionId: '' } };
    case 'text':
    default: return { id, type: 'labeled', props: { label, value: '', highlight: !!field.highlight, multiline: false } };
  }
}

/** A whole style → the widget blocks to seed a new page's body with. */
export function styleToBlocks(template: PageTemplate): WidgetBlock[] {
  return template.fields.map(fieldToWidget);
}
