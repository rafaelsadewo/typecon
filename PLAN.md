# TypeCon — Planning (v2: Next.js + Prisma + Vercel)

Game ngetik multiplayer: lomba ngetik tapi karakternya (dibuat dari huruf/ASCII) berantem. Bisa online sama temen (username + temenan), bisa solo lawan bot dengan level.

---

## 1. Konsep

| | |
|---|---|
| Genre | Typing race + fighting |
| Platform | Browser desktop (keyboard fisik) |
| Pemain | 1 (solo vs bot) atau 2 (online, temen) |
| Visual | Karakter dari huruf/teks monospace, tanpa sprite |
| Satu match | ±30–60 detik |

Inti: **ngetik kata = mukul lawan**. Makin cepet dan akurat, makin cepet lawan KO.

---

## 2. Tech stack

| Bagian | Pilihan | Kenapa |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript (TSX)** | Frontend + API dalam satu project, deploy 1 klik di Vercel. |
| Database | **PostgreSQL di Neon** (integrasi Vercel, gratis) | Postgres hosted; cocok serverless. |
| ORM | **Prisma** | Schema + migrasi + query type-safe. |
| Login | Username + password: **`bcryptjs`** (hash) + **`jose`** (JWT di cookie httpOnly) | Kecil, nggak butuh library auth besar. |
| Realtime | **Pusher Channels** (free tier) | Lihat catatan di bawah. |
| Styling | CSS biasa (global) | Game-nya cuma teks + animasi CSS. |
| Hosting | **Vercel** | Gratis, deploy dari GitHub. |

### Kenapa butuh Pusher? (penting)
Prisma itu cuma ORM, bukan realtime. Dan **Vercel itu serverless: nggak bisa nahan koneksi WebSocket**. Jadi push realtime (undangan, progres lawan, status online) dititipin ke layanan realtime. Pilihan:

| Opsi | Catatan |
|---|---|
| **Pusher Channels** (pilihan) | Gratis (±100 koneksi bareng, 200rb pesan/hari), SDK simpel, ada Presence buat status online. |
| Ably | Mirip Pusher, free tier lebih longgar, SDK lebih besar. |
| Polling ke API | Tanpa layanan tambahan, tapi lag dan boros request — jelek buat game realtime. |

### Yang sengaja nggak dipakai
- Auth.js/NextAuth → ketebalan nggak sebanding buat login username+password doang.
- Tailwind / UI library → belum perlu.
- Server WebSocket sendiri → nggak jalan di Vercel.

---

## 3. Arsitektur

```
Browser A ──HTTP──► Next.js API (Vercel) ──► Postgres (Prisma)
    ▲                       │
    └──── Pusher ◄──────────┘ (server yang nge-trigger event)
Browser B ◄──── Pusher
```

Prinsip: **server wasit** (authoritative). Client kirim progres ngetik ke API; server validasi, simpan, lalu broadcast lewat Pusher. Jadi anti-cheat dasar dapat dari awal.

### Model database (Prisma)

| Model | Field utama |
|---|---|
| `User` | `id`, `username` (unik, case-insensitive), `passwordHash`, `soloLevel` (level solo tertinggi yang kebuka), `createdAt` |
| `Friendship` | `userId`, `friendId` (dua baris per pasangan, unik) |
| `Match` | `id`, `hostId`, `guestId`, `text`, `status` (`PENDING`/`ACTIVE`/`DONE`/`DECLINED`), `winnerId?`, `hostPos`, `guestPos`, `createdAt`, `startedAt?` |

Undangan = `Match` berstatus `PENDING`. Riwayat match & statistik dapat gratis dari tabel ini.

### Channel Pusher
| Channel | Tipe | Isi |
|---|---|---|
| `presence-lobby` | Presence | Siapa yang online (dikenali dari `userId`) |
| `private-user-<id>` | Private | Undangan masuk, tantangan ditolak/dibatalin, temen baru, match mulai |
| `private-match-<id>` | Private | `pos {userId, n}`, `result {winnerId}` |

Auth channel lewat `POST /api/pusher/auth` (cek cookie login).

### API routes
| Route | Fungsi |
|---|---|
| `POST /api/auth/register` · `/login` · `/logout` · `GET /api/me` | Akun & sesi |
| `GET/POST /api/friends` | Daftar temen; tambah temen (dua arah) |
| `POST /api/match` | Tantang temen → buat `PENDING` + trigger undangan |
| `POST /api/match/[id]/accept` · `/decline` | Terima/tolak; accept → `ACTIVE` + trigger `start` ke dua pemain |
| `POST /api/match/[id]/pos {n}` | Progres ngetik. Validasi: anggota match, status `ACTIVE`, `n` naik, kecepatan masuk akal. Selesai → set pemenang (atomic) + trigger `result`. |
| `POST /api/match/[id]/forfeit` | Menyerah / kabur (dipanggil juga lewat `sendBeacon` saat tab ditutup) |
| `POST /api/solo/win {level}` | Naikin `soloLevel` |

Teks lomba dibuat server saat match dibuat, jadi nggak bisa dicurangi dari client.

---

## 4. Gameplay

### Alur match
1. Countdown 3-2-1-FIGHT (server kirim waktu mulai).
2. Dua pemain dapat teks yang sama (±25 kata).
3. Huruf bener → kursor maju. Salah → nggak maju, layar kedip merah (nggak ada backspace).
4. Tiap **kata selesai** = 1 pukulan: karakter nyerang, lawan kena hit, HP lawan turun.
5. Yang duluan nyelesaiin seluruh teks = KO → menang.
6. Hasil: menang/kalah + WPM.

### Damage
```
HP lawan = 100 − 100 × (huruf di kata yang udah selesai) / (panjang teks)
```
Kata panjang = pukulan lebih sakit.

### Mode
- **Solo (10 level)** — bot ngetik dengan kecepatan tetap + sedikit random. Progres disimpan di akun.

  | Level | Lawan | WPM bot | Kata |
  |---|---|---|---|
  | 1 | Slime | 15 | pendek |
  | 2–9 | Goblin … Dragon | 22–71 | makin panjang |
  | 10 | KING TYPO | 78 | paling panjang |
- **Online (temen)** — tambah temen via username, tantang yang lagi online, 1v1.

### Karakter
Dari karakter teks, kepala = huruf pertama username:
```
  S        S         S
 /|\      /|--      \|/ !
 / \      / \       / \
 idle     punch     kena hit
```
Frame lain: kick, KO. Lawan = versi cermin.

---

## 5. Struktur project (rencana)

```
typecon/
├─ prisma/schema.prisma
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                  # login / menu
│  │  ├─ play/page.tsx             # arena
│  │  └─ api/...                   # route handler (lihat tabel API)
│  ├─ components/                  # Battle, FriendList, dll
│  └─ lib/                         # db.ts (Prisma), auth.ts, pusher.ts, game.ts
├─ .env.example                    # DATABASE_URL, JWT_SECRET, PUSHER_*
└─ PLAN.md
```

---

## 6. Roadmap

**Fase 1 — MVP**
1. Setup Next.js + Prisma + Neon, migrasi schema.
2. Register/login (bcrypt + JWT cookie).
3. Mode solo + arena + animasi (port dari prototipe sebelumnya) + simpan `soloLevel`.
4. Temen: tambah, daftar, status online (Pusher presence).
5. Match online: tantang → terima → countdown → balapan → hasil.
6. Deploy Vercel (env var + `prisma migrate deploy`).

**Fase 2 — Rasa game**
Combo, penalti salah ketik, efek & suara, kursor lawan di teks, rematch.

**Fase 3 — Sosial & ketahanan**
Request temen (konfirmasi), hapus temen, room code, forfeit otomatis kalau lawan idle (cron/timeout), rate limit API, reconnect.

**Fase 4 — Konten**
Riwayat match, leaderboard & statistik (WPM terbaik, win/lose), mode kata baru (Indonesia/kode/kalimat), skin karakter, power-up, 3–4 pemain, mobile.

---

## 7. Yang perlu disiapin
| # | Apa | Buat |
|---|---|---|
| 1 | Akun **GitHub** | Repo kode |
| 2 | Akun **Vercel** (login GitHub) | Hosting |
| 3 | **Neon** Postgres (bisa dibuat langsung dari dashboard Vercel → Storage) | Database |
| 4 | Akun **Pusher** → bikin app Channels (cluster terdekat, mis. `ap1`) | Realtime |
| 5 | Node.js (udah ada) | Development |

Dari Pusher ambil: `app_id`, `key`, `secret`, `cluster`. Dari Neon: connection string. `JWT_SECRET` = string acak panjang (gue bantu generate).

---

## 8. Keputusan terbuka
1. Realtime: **Pusher** (default) atau Ably?
2. Bahasa teks: Inggris, Indonesia, atau campur?
3. Tetap 1v1 atau nanti 3–4 pemain?
4. Mobile penting atau cukup desktop?
