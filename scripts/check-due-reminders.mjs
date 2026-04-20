import PocketBase from 'pocketbase';

const baseUrl = process.env.PB_URL;
if (!baseUrl) {
  throw new Error('Missing env var: PB_URL');
}
const pb = new PocketBase(baseUrl);

const nowIso = new Date().toISOString();

const records = await pb.collection('plans').getFullList({
  sort: 'remindAt',
  filter: `type = "reminder" && done = false && (reminded = false || reminded = null) && remindAt != "" && remindAt <= "${nowIso}"`,
});

if (!records.length) {
  console.log('NO_DUE_REMINDERS');
  process.exit(0);
}

for (const record of records) {
  console.log(`DUE|${record.id}|${record.title}|${record.notes || ''}`);
}
