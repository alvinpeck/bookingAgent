"use client";

import { useState, useEffect } from "react";
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
type TimeSlot = { id: string; startTime: string; endTime: string };
type DayState = { enabled: boolean; slots: TimeSlot[] };

function newSlot(start = "09:00", end = "17:00"): TimeSlot {
  return { id: crypto.randomUUID(), startTime: start, endTime: end };
}

function defaultSchedule(): Record<DayKey, DayState> {
  return Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      {
        enabled: key !== "saturday" && key !== "sunday",
        slots: [newSlot()],
      },
    ])
  ) as Record<DayKey, DayState>;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function offsetDay(n: number) { return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10); }

// ─── Country list (Nager.Date supported country codes) ───────────────────────

const COUNTRIES = [
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CN", name: "China" },
  { code: "HR", name: "Croatia" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
];

// ─── Weekly Schedule ──────────────────────────────────────────────────────────

function WeeklySchedule({ staffId }: { staffId: string }) {
  const [schedule, setSchedule] = useState(defaultSchedule);
  const utils = trpc.useUtils();

  const { data: rules, isLoading } = trpc.availability.getRules.useQuery({ staffId });
  const setRulesMutation = trpc.availability.setRules.useMutation({
    onSuccess: () => utils.availability.getRules.invalidate({ staffId }),
  });

  // Load saved rules, grouping multiple slots per day
  useEffect(() => {
    const next = defaultSchedule();
    const grouped: Record<string, TimeSlot[]> = {};
    for (const rule of rules ?? []) {
      (grouped[rule.dayOfWeek] ??= []).push({
        id:        rule.id as string,
        startTime: (rule.startTime as string).slice(0, 5),
        endTime:   (rule.endTime as string).slice(0, 5),
      });
    }
    for (const { key } of DAYS) {
      if (grouped[key]?.length) {
        next[key] = { enabled: true, slots: grouped[key]! };
      }
    }
    setSchedule(next);
  }, [rules]);

  // ── Slot manipulation ───────────────────────────────────────────────────────

  function addSlot(day: DayKey) {
    setSchedule((s) => {
      const last = s[day].slots[s[day].slots.length - 1];
      const newStart = last ? last.endTime : "09:00";
      // Suggest a slot 1 hour after the last end
      const [h, m] = newStart.split(":").map(Number);
      const endH = Math.min(23, (h ?? 9) + 1);
      return {
        ...s,
        [day]: {
          ...s[day],
          slots: [
            ...s[day].slots,
            newSlot(newStart, `${String(endH).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`),
          ],
        },
      };
    });
  }

  function removeSlot(day: DayKey, slotId: string) {
    setSchedule((s) => {
      const remaining = s[day].slots.filter((sl) => sl.id !== slotId);
      return {
        ...s,
        [day]: { enabled: remaining.length > 0, slots: remaining.length ? remaining : [newSlot()] },
      };
    });
  }

  function updateSlot(day: DayKey, slotId: string, patch: Partial<TimeSlot>) {
    setSchedule((s) => ({
      ...s,
      [day]: {
        ...s[day],
        slots: s[day].slots.map((sl) => (sl.id === slotId ? { ...sl, ...patch } : sl)),
      },
    }));
  }

  function toggleDay(day: DayKey, enabled: boolean) {
    setSchedule((s) => ({ ...s, [day]: { ...s[day], enabled } }));
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  function applyTemplate(template: "weekdays" | "alldays" | "clear") {
    setSchedule((s) => {
      const next = { ...s };
      for (const { key } of DAYS) {
        const isWeekend = key === "saturday" || key === "sunday";
        if (template === "clear") {
          next[key] = { enabled: false, slots: [newSlot()] };
        } else if (template === "weekdays") {
          next[key] = { enabled: !isWeekend, slots: [newSlot("09:00", "17:00")] };
        } else {
          next[key] = { enabled: true, slots: [newSlot("09:00", "17:00")] };
        }
      }
      return next;
    });
  }

  function copyToAll(sourceDay: DayKey) {
    const source = schedule[sourceDay];
    setSchedule((s) => {
      const next = { ...s };
      for (const { key } of DAYS) {
        if (key !== sourceDay) {
          next[key] = {
            enabled: source.enabled,
            slots: source.slots.map((sl) => ({ ...sl, id: crypto.randomUUID() })),
          };
        }
      }
      return next;
    });
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  function handleSave() {
    setRulesMutation.mutate({
      staffId,
      rules: DAYS.filter(({ key }) => schedule[key].enabled).flatMap(({ key }) =>
        schedule[key].slots.map((slot) => ({
          dayOfWeek: key,
          startTime: slot.startTime,
          endTime:   slot.endTime,
        }))
      ),
    });
  }

  if (isLoading) return <Skeleton />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h2 className="text-sm font-semibold text-gray-700">Weekly Schedule</h2>
        {/* Quick templates */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Templates:</span>
          <button
            onClick={() => applyTemplate("weekdays")}
            className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            Mon – Fri 9–5
          </button>
          <button
            onClick={() => applyTemplate("alldays")}
            className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            All days 9–5
          </button>
          <button
            onClick={() => applyTemplate("clear")}
            className="px-2.5 py-1 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {DAYS.map(({ key, label }) => {
          const day = schedule[key];
          return (
            <div key={key} className="flex items-start gap-3">
              {/* Day toggle + label */}
              <div className="w-32 flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  id={`day-${key}`}
                  checked={day.enabled}
                  onChange={(e) => toggleDay(key, e.target.checked)}
                  className="accent-indigo-600"
                />
                <label
                  htmlFor={`day-${key}`}
                  className={`text-sm select-none ${day.enabled ? "text-gray-800 font-medium" : "text-gray-400"}`}
                >
                  {label}
                </label>
              </div>

              {/* Time slots */}
              {day.enabled ? (
                <div className="flex-1 space-y-2">
                  {day.slots.map((slot, idx) => (
                    <div key={slot.id} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlot(key, slot.id, { startTime: e.target.value })}
                        className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-gray-400 text-sm">–</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlot(key, slot.id, { endTime: e.target.value })}
                        className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {/* Remove slot (only if more than one) */}
                      {day.slots.length > 1 && (
                        <button
                          onClick={() => removeSlot(key, slot.id)}
                          title="Remove this slot"
                          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors rounded"
                        >
                          ×
                        </button>
                      )}
                      {/* Add slot / copy to all (on last slot row) */}
                      {idx === day.slots.length - 1 && (
                        <div className="flex items-center gap-1.5 ml-1">
                          <button
                            onClick={() => addSlot(key)}
                            title="Add another time window"
                            className="px-2 py-0.5 text-xs text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors"
                          >
                            + Add slot
                          </button>
                          <button
                            onClick={() => copyToAll(key)}
                            title="Copy this day's schedule to all days"
                            className="px-2 py-0.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                          >
                            Copy to all
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-400 pt-1.5">Unavailable</span>
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

// ─── Holiday Calendar ─────────────────────────────────────────────────────────

function HolidayCalendar() {
  const utils = trpc.useUtils();
  const currentYear = new Date().getFullYear();

  const [country, setCountry]   = useState("US");
  const [year, setYear]         = useState(currentYear);
  const [previewing, setPreviewing] = useState(false);

  // Reset preview when country/year changes
  function handleCountryChange(code: string) {
    setCountry(code);
    setPreviewing(false);
  }
  function handleYearChange(y: number) {
    setYear(y);
    setPreviewing(false);
  }

  const { data: holidays, isLoading: previewLoading, error: previewError } =
    trpc.availability.previewHolidays.useQuery(
      { countryCode: country, year },
      { enabled: previewing }
    );

  const importMutation = trpc.availability.importHolidays.useMutation({
    onSuccess: () => {
      utils.availability.getOverrides.invalidate();
    },
  });

  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? country;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Holiday Calendar</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Import public holidays as blocked dates for all staff members.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <Field label="Country">
          <select
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={inputCls}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Year">
          <select
            value={year}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            className={inputCls}
          >
            {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </Field>
        <button
          onClick={() => setPreviewing(true)}
          className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors self-end"
        >
          Preview holidays
        </button>
      </div>

      {/* Preview results */}
      {previewing && (
        <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
          {previewLoading ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Loading {countryName} holidays…
            </div>
          ) : previewError ? (
            <div className="px-4 py-4 text-sm text-red-600 bg-red-50">
              {previewError.message}
            </div>
          ) : !holidays?.length ? (
            <div className="px-4 py-4 text-sm text-gray-400">
              No public holidays found for {countryName} in {year}.
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-medium text-gray-600">
                  {holidays.length} public holiday{holidays.length !== 1 ? "s" : ""} in {countryName} ({year})
                </p>
                <div className="flex items-center gap-2">
                  {importMutation.isSuccess && (
                    <span className="text-xs text-green-600 font-medium">
                      ✓ Imported for {importMutation.data.staffCount} staff
                    </span>
                  )}
                  <button
                    onClick={() => importMutation.mutate({ countryCode: country, year })}
                    disabled={importMutation.isPending}
                    className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-md transition-colors"
                  >
                    {importMutation.isPending
                      ? "Importing…"
                      : `Block all ${holidays.length} days for all staff`}
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                {holidays.map((h) => (
                  <div key={h.date} className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-500 w-24 shrink-0">{h.date}</span>
                      <span className="text-sm text-gray-800">{h.name}</span>
                      {h.englishName !== h.name && (
                        <span className="text-xs text-gray-400">({h.englishName})</span>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600">Blocked</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {importMutation.isError && (
        <p className="text-sm text-red-600 mt-2">{importMutation.error.message}</p>
      )}

      <p className="text-xs text-gray-400">
        Holidays are imported as date overrides — existing custom overrides on the same date are preserved.
        Powered by{" "}
        <a href="https://date.nager.at" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
          Nager.Date
        </a>{" "}
        (free, no API key required).
      </p>
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
    upsertMutation.mutate(
      {
        staffId,
        overrideDate: form.date,
        isBlocked: form.isBlocked,
        startTime: form.isBlocked ? undefined : form.startTime,
        endTime:   form.isBlocked ? undefined : form.endTime,
        reason:    form.reason || undefined,
      },
      {
        onSuccess: () =>
          setForm({ date: "", isBlocked: true, startTime: "09:00", endTime: "17:00", reason: "" }),
      }
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Date Overrides</h2>

      <form
        onSubmit={handleAdd}
        className="flex flex-wrap gap-3 items-end pb-5 mb-5 border-b border-gray-100"
      >
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
              <input
                type="time" value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="End">
              <input
                type="time" value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </>
        )}
        <Field label="Note (optional)">
          <input
            type="text" placeholder="e.g. Doctor appointment" value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            className={`${inputCls} w-44`}
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
            <div
              key={o.id as string}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800">{o.overrideDate as string}</span>
                {o.isBlocked ? (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Day off</span>
                ) : (
                  <span className="text-gray-600">
                    {(o.startTime as string | null)?.slice(0, 5)} –{" "}
                    {(o.endTime as string | null)?.slice(0, 5)}
                  </span>
                )}
                {o.reason && (
                  <span className="text-gray-400 italic text-xs">{o.reason as string}</span>
                )}
              </div>
              <button
                onClick={() => deleteMutation.mutate({ id: o.id as string })}
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
  const [to, setTo]     = useState(() => offsetDay(6));

  const enabled = !!(tenantSlug && staffId && serviceId && from && to);
  const { data, isLoading, error } = trpc.availability.getSlots.useQuery(
    { tenantSlug, staffId, serviceId, from, to },
    { enabled }
  );

  type Slot = { startsAt: string; endsAt: string };
  const byDate: Record<string, Slot[]> = {};
  for (const slot of (data?.slots ?? []) as Slot[]) {
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
              <option key={s.id as string} value={s.id as string}>
                {s.name as string} ({s.durationMinutes as number}min)
              </option>
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
            {data.slots.length} slot{data.slots.length !== 1 ? "s" : ""} available · {data.timezone as string}
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
                        timeZone: data.timezone as string,
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
  const { data: currentTenant } = trpc.tenant.getCurrent.useQuery();
  const tenantSlug = currentTenant?.slug ?? "";
  const { data: staffList, isLoading } = trpc.staff.list.useQuery();
  const [staffId, setStaffId] = useState("");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Availability</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage weekly schedules, date overrides, holiday calendars, and preview open slots.
        </p>
      </div>

      {/* Staff selector */}
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
              <option key={s.id as string} value={s.id as string}>
                {s.displayName as string}
                {(s.tenantUser as any)?.email ? ` — ${(s.tenantUser as any).email}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {staffId ? (
        <div className="space-y-6">
          <WeeklySchedule staffId={staffId} />
          <DateOverrides staffId={staffId} />
          <HolidayCalendar />
          <SlotPreview staffId={staffId} tenantSlug={tenantSlug} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">Select a staff member above to manage their availability.</p>
          </div>
          {/* Holiday calendar is tenant-wide — show it even without a staff selection */}
          <HolidayCalendar />
        </div>
      )}
    </div>
  );
}
