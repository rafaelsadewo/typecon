import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from './db'

const key = () => new TextEncoder().encode(process.env.JWT_SECRET)
const COOKIE = 'tc'

export async function setSession(userId: string) {
  const token = await new SignJWT({}).setSubject(userId).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('30d').sign(key())
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
}
export const clearSession = async () => { (await cookies()).delete(COOKIE) }

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key())
    return await db.user.findUnique({ where: { id: payload.sub } })
  } catch { return null }
}

type DbUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>
export const publicUser = (u: DbUser) => ({ id: u.id, name: u.display, soloLevel: u.soloLevel })

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
