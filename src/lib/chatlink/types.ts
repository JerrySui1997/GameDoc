import { z } from 'zod';

// ── Chat-link wire types ────────────────────────────────────────────────────
// Shapes shared between the local chat-bridge (scripts/chat-bridge.mjs), the
// ingest endpoint (/api/chatlink/events), and the browser UI (/sessions).
// The bridge is the only thing that reads VS Code / Claude Code chat storage
// off disk — these types describe what it normalizes that data into.

export const ChatSourceSchema = z.enum(['copilot', 'claude']);
export type ChatSource = z.infer<typeof ChatSourceSchema>;

export const ChatSessionMetaSchema = z.object({
  id: z.string(),
  source: ChatSourceSchema,
  /** Human label for the originating project/workspace folder. */
  workspace: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  requestCount: z.number(),
});
export type ChatSessionMeta = z.infer<typeof ChatSessionMetaSchema>;

/** One rendered fragment of an assistant turn. Copilot responses are a list of
 *  typed parts (markdown, tool calls, etc.) — unknown kinds still render as a
 *  labeled chip rather than being dropped, since the part vocabulary isn't
 *  fully enumerable. */
export const ChatTurnPartSchema = z.object({
  kind: z.string(),
  text: z.string().optional(),
});
export type ChatTurnPart = z.infer<typeof ChatTurnPartSchema>;

export const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  parts: z.array(ChatTurnPartSchema).optional(),
  timestamp: z.number(),
  modelId: z.string().optional(),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const ChatLinkEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.upsert'), session: ChatSessionMetaSchema }),
  z.object({ type: z.literal('session.remove'), sessionId: z.string() }),
  z.object({ type: z.literal('transcript.snapshot'), sessionId: z.string(), turns: z.array(ChatTurnSchema) }),
  z.object({ type: z.literal('transcript.append'), sessionId: z.string(), turns: z.array(ChatTurnSchema) }),
]);
export type ChatLinkEvent = z.infer<typeof ChatLinkEventSchema>;
