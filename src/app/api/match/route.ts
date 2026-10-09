import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser, fail } from '@/lib/auth'
import { makeText } from '@/lib/game'
import { push } from '@/lib/pusher'

// challenge a friend: creates a PENDING match (the invite) and pings them
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  const { friendId } = await req.json().catch(() => ({}))
  if (typeof friendId !== 'string') return fail('Pilih temen')
  const isFriend = await db.friendship.findUnique({ where: { userId_friendId: { userId: u.id, friendId } } })
  if (!isFriend) return fail('Bukan temen lu', 403)

  // expire abandoned matches so nobody stays "busy" forever
  await db.match.updateMany({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 60_000) } }, data: { status: 'DECLINED' } })
  await db.match.updateMany({ where: { status: 'ACTIVE', startedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: 'DONE' } })
  const busy = await db.match.findFirst({
    where: { status: { in: ['PENDING', 'ACTIVE'] }, OR: [{ hostId: { in: [u.id, friendId] } }, { guestId: { in: [u.id, friendId] } }] },
  })
  if (busy) return fail('Salah satu lagi ada match, coba lagi bentar', 409)

  const match = await db.match.create({ data: { hostId: u.id, guestId: friendId, text: makeText(25, 0.3) } })
  await push('private-user-' + friendId, 'invite', { matchId: match.id, from: { id: u.id, name: u.display } })
  return NextResponse.json({ matchId: match.id })
}
