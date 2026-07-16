"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const STATUS_BADGE: Record<string, string> = {
  active:   "bg-green-100 text-green-700",
  draft:    "bg-gray-100 text-gray-600",
  archived: "bg-red-100 text-red-600",
};

const CURRENCIES = ["USD", "EUR", "GBP", "SGD", "AUD", "MYR"];
const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
}

const blankForm = {
  name: "", slug: "", description: "", durationMinutes: 60, bufferAfterMinutes: 0,
  price: "", currency: "USD", requiresPayment: false, isPublic: true, colorHex: "#6366f1",
};

type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferAfterMinutes: number;
  price: string | null;
  currency: string;
  requiresPayment: boolean;
  isPublic: boolean;
  colorHex: string | null;
  status: string;
};

type EditForm = {
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  price: string;
  currency: string;
  requiresPayment: boolean;
  isPublic: boolean;
  colorHex: string;
};

export default function ServicesPage() {
  const utils = trpc.useUtils();
  const { data: services, isLoading } = trpc.services.list.useQuery();
  const { data: tenant } = trpc.tenant.getCurrent.useQuery();
  const { data: connectStatus } = trpc.tenant.getConnectStatus.useQuery();

  const createMutation = trpc.services.create.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); setShowForm(false); setForm(blankForm); },
  });
  const updateMutation = trpc.services.update.useMutation({
    onSuccess: () => { utils.services.list.invalidate(); setEditingId(null); },
  });
  const setStatusMutation = trpc.services.setStatus.useMutation({
    onSuccess: () => utils.services.list.invalidate(),
  });
  const deleteMutation = trpc.services.delete.useMutation({
    onSuccess: () => utils.services.list.invalidate(),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(blankForm);

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: f.slug || slugify(name) }));
  }

  function startEdit(s: ServiceRow) {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      slug: s.slug,
      description: s.description ?? "",
      durationMinutes: s.durationMinutes,
      bufferAfterMinutes: s.bufferAfterMinutes,
      price: s.price ?? "",
      currency: s.currency,
      requiresPayment: s.requiresPayment,
      isPublic: s.isPublic,
      colorHex: s.colorHex ?? "#6366f1",
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      durationMinutes: form.durationMinutes,
      bufferAfterMinutes: form.bufferAfterMinutes,
      price: form.price || undefined,
      currency: form.currency,
      requiresPayment: form.requiresPayment,
      isPublic: form.isPublic,
      colorHex: form.colorHex,
    });
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      data: {
        name: editForm.name,
        slug: editForm.slug,
        description: editForm.description || undefined,
        durationMinutes: editForm.durationMinutes,
        bufferAfterMinutes: editForm.bufferAfterMinutes,
        price: editForm.price || undefined,
        currency: editForm.currency,
        requiresPayment: editForm.requiresPayment,
        isPublic: editForm.isPublic,
        colorHex: editForm.colorHex,
      },
    });
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Define what your business offers and how long each service takes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tenant && (
            <a
              href={`/book/${tenant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-gray-300 hover:border-indigo-400 text-gray-600 hover:text-indigo-600 text-sm font-medium rounded-lg transition-colors"
            >
              ↗ Booking page
            </a>
          )}
          <button
            onClick={() => { setShowForm((v) => !v); setEditingId(null); }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showForm ? "Cancel" : "+ New service"}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <ServiceForm
          form={form}
          setForm={setForm}
          onNameChange={handleNameChange}
          onSubmit={handleSubmit}
          isPending={createMutation.isPending}
          error={createMutation.isError ? createMutation.error.message : null}
          submitLabel="Create service"
          title="New service"
          stripeConnected={connectStatus?.chargesEnabled ?? false}
        />
      )}

      {/* Service list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : !services?.length ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-400 text-sm">No services yet. Create your first service above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <div key={s.id}>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.colorHex ?? "#6366f1" }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[s.status]}`}>
                        {s.status}
                      </span>
                      {!s.isPublic && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Private</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{s.durationMinutes}min{s.bufferAfterMinutes > 0 ? ` + ${s.bufferAfterMinutes}min buffer` : ""}</span>
                      <span>·</span>
                      <span>{s.price ? `${s.currency} ${s.price}` : "Free"}</span>
                      {s.requiresPayment && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                          Payment required
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {tenant && s.status === "active" && s.isPublic && (
                    <a
                      href={`/book/${tenant.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-400 hover:text-indigo-600 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                      title="View on booking page"
                    >
                      ↗ View
                    </a>
                  )}
                  <button
                    onClick={() => editingId === s.id ? setEditingId(null) : startEdit(s as ServiceRow)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                  >
                    {editingId === s.id ? "Cancel" : "Edit"}
                  </button>
                  {s.status === "draft" && (
                    <button
                      onClick={() => setStatusMutation.mutate({ id: s.id, status: "active" })}
                      className="text-xs text-green-600 hover:text-green-700 px-2 py-1 rounded-md hover:bg-green-50 transition-colors"
                    >
                      Publish
                    </button>
                  )}
                  {s.status === "active" && (
                    <button
                      onClick={() => setStatusMutation.mutate({ id: s.id, status: "draft" })}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Unpublish
                    </button>
                  )}
                  {s.status !== "archived" && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${s.name}"? This cannot be undone.`)) {
                          deleteMutation.mutate({ id: s.id });
                        }
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Inline edit form */}
              {editingId === s.id && (
                <div className="mt-1 ml-4 border-l-2 border-indigo-200 pl-4 space-y-1">
                  <StaffAssignment serviceId={s.id} />
                  <ServiceForm
                    form={editForm}
                    setForm={setEditForm}
                    onNameChange={(name) => setEditForm((f) => ({ ...f, name }))}
                    onSubmit={handleEditSubmit}
                    isPending={updateMutation.isPending}
                    error={updateMutation.isError ? updateMutation.error.message : null}
                    submitLabel="Save changes"
                    title={`Editing: ${s.name}`}
                    stripeConnected={connectStatus?.chargesEnabled ?? false}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Staff assignment ─────────────────────────────────────────────────────────

function StaffAssignment({ serviceId }: { serviceId: string }) {
  const utils = trpc.useUtils();
  const { data: allStaff } = trpc.staff.list.useQuery();
  const { data: assigned, isLoading } = trpc.services.getStaff.useQuery({ serviceId });
  const setStaffMutation = trpc.services.setStaff.useMutation({
    onSuccess: () => utils.services.getStaff.invalidate({ serviceId }),
  });

  const assignedIds = new Set((assigned ?? []).map((s) => s.id));

  function toggle(staffId: string) {
    const next = assignedIds.has(staffId)
      ? [...assignedIds].filter((id) => id !== staffId)
      : [...assignedIds, staffId];
    setStaffMutation.mutate({ serviceId, staffIds: next });
  }

  if (!allStaff?.length) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3 text-xs text-amber-700">
        No staff members yet. Add staff first via the Staff page, then assign them here.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
        Assigned staff
        <span className="ml-1 font-normal text-gray-400 normal-case">(staff visible on booking page)</span>
      </p>
      {isLoading ? (
        <div className="text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allStaff.map((s) => {
            const active = assignedIds.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                disabled={setStaffMutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                }`}
              >
                <span>{active ? "✓" : "+"}</span>
                {s.displayName ?? s.tenantUser?.firstName ?? "Staff"}
              </button>
            );
          })}
        </div>
      )}
      {assignedIds.size === 0 && !isLoading && (
        <p className="mt-2 text-xs text-amber-600">
          ⚠ No staff assigned — customers won&apos;t be able to book this service until you assign at least one.
        </p>
      )}
    </div>
  );
}

// ─── Shared form component ────────────────────────────────────────────────────

function ServiceForm({
  form,
  setForm,
  onNameChange,
  onSubmit,
  isPending,
  error,
  submitLabel,
  title,
  stripeConnected,
}: {
  form: EditForm;
  setForm: React.Dispatch<React.SetStateAction<EditForm>>;
  onNameChange: (name: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  error: string | null;
  submitLabel: string;
  title: string;
  stripeConnected: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="bg-white rounded-xl border border-indigo-200 p-6 mb-3 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Service name *</label>
          <input
            type="text" required value={form.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. 30-min Haircut"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">URL slug *</label>
          <input
            type="text" required value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
            placeholder="30-min-haircut"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Duration (minutes) *</label>
          <input
            type="number" required min={5} max={480} value={form.durationMinutes}
            onChange={(e) => setForm((f) => ({ ...f, durationMinutes: +e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Buffer after (minutes)</label>
          <input
            type="number" min={0} max={120} value={form.bufferAfterMinutes}
            onChange={(e) => setForm((f) => ({ ...f, bufferAfterMinutes: +e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Price</label>
          <div className="flex rounded-md border border-gray-300 focus-within:ring-2 focus-within:ring-indigo-500 overflow-hidden">
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="border-r border-gray-300 bg-gray-50 px-2 py-1.5 text-sm text-gray-600 focus:outline-none"
            >
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input
              type="text" placeholder="0.00" value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="flex-1 px-3 py-1.5 text-sm focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <input
            type="text" placeholder="Optional description" value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>

      {/* Color picker */}
      <div>
        <label className="block text-xs text-gray-500 mb-2">Colour</label>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c} type="button"
              onClick={() => setForm((f) => ({ ...f, colorHex: c }))}
              style={{ backgroundColor: c }}
              className={`w-7 h-7 rounded-full transition-transform ${form.colorHex === c ? "ring-2 ring-offset-2 ring-indigo-500 scale-110" : ""}`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox" id={`isPublic-${title}`} checked={form.isPublic}
          onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
          className="accent-indigo-600"
        />
        <label htmlFor={`isPublic-${title}`} className="text-sm text-gray-700">Show on public booking site</label>
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox" id={`requiresPayment-${title}`}
          checked={form.requiresPayment}
          disabled={!stripeConnected}
          onChange={(e) => setForm((f) => ({ ...f, requiresPayment: e.target.checked }))}
          className="accent-indigo-600 mt-0.5"
        />
        <div>
          <label
            htmlFor={`requiresPayment-${title}`}
            className={`text-sm ${stripeConnected ? "text-gray-700" : "text-gray-400"}`}
          >
            Require payment at booking
          </label>
          {!stripeConnected && (
            <p className="text-xs text-amber-600 mt-0.5">
              Connect Stripe first in{" "}
              <a href="/settings?tab=payments" className="underline hover:text-amber-800">Settings → Payments</a>
            </p>
          )}
          {form.requiresPayment && !form.price && (
            <p className="text-xs text-red-500 mt-0.5">Set a price above to enable payment.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit" disabled={isPending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

const inputCls = "w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
