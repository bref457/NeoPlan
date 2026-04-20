/**
 * reminder-daemon.mjs
 *
 * Profi-Reminder-Daemon für plan.neo457.ch
 *
 * - Lädt beim Start alle offenen Reminder aus PocketBase
 * - Subscribed auf PocketBase Realtime (create/update/delete)
 * - Schedult jeden Reminder mit setTimeout (kein Minuten-Polling)
 * - Sendet bei Fälligkeit Telegram-Nachricht + setzt reminded=true
 * - Restart-safe: reminded=false im DB → wird beim Neustart wieder aufgegriffen
 */

import { EventSource } from 'eventsource';
import PocketBase from 'pocketbase';

// PocketBase Realtime braucht EventSource als Global
globalThis.EventSource = EventSource;

const PB_URL = process.env.PB_URL;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
if (!PB_URL || !BOT_TOKEN || !CHAT_ID) {
  throw new Error('Missing env vars: PB_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID');
}

const pb = new PocketBase(PB_URL);

// Map: record.id → timeoutId
const timers = new Map();

// ─────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

// ─────────────────────────────────────────
// Reminder lifecycle
// ─────────────────────────────────────────

async function fireReminder(record) {
  const msg = `⏰ <b>Reminder</b>\n${record.title}${record.notes ? `\n\n${record.notes}` : ''}`;
  try {
    await sendTelegram(msg);
    await pb.collection('plans').update(record.id, { reminded: true });
    log(`Fired: "${record.title}"`);
  } catch (err) {
    log(`ERROR firing "${record.title}": ${err.message}`);
    // Retry in 60s if Telegram failed
    const t = setTimeout(() => {
      timers.delete(record.id);
      fireReminder(record);
    }, 60_000);
    timers.set(record.id, t);
    return;
  }
  timers.delete(record.id);
}

function scheduleReminder(record) {
  // Cancel existing timer for this record
  if (timers.has(record.id)) {
    clearTimeout(timers.get(record.id));
    timers.delete(record.id);
  }

  // Skip conditions
  if (record.reminded || record.done || !record.remindAt) return;

  const remindAt = new Date(record.remindAt);
  if (isNaN(remindAt.getTime())) {
    log(`WARN: Invalid remindAt for "${record.title}", skipping`);
    return;
  }

  const delay = remindAt.getTime() - Date.now();

  if (delay <= 0) {
    // Overdue — fire immediately
    log(`Overdue, firing now: "${record.title}"`);
    fireReminder(record);
    return;
  }

  // For reminders further than 23h away: re-schedule in 23h
  // (handles long-future reminders across restarts + max setTimeout safety)
  const MAX_DELAY = 23 * 60 * 60 * 1000;

  if (delay > MAX_DELAY) {
    const t = setTimeout(() => {
      timers.delete(record.id);
      // Re-fetch to get latest state before re-scheduling
      pb.collection('plans').getOne(record.id)
        .then(fresh => scheduleReminder(fresh))
        .catch(err => log(`Re-fetch failed for ${record.id}: ${err.message}`));
    }, MAX_DELAY);
    timers.set(record.id, t);
    log(`Scheduled re-check in 23h: "${record.title}" (due ${remindAt.toISOString()})`);
    return;
  }

  const t = setTimeout(() => {
    timers.delete(record.id);
    fireReminder(record);
  }, delay);
  timers.set(record.id, t);

  const inMin = Math.round(delay / 60_000);
  log(`Scheduled in ${inMin}min: "${record.title}" (due ${remindAt.toISOString()})`);
}

// ─────────────────────────────────────────
// Startup load
// ─────────────────────────────────────────

async function loadAndSchedule() {
  const records = await pb.collection('plans').getFullList({
    filter: `type = "reminder" && done = false && reminded = false && remindAt != ""`,
  });
  log(`Loaded ${records.length} upcoming reminder(s)`);
  for (const record of records) {
    scheduleReminder(record);
  }
}

// ─────────────────────────────────────────
// Realtime subscription
// ─────────────────────────────────────────

async function startRealtime() {
  try {
    await pb.collection('plans').subscribe('*', (e) => {
      const { action, record } = e;

      if (action === 'delete') {
        if (timers.has(record.id)) {
          clearTimeout(timers.get(record.id));
          timers.delete(record.id);
          log(`Cancelled timer for deleted record "${record.title}"`);
        }
        return;
      }

      if (action === 'create' || action === 'update') {
        if (record.type === 'reminder') {
          log(`Realtime ${action}: "${record.title}"`);
          scheduleReminder(record);
        }
      }
    });
    log('Realtime subscription active');
  } catch (err) {
    log(`Realtime subscription failed: ${err.message} — retrying in 30s`);
    setTimeout(startRealtime, 30_000);
  }
}

// ─────────────────────────────────────────
// Util
// ─────────────────────────────────────────

function log(msg) {
  console.log(`[reminder-daemon] ${new Date().toISOString()} ${msg}`);
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

log('Starting...');
await loadAndSchedule();
await startRealtime();
log('Ready');
