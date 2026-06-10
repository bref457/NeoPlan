# NeoPlan — Agent Instructions

## Projekt
Persönlicher Reminder-Kalender auf https://plan.neo457.ch
PM2: plan-neo457 + plan-reminder (Telegram-Reminder-Daemon)

## Stack
- Next.js (App Router), TypeScript, Tailwind CSS
- PocketBase: pb.neo457.ch
- Telegram-Bot für Reminder-Notifications

## Struktur
```
/root/.openclaw/workspace/plan-app/
├── src/
├── scripts/        # Reminder-Daemon
├── package.json
└── ecosystem.config.js
```

## Scripts
- `npm run dev` — Dev-Server
- `npm run build` — Build
- Deploy: `pm2 restart plan-neo457`

## Git-Hinweis
WICHTIG: Dieses Verzeichnis liegt in `/root/.openclaw/workspace/`.
Das übergeordnete `.git` in `/root/.openclaw/workspace/` enthält sensible History.
Nur innerhalb dieses Projektordners arbeiten. Nie `git push` aus dem workspace-Root.

## Handoff
Nach jeder Session: HANDOFF.md aktualisieren + commit.
