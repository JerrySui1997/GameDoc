'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChatSessionMeta, ChatTurn, ChatLinkEvent } from '@/lib/chatlink/types';

type DeviceToken = { id: string; label: string; createdAt: string };
type NewDeviceToken = { id: string; token: string; label: string };

const SOURCE_LABEL: Record<ChatSessionMeta['source'], string> = {
  copilot: 'VS Code Copilot',
  claude: 'Claude Code',
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function DevicesPanel() {
  const [devices, setDevices] = useState<DeviceToken[]>([]);
  const [label, setLabel] = useState('');
  const [minted, setMinted] = useState<NewDeviceToken | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const res = await fetch('/api/chatlink/devices');
    if (res.ok) setDevices(await res.json());
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch('/api/chatlink/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: trimmed }),
      });
      if (res.ok) {
        const created: NewDeviceToken = await res.json();
        setMinted(created);
        setLabel('');
        await refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id: string) => {
    await fetch('/api/chatlink/devices', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (minted?.id === id) setMinted(null);
    await refresh();
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-ink">Connect a device</h2>
      <p className="mt-1 text-xs text-muted">
        Pair the local chat-bridge to this account. It watches VS Code Copilot / Claude Code chat storage on your
        machine and reports here — only you can see it.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="e.g. My Laptop"
          className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-muted"
        />
        <button
          onClick={create}
          disabled={loading || !label.trim()}
          className="shrink-0 rounded-lg bg-brass px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
        >
          Generate token
        </button>
      </div>

      {minted && (
        <div className="mt-3 rounded-lg border border-brass bg-brass-soft p-3">
          <p className="text-xs font-medium text-ink">
            Copy this now — it won&apos;t be shown again. Run the bridge with it:
          </p>
          <code className="mt-2 block overflow-x-auto whitespace-pre rounded-md bg-canvas px-2 py-1.5 text-xs text-ink">
            npm run chat-bridge -- --token={minted.token}
          </code>
        </div>
      )}

      {devices.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm">
              <span className="text-ink">{d.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{relativeTime(new Date(d.createdAt).getTime())}</span>
                <button onClick={() => revoke(d.id)} className="text-xs text-muted hover:text-oxblood">
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  useEffect(() => {
    fetch('/api/chatlink/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => {});
  }, []);

  // Best-effort: if the endpoint is briefly unavailable the EventSource just
  // keeps retrying; the list/transcript still work from the initial fetch.
  useEffect(() => {
    const source = new EventSource('/api/chatlink/stream');
    source.onmessage = (e) => {
      let msg: ChatLinkEvent;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'session.upsert':
          setSessions((prev) => {
            const next = prev.some((s) => s.id === msg.session.id)
              ? prev.map((s) => (s.id === msg.session.id ? msg.session : s))
              : [...prev, msg.session];
            return next.sort((a, b) => b.updatedAt - a.updatedAt);
          });
          break;
        case 'session.remove':
          setSessions((prev) => prev.filter((s) => s.id !== msg.sessionId));
          break;
        case 'transcript.snapshot':
          setTurns((prev) => (msg.sessionId === selectedId ? msg.turns : prev));
          break;
        case 'transcript.append':
          setTurns((prev) => (msg.sessionId === selectedId ? [...prev, ...msg.turns] : prev));
          break;
      }
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setTurns([]);
      return;
    }
    fetch(`/api/chatlink/sessions/${selectedId}`)
      .then((r) => (r.ok ? r.json() : { turns: [] }))
      .then((data) => setTurns(data.turns ?? []))
      .catch(() => setTurns([]));
  }, [selectedId]);

  const grouped = useMemo(() => {
    const byWorkspace = new Map<string, ChatSessionMeta[]>();
    for (const s of sessions) {
      const list = byWorkspace.get(s.workspace) ?? [];
      list.push(s);
      byWorkspace.set(s.workspace, list);
    }
    return [...byWorkspace.entries()];
  }, [sessions]);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Sessions</h1>
        <p className="mt-1 text-sm text-muted">
          Live-linked chats from VS Code Copilot and Claude Code, running on your own device.
        </p>
      </div>

      <DevicesPanel />

      {sessions.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
          No sessions yet. Pair a device above, then run <code className="font-mono">npm run chat-bridge</code> on
          your machine.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            {grouped.map(([workspace, list]) => (
              <div key={workspace}>
                <p className="mb-1.5 truncate px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {workspace}
                </p>
                <ul className="space-y-1">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setSelectedId(s.id)}
                        className={[
                          'block w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                          s.id === selectedId ? 'bg-brass-soft' : 'hover:bg-canvas',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-ink">{s.title || 'Untitled session'}</span>
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">
                            {SOURCE_LABEL[s.source]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {s.requestCount} turn{s.requestCount === 1 ? '' : 's'} · {relativeTime(s.updatedAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            {!selected ? (
              <p className="text-sm text-muted">Select a session to view its transcript.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-ink">{selected.title || 'Untitled session'}</h2>
                  <p className="text-xs text-muted">
                    {SOURCE_LABEL[selected.source]} · {selected.workspace}
                  </p>
                </div>
                {turns.length === 0 ? (
                  <p className="text-sm text-muted">No turns synced for this session yet.</p>
                ) : (
                  <div className="space-y-3">
                    {turns.map((t, i) => (
                      <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
                        <div
                          className={[
                            'inline-block max-w-[85%] rounded-xl px-3 py-2 text-left text-sm whitespace-pre-wrap',
                            t.role === 'user' ? 'bg-brass-soft text-ink' : 'bg-canvas text-ink',
                          ].join(' ')}
                        >
                          {t.text ||
                            t.parts
                              ?.filter((p) => p.text)
                              .map((p) => p.text)
                              .join('\n') || <span className="text-muted italic">({t.parts?.[0]?.kind ?? 'no content'})</span>}
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] text-muted">{new Date(t.timestamp).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
