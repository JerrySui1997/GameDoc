'use client';

import type { WidgetBlock, WidgetType } from '@/lib/docs/blocks';
import type { WidgetEntry } from './types';
import { Labeled, StatusBadge, Badges, Tags, Refs, Collection } from './SmallWidgets';
import { StudioPanel } from './StudioPanel';
import { EnvironmentPanel } from './EnvironmentPanel';
import { CharacterCard } from './CharacterCard';
import { NarrativeTimeline } from './NarrativeTimeline';
import { HexelMap } from './HexelMap';
import { ImageBoard } from './ImageBoard';
import { Hero, Cards, Swatches } from './RichWidgets';

// The single registry of insertable widgets — replaces the old WIDGET_DEFS +
// createReactBlockSpec schema. Each entry knows how to label, insert (defaults),
// and render itself. `defaults` mirror the old block propSchema defaults and are
// applied to any block missing a prop.
export const WIDGETS: Record<WidgetType, WidgetEntry> = {
  statusBadge: {
    type: 'statusBadge',
    title: 'Status badge',
    aliases: ['status', 'badge', 'tier', 'chip'],
    defaults: { label: 'Status', value: '', tone: 'slate' },
    Component: StatusBadge,
  },
  labeled: {
    type: 'labeled',
    title: 'Labeled value',
    aliases: ['field', 'label', 'text', 'value'],
    defaults: { label: 'Field', value: '', highlight: false, multiline: false },
    Component: Labeled,
  },
  badges: {
    type: 'badges',
    title: 'Badge list',
    aliases: ['badges', 'evidence'],
    defaults: { label: 'Badges', badgesJson: '[]' },
    Component: Badges,
  },
  tags: {
    type: 'tags',
    title: 'Tag list',
    aliases: ['tags', 'chips'],
    defaults: { label: 'Tags', tagsJson: '[]', tone: 'slate' },
    Component: Tags,
  },
  refs: {
    type: 'refs',
    title: 'References',
    aliases: ['refs', 'links', 'related'],
    defaults: { label: 'References', refsJson: '[]' },
    Component: Refs,
  },
  collection: {
    type: 'collection',
    title: 'Collection',
    aliases: ['collection', 'embed', 'list', 'table'],
    defaults: { label: 'Collection', collectionId: '' },
    Component: Collection,
  },
  studioPanel: {
    type: 'studioPanel',
    title: 'Character Studio',
    aliases: ['studio', 'character', 'sheet', 'panel', 'designer', 'art'],
    defaults: { dataJson: '' },
    Component: StudioPanel,
  },
  environmentStudio: {
    type: 'environmentStudio',
    title: 'Environment Studio',
    aliases: ['environment', 'location', 'sheet', 'panel', 'designer', 'place', 'area', 'level'],
    defaults: { dataJson: '' },
    Component: EnvironmentPanel,
  },
  characterCard: {
    type: 'characterCard',
    title: 'Character Card',
    aliases: ['card', 'character', 'profile', 'crew', 'mirror', 'bind', 'reference'],
    defaults: { sourcePageId: '', hideJson: '[]' },
    Component: CharacterCard,
  },
  narrativeTimeline: {
    type: 'narrativeTimeline',
    title: 'Narrative Timeline',
    aliases: ['timeline', 'story', 'spine', 'acts', 'moments', 'beats', 'arc', 'flow', 'plot'],
    defaults: { dataJson: '' },
    Component: NarrativeTimeline,
  },
  hexelMap: {
    type: 'hexelMap',
    title: 'Hexel Map',
    aliases: ['hexel', 'iso', 'isometric', 'map', 'space', 'room', 'level', 'blockout', 'voxel', '3d', 'grid', 'scene', 'paint'],
    defaults: { dataJson: '' },
    Component: HexelMap,
  },
  hero: {
    type: 'hero',
    title: 'Hero banner',
    aliases: ['hero', 'banner', 'lead', 'cover', 'title'],
    defaults: { eyebrow: '', title: '', subtitle: '', tone: 'dark' },
    Component: Hero,
  },
  cards: {
    type: 'cards',
    title: 'Card grid',
    aliases: ['cards', 'grid', 'crew', 'steps', 'tiles', 'features'],
    defaults: { label: '', columns: 3, cardsJson: '[]' },
    Component: Cards,
  },
  swatch: {
    type: 'swatch',
    title: 'Color palette',
    aliases: ['swatch', 'swatches', 'palette', 'colors', 'colours', 'hex'],
    defaults: { label: 'Palette', swatchesJson: '[]', overridesJson: '{}' },
    Component: Swatches,
  },
  imageBoard: {
    type: 'imageBoard',
    title: 'Image Board',
    aliases: ['board', 'reference', 'gallery', 'images', 'moodboard', 'refs'],
    defaults: { boardId: '' },
    Component: ImageBoard,
  },
};

/** Shelf / slash-menu order (matches the previous WIDGET_DEFS ordering). */
export const WIDGET_LIST: WidgetEntry[] = [
  WIDGETS.hero,
  WIDGETS.cards,
  WIDGETS.swatch,
  WIDGETS.statusBadge,
  WIDGETS.labeled,
  WIDGETS.badges,
  WIDGETS.tags,
  WIDGETS.refs,
  WIDGETS.collection,
  WIDGETS.studioPanel,
  WIDGETS.environmentStudio,
  WIDGETS.characterCard,
  WIDGETS.narrativeTimeline,
  WIDGETS.hexelMap,
  WIDGETS.imageBoard,
];

/** A fresh widget block of the given type, seeded with its default props. */
export function makeWidgetBlock(type: WidgetType, id: string): WidgetBlock {
  return { id, type, props: { ...WIDGETS[type].defaults } };
}

/** Render a widget block. The host is `contentEditable={false}` so the widget's
 *  own React UI owns all interaction. Missing props fall back to defaults. */
export function WidgetHost({ block, onChange }: { block: WidgetBlock; onChange: (patch: Record<string, unknown>) => void }) {
  const entry = WIDGETS[block.type];
  if (!entry) return null;
  const Component = entry.Component;
  const props = { ...entry.defaults, ...block.props };
  return (
    <div contentEditable={false}>
      <Component props={props} onChange={onChange} />
    </div>
  );
}
