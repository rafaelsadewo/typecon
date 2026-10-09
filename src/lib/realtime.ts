import PusherJS from 'pusher-js'

export const realtimeReady = !!process.env.NEXT_PUBLIC_PUSHER_KEY

let p: PusherJS | null = null
/** one shared Pusher connection; channel auth goes through our cookie-protected endpoint */
export const pusher = () =>
  (p ??= new PusherJS(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap1',
    channelAuthorization: { endpoint: '/api/pusher/auth', transport: 'ajax' },
  }))
