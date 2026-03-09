import { useState, useEffect } from "react";
import { api, type UserListItem } from "../lib/api";
import { UserPlus, Pencil, Trash2 } from "lucide-react";

const ROLES = ["ADMIN", "SUPPORT", "MARKETING", "CONTENT_EDITOR"];

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
}

export function SettingsPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("SUPPORT");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSubmitting(true);
    setInviteResult(null);
    try {
      const res = await api.inviteUser({ email: inviteEmail.trim(), name: inviteName.trim() || undefined, role: inviteRole });
      setInviteResult({ message: res.message });
      setInviteEmail("");
      setInviteName("");
      load();
    } catch (e) {
      setInviteResult({ message: e instanceof Error ? e.message : "Failed to invite" });
    } finally {
      setInviteSubmitting(false);
    }
  };

  const startEdit = (u: UserListItem) => {
    setEditingId(u.id);
    setEditName(u.name ?? "");
    setEditRole(u.role);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await api.updateUser(editingId, { name: editName.trim() || undefined, role: editRole });
      setEditingId(null);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this user? They will no longer be able to sign in.")) return;
    try {
      await api.deleteUser(id);
      setEditingId((x) => x === id ? null : x);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Users</h2>
          <button
            type="button"
            onClick={() => { setInviteOpen(true); setInviteResult(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
          >
            <UserPlus className="h-4 w-4" /> Invite user
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : (
          <div className="rounded-lg border border-border-dark bg-panel overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-dark text-left text-xs text-gray-400 uppercase">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Email</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Last login</th>
                  <th className="p-3 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border-dark">
                    <td className="p-3">
                      {editingId === u.id ? (
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded border border-border-dark bg-surface px-2 py-1 text-white w-40" />
                      ) : (
                        <span className="text-white">{u.name || "—"}</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-300">{u.email}</td>
                    <td className="p-3">
                      {editingId === u.id ? (
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="rounded border border-border-dark bg-surface px-2 py-1 text-white text-sm">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-300">{u.role}</span>
                      )}
                    </td>
                    <td className="p-3 text-sm text-gray-400">{formatDate(u.lastLoginAt)}</td>
                    <td className="p-3">
                      {editingId === u.id ? (
                        <div className="flex gap-1">
                          <button type="button" onClick={handleUpdate} className="text-accent text-sm hover:underline">Save</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-gray-400 text-sm hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => startEdit(u)} className="p-1 text-gray-400 hover:text-white"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={() => handleDelete(u.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setInviteOpen(false)} aria-hidden />
          <div className="relative bg-panel border border-border-dark rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Invite user</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
                <input type="text" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              {inviteResult && <p className="text-sm text-gray-300">{inviteResult.message}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setInviteOpen(false)} className="rounded px-4 py-2 text-sm text-gray-400 hover:text-white">Close</button>
                <button type="submit" disabled={inviteSubmitting} className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent-dark disabled:opacity-50">Invite</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
