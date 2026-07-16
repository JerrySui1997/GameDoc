// The current shared site becomes the flagship workspace, owned by this
// email (plans/06-multi-workspace-dashboard.md — confirmed 2026-07-14, no
// other editors to seed). A fixed id rather than a generated one so every
// legacy (bare-docId) room/file resolves to it by convention, not lookup.
export const FLAGSHIP_OWNER_EMAIL = 'suij1997@gmail.com';
export const FLAGSHIP_WORKSPACE_ID = 'flagship';

export function personalWorkspaceId(userId: string): string {
  return `personal:${userId}`;
}

type WorkspaceKindShape = { id: string; kind: 'flagship' | 'personal' | 'custom'; ownerId: string };

// The generalized /w/[workspaceId] route (Phase 4) resolves storage/room
// naming for all three kinds so a workspace's dashboard card can link there
// uniformly — even though in practice flagship and personal each have their
// own richer, purpose-built route instead (see dashboard/page.tsx's hrefFor).

/** Storage scope (docs/store.ts's `DocsScope`) for a workspace row. */
export function docsScopeFor(ws: WorkspaceKindShape): { userId: string } | { workspaceId: string } | undefined {
  if (ws.kind === 'personal') return { userId: ws.ownerId };
  if (ws.kind === 'custom') return { workspaceId: ws.id };
  return undefined;
}

/** Collab room id (server/collab-core.ts's room-kind regexes) for a doc in this workspace. */
export function roomIdFor(ws: WorkspaceKindShape, docId: string): string {
  if (ws.kind === 'personal') return `user:${ws.ownerId}:${docId}`;
  if (ws.kind === 'custom') return `ws:${ws.id}:${docId}`;
  return docId;
}
