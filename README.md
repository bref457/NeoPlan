# NeoPlan

> Reminder-App mit Echtzeit-Telegram-Benachrichtigungen, betrieben auf eigenem VPS.

**Live:** [plan.neo457.ch](https://plan.neo457.ch)

![Next.js](https://img.shields.io/badge/Next.js_15-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![PocketBase](https://img.shields.io/badge/PocketBase-B8DBE4?logo=pocketbase&logoColor=black)

---

## Architektur

```
Next.js UI  →  PocketBase (SQLite)  →  Realtime-Daemon  →  Telegram
```

Reminder werden in PocketBase gespeichert. Der Daemon abonniert den Realtime-Stream, schedult fällige Einträge via `setTimeout` und sendet bei Fälligkeit eine Telegram-Nachricht.

## Stack

| Layer | Technologie |
|-------|------------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Datenbank | PocketBase (self-hosted, SQLite) |
| Notifications | Telegram Bot API |
| Process | PM2 (`plan-reminder`) |

## Setup

```bash
git clone https://github.com/bref457/plan-app.git
cd plan-app
cp .env.example .env.local
# .env.local befüllen (siehe .env.example)
npm install
npm run dev
```

### Umgebungsvariablen

```env
NEXT_PUBLIC_PB_URL=https://your-pocketbase.example.com
PB_URL=https://your-pocketbase.example.com
TELEGRAM_BOT_TOKEN=1234567890:your-token-from-botfather
TELEGRAM_CHAT_ID=123456789
```

## Reminder-Daemon

```bash
# Entwicklung
node scripts/reminder-daemon.mjs

# Produktion (PM2)
pm2 start ecosystem.config.js
pm2 save
```

Fehlen Env-Vars → Daemon bricht sofort mit Fehler ab (fail-fast).

## Scripts

| Script | Beschreibung |
|--------|-------------|
| `scripts/reminder-daemon.mjs` | Long-running Daemon, PocketBase Realtime + Telegram |
| `scripts/check-due-reminders.mjs` | One-shot Check (z. B. via Cron) |

## Verwandte Projekte

- [neo457-landing](https://github.com/bref457/neo457-landing) — Portfolio-Showcase
- [kinews](https://github.com/bref457/kinews) — KI-News-Aggregator
