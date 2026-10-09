'use client'
import { useEffect, useReducer, useRef } from 'react'
import { done, LV } from '@/lib/game'
import { Arena } from '@/lib/arena'
import { pusher } from '@/lib/realtime'

export type OnlineMatch = { matchId: string; myId: string }
export type BattleCfg = { n: number; text: string; vs: string; vsColor?: string; wpm?: number; level?: number; online?: OnlineMatch }
type Props = BattleCfg & { me: string; onExit: () => void; onRetry: () => void; onNext: () => void; onWin: () => void }

export default function Battle({ text, me, vs, vsColor, wpm, level, online, onExit, onRetry, onNext, onWin }: Props) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  // all game state lives in one mutable object; bump() re-renders
  const g = useRef({
    pos: 0, opos: 0, typed: 0, acc: 0, t0: 0,
    phase: 'count' as 'count' | 'fight' | 'wait' | 'end', cd: '3', bad: false, win: false, why: '', wpm: 0, showRes: false,
  }).current
  const canvas = useRef<HTMLCanvasElement>(null)
  const arena = useRef<Arena | null>(null)

  useEffect(() => {
    arena.current = new Arena(canvas.current!, ['#6ec1ff', vsColor ?? '#ff8a6e'])
    return () => arena.current?.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timers: number[] = []
    let bot = 0
    const later = (f: () => void, ms: number) => { timers.push(window.setTimeout(f, ms)) }

    const hit = (a: 0 | 1, before: number) => { // before = progress prior to this hit
      const after = a ? g.opos : g.pos
      arena.current?.hit(a, Math.max(1, Math.round(100 * (done(text, after) - done(text, before)) / text.length)))
      bump()
    }
    const end = (win: boolean, why = '') => {
      if (g.phase === 'end') return
      g.phase = 'end'; g.win = win; g.why = why; clearInterval(bot)
      g.wpm = Math.round(g.typed / 5 / ((Date.now() - g.t0) / 60000)) || 0
      later(() => arena.current?.ko(win ? 1 : 0), 250)
      later(() => { g.showRes = true; bump() }, 1000)
      if (win) onWin()
      bump()
    }

    // countdown, then fight
    later(() => { g.cd = '2'; bump() }, 800)
    later(() => { g.cd = '1'; bump() }, 1600)
    later(() => {
      g.cd = 'FIGHT!'; g.phase = 'fight'; g.t0 = Date.now(); bump()
      if (!online && wpm) bot = window.setInterval(() => { // bot types wpm*5 chars/min with jitter
        g.acc += wpm * 5 / 60 * 0.1 * (0.8 + Math.random() * 0.4)
        const n = Math.min(text.length, g.acc | 0), had = g.opos
        g.opos = n
        if (done(text, n) > done(text, had)) { hit(1, had); if (n === text.length) end(false) }
      }, 100)
    }, 2400)
    later(() => { g.cd = ''; bump() }, 3000)

    // online: opponent progress and the final result come from the server through Pusher
    let ch: ReturnType<ReturnType<typeof pusher>['subscribe']> | null = null
    const post = (path: string, body?: object) =>
      fetch(`/api/match/${online!.matchId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
    if (online) {
      ch = pusher().subscribe('private-match-' + online.matchId)
      ch.bind('pos', (d: { userId: string; n: number }) => {
        if (d.userId === online.myId || g.phase === 'end') return
        const had = g.opos; g.opos = d.n; hit(1, had)
      })
      ch.bind('result', (d: { winnerId: string; why?: string }) => end(d.winnerId === online.myId, d.why))
    }
    const bye = () => { if (online && g.phase !== 'end') navigator.sendBeacon(`/api/match/${online.matchId}/forfeit`) } // tab closed mid-match
    addEventListener('pagehide', bye)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !online) return onExit()
      if (g.phase !== 'fight' || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return
      e.preventDefault()
      if (e.key !== text[g.pos]) { g.bad = true; bump(); later(() => { g.bad = false; bump() }, 100); return }
      const before = g.pos
      g.pos++; g.typed++
      if (g.pos === text.length || text[g.pos - 1] === ' ') {
        hit(0, before)
        if (online) post('pos', { n: g.pos })
        if (g.pos === text.length) { if (online) g.phase = 'wait'; else end(true) }
      }
      bump()
    }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey); removeEventListener('pagehide', bye)
      clearInterval(bot); timers.forEach(clearTimeout)
      if (online) { ch?.unbind_all(); pusher().unsubscribe('private-match-' + online.matchId) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hp = (side: number) => 100 - 100 * done(text, side ? g.pos : g.opos) / text.length
  const p = g.pos

  return (
    <section>
      <div className="bars">
        {[me, vs].map((n, s) => (
          <div key={s}><b>{n}</b><div className="bar"><i style={{ width: hp(s) + '%' }} /></div></div>
        ))}
      </div>
      <div id="arena">
        <canvas ref={canvas} />
        <div id="cd">{g.cd}</div>
      </div>
      <div id="txt" style={g.bad ? { background: '#5c2030' } : undefined}>
        <b>{text.slice(0, p)}</b><u>{text[p] === ' ' ? ' ' : text[p] ?? ''}</u>{text.slice(p + 1)}
      </div>
      {g.showRes && (
        <div id="res">
          <h2>{g.win ? 'MENANG!' : 'KALAH...'}</h2>
          <p>{g.why} {g.wpm} WPM</p>
          {level && g.win && level < LV.length && <button onClick={onNext}>Level {level + 1} ▶</button>}{' '}
          {level && <button onClick={onRetry}>Ulang</button>}{' '}
          <button onClick={onExit}>Menu</button>
        </div>
      )}
    </section>
  )
}
