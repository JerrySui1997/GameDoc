import { NextResponse } from 'next/server';
import { chatBus } from '@/lib/chatlink/bus';
import { requireUserId } from '@/lib/auth/personal';

// List every chat session the signed-in user's bridge has reported so far,
// newest first. In-memory snapshot only — restarting the Next server clears
// it until the bridge's next upsert sweep repopulates it.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(chatBus().listSessions(userId));
}
