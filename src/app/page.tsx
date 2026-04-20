"use client";

import { useEffect, useState } from "react";
import pb, { Plan } from "@/lib/pb";

type FormState = {
  type: "event" | "reminder";
  title: string;
  date: string;
  time: string;
  notes: string;
};

function toFormState(plan: Plan): FormState {
  return {
    type: plan.type,
    title: plan.title ?? "",
    date: plan.date ? String(plan.date).slice(0, 10) : "",
    time: plan.time ?? "",
    notes: plan.notes ?? "",
  };
}

const initialForm: FormState = {
  type: "event",
  title: "",
  date: "",
  time: "",
  notes: "",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function HomePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadPlans() {
    setLoading(true);
    setError("");

    try {
      const records = await pb.collection("plans").getList<Plan>(1, 100, {
        sort: "date,time",
      });
      setPlans(records.items);
    } catch (err) {
      console.error("load plans failed", err);
      setError("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlans();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const remindAt =
        form.type === "reminder" && form.date && form.time
          ? new Date(`${form.date}T${form.time}`).toISOString()
          : "";

      if (editingId) {
        await pb.collection("plans").update(editingId, { ...form, remindAt });
      } else {
        await pb.collection("plans").create({
          ...form,
          done: false,
          reminded: false,
          remindAt,
        });
      }
      setForm(initialForm);
      setEditingId(null);
      setShowForm(false);
      await loadPlans();
    } catch (err) {
      console.error("save plan failed", err);
      setError("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(plan: Plan) {
    try {
      setError("");
      await pb.collection("plans").update(plan.id, { done: !plan.done });
      await loadPlans();
    } catch (err) {
      console.error("toggle done failed", err);
      setError("Fehler beim Aktualisieren");
    }
  }

  async function deletePlan(id: string) {
    try {
      setError("");
      await pb.collection("plans").delete(id);
      await loadPlans();
    } catch (err) {
      console.error("delete plan failed", err);
      setError("Fehler beim Löschen");
    }
  }

  function startEdit(plan: Plan) {
    setForm(toFormState(plan));
    setEditingId(plan.id);
    setShowForm(true);
    setError("");
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
    setError("");
  }

  const openPlans = plans.filter((plan) => !plan.done);
  const donePlans = plans.filter((plan) => plan.done);

  return (
    <main className="max-w-2xl mx-auto p-4 pt-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">NeoPlan</h1>
        <button
          onClick={() => {
            if (showForm) {
              cancelForm();
            } else {
              setShowForm(true);
            }
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          {showForm ? "Abbrechen" : "+ Neu"}
        </button>
      </div>

      {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

      {showForm && (
        <form onSubmit={submit} className="bg-gray-900 rounded-xl p-5 mb-8 space-y-4 border border-gray-800">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Typ</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "event" | "reminder" })}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500"
              >
                <option value="event">Event</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Zeit (optional)</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Titel *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Was?"
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Datum *</label>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notizen</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition"
          >
            {saving ? "Speichert..." : editingId ? "Änderungen speichern" : "Speichern"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Laden...</p>
      ) : (
        <>
          <Section title="Offen" plans={openPlans} onToggle={toggleDone} onDelete={deletePlan} onEdit={startEdit} />
          <Section title="Erledigt" plans={donePlans} onToggle={toggleDone} onDelete={deletePlan} onEdit={startEdit} />
          {plans.length === 0 && <p className="text-gray-600 text-sm text-center mt-16">Keine Einträge.</p>}
        </>
      )}
    </main>
  );
}

function Section({
  title,
  plans,
  onToggle,
  onDelete,
  onEdit,
}: {
  title: string;
  plans: Plan[];
  onToggle: (plan: Plan) => void;
  onDelete: (id: string) => void;
  onEdit: (plan: Plan) => void;
}) {
  if (plans.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xs uppercase tracking-widest text-gray-500 mb-3">{title}</h2>
      <ul className="space-y-2">
        {plans.map((plan) => (
          <li key={plan.id} className="flex items-start gap-3 bg-gray-900 rounded-xl p-4 border border-gray-800">
            <button
              onClick={() => onToggle(plan)}
              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition ${
                plan.done ? "bg-green-500 border-green-500" : "border-gray-600 hover:border-indigo-400"
              }`}
              title={plan.done ? "Als offen markieren" : "Als erledigt markieren"}
            />
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm truncate ${plan.done ? "line-through text-gray-500" : ""}`}>{plan.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDate(plan.date)}
                {plan.time && ` • ${plan.time}`}
                {plan.type && ` • ${plan.type}`}
              </p>
              {plan.notes && <p className="text-xs text-gray-400 mt-1">{plan.notes}</p>}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onEdit(plan)}
                className="text-white hover:text-indigo-300 text-xl leading-none transition p-2"
                title="Bearbeiten"
              >
                ✎
              </button>
              <button
                onClick={() => onDelete(plan.id)}
                className="text-red-500 hover:text-red-400 transition p-2"
                title="Löschen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
