# NeoPlan

Reminder-UI und Telegram-Daemon fuer [plan.neo457.ch](https://plan.neo457.ch).

Plaene und Reminder werden in PocketBase gespeichert. Ein Hintergrund-Daemon
abonniert PocketBase Realtime, schedult faellige Reminder und sendet sie via
Telegram.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **PocketBase** als Backend / Datenbank
- **Telegram Bot API** fuer Reminder-Zustellung
- **PM2** fuer Daemon-Process-Management auf dem VPS

## Setup

```bash
cp .env.example .env.local
# .env.local mit echten Werten befuellen (PocketBase-URL, Telegram Bot Token, Chat-ID)

npm install
npm run dev
```

App laeuft danach auf [http://localhost:3000](http://localhost:3000).

## Reminder-Daemon starten

Der Daemon laeuft als eigener Node-Prozess (in Produktion via PM2):

```bash
node scripts/reminder-daemon.mjs
```

Der Daemon braucht alle drei Env-Vars (`PB_URL`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`). Fehlt eine davon, bricht er fail-fast ab.

In Produktion via PM2:

```bash
pm2 start scripts/reminder-daemon.mjs --name plan-reminder
pm2 save
```

## Scripts

- `scripts/reminder-daemon.mjs` — Long-running Daemon mit PocketBase Realtime + Telegram
- `scripts/check-due-reminders.mjs` — One-shot Check faelliger Reminder (z. B. via Cron)