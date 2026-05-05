"use client";

import { useState, useEffect } from "react";
import { useOrganization } from "@clerk/nextjs";
import { trpc } from "@/lib/trpc/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { key: "monday",    label: "Monday" },
  { key: "tuesday",   label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday",  label: "Thursday" },
  { key: "friday",    label: "Friday" },
  { key: "saturday",  label: "Saturday" },
  { key: "sunday",    label: "Sunday" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];
type DayState = { enabled: boolean; startTime: string; endTime: string };

function defaultSchedule(): Record<DayKey, DayState> {
  return Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      { enabled: key !== "saturday" && key !== "sunday", startTime: "09:00", endTime: "17:00" },
    ])
  ) as Record<DayKey, DayState>;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function offsetDay(n: number) { return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10); }

// ─── Weekly Schedule ──────────────────────────────────────────────────────────

function WeeklySchedule({ staffId }: { staffId: string }) {
  const [schedule, setSchedule] = useState(defaultSchedule);
  const utils = trpc.useUtils();

  const { data: rules, isLoading } = trpc.availability.getRules.useQuery({ staffId });
  const setRulesMutation = trpc.availability.setRules.useMutation({
    onSuccess: () => utils.availability.getRules.invalidate({ staffId }),
  });

  useEffect(() => {
    const next = defaultSchedule();
    for (const rule of rules ?? []) {
      next[rule.dayOfWeek as DayKey] = {
        enabled: true,
        startTime: rule.startTime.slice(0, 5),
        endTime: rule.endTime.slice(0, 5),
      };
    }
    setSchedule(next);
  }, [rules]);

  function update(day: DayKey, patch: Partial<DayState>) {
    setSchedule((s) => ({ ...s, [day]: { ...s[day], ...patch } }));
  }

  function handleSave() {
    setRulesMutation.mutate({
      staffId,
      rules: DAYS.filter(({ key }) => schedule[key].enabled).map(({ key }) => ({
        dayOfWeek: key,
        startTime: schedule[key].startTime,
        endTime: schedule[key].endTime,
      })),
    });
  }

  if (isLoading) return <Skeleton />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Weekly Schedule</h2>
      <div className="space-y-3">
        {DAYS.map(({ key, label }) => {
          const day = schedule[key];
          return (
            <div key={key} className="flex items-center gap-4">
              <div className="w-32 flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`day-${key}`}
                  checked={day.enabled}
                  onChange={(e) => update(key, { enabled: e.target.checked })}
                  className="accent-indigo-600"
                />
                <label
                  htmlFor={`day-${key}`}
                  className={`text-sm select-none ${day.enabled ? "text-gray-800 font-medium" : "text-gray-400"}`}
                >
                  {label}
                </label>
              </div>
              {day.enabled ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={day.startTime}
                    onChange={(e) => update(key, { startTime: e.target.value })}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-gray-400 text-sm">–</span>
                  <input
                    type="time"
                    value={day.endTime}
                    onChange={(e) => update(key, { endTime: e.target.value })}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Unavailable</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={setRulesMutation.isPending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {setRulesMutation.isPending ? "Saving…" : "Save schedule"}
        </button>
        {setRulesMutation.isSuccess && <span className="text-sm text-green-600">Saved!</span>}
        {setRulesMutation.isError && (
          <span className="text-sm text-red-600">{setRulesMutation.error.message}</span>
        )}
      </div>
    </div>
  );
}

// ─── Date Overrides ───────────────────────────────────────────────────────────

function DateOverrides({ staffId }: { staffId: string }) {
  const utils = trpc.useUtils();
  const { data: overrides } = trpc.availability.getOverrides.useQuery({
    staffId,
    from: todayStr(),
    to: offsetDay(90),
  });

  const upsertMutation = trpc.availability.upsertOverride.useMutation({
    onSuccess: () => utils.availability.getOverrides.invalidate(),
  });
  const deleteMutation = trpc.availability.deleteOverride.useMutation({
    onSuccess: () => utils.availability.getOverrides.invalidate(),
  });

  const [form, setForm] = useState({
    date: "",
    isBlocked: true,
    startTime: "09:00",
    endTime: "17:00",
    reason: "",
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date) return;
    upsertMutation.mutate({
      staffId,
      overrideDate: form.date,
      isBlocked: form.isBlocked,
      startTime: form.isBlocked ? undefined : form.startTime,
      endTime: form.isBlocked ? undefined : form.endTime,
      reason: form.reason || undefined,
    }, {
      onSuccess: () => setForm({ date: "", isBlocked: true, startTime: "09:00", endTime: "17:00", reason: "" }),
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Date Overrides</h2>

      <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end pb-5 mb-5 border-b border-gray-100">
        <Field label="Date">
          <input
            type="date" required min={todayStr()} value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={inputCls}
          />
        </Field>
        <Field label="Type">
          <select
            value={form.isBlocked ? "blocked" : "custom"}
            onChange={(e) => setForm((f) => ({ ...f, isBlocked: e.target.value === "blocked" }))}
            className={inputCls}
          >
            <option value="blocked">Day off</option>
            <option value="custom">Custom hours</option>
          </select>
        </Field>
        {!form.isBlocked && (
          <>
            <Field label="Start">
              <input type="time" value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className={inputCls} />
            </Field>
            <Field label="End">
              <input type="time" value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className={inputCls} />
            </Field>
          </>
        )}
        <Field label="Note (optional)">
          <input
            type="text" placeholder="e.g. Public holiday" value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            className={`${inputCls} w-40`}
          />
        </Field>
        <button
          type="submit" disabled={upsertMutation.isPending}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm rounded-lg transition-colors self-end"
        >
          Add
        </button>
      </form>

      {overrides?.length ? (
        <div className="space-y-2">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm">
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800">{o.overrideDate}</span>
                {o.isBlocked ? (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Day off</span>
                ) : (
                  <span className="text-gray-600">{o.startTime?.slice(0, 5)} – {o.endTime?.slice(0, 5)}</span>
                )}
                {o.reason && <span className="text-gray-400 italic text-xs">{o.reason}</span>}
              </div>
              <button
                onClick={() => deleteMutation.mutate({ id: o.id })}
                className="text-gray-400 hover:text-red-500 transition-colors text-xs px-1"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No overrides in the next 90 days.</p>
      )}
    </div>
  );
}

// ─── Slot Preview ─────────────────────────────────────────────────────────────

function SlotPreview({ staffId, tenantSlug }: { staffId: string; tenantSlug: string }) {
  const { data: services } = trpc.services.list.useQuery();
  const [serviceId, setServiceId] = useState("");
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(() => offsetDay(6));

  const enabled = !!(tenantSlug && staffId && serviceId && from && to);
  const { data, isLoading, error } = trpc.availability.getSlots.useQuery(
    { tenantSlug, staffId, serviceId, from, to },
    { enabled }
  );

  // Group slots by date for display
  const byDate: Record<string, typeof data extends { slots: infer S } ? S : never[]> = {};
  for (const slot of data?.slots ?? []) {
    const d = slot.startsAt.slice(0, 10);
    (byDate[d] ??= []).push(slot);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Slot Preview</h2>
      <div className="flex flex-wrap gap-3 mb-5">
        <Field label="Service">
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={inputCls}>
            <option value="">Select service…</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes}min)</option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
      </div>

      {!enabled && <p className="text-sm text-gray-400">Select a service to preview slots.</p>}
      {isLoading && <p className="text-sm text-gray-400">Loading slots…</p>}
      {error && <p className="text-sm text-red-500">{error.message}</p>}
      {data && (
        <>
          <p className="text-xs text-gray-400 mb-4">
            {data.slots.length} slot{data.slots.length !== 1 ? "s" : ""} available · {data.timezone}
          </p>
          {data.slots.length === 0 ? (
            <p className="text-sm text-gray-400">No available slots in this range.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(byDate).map(([date, slots]) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                      weekday: "long", month: "short", day: "numeric",
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => {
                      const time = new Date(slot.startsAt).toLocaleTimeString("en-US", {
                        hour: "numeric", minute: "2-digit", hour12: true,
                        timeZone: data.timezone,
                      });
                      return (
                        <span
                          key={slot.startsAt}
                          className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700"
                        >
                          {time}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const inputCls =
  "border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 bg-gray-100 rounded mb-3" />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const { organization } = useOrganization();
  const tenantSlug = organization?.slug ?? "";
  const { data: staffList, isLoading } = trpc.staff.list.useQuery();
  const [staffId, setStaffId] = useState("");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Availability</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage weekly schedules, date overrides, and preview open slots.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Staff member</label>
        {isLoading ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : !staffList?.length ? (
          <p className="text-sm text-gray-400">
            No active staff yet. Invite members via Settings → Members, then create their staff record.
          </p>
        ) : (
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
          >
            <option value="">Select staff member…</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}{s.tenantUser?.email ? ` — ${s.tenantUser.email}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {staffId ? (
        <div className="space-y-6">
          <WeeklySchedule staffId={staffId} />
          <DateOverrides staffId={staffId} />
          <SlotPreview staffId={staffId} tenantSlug={tenantSlug} />
        </div>
      ) : (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-400 text-sm">Select a staff member above to manage their availability.</p>
        </div>
      )}
    </div>
  );
}
