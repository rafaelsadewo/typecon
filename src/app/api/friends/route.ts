import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser, fail } from '@/lib/auth'
import { push } from '@/lib/pusher'

async function list(userId: string) {
  const rows = await db.friendship.findMany({ where: { userId }, include: { friend: true }, orderBy: { friend: { username: 'asc' } } })
  return rows.map(r => ({ id: r.friend.id, name: r.friend.display }))
}

export async function GET() {
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  return NextResponse.json(await list(u.id))
}

// add a friend by username (both directions at once)
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  const { username } = await req.json().catch(() => ({}))
  if (typeof username !== 'string') return fail('Isi username temen')
  const friend = await db.user.findUnique({ where: { username: username.trim().toLowerCase() } })
  if (!friend) return fail('User nggak ketemu', 404)
  if (friend.id === u.id) return fail('Itu lu sendiri')
  await db.friendship.createMany({ data: [{ userId: u.id, friendId: friend.id }, { userId: friend.id, friendId: u.id }], skipDuplicates: true })
  await push('private-user-' + friend.id, 'friends', {})
  return NextResponse.json(await list(u.id))
}
