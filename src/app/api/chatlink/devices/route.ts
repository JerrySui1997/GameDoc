import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/personal';
import { createDeviceToken, listDeviceTokens, revokeDeviceToken } from '@/lib/chatlink/deviceToken';

// Manage device-pairing tokens for the local chat-bridge, from /app/sessions.
// The raw token is only ever returned once, at creation — the list view
// shows id + label + createdAt, never the secret again, so a screen share of
// /app/sessions can't leak a live credential.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const tokens = await listDeviceTokens(userId);
  return NextResponse.json(tokens);
}

const CreateSchema = z.object({ label: z.string().min(1).max(80) });

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = CreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, token } = await createDeviceToken(userId, parsed.data.label);
  return NextResponse.json({ id, token, label: parsed.data.label }, { status: 201 });
}

const RevokeSchema = z.object({ id: z.string().min(1) });

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = RevokeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await revokeDeviceToken(userId, parsed.data.id);
  return NextResponse.json({ ok: true });
}
