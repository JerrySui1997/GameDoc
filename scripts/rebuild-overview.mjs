import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'src/data/docs/content.json';
const docs = JSON.parse(readFileSync(PATH, 'utf8'));

let n = 0;
const id = () => `b-ov-${(n++).toString(36)}`;

const prose = (type, text) => ({ id: id(), type, text });
const widget = (type, props) => ({ id: id(), type, props });

const blocks = [
  widget('hero', {
    eyebrow: 'Co-op paranormal investigation · New Miri',
    title: 'Dreamcatchers / 捕梦者',
    subtitle: 'A city that hides its dreams. Whimsical, not horror.',
    tone: 'dark',
  }),
  widget('badges', {
    label: 'Format',
    badgesJson: JSON.stringify([
      { label: '4-player co-op', tone: 'blue' },
      { label: 'Paranormal investigation', tone: 'purple' },
      { label: 'Whimsical, not horror', tone: 'amber' },
    ]),
  }),

  prose('heading2', 'Premise'),
  prose('paragraph', 'Four streamers run an urbex documentary channel on StreamVibe — the last honest window into New Miri. They came for views; the ruins turned out not to be empty, and the dreams not just dreams. Every investigation is a live broadcast, and the audience is part of the story.'),
  prose('quote', 'They came for views. They found the truth.'),

  prose('heading2', 'The World — New Miri'),
  widget('cards', {
    label: 'Three zones',
    columns: 3,
    cardsJson: JSON.stringify([
      { eyebrow: 'Surface', title: 'The Boulevard', body: 'Gas-lit avenue where empire-era authority meets immigrant street life.', tone: 'amber' },
      { eyebrow: 'The stage', title: 'The Outskirts', body: "A growing graveyard of abandoned malls, hospitals, and manors — the crew's hunting ground.", tone: 'orange' },
      { eyebrow: 'At night', title: 'The Dream Layer', body: 'What leaks out after dark; phosphorescent vines mark where the world is thin.', tone: 'sky' },
    ]),
  }),

  prose('heading2', 'The Crew'),
  widget('cards', {
    label: 'Four streamers',
    columns: 2,
    cardsJson: JSON.stringify([
      { eyebrow: 'Director', title: 'Harriet', body: 'Thief-turned-leader; sharp tongue, harlequin suitcase, protects the crew like family.', tone: 'red' },
      { eyebrow: 'Camera', title: 'Shop', body: 'A homeless prodigy pulled out of a dead mall; absurd talent, zero practicality.', tone: 'sky' },
      { eyebrow: 'Sound', title: 'Aria', body: 'Japanese-French audio obsessive living under a hidden name; escaped a cult.', tone: 'purple' },
      { eyebrow: 'Light', title: 'Adrian', body: 'Quiet rigging specialist searching the ruins for his vanished parents.', tone: 'green' },
    ]),
  }),

  prose('heading2', 'Gameplay Loop'),
  widget('cards', {
    label: 'Three steps',
    columns: 3,
    cardsJson: JSON.stringify([
      { eyebrow: '01', title: 'Identify & Find', body: 'Read the site — vines, cold rooms, moved objects — to locate the nightmare.', tone: 'sky' },
      { eyebrow: '02', title: 'Capture', body: "Cameras reveal what eyes can't; flash stuns; rigs, lights, and bait build the trap.", tone: 'amber' },
      { eyebrow: '03', title: 'Banish', body: "Some things can't be bottled; coordinate gear, timing, and nerve to drive them out — on camera.", tone: 'red' },
    ]),
  }),
  prose('paragraph', 'Nightmares are agents, not jump-scares: shy ones flee and hide, mischievous ones toy with doors and lights, aggressive ones hunt. Light can trap them; the camera is the weapon.'),

  prose('heading2', 'Progression'),
  widget('cards', {
    label: 'Four metrics',
    columns: 2,
    cardsJson: JSON.stringify([
      { eyebrow: 'Metric', title: 'Story', body: 'Each site peels back another layer of what New Miri buried.', tone: 'purple' },
      { eyebrow: 'Metric', title: 'Followers', body: 'Grow the channel; a bigger audience opens doors and draws attention.', tone: 'sky' },
      { eyebrow: 'Metric', title: 'Money', body: "Harriet's favorite metric; funds gear, intel, and access.", tone: 'green' },
      { eyebrow: 'Metric', title: 'Craft & Gear', body: 'Modded cameras, rigs, and dieselpunk equipment built between runs.', tone: 'amber' },
    ]),
  }),
  widget('labeled', {
    label: 'Fail-soft',
    value: 'A bad run costs you — it never dead-ends you.',
    highlight: true,
    multiline: false,
  }),

  prose('heading2', 'Art Direction'),
  prose('paragraph', 'A hand-painted port city of stone, salt, and lamplight — worn and alive, bold honest brushwork over big simple planes. A low-saturation world where a few disciplined accent colors do all the talking, with Eastern mysticism and dieselpunk gear sitting quietly inside the frame, rewarding a second look.'),
  widget('swatch', {
    label: 'Palette',
    swatchesJson: JSON.stringify([
      { hex: '#4A4658', name: 'Dusk Grey' },
      { hex: '#B8B2A4', name: 'Precinct Stone' },
      { hex: '#C9893A', name: 'Sodium Amber' },
      { hex: '#C8351F', name: 'Cinnabar' },
      { hex: '#7DA9B8', name: 'Phosphor Cyan' },
      { hex: '#3A5F3A', name: 'Moss Jade' },
    ]),
  }),
  prose('paragraph', 'Whimsical, not horror. Touchstones: Sifu · Disco Elysium · Dishonored 2.'),
];

const ov = docs.find((d) => d.id === 'overview');
if (!ov) throw new Error('overview record not found');
ov.body = JSON.stringify({ v: 2, blocks });

writeFileSync(PATH, JSON.stringify(docs, null, 2) + '\n', 'utf8');
console.log(`overview rebuilt with ${blocks.length} blocks; total docs: ${docs.length}`);
