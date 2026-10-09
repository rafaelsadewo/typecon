// Cinematic 2D stickman fight on a canvas. No assets: each fighter is a skeleton posed by joint angles,
// tweened every frame; attacks are short pose scripts. On top: camera zoom/pan, hit-stop, slow-mo KO,
// motion trails, neon glow, slash/impact effects, letterbox bars.

// Angles in degrees, 0 = up, 90 = forward, 180 = down, negative = backward.
type Pose = { torso: number; aF: [number, number]; aB: [number, number]; lF: [number, number]; lB: [number, number]; y: number; rot: number }
const P = (torso: number, aF: [number, number], aB: [number, number], lF: [number, number], lB: [number, number], y = 0, rot = 0): Pose =>
  ({ torso, aF, aB, lF, lB, y, rot })

const GUARD = P(8, [125, 35], [150, 60], [155, 178], [205, 185])
const POSES = {
  punchWind: P(-6, [165, 120], [140, 50], [150, 175], [210, 190], 2),
  punch: P(30, [88, 86], [165, 110], [120, 170], [215, 190], 5),
  kickWind: P(-6, [140, 60], [140, 40], [95, 175], [185, 180]),
  kick: P(-18, [40, 10], [-60, -30], [88, 90], [185, 180], 8),
  upperWind: P(15, [170, 160], [150, 90], [135, 185], [210, 190], 12),
  upper: P(-5, [40, 10], [150, 70], [135, 175], [205, 185], -4),
  hurt: P(-30, [205, 250], [-40, -80], [170, 185], [215, 200], 2),
  ko: P(0, [140, 150], [-140, -150], [170, 185], [190, 195], 44, -90),
  win: P(0, [20, 5], [-20, -5], [160, 180], [200, 180]),
}
type PoseName = keyof typeof POSES

// each move: [pose, ms] steps; impact = ms after start when the hit lands; slash = effect style
const MOVES: { steps: [PoseName, number][]; impact: number; slash: 0 | 1 | 2 }[] = [
  { steps: [['punchWind', 60], ['punch', 170]], impact: 90, slash: 0 },
  { steps: [['punchWind', 60], ['punch', 170]], impact: 90, slash: 0 },
  { steps: [['kickWind', 80], ['kick', 200]], impact: 130, slash: 1 },
  { steps: [['upperWind', 70], ['upper', 200]], impact: 110, slash: 2 },
]

const W = 800, H = 340, GROUND = 285, HIP = 52, S = 1.3, BASE_X = [290, 510], DASH = 150, KNOCK = 40
const KEYS = ['torso', 'y', 'rot'] as const
type Fighter = {
  dir: 1 | -1; color: string; shade: string; cur: Pose; target: Pose
  script: [PoseName, number][]; st: number; ox: number; oxT: number; moves: number; ko: boolean; win: boolean; ph: number
  trail: { pose: Pose; x: number }[]
}
type Fx = { x: number; y: number; vx: number; vy: number; life: number; max: number; kind: 'spark' | 'line' | 'dust'; r: number }
type Pop = { x: number; y: number; text: string; life: number }
type Slash = { x: number; y: number; dir: 1 | -1; kind: number; life: number }
type Ring = { x: number; y: number; life: number; max: number }
type Cam = { x: number; y: number; z: number }

const clone = (p: Pose): Pose => ({ ...p, aF: [...p.aF], aB: [...p.aB], lF: [...p.lF], lB: [...p.lB] })
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
function ease(cur: Pose, tgt: Pose, k: number, kBody: number) {
  for (const key of KEYS) cur[key] = lerp(cur[key], tgt[key], key === 'torso' ? k : kBody)
  for (const l of ['aF', 'aB', 'lF', 'lB'] as const) { cur[l][0] = lerp(cur[l][0], tgt[l][0], k); cur[l][1] = lerp(cur[l][1], tgt[l][1], k) }
}
const vec = (deg: number, len: number): [number, number] => [Math.sin(deg * Math.PI / 180) * len, -Math.cos(deg * Math.PI / 180) * len]
const CENTER: Cam = { x: W / 2, y: H / 2 + 5, z: 1 }

export class Arena {
  private ctx: CanvasRenderingContext2D
  private f: Fighter[]
  private fx: Fx[] = []; private pops: Pop[] = []; private slashes: Slash[] = []; private rings: Ring[] = []
  private q: { at: number; fn: () => void }[] = []
  private stars = Array.from({ length: 50 }, () => [Math.random() * W * 3 - W, Math.random() * 170, Math.random() * 1.4 + 0.4])
  private sim = 0; private real = 0; private last = 0; private raf = 0
  private stopUntil = 0; private slowUntil = 0; private slowScale = 1
  private cam: Cam = { ...CENTER }; private hitCam: Cam = CENTER; private koCam: Cam = CENTER
  private zoomUntil = 0; private camHold = 0
  private shake = 0; private flash = 0; private bars = 0; private barsT = 0; private koAt = -1

  constructor(private canvas: HTMLCanvasElement, colors: [string, string]) {
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr; canvas.height = H * dpr
    this.ctx = canvas.getContext('2d')!
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.f = [0, 1].map(i => ({
      dir: i ? -1 : 1, color: colors[i], shade: colors[i] + 'aa', cur: clone(GUARD), target: GUARD,
      script: [], st: 0, ox: 0, oxT: 0, moves: 0, ko: false, win: false, ph: i * 2, trail: [],
    } as Fighter))
    this.raf = requestAnimationFrame(this.frame)
  }
  destroy() { cancelAnimationFrame(this.raf) }

  /** attacker `a` lands a hit worth `dmg` hp */
  hit(a: 0 | 1, dmg: number) {
    const d = (1 - a) as 0 | 1, A = this.f[a], D = this.f[d]
    if (A.ko || D.ko) return
    const mv = MOVES[A.moves++ % MOVES.length]
    A.script = mv.steps.map(s => [...s] as [PoseName, number]); A.st = 0
    A.oxT = A.dir * DASH
    this.dust(BASE_X[a] + A.ox, 5)
    const total = mv.steps.reduce((s, [, ms]) => s + ms, 0)
    this.at(total + 60, () => { A.oxT = 0 })
    this.at(mv.impact, () => {
      if (D.ko) return
      D.script = [['hurt', 170]]; D.st = 0; D.oxT = -D.dir * KNOCK
      this.at(200, () => { D.oxT = 0 })
      const x = BASE_X[d] + D.ox, y = GROUND - 100
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2, v = 140 + Math.random() * 220
        this.fx.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 0.35, max: 0.35, kind: 'spark', r: 0 })
      }
      this.rings.push({ x, y, life: 0.3, max: 0.3 })
      this.slashes.push({ x, y, dir: A.dir, kind: mv.slash, life: 0.18 })
      this.dust(x, 6)
      this.pops.push({ x, y: y - 40, text: '-' + dmg, life: 0.9 })
      this.shake = 9; this.flash = 0.22
      this.stopUntil = this.real + 70 // hit-stop
      this.hitCam = { x: (BASE_X[a] + A.ox + x) / 2, y: GROUND - 110, z: 1.2 }; this.zoomUntil = this.real + 320
    })
  }

  /** finishing blow: `loser` is launched and falls in slow motion, the other celebrates */
  ko(loser: 0 | 1) {
    const L = this.f[loser], Wn = this.f[1 - loser]
    L.ko = true; L.script = []; L.target = POSES.ko; L.oxT = -L.dir * 200
    Wn.win = true; Wn.script = []; Wn.target = POSES.win; Wn.oxT = 0
    this.slowScale = 0.18; this.slowUntil = this.real + 1300
    this.koCam = { x: BASE_X[loser] - L.dir * 90, y: GROUND - 90, z: 1.65 }; this.camHold = this.real + 3200
    this.barsT = 1; this.shake = 16; this.flash = 0.9; this.koAt = this.real
    const x = BASE_X[loser] + L.ox
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2, v = 200 + Math.random() * 320
      this.fx.push({ x, y: GROUND - 100, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 0.7, max: 0.7, kind: 'spark', r: 0 })
    }
    this.rings.push({ x, y: GROUND - 100, life: 0.5, max: 0.5 })
  }

  private at(ms: number, fn: () => void) { this.q.push({ at: this.sim + ms, fn }) }
  private dust(x: number, n: number) {
    for (let i = 0; i < n; i++) this.fx.push({ x: x + (Math.random() - 0.5) * 30, y: GROUND + 2, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 40, life: 0.5, max: 0.5, kind: 'dust', r: 4 + Math.random() * 5 })
  }

  private frame = (t: number) => {
    const dr = Math.min(0.05, (t - (this.last || t)) / 1000); this.last = t; this.real = t
    this.raf = requestAnimationFrame(this.frame) // schedule first so one bad frame can't kill the loop
    this.update(dr)
    this.draw(t / 1000)
  }

  private update(dr: number) {
    const ts = this.real < this.stopUntil ? 0.03 : this.real < this.slowUntil ? this.slowScale : 1
    const dt = dr * ts
    this.sim += dt * 1000
    const due = this.q.filter(e => e.at <= this.sim); this.q = this.q.filter(e => e.at > this.sim)
    due.forEach(e => e.fn())

    for (const f of this.f) {
      if (!f.ko && !f.win && f.script.length) {
        f.target = POSES[f.script[0][0]]; f.st += dt * 1000
        if (f.st >= f.script[0][1]) { f.st = 0; f.script.shift(); if (!f.script.length) f.target = GUARD }
      }
      ease(f.cur, f.target, 1 - Math.exp(-dt * 28), 1 - Math.exp(-dt * (f.ko ? 7 : 28)))
      f.ox = lerp(f.ox, f.oxT, 1 - Math.exp(-dt * (f.ko ? 6 : 18)))

      const dashing = !f.ko && Math.abs(f.ox) > 25 && Math.abs(f.oxT) > 25
      if (dashing || (f.ko && Math.abs(f.oxT - f.ox) > 25)) {
        f.trail.push({ pose: clone(f.cur), x: f.ox }); if (f.trail.length > 6) f.trail.shift()
        if (dashing && Math.random() < 0.7) { // speed lines
          const bx = BASE_X[this.f.indexOf(f)] + f.ox
          this.fx.push({ x: bx - f.dir * 30, y: GROUND - 20 - Math.random() * 110, vx: -f.dir * 500, vy: 0, life: 0.2, max: 0.2, kind: 'line', r: 40 + Math.random() * 40 })
        }
      } else if (f.trail.length) f.trail.shift()
    }

    this.fx = this.fx.filter(p => (p.life -= dt) > 0)
    this.fx.forEach(p => {
      p.x += p.vx * dt; p.y += p.vy * dt
      if (p.kind === 'spark') { p.vx *= 0.92; p.vy = p.vy * 0.92 + 120 * dt } else if (p.kind === 'dust') { p.vx *= 0.95; p.r += 14 * dt }
    })
    this.pops = this.pops.filter(p => (p.life -= dt) > 0); this.pops.forEach(p => { p.y -= 45 * dt })
    this.slashes = this.slashes.filter(s => (s.life -= dt) > 0)
    this.rings = this.rings.filter(r => (r.life -= dt) > 0)

    // camera: KO close-up > hit punch-in > default
    const tg = this.real < this.camHold ? this.koCam : this.real < this.zoomUntil ? this.hitCam : CENTER
    const k = 1 - Math.exp(-dr * (this.real < this.camHold ? 4 : 9))
    this.cam.z = lerp(this.cam.z, tg.z, k)
    const hw = W / (2 * this.cam.z), hh = H / (2 * this.cam.z)
    this.cam.x = lerp(this.cam.x, Math.min(W - hw, Math.max(hw, tg.x)), k)
    this.cam.y = lerp(this.cam.y, Math.min(H - hh, Math.max(hh, tg.y)), k)

    this.shake *= Math.exp(-dr * 12); this.flash *= Math.exp(-dr * 5)
    this.bars = lerp(this.bars, this.barsT, 1 - Math.exp(-dr * 6))
  }

  private draw(t: number) {
    const c = this.ctx, cam = this.cam
    c.save()
    c.clearRect(0, 0, W, H)
    c.save()
    if (this.shake > 0.3) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake)
    c.translate(W / 2, H / 2); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y)
    this.drawWorld(t)
    c.restore()

    // screen-space overlays: vignette, flash, letterbox, K.O. text
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65)
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)')
    c.fillStyle = vg; c.fillRect(0, 0, W, H)
    if (this.flash > 0.02) { c.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`; c.fillRect(0, 0, W, H) }
    c.fillStyle = '#000'; const bh = 44 * this.bars; c.fillRect(0, 0, W, bh); c.fillRect(0, H - bh, W, bh)
    if (this.koAt >= 0) {
      const age = (this.real - this.koAt) / 1000
      if (age < 2.6) {
        const s = age < 0.25 ? 3 - 2 * (age / 0.25) : 1 + Math.sin(age * 3) * 0.03
        c.save(); c.translate(W / 2, H / 2 - 20); c.scale(s, s); c.globalAlpha = Math.min(1, age * 6, (2.6 - age) * 3)
        c.font = '900 84px ui-monospace, Consolas, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'
        c.lineWidth = 8; c.strokeStyle = '#000'; c.strokeText('K.O.', 0, 0)
        c.fillStyle = '#ffd24a'; c.shadowColor = '#ff7a00'; c.shadowBlur = 24; c.fillText('K.O.', 0, 0)
        c.restore()
      }
    }
    c.restore()
  }

  private drawWorld(t: number) {
    const c = this.ctx, px = (f: number) => (this.cam.x - W / 2) * f // parallax: far layers follow the camera
    const sky = c.createLinearGradient(0, 0, 0, GROUND)
    sky.addColorStop(0, '#0b0e22'); sky.addColorStop(1, '#2d2760')
    c.fillStyle = sky; c.fillRect(-W, -H, W * 3, H * 3)

    c.save(); c.translate(px(0.9), 0); c.fillStyle = '#fff'
    for (const [x, y, r] of this.stars) { c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + x); c.fillRect(x, y, r, r) }
    c.restore(); c.globalAlpha = 1
    c.save(); c.translate(px(0.85), 0)
    c.shadowColor = '#f4efd0'; c.shadowBlur = 40; c.fillStyle = '#f4efd0'; c.beginPath(); c.arc(660, 70, 30, 0, 7); c.fill()
    c.restore()
    for (const [off, col, amp] of [[0.6, '#1d1a4a', 1], [0.35, '#15132e', 0.7]] as const) {
      c.save(); c.translate(px(off), 0); c.fillStyle = col; c.beginPath(); c.moveTo(-W, GROUND)
      for (let x = -W; x <= 2 * W; x += 40) c.lineTo(x, GROUND - 45 * amp - 28 * amp * Math.sin(x * 0.012 + off * 9) - 16 * amp * Math.sin(x * 0.04))
      c.lineTo(2 * W, GROUND); c.fill(); c.restore()
    }
    c.fillStyle = '#121029'; c.fillRect(-W, GROUND, W * 3, H)
    c.fillStyle = '#4a4690'; c.fillRect(-W, GROUND, W * 3, 3)
    c.strokeStyle = 'rgba(120,110,220,.12)'; c.lineWidth = 1
    for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(-W, GROUND + i * i * 4); c.lineTo(2 * W, GROUND + i * i * 4); c.stroke() }

    for (const [i, f] of this.f.entries()) {
      const x = BASE_X[i] + f.ox
      const glow = c.createRadialGradient(x, GROUND + 6, 2, x, GROUND + 6, 70)
      glow.addColorStop(0, f.color + '55'); glow.addColorStop(1, f.color + '00')
      c.fillStyle = glow; c.beginPath(); c.ellipse(x, GROUND + 6, 70, 14, 0, 0, 7); c.fill()
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(x, GROUND + 6, f.ko ? 52 : 28, 6, 0, 0, 7); c.fill()
    }
    for (const [i, f] of this.f.entries()) {
      f.trail.forEach((g, n) => this.drawFighter(f, g.pose, BASE_X[i] + g.x, t, 0.1 + 0.04 * n, false))
      this.drawFighter(f, f.cur, BASE_X[i] + f.ox, t, 1, true)
    }

    // effects
    for (const r of this.rings) {
      const u = r.life / r.max; c.globalAlpha = u; c.strokeStyle = '#fff'; c.lineWidth = 4
      c.beginPath(); c.arc(r.x, r.y, 10 + (1 - u) * 60, 0, 7); c.stroke()
    }
    for (const s of this.slashes) {
      c.save(); c.translate(s.x, s.y); c.scale(s.dir, 1); c.globalAlpha = s.life / 0.18
      c.strokeStyle = '#fff'; c.lineWidth = 7; c.lineCap = 'round'; c.shadowColor = '#7fd6ff'; c.shadowBlur = 20
      c.beginPath()
      if (s.kind === 0) { c.moveTo(-80, 0); c.lineTo(30, 0) } else if (s.kind === 1) c.arc(-30, 20, 75, -1.1, 0.3); else c.arc(-10, 45, 70, -2.3, -0.7)
      c.stroke(); c.restore()
    }
    c.globalAlpha = 1
    for (const p of this.fx) {
      const a = Math.max(0, p.life / p.max)
      if (p.kind === 'spark') { c.globalAlpha = a; c.strokeStyle = '#ffd24a'; c.lineWidth = 3; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke() }
      else if (p.kind === 'line') { c.globalAlpha = a * 0.6; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - Math.sign(p.vx) * p.r, p.y); c.stroke() }
      else { c.globalAlpha = a * 0.35; c.fillStyle = '#9a96d8'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill() }
    }
    c.globalAlpha = 1
    c.font = 'bold 30px ui-monospace, Consolas, monospace'; c.textAlign = 'center'
    for (const p of this.pops) {
      c.globalAlpha = Math.min(1, p.life * 2); c.lineWidth = 5; c.strokeStyle = '#000'; c.strokeText(p.text, p.x, p.y)
      c.fillStyle = '#ff5d73'; c.fillText(p.text, p.x, p.y)
    }
    c.globalAlpha = 1
  }

  private drawFighter(f: Fighter, p: Pose, x: number, t: number, alpha: number, glow: boolean) {
    const c = this.ctx
    const idle = !f.ko && !f.script.length && glow
    const bob = idle ? Math.sin(t * 4 + f.ph) : 0
    const y = p.y + bob * 2 - (f.win && glow ? Math.abs(Math.sin(t * 6)) * 8 : 0)
    c.save()
    c.globalAlpha = alpha
    c.translate(x, GROUND - HIP * S + y * S); c.scale(f.dir * S, S); c.rotate(p.rot * Math.PI / 180)
    c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round'
    if (glow) { c.shadowColor = f.color; c.shadowBlur = 14 }

    const limb = (from: [number, number], a: [number, number], l1: number, l2: number, col: string) => {
      const m: [number, number] = [from[0] + vec(a[0], l1)[0], from[1] + vec(a[0], l1)[1]]
      const e: [number, number] = [m[0] + vec(a[1], l2)[0], m[1] + vec(a[1], l2)[1]]
      c.strokeStyle = col; c.beginPath(); c.moveTo(...from); c.lineTo(...m); c.lineTo(...e); c.stroke()
    }
    const torso = p.torso + bob * 1.5
    const [nx, ny] = vec(torso, 44), [hx, hy] = vec(torso, 58)
    const sh: [number, number] = [nx * 0.92, ny * 0.92]

    limb([0, 0], p.lB, 26, 26, f.shade); limb(sh, p.aB, 22, 22, f.shade) // back limbs
    c.strokeStyle = f.color; c.beginPath(); c.moveTo(0, 0); c.lineTo(nx, ny); c.stroke() // torso
    c.fillStyle = '#0f1220'; c.beginPath(); c.arc(hx, hy, 12, 0, 7); c.fill(); c.stroke() // head
    c.shadowBlur = 0; c.fillStyle = f.color; c.fillRect(hx + 3, hy - 4, 3, 3) // eye, shows facing
    if (glow) { c.shadowColor = f.color; c.shadowBlur = 14 }
    limb([0, 0], p.lF, 26, 26, f.color); limb(sh, p.aF, 22, 22, f.color) // front limbs
    c.restore()
  }
}
