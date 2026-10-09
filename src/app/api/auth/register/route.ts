import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, publicUser, setSession } from '@/lib/auth'

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}))
  if (typeof username !== 'string' || !/^\w{3,12}$/.test(username)) return fail('Username 3-12 huruf/angka/_')
  if (typeof password !== 'string' || password.length < 6) return fail('Password minimal 6 karakter')
  const taken = await db.user.findUnique({ where: { username: username.toLowerCase() } })
  if (taken) return fail('Username udah dipakai', 409)
  const user = await db.user.create({
    data: { username: username.toLowerCase(), display: username, passwordHash: await bcrypt.hash(password, 10) },
  })
  await setSession(user.id)
  return NextResponse.json(publicUser(user))
}
