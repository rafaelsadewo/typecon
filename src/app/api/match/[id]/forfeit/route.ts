import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser, fail } from '@/lib/auth'
import { push } from '@/lib/pusher'

// called when a player leaves mid-match (also via sendBeacon on tab close); the other player wins
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  const m = await db.match.findUnique({ where: { id } })
  if (!m || (m.hostId !== u.id && m.guestId !== u.id)) return fail('Match nggak ketemu', 404)
  const winnerId = m.hostId === u.id ? m.guestId : m.hostId
  const r = await db.match.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'DONE', winnerId } })
  if (r.count) await push('private-match-' + id, 'result', { winnerId, why: 'lawan kabur' })
  return NextResponse.json({ ok: true })
}
