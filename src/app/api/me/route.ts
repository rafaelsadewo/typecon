import { NextResponse } from 'next/server'
import { currentUser, publicUser } from '@/lib/auth'

export async function GET() {
  const u = await currentUser()
  return NextResponse.json(u ? publicUser(u) : null)
}
