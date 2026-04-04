"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/auth";

interface AdminUser {
    id: string;
    username: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    roles: string[];
    profile_setup_complete: boolean;
    created_at: string | null;
}

const ALL_ROLES = ["player", "tournament_organizer", "referee", "club_admin", "system_admin"];

const ROLE_COLORS: Record<string, string> = {
    player:               "bg-zinc-700/60 text-zinc-300 border-zinc-600/40",
    tournament_organizer: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    referee:              "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    club_admin:           "bg-violet-500/15 text-violet-300 border-violet-500/30",
    system_admin:         "bg-red-500/15 text-red-300 border-red-500/30",
};

function authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${getAccessToken()}`, "Content-Type": "application/json" };
}

function RoleChip({ role, onRemove }: { role: string; onRemove?: () => void }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROLE_COLORS[role] ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
            {role.replace(/_/g, " ")}
            {onRemove && (
                <button onClick={onRemove} className="hover:opacity-70 transition-opacity ml-0.5 leading-none">×</button>
            )}
        </span>
    );
}

export default function UsersAdminPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [userTotal, setUserTotal] = useState(0);
    const [userPage, setUserPage] = useState(1);
    const [userQ, setUserQ] = useState("");
    const [userSearch, setUserSearch] = useState("");
    const userDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
    const [addRoleVal, setAddRoleVal] = useState("");
    const [roleLoading, setRoleLoading] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchUsers = useCallback(async (q: string, page: number) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=${page}&limit=20`, { headers: authHeaders() });
            if (!res.ok) throw new Error("Failed to load users");
            const data = await res.json();
            setUsers(data.users);
            setUserTotal(data.total);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers(userQ, userPage);
    }, [userQ, userPage, fetchUsers]);

    async function removeRole(user: AdminUser, role: string) {
        setRoleLoading(true);
        try {
            const res = await fetch(`/api/admin/users/${user.id}/roles`, {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify({ add: [], remove: [role] }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
            const data = await res.json();
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, roles: data.roles } : u));
            if (roleTarget?.id === user.id) setRoleTarget(prev => prev ? { ...prev, roles: data.roles } : null);
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Failed to remove role");
        } finally {
            setRoleLoading(false);
        }
    }

    async function addRole(user: AdminUser, role: string) {
        if (!role) return;
        setRoleLoading(true);
        try {
            const res = await fetch(`/api/admin/users/${user.id}/roles`, {
                method: "PATCH",
                headers: authHeaders(),
                body: JSON.stringify({ add: [role], remove: [] }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
            const data = await res.json();
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, roles: data.roles } : u));
            if (roleTarget?.id === user.id) setRoleTarget(prev => prev ? { ...prev, roles: data.roles } : null);
            setAddRoleVal("");
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Failed to add role");
        } finally {
            setRoleLoading(false);
        }
    }

    const userPages = Math.ceil(userTotal / 20);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <input
                    value={userSearch}
                    onChange={e => {
                        setUserSearch(e.target.value);
                        if (userDebounce.current) clearTimeout(userDebounce.current);
                        userDebounce.current = setTimeout(() => {
                            setUserQ(e.target.value);
                            setUserPage(1);
                        }, 300);
                    }}
                    placeholder="Search by username or email..."
                    className="w-full max-w-sm rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                />
                <div className="text-xs text-white/40">
                    Total: <span className="text-white/70 font-bold">{userTotal}</span> users
                </div>
            </div>

            {error && (
                <div className="rounded-xl px-4 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20">
                    {error}
                </div>
            )}

            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase">User</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden md:table-cell">Email</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase">Roles</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden lg:table-cell">Joined</th>
                            <th className="px-6 py-4" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30 italic">Loading users...</td></tr>
                        )}
                        {!loading && users.map((u, i) => (
                            <tr
                                key={u.id}
                                style={{ borderBottom: i < users.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                                className="hover:bg-white/[0.04] transition-colors group"
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 overflow-hidden shrink-0 group-hover:border-white/20 transition-colors">
                                            {u.avatar_url
                                                ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                                                : <div className="w-full h-full flex items-center justify-center text-sm text-white/40 font-bold">{(u.username ?? "?")[0].toUpperCase()}</div>
                                            }
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white">{u.username}</p>
                                            <p className="text-xs text-white/30">{u.first_name} {u.last_name}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-white/50 hidden md:table-cell">{u.email}</td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap gap-1.5">
                                        {u.roles.map(r => <RoleChip key={r} role={r} />)}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-white/30 text-xs hidden lg:table-cell">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => { setRoleTarget(u); setAddRoleVal(""); }}
                                        className="text-xs font-bold px-4 py-2 rounded-xl text-white/50 hover:text-white transition-all hover:bg-white/10 border border-transparent hover:border-white/10"
                                    >
                                        Manage
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!loading && users.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-white/25 italic">No users found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {userPages > 1 && (
                <div className="flex items-center gap-4 justify-end pt-4">
                    <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/40 hover:text-white disabled:opacity-20 transition-all hover:bg-white/5 border border-white/5">
                        ← Previous
                    </button>
                    <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/70">
                        {userPage} <span className="text-white/20 mx-1">/</span> {userPages}
                    </div>
                    <button onClick={() => setUserPage(p => Math.min(userPages, p + 1))} disabled={userPage === userPages}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/40 hover:text-white disabled:opacity-20 transition-all hover:bg-white/5 border border-white/5">
                        Next →
                    </button>
                </div>
            )}

            {roleTarget && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}>
                    <div
                        className="w-full max-w-md rounded-[2rem] p-8 space-y-6"
                        style={{
                            background: "linear-gradient(180deg, rgba(24,24,27,0.95) 0%, rgba(18,18,18,0.98) 100%)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            boxShadow: "0 32px 64px -16px rgba(0,0,0,0.8)",
                        }}
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Manage Roles</h2>
                                <p className="text-sm text-white/40 mt-1">{roleTarget.username} · <span className="text-white/20">{roleTarget.email}</span></p>
                            </div>
                            <button onClick={() => setRoleTarget(null)} className="w-10 h-10 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all text-2xl leading-none">×</button>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Active Roles</p>
                            <div className="flex flex-wrap gap-2">
                                {roleTarget.roles.length === 0 && <span className="text-sm text-white/20 italic">No roles assigned</span>}
                                {roleTarget.roles.map(r => (
                                    <div key={r} className="group relative">
                                        <RoleChip role={r} />
                                        <button 
                                            onClick={() => removeRole(roleTarget, r)}
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                        <div className="space-y-3">
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Assign New Role</p>
                            <div className="flex gap-2">
                                <select
                                    value={addRoleVal}
                                    onChange={e => setAddRoleVal(e.target.value)}
                                    className="flex-1 rounded-xl px-4 py-3 text-sm text-white focus:outline-none appearance-none cursor-pointer"
                                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                                >
                                    <option value="" className="bg-zinc-900 text-white/40">Select a role...</option>
                                    {ALL_ROLES.filter(r => !roleTarget.roles.includes(r)).map(r => (
                                        <option key={r} value={r} className="bg-zinc-900">{r.replace(/_/g, " ")}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => addRole(roleTarget, addRoleVal)}
                                    disabled={!addRoleVal || roleLoading}
                                    className="px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:grayscale"
                                    style={{
                                        background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                                        boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
                                        color: "#fff",
                                    }}
                                >
                                    {roleLoading ? "Adding..." : "Add"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
