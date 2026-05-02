# Deploy to Railway

Langkah-langkah men-deploy **SFL Yield Optimizer** ke Railway supaya
dashboard + scheduler + Telegram notification jalan 24/7 walau laptop Master
mati.

## Arsitektur singkat

- **Single service**, single process: Next.js HTTP server + background cron
  scheduler ada di satu proses (lihat `server.ts`).
- **SQLite** di-store di Railway Volume supaya tidak hilang saat redeploy.
  Isi DB: rules, notification log, farm snapshot cache, **14 hari price
  history** buat sparkline.
- **Healthcheck** di `/api/health` — Railway otomatis auto-restart kalau
  endpoint ini gagal.

---

## 1. Prerequisites

- Akun [Railway](https://railway.com/) (paket Hobby $5/bln sudah cukup).
- Akun GitHub (buat push source code).
- Kredensial siap:
  - `SFL_API_KEY` — dari tim Sunflower Land
  - `SFL_FARM_ID` — nomor farm Master di game
  - `TELEGRAM_BOT_TOKEN` — dari [@BotFather](https://t.me/BotFather)
  - `TELEGRAM_CHAT_ID` — chat ID Master (dapat via
    `https://api.telegram.org/bot<TOKEN>/getUpdates` setelah kirim pesan
    ke bot)

---

## 2. Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit: SFL Yield Optimizer"
git branch -M main
git remote add origin https://github.com/<username>/sfl-yield-optimizer.git
git push -u origin main
```

> `data/` dan `.env*` sudah di-ignore jadi DB lokal & kredensial Master
> tidak ikut ke-push. Aman.

---

## 3. Create project di Railway

1. Login ke Railway → **New Project** → **Deploy from GitHub repo** →
   pilih repo `sfl-yield-optimizer`.
2. Railway akan auto-detect `Dockerfile` dan mulai build.
3. Tunggu build pertama selesai (~3–5 menit karena `better-sqlite3`
   perlu compile native binding).

---

## 4. Attach Volume (PENTING)

Tanpa volume, setiap redeploy akan menghapus SQLite DB → rules hilang,
price history hilang.

1. Di service settings → **Volumes** → **+ New Volume**.
2. **Mount path**: `/data`
3. **Size**: 1 GB cukup (price snapshots ±1MB/minggu).
4. Save.

---

## 5. Set environment variables

Di service settings → **Variables**, tambahkan:

| Variable | Value | Catatan |
|---|---|---|
| `SFL_API_BASE_URL` | `https://api.sunflower-land.com` | |
| `SFL_API_KEY` | `<x-api-key dari tim SFL>` | **wajib** |
| `SFL_FARM_ID` | `<nomor farm Master>` | **wajib** |
| `TELEGRAM_BOT_TOKEN` | `<token dari BotFather>` | **wajib** |
| `TELEGRAM_CHAT_ID` | `<chat id Master>` | **wajib** |
| `POLL_INTERVAL_MINUTES` | `5` | default sudah OK |
| `DATABASE_PATH` | `/data/sfl.db` | **harus di-set** supaya DB di volume |
| `TZ` | `Asia/Jakarta` | buat quiet hours + cron pakai jam Master |
| `QUIET_HOURS_START` | `23` | opsional, jam mulai jeda notif |
| `QUIET_HOURS_END` | `7` | opsional, jam akhir jeda notif |

Railway akan auto-redeploy setelah env berubah.

---

## 6. Generate public domain

Di service settings → **Networking** → **Generate Domain**. Master akan
dapat URL seperti `sfl-yield-optimizer-production-xxxx.up.railway.app`.

Railway tidak perlu `PORT` di-set manual — auto-inject via `process.env.PORT`.

---

## 7. Verifikasi

Buka di browser / curl:

```bash
curl https://<your-domain>.up.railway.app/api/health
# { "status": "ok", "db": true, "uptimeSec": 42, "now": "..." }

curl https://<your-domain>.up.railway.app/api/prices
# { "source": "sfl.world", "p2p": { "Sunflower": 0.0003..., ... }, ... }

curl https://<your-domain>.up.railway.app/api/yield
# { "rows": [...], "fetchedAt": ..., "unpriced": [...] }
```

Kalau Telegram token benar, dalam ≤5 menit Master harusnya dapat notif
pertama saat ada event di farm (crop siap panen, hewan lapar, dll).

Cek log di Railway dashboard untuk memastikan scheduler jalan:

```
[scheduler] Price snapshot cron "*/5 * * * *"
[scheduler] Farm poll cron "*/5 * * * *" (every 5 min)
```

---

## 8. Testing Telegram

```bash
curl -X POST https://<your-domain>.up.railway.app/api/test-telegram
# Master akan dapat pesan "🌻 Test OK, Master!" di Telegram
```

---

## Maintenance

- **Update recipe/produce data**: jalankan lokal
  `node scripts/import-recipes.mjs` dan `node scripts/import-produce.mjs`,
  commit hasilnya di `src/data/*.json`, push → Railway auto-redeploy.
- **Cek price history ukuran DB**: auto-prune >14 hari. Kalau volume
  penuh, naikkan size atau turunkan `PRICE_RETENTION_MS` di
  `src/lib/scheduler.ts`.
- **Restart manual**: di Railway dashboard → service → **Restart**.
- **Logs**: dashboard menampilkan stdout/stderr real-time.

---

## Troubleshooting

| Gejala | Kemungkinan | Fix |
|---|---|---|
| Healthcheck 503 di Railway | Volume belum di-mount / path salah | pastikan volume mount `/data` + env `DATABASE_PATH=/data/sfl.db` |
| `[scheduler] Config incomplete; farm polling in DRY-RUN` | Ada env var kosong | lengkapi 4 env wajib |
| `npm ci` fail di build | `package-lock.json` tidak sinkron | jalankan `npm install` lokal, commit lock, push |
| Cron jam ngawur | TZ belum di-set | tambah `TZ=Asia/Jakarta` |
| Price history 0 rows setelah 10 menit | sfl.world unreachable | cek `curl https://sfl.world/api/v1/prices` dari Railway shell |

---

## Biaya estimasi Railway

- Hobby plan $5/bln sudah include credit
- Service idle (low CPU/RAM) → ±$3–5/bln
- 1 GB volume → gratis (included)

Total: **~$5/bln** untuk uptime 24/7 dengan fitur lengkap.
