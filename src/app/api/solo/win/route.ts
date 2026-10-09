import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser, fail } from '@/lib/auth'
import { LV } from '@/lib/game'

// unlock the next level; can't skip ahead of what you've unlocked
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return fail('Belum login', 401)
  const { level } = await req.json().catch(() => ({}))
  if (!Number.isInteger(level) || level < 1 || level > u.soloLevel) return fail('Level nggak valid')
  const soloLevel = Math.max(u.soloLevel, Math.min(level + 1, LV.length))
  await db.user.update({ where: { id: u.id }, data: { soloLevel } })
  return NextResponse.json({ soloLevel })
}
