import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser, fail } from '@/lib/auth'
import { push } from '@/lib/pusher'

const MAX_CPS = 25 // chars/second ceiling (~300 wpm); anything faster is rejected as cheating

// typing progress: the server validates it, stores it, relays it, and decides the winner
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  const { n } = await req.json().catch(() => ({}))
  const m = await db.match.findUnique({ where: { id } })
  if (!m || (m.hostId !== u.id && m.guestId !== u.id)) return fail('Match nggak ketemu', 404)
  if (m.status !== 'ACTIVE' || !m.startedAt) return fail('Match nggak aktif', 409)

  const isHost = m.hostId === u.id
  const prev = isHost ? m.hostPos : m.guestPos
  const elapsed = (Date.now() - m.startedAt.getTime()) / 1000
  if (!Number.isInteger(n) || n <= prev || n > m.text.length) return fail('Progres nggak valid')
  if (elapsed < -0.8 || n > 15 + MAX_CPS * Math.max(0, elapsed)) return fail('Terlalu cepat', 422)

  await db.match.update({ where: { id }, data: isHost ? { hostPos: n } : { guestPos: n } })
  await push('private-match-' + id, 'pos', { userId: u.id, n })

  if (n === m.text.length) { // first to finish wins; updateMany makes it atomic
    const r = await db.match.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'DONE', winnerId: u.id } })
    if (r.count) await push('private-match-' + id, 'result', { winnerId: u.id })
  }
  return NextResponse.json({ ok: true })
}
