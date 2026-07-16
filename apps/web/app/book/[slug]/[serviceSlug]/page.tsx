"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "staff" | "date" | "slots" | "details" | "confirmed";

type SlotItem = { startsAt: string; endsAt: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function toDateStr(d: Date) {
  // Use local date components so the calendar isn't offset by UTC
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

function Calendar({
  selected,
  onSelect,
}: {
  selected: Date | null;
  onSelect: (d: Date) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
  const maxDate = addDays(today, 60);

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevDisabled = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function prev() {
    if (prevDisabled) return;
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function next() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-sm">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} disabled={prevDisabled} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-600">‹</button>
        <span className="text-sm font-semibold text-gray-700">{monthLabel}</span>
        <button onClick={next} className="p-1 rounded hover:bg-gray-100 text-gray-600">›</button>
      </div>
      <div className="grid grid-cols-7 text-center mb-1">
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d => (
          <span key={d} className="text-xs text-gray-400 py-1">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center">
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const past = d < today;
          const tooFar = d > maxDate;
          const disabled = past || tooFar;
          const isSelected = selected && toDateStr(d) === toDateStr(selected);
          const isToday = toDateStr(d) === toDateStr(today);
          return (
            <button
              key={i}
              onClick={() => !disabled && onSelect(d)}
              disabled={disabled}
              className={`text-sm py-1.5 rounded-full transition-colors
                ${disabled ? "text-gray-300 cursor-not-allowed" : "hover:bg-indigo-50 cursor-pointer"}
                ${isSelected ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}
                ${isToday && !isSelected ? "font-bold text-indigo-600" : ""}
                ${!isSelected && !disabled ? "text-gray-700" : ""}
              `}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function Steps({ current, hasMultipleStaff }: { current: Step; hasMultipleStaff: boolean }) {
  const steps: { id: Step; label: string }[] = [
    ...(hasMultipleStaff ? [{ id: "staff" as Step, label: "Staff" }] : []),
    { id: "date", label: "Date" },
    { id: "slots", label: "Time" },
    { id: "details", label: "Details" },
  ];
  const idx = steps.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${
            i < idx ? "text-indigo-600" : i === idx ? "text-indigo-600" : "text-gray-400"
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              i < idx ? "bg-indigo-600 text-white" :
              i === idx ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-400"
            }`}>
              {i < idx ? "✓" : i + 1}
            </span>
            {s.label}
          </div>
          {i < steps.length - 1 && <div className="w-6 h-px bg-gray-200" />}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookingFlowPage({
  params,
}: {
  params: Promise<{ slug: string; serviceSlug: string }>;
}) {
  const { slug, serviceSlug } = use(params);

  const serviceQuery = trpc.services.getPublicBySlug.useQuery({ tenantSlug: slug, serviceSlug });
  const staffQuery = trpc.staff.listPublicForService.useQuery({ tenantSlug: slug, serviceSlug });

  const [step, setStep] = useState<Step>("staff");
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; displayName: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  const staffList = staffQuery.data ?? [];
  const service = serviceQuery.data?.service;
  const tenantTimezone = serviceQuery.data?.tenantTimezone ?? "UTC";

  // Auto-skip staff step if only one
  useEffect(() => {
    if (staffList.length === 1 && step === "staff") {
      setSelectedStaff({ id: staffList[0]!.id, displayName: staffList[0]!.displayName });
      setStep("date");
    }
  }, [staffList, step]);

  // Slot query — load a week around the selected date
  const slotsFrom = selectedDate ? toDateStr(selectedDate) : "";
  const slotsTo = selectedDate ? toDateStr(addDays(selectedDate, 6)) : "";
  const slotsQuery = trpc.availability.getSlots.useQuery(
    {
      tenantSlug: slug,
      staffId: selectedStaff?.id ?? "",
      serviceId: service?.id ?? "",
      from: slotsFrom,
      to: slotsTo,
    },
    { enabled: !!selectedDate && !!selectedStaff && !!service }
  );

  const allSlots = slotsQuery.data?.slots ?? [];
  const daySlots = allSlots.filter((s) => {
    if (!selectedDate) return false;
    // Compare slot date in tenant's timezone, not UTC
    const localDate = new Date(s.startsAt).toLocaleDateString("sv-SE", { timeZone: tenantTimezone });
    return localDate === toDateStr(selectedDate);
  });

  const holdMutation = trpc.availability.holdSlot.useMutation();
  const bookMutation = trpc.bookings.createPublic.useMutation();

  async function handleSlotSelect(slot: SlotItem) {
    if (!service || !selectedStaff) return;
    try {
      const result = await holdMutation.mutateAsync({
        tenantSlug: slug,
        staffId: selectedStaff.id,
        serviceId: service.id,
        slotStartAt: slot.startsAt,
        slotEndAt: slot.endsAt,
      });
      setSelectedSlot(slot);
      setHoldToken(result.holdToken);
      setStep("details");
    } catch {
      // slot taken — refetch
      slotsQuery.refetch();
    }
  }

  async function handleBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !selectedStaff || !selectedSlot || !holdToken) return;
    const result = await bookMutation.mutateAsync({
      tenantSlug: slug,
      serviceId: service.id,
      staffId: selectedStaff.id,
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
      holdToken,
      customerName: form.name,
      customerEmail: form.email,
      customerPhone: form.phone || undefined,
      customerNotes: form.notes || undefined,
      channel: "web",
    });
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    setConfirmedId(result.id);
    setStep("confirmed");
  }

  if (serviceQuery.isLoading || staffQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Service not found.</p>
          <Link href={`/book/${slug}`} className="text-indigo-600 text-sm hover:underline">← Back</Link>
        </div>
      </div>
    );
  }

  if (!staffQuery.isLoading && staffList.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-4">
            <Link href={`/book/${slug}`} className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
            <p className="text-sm font-semibold text-gray-900">{service.name}</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-400 text-sm">This service is not currently available for online booking.</p>
          <Link href={`/book/${slug}`} className="mt-4 inline-block text-indigo-600 text-sm hover:underline">← View other services</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-4">
          <Link href={`/book/${slug}`} className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: service.colorHex ?? "#6366f1" }}
            >
              {service.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{service.name}</p>
              <p className="text-xs text-gray-400">
                {service.durationMinutes} min
                {service.price ? ` · ${service.currency} ${service.price}` : " · Free"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {step !== "confirmed" && (
          <Steps current={step} hasMultipleStaff={staffList.length > 1} />
        )}

        {/* STEP: Staff */}
        {step === "staff" && staffList.length > 1 && (
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-4">Who would you like to see?</h2>
            <div className="space-y-3">
              {staffList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStaff({ id: s.id, displayName: s.displayName }); setStep("date"); }}
                  className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 hover:border-indigo-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold shrink-0">
                    {s.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.displayName}</p>
                    {s.bio && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{s.bio}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP: Date */}
        {step === "date" && (
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Pick a date
              {selectedStaff && staffList.length > 1 && (
                <span className="text-gray-400 font-normal text-sm ml-2">with {selectedStaff.displayName}</span>
              )}
            </h2>
            <Calendar
              selected={selectedDate}
              onSelect={(d) => {
                setSelectedDate(d);
                setSelectedSlot(null);
                setStep("slots");
              }}
            />
          </div>
        )}

        {/* STEP: Slots */}
        {step === "slots" && selectedDate && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => setStep("date")} className="text-gray-400 hover:text-gray-600 text-sm">← Date</button>
              <h2 className="text-base font-semibold text-gray-800">{fmtDate(selectedDate)}</h2>
            </div>

            {slotsQuery.isLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-20 h-10 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : daySlots.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center">
                <p className="text-sm text-gray-400">No available slots on this day.</p>
                <button onClick={() => setStep("date")} className="mt-3 text-sm text-indigo-600 hover:underline">
                  Choose another date
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-3">Times shown in {tenantTimezone}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      onClick={() => handleSlotSelect(slot)}
                      disabled={holdMutation.isPending}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                    >
                      {fmtTime(slot.startsAt)}
                    </button>
                  ))}
                </div>
                {holdMutation.isError && (
                  <p className="mt-3 text-sm text-red-600">{holdMutation.error.message}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP: Details */}
        {step === "details" && selectedSlot && selectedStaff && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button onClick={() => { setStep("slots"); setSelectedSlot(null); setHoldToken(null); }} className="text-gray-400 hover:text-gray-600 text-sm">← Time</button>
              <h2 className="text-base font-semibold text-gray-800">Your details</h2>
            </div>

            {/* Summary card */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-6 text-sm">
              <p className="font-medium text-indigo-800">{service.name}</p>
              <p className="text-indigo-600 mt-0.5">
                {selectedDate && fmtDate(selectedDate)} · {fmtTime(selectedSlot.startsAt)} – {fmtTime(selectedSlot.endsAt)}
              </p>
              {staffList.length > 1 && (
                <p className="text-indigo-500 text-xs mt-0.5">with {selectedStaff.displayName}</p>
              )}
            </div>

            <form onSubmit={handleBooking} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Full name *</label>
                  <input
                    type="text" required value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Jane Smith"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email *</label>
                  <input
                    type="email" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input
                    type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 555 000 0000"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                  value={form.notes} rows={3}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Anything you'd like us to know…"
                  className={`${inputCls} resize-none`}
                />
              </div>
              <button
                type="submit"
                disabled={bookMutation.isPending}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-xl transition-colors"
              >
                {bookMutation.isPending
                  ? "Processing…"
                  : service.requiresPayment && service.price
                  ? `Pay ${service.currency} ${service.price} & confirm`
                  : "Confirm booking"}
              </button>
              {bookMutation.isError && (
                <p className="text-sm text-red-600 text-center">{bookMutation.error.message}</p>
              )}
            </form>
          </div>
        )}

        {/* STEP: Confirmed */}
        {step === "confirmed" && selectedSlot && selectedStaff && selectedDate && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-green-600">✓</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Booking confirmed!</h2>
            <p className="text-sm text-gray-500 mb-6">A confirmation will be sent to {form.email}</p>

            <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 text-left max-w-sm mx-auto space-y-3">
              <div>
                <p className="text-xs text-gray-400">Service</p>
                <p className="text-sm font-medium text-gray-900">{service.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Date & time</p>
                <p className="text-sm font-medium text-gray-900">
                  {fmtDate(selectedDate)} · {fmtTime(selectedSlot.startsAt)} – {fmtTime(selectedSlot.endsAt)}
                </p>
              </div>
              {staffList.length > 1 && (
                <div>
                  <p className="text-xs text-gray-400">Staff</p>
                  <p className="text-sm font-medium text-gray-900">{selectedStaff.displayName}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Customer</p>
                <p className="text-sm font-medium text-gray-900">{form.name}</p>
              </div>
            </div>

            <Link
              href={`/book/${slug}`}
              className="mt-6 inline-block text-sm text-indigo-600 hover:underline"
            >
              Book another appointment
            </Link>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-300 pb-8">Powered by BookingAgent</p>
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
