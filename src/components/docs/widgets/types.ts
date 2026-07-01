import type { WidgetType } from '@/lib/docs/blocks';

// The contract every widget component honors. The host owns the block's props
// (a primitive/JSON record) and persists patches; the component renders an
// always-editable UI and calls `onChange` with a partial update. Components
// commit on discrete actions / blur so typing never round-trips through the
// document and steals focus.
export type WidgetProps = {
  props: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

/** Registry entry: how to label, insert, and render a widget. */
export type WidgetEntry = {
  type: WidgetType;
  title: string;
  aliases: string[];
  defaults: Record<string, unknown>;
  Component: React.ComponentType<WidgetProps>;
};
