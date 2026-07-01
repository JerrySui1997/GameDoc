'use client';

import { useEffect, useState } from 'react';
import type { Awareness } from './useYDoc';
import { initials, type Identity } from './identity';

// Live presence: who else is on this page, derived from the y-websocket awareness
// protocol. Each client publishes a `user` ({name,color}) and a `cursor`
// ({blockId,start,end}) field; everyone observes everyone else's.

export type RemoteUser = {
  clientId: number;
  name: string;
  color: string;
  cursor?: { blockId: string; start: number; end: number };
};

/** All *other* clients currently connected to this room. */
export function useRemoteUsers(awareness: Awareness | null): RemoteUser[] {
  const [users, setUsers] = useState<RemoteUser[]>([]);

  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      const out: RemoteUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = (state as { user?: { name?: string; color?: string } }).user;
        if (!user) return;
        const cursor = (state as { cursor?: RemoteUser['cursor'] }).cursor;
        out.push({
          clientId,
          name: user.name || 'Anonymous',
          color: user.color || '#64748b',
          cursor: cursor && cursor.blockId ? cursor : undefined,
        });
      });
      out.sort((a, b) => a.clientId - b.clientId);
      setUsers(out);
    };
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [awareness]);

  return users;
}

/** A row of colored avatar chips for the people on this page. */
export function PresenceAvatars({ users }: { users: RemoteUser[] }) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center -space-x-1.5">
      {users.map((u) => (
        <span
          key={u.clientId}
          title={u.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: u.color }}
        >
          {initials(u.name)}
        </span>
      ))}
    </div>
  );
}

/** A small, non-blocking prompt to set a display name for presence. */
export function NamePrompt({ onSave }: { onSave: (name: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(value); }}
      className="flex items-center gap-2 rounded-lg border border-brass/40 bg-brass-soft px-3 py-2"
    >
      <span className="text-sm text-ink">Add your name so teammates can see your cursor:</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your name"
        autoFocus
        className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brass"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-md bg-ink px-3 py-1 text-sm font-semibold text-white hover:bg-ink-soft disabled:opacity-40"
      >
        Save
      </button>
    </form>
  );
}

/** The label chips shown on a block that one or more remote users are editing. */
export function RemoteBlockBadges({ users }: { users: RemoteUser[] }) {
  if (users.length === 0) return null;
  return (
    <div className="pointer-events-none absolute -top-2 right-0 z-10 flex gap-1">
      {users.map((u) => (
        <span
          key={u.clientId}
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: u.color }}
        >
          {u.name}
        </span>
      ))}
    </div>
  );
}

/** A colored left accent bar marking a block a remote user is editing. */
export function RemoteBlockAccent({ color }: { color: string }) {
  return (
    <span
      className="pointer-events-none absolute -left-2 top-0 bottom-0 w-0.5 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

/** Coerce an Identity into the awareness `user` payload (or null to clear). */
export function userField(identity: Identity | null): { name: string; color: string } | null {
  return identity ? { name: identity.name, color: identity.color } : null;
}
