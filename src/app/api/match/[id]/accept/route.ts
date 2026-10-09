import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser, fail } from '@/lib/auth'
import { push } from '@/lib/pusher'

const START_IN = 2400 // ms between accept and FIGHT; the client countdown matches this

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  const m = await db.match.findUnique({ where: { id }, include: { host: true } })
  if (!m || m.guestId !== u.id) return fail('Tantangan nggak ketemu', 404)
  const r = await db.match.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'ACTIVE', startedAt: new Date(Date.now() + START_IN) } })
  if (!r.count) return fail('Tantangan udah nggak berlaku', 409)
  await push('private-user-' + m.hostId, 'start', { matchId: id, text: m.text, vs: { id: u.id, name: u.display }, startsIn: START_IN })
  return NextResponse.json({ matchId: id, text: m.text, vs: { id: m.host.id, name: m.host.display }, startsIn: START_IN })
}
