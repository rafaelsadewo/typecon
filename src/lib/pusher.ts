import Pusher from 'pusher'

const { PUSHER_APP_ID: appId, PUSHER_SECRET: secret, NEXT_PUBLIC_PUSHER_KEY: key, NEXT_PUBLIC_PUSHER_CLUSTER: cluster } = process.env
export const pusherReady = !!(appId && secret && key)
const pusher = pusherReady ? new Pusher({ appId: appId!, key: key!, secret: secret!, cluster: cluster || 'ap1', useTLS: true }) : null

/** trigger an event; without Pusher keys it only warns so the API logic can still run locally */
export async function push(channel: string, event: string, data: object) {
  if (!pusher) return void console.warn(`[pusher] belum dikonfigurasi, event "${event}" dilewati`)
  await pusher.trigger(channel, event, data)
}
export const authorize = (socketId: string, channel: string, presence?: { user_id: string; user_info: object }) =>
  pusher!.authorizeChannel(socketId, channel, presence)
