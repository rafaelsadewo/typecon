import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentUser } from '@/lib/auth'
import { authorize, pusherReady } from '@/lib/pusher'

// Pusher calls this before letting a browser join a private/presence channel
export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return new Response('Belum login', { status: 401 })
  if (!pusherReady) return new Response('Pusher belum dikonfigurasi', { status: 503 })
  const form = await req.formData()
  const socketId = String(form.get('socket_id')), channel = String(form.get('channel_name'))

  if (channel === 'presence-lobby')
    return NextResponse.json(authorize(socketId, channel, { user_id: u.id, user_info: { name: u.display } }))
  if (channel === 'private-user-' + u.id) return NextResponse.json(authorize(socketId, channel))
  const m = channel.match(/^private-match-(\w+)$/)
  if (m) {
    const match = await db.match.findUnique({ where: { id: m[1] } })
    if (match && (match.hostId === u.id || match.guestId === u.id)) return NextResponse.json(authorize(socketId, channel))
  }
  return new Response('Nggak boleh', { status: 403 })
}
