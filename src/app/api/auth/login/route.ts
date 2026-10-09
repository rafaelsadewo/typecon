import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fail, publicUser, setSession } from '@/lib/auth'

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}))
  if (typeof username !== 'string' || typeof password !== 'string') return fail('Isi username & password')
  const user = await db.user.findUnique({ where: { username: username.toLowerCase() } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return fail('Username atau password salah', 401)
  await setSession(user.id)
  return NextResponse.json(publicUser(user))
}
