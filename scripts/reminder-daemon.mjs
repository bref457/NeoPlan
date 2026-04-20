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

import { createServer } from 'http';
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
const CALLBACK_TOKEN = process.env.CALLBACK_TOKEN;
if (!CALLBACK_TOKEN) {
  throw new Error('Missing env var: CALLBACK_TOKEN');
}

const pb = new PocketBase(PB_URL);

// Map: record.id → timeoutId
const timers = new Map();

// ─────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────

async function sendTelegram(text, buttons = null) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
  };
  
  if (buttons && buttons.length > 0) {
    body.reply_markup = { inline_keyboard: buttons };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${errorBody}`);
  }
}

// ─────────────────────────────────────────
// Callback Handler (Webhook)
// ─────────────────────────────────────────

// Note: In a real production setup, this would be an Express/Fastify endpoint.
// For this daemon, we assume the Telegram Bot Webhook is configured 
// to point to a handler that we will implement.
// For now, we add the logic to handle "callback_query" actions.

async function handleTelegramCallback(callbackQuery) {
  const { id, data, message } = callbackQuery;
  
  // Expected data format: "done:{recordId}" or "later:{recordId}"
  const [action, recordId] = data.split(':');
  
  if (!recordId) {
    log(`Invalid callback data: ${data}`);
    return;
  }

  try {
    if (action === 'done') {
      await pb.collection('plans').update(recordId, { done: true });
      log(`Callback: Marked "${message.text}" as DONE`);
    } else if (action === 'later') {
      const record = await pb.collection('plans').getOne(recordId);
      const newDate = new Date();
      newDate.setMinutes(newDate.getMinutes() + 30);
      
      await pb.collection('plans').update(recordId, { 
        remindAt: newDate.toISOString() 
      });
      log(`Callback: Rescheduled "${record.title}" to ${newDate.toISOString()}`);
    }
  } catch (err) {
    log(`Callback ERROR for ${recordId}: ${err.message}`);
  }
}

// ─────────────────────────────────────────
// HTTP Callback Server (Port 3021)
// ─────────────────────────────────────────

function startCallbackServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    const token = url.searchParams.get('t');

    if (token !== CALLBACK_TOKEN) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (!id) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing id');
      return;
    }

    const action = url.pathname === '/done' ? 'done' : url.pathname === '/later' ? 'later' : null;

    if (!action) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    try {
      if (action === 'done') {
        await pb.collection('plans').update(id, { done: true });
        log(`HTTP: Marked ${id} as DONE`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:2rem"><h2>✅ Erledigt!</h2><p>Reminder wurde als erledigt markiert.</p></body></html>');
      } else if (action === 'later') {
        const newDate = new Date(Date.now() + 30 * 60 * 1000);
        await pb.collection('plans').update(id, { remindAt: newDate.toISOString(), reminded: false });
        log(`HTTP: Rescheduled ${id} to ${newDate.toISOString()}`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:2rem"><h2>⏳ Verschoben!</h2><p>Reminder kommt in 30 Minuten nochmal.</p></body></html>');
      }
    } catch (err) {
      log(`HTTP ERROR for ${id}: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error');
    }
  });

  server.listen(3021, '127.0.0.1', () => {
    log('Callback HTTP server listening on port 3021');
  });
}

// ─────────────────────────────────────────
// Reminder lifecycle
// ─────────────────────────────────────────

async function fireReminder(record) {
  const msg = `⏰ <b>Reminder</b>\n${record.title}${record.notes ? `\n\n${record.notes}` : ''}`;
  
  const buttons = [
    [
      { text: '✅ Erledigt', url: `https://neo457.ch/r/done?id=${record.id}&t=${CALLBACK_TOKEN}` },
      { text: '⏳ Später (30m)', url: `https://neo457.ch/r/later?id=${record.id}&t=${CALLBACK_TOKEN}` }
    ]
  ];

  try {
    await sendTelegram(msg, buttons);
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
startCallbackServer();
log('Ready');
