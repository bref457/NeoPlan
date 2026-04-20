import PocketBase from "pocketbase";

const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL || "http://localhost:8090");

export default pb;

export interface Plan {
  id: string;
  type: "event" | "reminder";
  title: string;
  date: string;
  time?: string;
  notes?: string;
  done: boolean;
  remindAt?: string;
  reminded?: boolean;
  source?: "web" | "telegram" | "audio" | "system";
  created: string;
  updated: string;
}
