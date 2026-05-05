"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

const ROLE_BADGE: Record<string, string> = {
  owner:    "bg-purple-100 text-purple-700",
  admin:    "bg-blue-100 text-blue-700",
  staff:    "bg-green-100 text-green-700",
  readonly: "bg-gray-100 text-gray-600",
};

const inputCls = "w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function StaffPage() {
  const utils = trpc.useUtils();
  const { data: staffList, isLoading } = trpc.staff.list.useQuery();
  const { data: allUsers } = trpc.staff.listUsers.useQuery();

  const createMutation = trpc.staff.create.useMutation({
    onSuccess: () => { utils.staff.list.invalidate(); setShowAdd(false); setAddForm({ tenantUserId: "", displayName: "", bio: "" }); },
  });
  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => { utils.staff.list.invalidate(); setEditing(null); },
  });
  const deactivateMutation = trpc.staff.deactivate.useMutation({
    onSuccess: () => utils.staff.list.invalidate(),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ tenantUserId: "", displayName: "", bio: "" });

  // Users who are NOT yet staff
  const staffUserIds = new Set((staffList ?? []).map((s) => s.tenantUserId));
  const nonStaffUsers = (allUsers ?? []).filter((u) => !staffUserIds.has(u.id));

  function startEdit(id: string, name: string, bio: string) {
    setEditing(id);
    setEditName(name);
    setEditBio(bio);
  }

  function handleAddUserChange(userId: string) {
    const user = nonStaffUsers.find((u) => u.id === userId);
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email?.split("@")[0] || "";
    setAddForm({ tenantUserId: userId, displayName: name, bio: "" });
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Staff</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage team members who can be assigned to services and bookings.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {showAdd ? "Cancel" : "+ Add staff"}
        </button>
      </div>

      {/* Add staff form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-indigo-200 p-6 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Add staff member</h2>

          {nonStaffUsers.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
              All organisation members are already staff members.
              To add more, invite them via <strong>Settings → Members</strong> first.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Select member *</label>
                <select
                  value={addForm.tenantUserId}
                  onChange={(e) => handleAddUserChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— choose a member —</option>
                  {nonStaffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Display name *</label>
                <input
                  type="text"
                  value={addForm.displayName}
                  onChange={(e) => setAddForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Name shown to customers"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Bio <span className="text-gray-400">(optional)</span></label>
                <input
                  type="text"
                  value={addForm.bio}
                  onChange={(e) => setAddForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="Short description shown on booking page"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3 pt-1">
                <button
                  disabled={!addForm.tenantUserId || !addForm.displayName || createMutation.isPending}
                  onClick={() => createMutation.mutate({
                    tenantUserId: addForm.tenantUserId,
                    displayName: addForm.displayName,
                    bio: addForm.bio || undefined,
                  })}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {createMutation.isPending ? "Adding…" : "Add to staff"}
                </button>
                {createMutation.isError && (
                  <span className="text-sm text-red-600">{createMutation.error.message}</span>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400">
              Don&apos;t see someone? Invite them via{" "}
              <a href="/dashboard/settings" className="text-indigo-500 hover:underline">Settings → Members</a>,
              then ask them to sign in so their account syncs.
            </p>
          </div>
        </div>
      )}

      {/* Staff list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 py-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : !staffList?.length ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-500 text-sm font-medium">No staff members yet</p>
          <p className="text-gray-400 text-xs mt-1 max-w-sm mx-auto">
            Click <strong>+ Add staff</strong> above to promote an organisation member to staff.
            If no members appear, invite them first via Settings → Members.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {staffList.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              {editing === s.id ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Display name"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      placeholder="Short bio (optional)"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMutation.mutate(
                        { id: s.id, displayName: editName, bio: editBio || undefined },
                        { onSuccess: () => setEditing(null) }
                      )}
                      disabled={updateMutation.isPending}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 disabled:bg-indigo-300"
                    >
                      {updateMutation.isPending ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-semibold shrink-0">
                      {s.displayName[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{s.displayName}</span>
                        {s.tenantUser?.role && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[s.tenantUser.role] ?? ROLE_BADGE.readonly}`}>
                            {s.tenantUser.role}
                          </span>
                        )}
                        {!s.isPublic && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Hidden from public</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{s.tenantUser?.email}</p>
                      {s.bio && <p className="text-xs text-gray-500 mt-0.5 italic">{s.bio}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(s.id, s.displayName, s.bio ?? "")}
                      className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Deactivate ${s.displayName}? They won't appear on the booking site.`)) {
                          deactivateMutation.mutate({ id: s.id });
                        }
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
