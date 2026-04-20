import pb, { Plan } from "@/lib/pb";

export type ReminderInput = {
  title: string;
  remindAt: string;
  notes?: string;
  source?: "web" | "telegram" | "audio" | "system";
};

function splitDateTime(remindAt: string) {
  const d = new Date(remindAt);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}`,
  };
}

export async function createReminder(input: ReminderInput) {
  const { date, time } = splitDateTime(input.remindAt);

  return pb.collection("plans").create({
    type: "reminder",
    title: input.title,
    date,
    time,
    notes: input.notes ?? "",
    done: false,
    remindAt: input.remindAt,
    reminded: false,
    source: input.source ?? "system",
  });
}

export async function getDueReminders(nowIso = new Date().toISOString()) {
  const records = await pb.collection("plans").getFullList<Plan>({
    sort: "remindAt",
    filter: `type = \"reminder\" && done = false && (reminded = false || reminded = null) && remindAt != \"\" && remindAt <= \"${nowIso}\"`,
  });

  return records;
}

export async function markReminded(id: string) {
  return pb.collection("plans").update(id, {
    reminded: true,
  });
}
