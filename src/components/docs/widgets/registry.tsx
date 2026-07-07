'use client';

import type { WidgetBlock, WidgetType } from '@/lib/docs/blocks';
import type { WidgetEntry } from './types';
import { Labeled, StatusBadge, Badges, Tags, Refs, Collection } from './SmallWidgets';
import { StudioPanel } from './StudioPanel';
import { CharacterCard } from './CharacterCard';
import { NarrativeTimeline } from './NarrativeTimeline';
import { HexelMap } from './HexelMap';
import { Hero, Cards, Swatches, ChildPages } from './RichWidgets';

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
  childPages: {
    type: 'childPages',
    title: 'Child pages',
    aliases: ['children', 'subpages', 'chapters', 'toc', 'index', 'hub'],
    defaults: { label: 'Child pages', columns: 3, titlesJson: '{}' },
    Component: ChildPages,
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
  WIDGETS.characterCard,
  WIDGETS.narrativeTimeline,
  WIDGETS.hexelMap,
  WIDGETS.childPages,
];

/** A fresh widget block of the given type, seeded with its default props. */
export function makeWidgetBlock(type: WidgetType, id: string): WidgetBlock {
  return { id, type, props: { ...WIDGETS[type].defaults } };
}

/** Render a widget block. The host is `contentEditable={false}` so the widget's
 *  own React UI owns all interaction. Missing props fall back to defaults.
 *  `docId` is the page the block lives on — most widgets ignore it; childPages
 *  uses it to find its own children. */
export function WidgetHost({
  block,
  onChange,
  docId,
}: {
  block: WidgetBlock;
  onChange: (patch: Record<string, unknown>) => void;
  docId?: string;
}) {
  const entry = WIDGETS[block.type];
  if (!entry) return null;
  const Component = entry.Component;
  const props = { ...entry.defaults, ...block.props };
  return (
    <div contentEditable={false}>
      <Component props={props} onChange={onChange} docId={docId} />
    </div>
  );
}
