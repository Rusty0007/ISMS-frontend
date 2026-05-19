"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/auth";

interface AdminUser {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    roles: string[];
    region_code: string | null;
    province_code: string | null;
    city_mun_code: string | null;
    barangay_code: string | null;
    profile_setup_complete: boolean;
    created_at: string | null;
    total_matches: number;
    best_rating: number | null;
    distinct_opponents: number;
    activeness_score: number;
    rating_status: string;
}

interface PSGCItem {
    code: string;
    name: string;
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

async function fetchPsgcItems(path: string): Promise<PSGCItem[]> {
    const res = await fetch(`/api/psgc${path}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
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

function LocationSelect({
    label,
    value,
    items,
    placeholder,
    disabled,
    onChange,
}: {
    label: string;
    value: string;
    items: PSGCItem[];
    placeholder: string;
    disabled?: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <label className="space-y-1.5">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">{label}</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
                <option value="" className="bg-zinc-900 text-white/40">{placeholder}</option>
                {items.map(item => (
                    <option key={item.code} value={item.code} className="bg-zinc-900">
                        {item.name}
                    </option>
                ))}
            </select>
        </label>
    );
}

function LocationPill({ label, code, items }: { label: string; code: string; items: PSGCItem[] }) {
    const name = items.find(item => item.code === code)?.name ?? code;
    return (
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-cyan-200">
            {label}: <span className="font-bold">{name}</span>
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

    const [regions, setRegions] = useState<PSGCItem[]>([]);
    const [provinces, setProvinces] = useState<PSGCItem[]>([]);
    const [cities, setCities] = useState<PSGCItem[]>([]);
    const [barangays, setBarangays] = useState<PSGCItem[]>([]);
    const [regionCode, setRegionCode] = useState("");
    const [provinceCode, setProvinceCode] = useState("");
    const [cityMunCode, setCityMunCode] = useState("");
    const [barangayCode, setBarangayCode] = useState("");

    const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
    const [addRoleVal, setAddRoleVal] = useState("");
    const [roleLoading, setRoleLoading] = useState(false);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

    const [sortBy, setSortBy] = useState<"joined" | "rating" | "matches">("joined");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Bulk CSV import
    const [importFile,      setImportFile]      = useState<File | null>(null);
    const [importBusy,      setImportBusy]      = useState(false);
    const [importResult,    setImportResult]    = useState<{ assigned: number; errors: number; results: { email: string; role: string; status: string; reason?: string }[] } | null>(null);
    const [showImportPanel, setShowImportPanel] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchUsers = useCallback(async (q: string, page: number) => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({
                q,
                page: String(page),
                limit: "20",
                sort_by: sortBy,
                sort_dir: sortDir,
            });
            if (regionCode) params.set("region_code", regionCode);
            if (provinceCode) params.set("province_code", provinceCode);
            if (cityMunCode) params.set("city_mun_code", cityMunCode);
            if (barangayCode) params.set("barangay_code", barangayCode);
            const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: authHeaders() });
            if (!res.ok) throw new Error("Failed to load users");
            const data = await res.json();
            setUsers(data.users);
            setUserTotal(data.total);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Error");
        } finally {
            setLoading(false);
        }
    }, [barangayCode, cityMunCode, provinceCode, regionCode, sortBy, sortDir]);

    function handleSort(field: "rating" | "matches") {
        if (sortBy === field) {
            setSortDir(d => d === "desc" ? "asc" : "desc");
        } else {
            setSortBy(field);
            setSortDir("desc");
        }
        setUserPage(1);
    }

    useEffect(() => {
        fetchUsers(userQ, userPage);
    }, [userQ, userPage, fetchUsers]);

    useEffect(() => {
        void fetchPsgcItems("/regions").then(setRegions);
    }, []);

    useEffect(() => {
        setProvinces([]);
        setCities([]);
        setBarangays([]);
        setProvinceCode("");
        setCityMunCode("");
        setBarangayCode("");
        setUserPage(1);
        if (regionCode) void fetchPsgcItems(`/regions/${regionCode}/provinces`).then(setProvinces);
    }, [regionCode]);

    useEffect(() => {
        setCities([]);
        setBarangays([]);
        setCityMunCode("");
        setBarangayCode("");
        setUserPage(1);
        if (provinceCode) void fetchPsgcItems(`/provinces/${provinceCode}/cities-municipalities`).then(setCities);
    }, [provinceCode]);

    useEffect(() => {
        setBarangays([]);
        setBarangayCode("");
        setUserPage(1);
        if (cityMunCode) void fetchPsgcItems(`/cities-municipalities/${cityMunCode}/barangays`).then(setBarangays);
    }, [cityMunCode]);

    useEffect(() => {
        setUserPage(1);
    }, [barangayCode]);

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

    async function deleteUser(user: AdminUser) {
        const label = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || user.id;
        const confirmed = window.confirm(
            `Delete ${label}?\n\nThis will remove the user account, clear their queue/session records, and detach them from historical matches. This cannot be undone.`
        );
        if (!confirmed) return;

        setDeletingUserId(user.id);
        setError("");
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, {
                method: "DELETE",
                headers: authHeaders(),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.detail || "Failed to delete user");
            }
            setUsers(prev => prev.filter(u => u.id !== user.id));
            setUserTotal(prev => Math.max(0, prev - 1));
            if (roleTarget?.id === user.id) setRoleTarget(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to delete user");
        } finally {
            setDeletingUserId(null);
        }
    }

    const userPages = Math.ceil(userTotal / 20);

    // ── Bulk import handler ──────────────────────────────────────────────────
    async function handleImport() {
        if (!importFile) return;
        setImportBusy(true);
        setImportResult(null);
        try {
            const formData = new FormData();
            formData.append("file", importFile);
            const token = getAccessToken();
            const res = await fetch("/api/admin/users/import-roles", {
                method: "POST",
                headers: { Authorization: `Bearer ${token ?? ""}` },
                body: formData,
            });
            const d = await res.json();
            setImportResult(d as typeof importResult);
        } catch {
            setImportResult({ assigned: 0, errors: 1, results: [{ email: "—", role: "—", status: "error", reason: "Network error" }] });
        } finally {
            setImportBusy(false);
            setImportFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
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
                    className="flex-1 min-w-48 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                />
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-white/40">
                        Total: <span className="text-white/70 font-bold">{userTotal}</span>
                    </span>
                    <button
                        onClick={() => { setShowImportPanel(v => !v); setImportResult(null); }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                            showImportPanel
                                ? "bg-white/10 border-white/20 text-white"
                                : "border-white/10 text-white/40 hover:text-white hover:bg-white/5"
                        }`}
                    >
                        ↑ Import Roles CSV
                    </button>
                </div>
            </div>

            <div className="rounded-2xl bg-zinc-900/50 border border-white/8 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-white">Location Directory</h3>
                        <p className="text-xs text-white/40 mt-1">
                            Filter registered users by their profile location, from region down to barangay.
                        </p>
                    </div>
                    {(regionCode || provinceCode || cityMunCode || barangayCode) && (
                        <button
                            onClick={() => {
                                setRegionCode("");
                                setProvinceCode("");
                                setCityMunCode("");
                                setBarangayCode("");
                                setUserPage(1);
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white/50 border border-white/10 hover:text-white hover:bg-white/5 transition-all"
                        >
                            Clear Location
                        </button>
                    )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <LocationSelect
                        label="Region"
                        value={regionCode}
                        items={regions}
                        placeholder="All regions"
                        onChange={setRegionCode}
                    />
                    <LocationSelect
                        label="Province"
                        value={provinceCode}
                        items={provinces}
                        placeholder={regionCode ? "All provinces" : "Select region first"}
                        onChange={setProvinceCode}
                        disabled={!regionCode}
                    />
                    <LocationSelect
                        label="City / Municipality"
                        value={cityMunCode}
                        items={cities}
                        placeholder={provinceCode ? "All cities / municipalities" : "Select province first"}
                        onChange={setCityMunCode}
                        disabled={!provinceCode}
                    />
                    <LocationSelect
                        label="Barangay"
                        value={barangayCode}
                        items={barangays}
                        placeholder={cityMunCode ? "All barangays" : "Select city first"}
                        onChange={setBarangayCode}
                        disabled={!cityMunCode}
                    />
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-white/40">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                        Showing <span className="font-bold text-white/70">{userTotal}</span> registered user{userTotal === 1 ? "" : "s"}
                    </span>
                    {regionCode && <LocationPill label="Region" code={regionCode} items={regions} />}
                    {provinceCode && <LocationPill label="Province" code={provinceCode} items={provinces} />}
                    {cityMunCode && <LocationPill label="City/Mun." code={cityMunCode} items={cities} />}
                    {barangayCode && <LocationPill label="Barangay" code={barangayCode} items={barangays} />}
                </div>
            </div>

            {/* Bulk import panel */}
            {showImportPanel && (
                <div className="rounded-2xl bg-zinc-900/50 border border-white/8 p-6 space-y-4">
                    <div>
                        <h3 className="text-sm font-bold text-white">Bulk Role Assignment via CSV</h3>
                        <p className="text-xs text-white/40 mt-1">
                            CSV must have <code className="text-white/60">email,role</code> headers. Valid roles:{" "}
                            {ALL_ROLES.filter(r => r !== "system_admin").map(r => (
                                <code key={r} className="text-white/50 mx-0.5">{r}</code>
                            ))}.
                            <span className="text-amber-400/70 ml-1">system_admin cannot be assigned via import.</span>
                        </p>
                    </div>

                    {/* Download template */}
                    <a
                        href="data:text/csv;charset=utf-8,email%2Crole%0Auser%40example.com%2Cplayer%0Aadmin%40example.com%2Cclub_admin"
                        download="isms_role_import_template.csv"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download CSV template
                    </a>

                    <div className="flex items-center gap-3 flex-wrap">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                            className="text-sm text-white/60 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-white/20 file:bg-white/5 file:text-white/60 file:text-xs file:font-bold file:uppercase file:tracking-widest hover:file:bg-white/10 file:transition-all file:cursor-pointer"
                        />
                        <button
                            onClick={() => void handleImport()}
                            disabled={!importFile || importBusy}
                            className="px-5 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {importBusy ? "Importing…" : "Import"}
                        </button>
                    </div>

                    {importResult && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-4 text-xs">
                                <span className="text-emerald-400 font-bold">{importResult.assigned} assigned</span>
                                {importResult.errors > 0 && <span className="text-rose-400 font-bold">{importResult.errors} errors</span>}
                            </div>
                            <div className="rounded-xl bg-black/20 border border-white/5 overflow-hidden max-h-48 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-white/5 bg-white/3">
                                            <th className="text-left px-4 py-2 text-white/30 font-bold uppercase tracking-widest">Email</th>
                                            <th className="text-left px-4 py-2 text-white/30 font-bold uppercase tracking-widest">Role</th>
                                            <th className="text-left px-4 py-2 text-white/30 font-bold uppercase tracking-widest">Result</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importResult.results.map((r, i) => (
                                            <tr key={i} className="border-b border-white/3">
                                                <td className="px-4 py-2 text-white/60 font-mono">{r.email}</td>
                                                <td className="px-4 py-2 text-white/50">{r.role}</td>
                                                <td className="px-4 py-2">
                                                    <span className={`font-bold ${r.status === "assigned" ? "text-emerald-400" : r.status === "skipped" ? "text-amber-400" : "text-rose-400"}`}>
                                                        {r.status}
                                                        {r.reason ? ` — ${r.reason}` : ""}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

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
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase">Roles</th>
                            <th
                                onClick={() => handleSort("matches")}
                                className={`px-6 py-4 text-center text-xs font-semibold tracking-widest uppercase hidden lg:table-cell cursor-pointer select-none transition-colors hover:text-white/70 ${sortBy === "matches" ? "text-cyan-300" : "text-white/40"}`}
                            >
                                <span className="inline-flex items-center justify-center gap-1">
                                    Matches
                                    <span className={`text-[10px] ${sortBy === "matches" ? "opacity-100" : "opacity-30"}`}>
                                        {sortBy === "matches" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                                    </span>
                                </span>
                            </th>
                            <th
                                onClick={() => handleSort("rating")}
                                className={`px-6 py-4 text-center text-xs font-semibold tracking-widest uppercase hidden lg:table-cell cursor-pointer select-none transition-colors hover:text-white/70 ${sortBy === "rating" ? "text-cyan-300" : "text-white/40"}`}
                            >
                                <span className="inline-flex items-center justify-center gap-1">
                                    Rating
                                    <span className={`text-[10px] ${sortBy === "rating" ? "opacity-100" : "opacity-30"}`}>
                                        {sortBy === "rating" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                                    </span>
                                </span>
                            </th>
                            <th className="px-6 py-4 text-center text-xs text-white/40 font-semibold tracking-widest uppercase hidden xl:table-cell">Opponents</th>
                            <th className="px-6 py-4 text-center text-xs text-white/40 font-semibold tracking-widest uppercase hidden xl:table-cell">Activity</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden lg:table-cell">Joined</th>
                            <th className="px-6 py-4" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={9} className="px-6 py-12 text-center text-white/30 italic">Loading users...</td></tr>
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
                                                : <div className="w-full h-full flex items-center justify-center text-sm text-white/40 font-bold">{(u.first_name?.[0] ?? "?").toUpperCase()}</div>
                                            }
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white">{`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email}</p>
                                            <p className="text-xs text-white/30">{u.email}</p>
                                            <p className="text-[10px] text-white/20 mt-1 font-mono">
                                                {u.barangay_code || u.city_mun_code || u.province_code || u.region_code
                                                    ? [u.region_code, u.province_code, u.city_mun_code, u.barangay_code].filter(Boolean).join(" / ")
                                                    : "No location set"}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap gap-1.5">
                                        {u.roles.map(r => <RoleChip key={r} role={r} />)}
                                    </div>
                                </td>

                                {/* Matches */}
                                <td className="px-6 py-4 text-center hidden lg:table-cell">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-sm font-bold text-white">{u.total_matches}</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-widest ${u.rating_status === "RATED" ? "text-emerald-400" : "text-amber-400"}`}>
                                            {u.rating_status === "RATED" ? "Rated" : "Calibrating"}
                                        </span>
                                    </div>
                                </td>

                                {/* Rating */}
                                <td className="px-6 py-4 text-center hidden lg:table-cell">
                                    {u.best_rating != null ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className="text-sm font-bold text-cyan-300">{u.best_rating.toFixed(0)}</span>
                                            <span className="text-[9px] text-white/30 font-medium">Glicko-2</span>
                                        </div>
                                    ) : (
                                        <span className="text-white/20 text-xs">—</span>
                                    )}
                                </td>

                                {/* Distinct Opponents */}
                                <td className="px-6 py-4 text-center hidden xl:table-cell">
                                    <span className="text-sm font-bold text-white/70">{u.distinct_opponents}</span>
                                </td>

                                {/* Activity */}
                                <td className="px-6 py-4 hidden xl:table-cell">
                                    <div className="flex flex-col items-center gap-1 min-w-[64px]">
                                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    u.activeness_score >= 0.7 ? "bg-emerald-400" :
                                                    u.activeness_score >= 0.4 ? "bg-amber-400" : "bg-zinc-600"
                                                }`}
                                                style={{ width: `${Math.round(u.activeness_score * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-[9px] text-white/30 font-medium">
                                            {Math.round(u.activeness_score * 100)}%
                                        </span>
                                    </div>
                                </td>

                                <td className="px-6 py-4 text-white/30 text-xs hidden lg:table-cell">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => { setRoleTarget(u); setAddRoleVal(""); }}
                                            className="text-xs font-bold px-4 py-2 rounded-xl text-white/50 hover:text-white transition-all hover:bg-white/10 border border-transparent hover:border-white/10"
                                        >
                                            Manage
                                        </button>
                                        <button
                                            onClick={() => deleteUser(u)}
                                            disabled={deletingUserId === u.id}
                                            className="text-xs font-bold px-4 py-2 rounded-xl text-red-300/70 hover:text-red-200 transition-all hover:bg-red-500/10 border border-red-500/20 disabled:opacity-40 disabled:cursor-wait"
                                        >
                                            {deletingUserId === u.id ? "Deleting..." : "Delete"}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && users.length === 0 && (
                            <tr><td colSpan={9} className="px-6 py-12 text-center text-white/25 italic">No users found.</td></tr>
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
                                <p className="text-sm text-white/40 mt-1">{`${roleTarget.first_name || ''} ${roleTarget.last_name || ''}`.trim() || roleTarget.email} · <span className="text-white/20">{roleTarget.email}</span></p>
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
