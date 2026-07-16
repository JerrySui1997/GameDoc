import { NextResponse } from 'next/server';
import { chatBus } from '@/lib/chatlink/bus';
import { requireUserId } from '@/lib/auth/personal';

// Full transcript for one of the signed-in user's sessions. 404 until the
// bridge has sent at least one transcript.snapshot for this id (sessions can
// exist via session.upsert before their turns have been synced).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const turns = chatBus().getTranscript(userId, id);
  if (!turns) {
    return NextResponse.json({ error: 'No transcript synced for this session yet' }, { status: 404 });
  }
  return NextResponse.json({ sessionId: id, turns });
}
