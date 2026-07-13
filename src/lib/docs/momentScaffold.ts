// One-shot page scaffold for "moment" story pages — prose pages narrating one
// story beat (e.g. the-child-prodigy, the-porch-light, the-crew-assembles).
// Seeds hero + Sequence of Events + five analytical sections, closing with a
// "Related" refs widget; the page is freely editable afterward. Nothing here
// is enforced — this is a preset, not a new block or widget type.

import { emptyProse, makeBlockId, serializeBlocks, type DocBlock, type WidgetBlock } from './blocks';

function hero(): WidgetBlock {
  return {
    id: makeBlockId(),
    type: 'hero',
    props: { eyebrow: 'Moment', title: '', subtitle: '', tone: 'dark' },
  };
}

function refs(label: string): WidgetBlock {
  return { id: makeBlockId(), type: 'refs', props: { label, refsJson: '[]' } };
}

export function momentScaffoldBlocks(): DocBlock[] {
  return [
    hero(),

    emptyProse('heading2', 'Sequence of Events'),
    emptyProse('paragraph', 'One paragraph of prose per beat. Add a beat marker before each — the numbers count themselves.'),
    emptyProse('beat', 'Opening image'),
    emptyProse('paragraph', 'What the reader sees first — where we are, who is present, what is off.'),
    emptyProse('beat', 'Turn'),
    emptyProse('paragraph', 'The moment the situation changes. What forces a choice?'),
    emptyProse('beat', 'Aftermath'),
    emptyProse('paragraph', 'Where everyone lands. What is different now, and what did it cost?'),

    emptyProse('heading2', 'Purpose & Arc'),
    emptyProse(
      'paragraph',
      'What story beat does this moment serve? What must be true before it, and what does it make true after? Name where it sits on the overall arc.'
    ),

    emptyProse('heading2', 'Characters & Motivations'),
    emptyProse(
      'paragraph',
      'One line per character: @mention the page, then what they want in this moment and what they will not do to get it.'
    ),
    emptyProse('bullet', '@character-page — wants …, but will not …'),
    emptyProse('bullet', '@character-page — wants …, but will not …'),

    emptyProse('heading2', 'Tone & Pacing'),
    emptyProse(
      'paragraph',
      'The emotional target (dread, relief, wonder…) and the tempo: where it lingers, where it cuts. Note the beat where the tone pivots.'
    ),

    emptyProse('heading2', 'Setting & Lore'),
    emptyProse(
      'paragraph',
      'Where this happens and what the environment says on its own. List lore this moment depends on, and any new canon it establishes — @mention the pages.'
    ),

    emptyProse('heading2', 'Level & Interaction Notes'),
    emptyProse(
      'paragraph',
      'Is this beat playable, or pure narrative? If playable, note the player-facing choices and whether they actually branch or are illusory. If not, say so plainly rather than leaving it blank.'
    ),

    refs('Related'),
  ];
}

export function momentScaffoldBody(): string {
  return serializeBlocks(momentScaffoldBlocks());
}
