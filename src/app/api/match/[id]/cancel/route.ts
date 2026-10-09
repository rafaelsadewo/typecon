import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser, fail } from '@/lib/auth'
import { push } from '@/lib/pusher'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  const m = await db.match.findUnique({ where: { id } })
  if (!m || m.hostId !== u.id) return fail('Tantangan nggak ketemu', 404)
  const r = await db.match.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'DECLINED' } })
  if (r.count) await push('private-user-' + m.guestId, 'cancelled', { matchId: id })
  return NextResponse.json({ ok: true })
}
