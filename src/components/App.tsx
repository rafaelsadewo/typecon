'use client'
import { useEffect, useRef, useState } from 'react'
import { LV, makeText } from '@/lib/game'
import { pusher, realtimeReady } from '@/lib/realtime'
import Battle, { BattleCfg } from './Battle'

type Me = { id: string; name: string; soloLevel: number }
type Friend = { id: string; name: string }
type Banner = { msg: string; btns: [string, () => void][] } | null
type Start = { matchId: string; text: string; vs: Friend }

async function api<T = unknown>(path: string, body?: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, data: await r.json().catch(() => ({})) }
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined) // undefined = still loading
  const [battle, setBattle] = useState<BattleCfg | null>(null)
  const [form, setForm] = useState({ name: '', pw: '', friend: '' })
  const [toast, setToast] = useState('')
  const [friends, setFriends] = useState<Friend[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [banner, setBanner] = useState<Banner>(null)
  const n = useRef(0)
  const inBattle = useRef(false)
  inBattle.current = !!battle

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }
  useEffect(() => { api<Me | null>('/api/me').then(r => setMe(r.data as Me | null)) }, [])

  async function auth(kind: 'login' | 'register') {
    const r = await api<Me>('/api/auth/' + kind, { username: form.name.trim(), password: form.pw })
    if (!r.ok) return say(r.data.error ?? 'Gagal')
    setMe(r.data); setForm({ ...form, name: '', pw: '' })
  }
  const logout = async () => { await api('/api/auth/logout', {}); location.reload() }

  // ---------- solo ----------
  const solo = (lvl: number) => {
    const l = LV[lvl - 1]
    setBattle({ n: ++n.current, text: makeText(l.words, l.hard), vs: l.name, vsColor: l.color, wpm: l.wpm, level: lvl })
  }
  const onWin = async () => {
    if (!battle?.level) return
    const r = await api<{ soloLevel: number }>('/api/solo/win', { level: battle.level })
    if (r.ok) setMe(m => m && { ...m, soloLevel: r.data.soloLevel })
  }

  // ---------- online: friends, presence, invites ----------
  const loadFriends = async () => { const r = await api<Friend[]>('/api/friends'); if (r.ok) setFriends(r.data as unknown as Friend[]) }
  const startMatch = (s: Start, myId: string) => {
    setBanner(null)
    setBattle({ n: ++n.current, text: s.text, vs: s.vs.name, online: { matchId: s.matchId, myId } })
  }

  useEffect(() => {
    if (!me || !realtimeReady) return
    loadFriends()
    const p = pusher()
    const lobby = p.subscribe('presence-lobby')
    lobby.bind('pusher:subscription_succeeded', (m: { each: (f: (x: { id: string }) => void) => void }) => {
      const s = new Set<string>(); m.each(x => s.add(x.id)); setOnline(s)
    })
    lobby.bind('pusher:member_added', (m: { id: string }) => setOnline(o => new Set(o).add(m.id)))
    lobby.bind('pusher:member_removed', (m: { id: string }) => setOnline(o => { const s = new Set(o); s.delete(m.id); return s }))

    const inbox = p.subscribe('private-user-' + me.id)
    inbox.bind('friends', loadFriends)
    inbox.bind('invite', (d: { matchId: string; from: Friend }) => {
      if (inBattle.current) return void api(`/api/match/${d.matchId}/decline`, {})
      setBanner({ msg: `${d.from.name} nantang lu!`, btns: [
        ['Terima', async () => {
          const r = await api<Start>(`/api/match/${d.matchId}/accept`, {})
          if (!r.ok) { setBanner(null); return say(r.data.error ?? 'Gagal') }
          startMatch(r.data, me.id)
        }],
        ['Tolak', () => { api(`/api/match/${d.matchId}/decline`, {}); setBanner(null) }],
      ] })
    })
    inbox.bind('cancelled', () => { setBanner(null); say('Tantangan dibatalin') })
    inbox.bind('declined', (d: { name: string }) => { setBanner(null); say(d.name + ' nolak') })
    inbox.bind('start', (d: Start) => startMatch(d, me.id))
    return () => {
      lobby.unbind_all(); inbox.unbind_all()
      p.unsubscribe('presence-lobby'); p.unsubscribe('private-user-' + me.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  async function addFriend() {
    const username = form.friend.trim(); setForm({ ...form, friend: '' })
    if (!username) return
    const r = await api<Friend[]>('/api/friends', { username })
    if (!r.ok) return say(r.data.error ?? 'Gagal')
    setFriends(r.data as unknown as Friend[])
  }
  async function challenge(f: Friend) {
    const r = await api<{ matchId: string }>('/api/match', { friendId: f.id })
    if (!r.ok) return say(r.data.error ?? 'Gagal')
    const matchId = r.data.matchId
    setBanner({ msg: `Nunggu ${f.name}...`, btns: [['Batal', () => { api(`/api/match/${matchId}/cancel`, {}); setBanner(null) }]] })
  }

  // ---------- render ----------
  let body
  if (me === undefined) body = <p>Loading...</p>
  else if (!me) {
    body = (
      <section>
        <p>Username (3-12 huruf/angka) + password</p>
        <div className="row">
          <input value={form.name} maxLength={12} autoFocus placeholder="username" onChange={e => setForm({ ...form, name: e.target.value })} />
          <input value={form.pw} type="password" placeholder="password" onChange={e => setForm({ ...form, pw: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && auth('login')} />
        </div>
        <div className="row"><button onClick={() => auth('login')}>Masuk</button><button onClick={() => auth('register')}>Daftar</button></div>
      </section>
    )
  } else if (battle) {
    body = <Battle key={battle.n} {...battle} me={me.name} onExit={() => setBattle(null)} onWin={onWin}
      onRetry={() => battle.level && solo(battle.level)} onNext={() => battle.level && solo(battle.level + 1)} />
  } else {
    body = (
      <section>
        <p>Halo, <b>{me.name}</b> <button onClick={logout}>Keluar</button></p>
        <h2>SOLO — LAWAN BOT</h2>
        <div id="lv">{LV.map((l, i) => <button key={l.name} disabled={i + 1 > me.soloLevel} onClick={() => solo(i + 1)}>{i + 1}. {l.name}</button>)}</div>
        <h2>TEMEN</h2>
        {!realtimeReady && <p style={{ color: 'var(--bad)' }}>Pusher belum dikonfigurasi (.env) — mode online belum aktif.</p>}
        {friends.map(f => (
          <div className="row" key={f.id}>
            <i className={'dot' + (online.has(f.id) ? ' on' : '')} /><span>{f.name}</span>
            <button disabled={!online.has(f.id)} onClick={() => challenge(f)}>Tantang</button>
          </div>
        ))}
        {!friends.length && <p style={{ color: 'var(--dim)' }}>Belum ada temen.</p>}
        <div className="row">
          <input value={form.friend} maxLength={12} placeholder="username temen" onChange={e => setForm({ ...form, friend: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && addFriend()} />
          <button onClick={addFriend}>Tambah</button>
        </div>
      </section>
    )
  }

  return (
    <main>
      <h1>TYPECON</h1>
      {body}
      {banner && <div id="bn">{banner.msg}{banner.btns.map(([l, f]) => <button key={l} onClick={f}>{l}</button>)}</div>}
      {toast && <div id="ts">{toast}</div>}
    </main>
  )
}
