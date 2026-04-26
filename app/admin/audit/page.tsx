"use client";

import React, { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth";

interface AuditLog {
    id: string;
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    event_type: string;
    ip_address: string | null;
    details: Record<string, unknown> | null;
    created_at: string | null;
}

const EVENT_COLORS: Record<string, string> = {
    LOGIN:                   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    LOGOUT:                  "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
    LOGIN_SESSION_REPLACED:  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    SESSION_REPLACED:        "text-orange-400 bg-orange-400/10 border-orange-400/20",
    BROWSER_CLOSED:          "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
};

function authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${getAccessToken()}`, "Content-Type": "application/json" };
}

export default function AuditAdminPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [logTotal, setLogTotal] = useState(0);
    const [logPage, setLogPage] = useState(1);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchLogs = useCallback(async (page: number) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/admin/audit-logs?page=${page}&limit=50`, { headers: authHeaders() });
            if (!res.ok) throw new Error("Failed to load logs");
            const data = await res.json();
            setLogs(data.logs);
            setLogTotal(data.total);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs(logPage);
    }, [logPage, fetchLogs]);

    const logPages = Math.ceil(logTotal / 50);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">System Events</h3>
                <div className="text-xs text-white/40">
                    Total Logs: <span className="text-white/70 font-bold">{logTotal}</span>
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
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase">Event</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden md:table-cell">IP Address</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden lg:table-cell">Metadata</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase">Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30 italic">Loading audit trail...</td></tr>
                        )}
                        {!loading && logs.map((l, i) => (
                            <tr
                                key={l.id}
                                style={{ borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                                className="hover:bg-white/[0.03] transition-colors"
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                                        <span className="text-white/80 font-medium">{`${l.first_name || ''} ${l.last_name || ''}`.trim() || l.user_id.slice(0, 8)}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${EVENT_COLORS[l.event_type] ?? "text-white/50 bg-white/5 border-white/10"}`}>
                                        {l.event_type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-white/30 font-mono text-xs hidden md:table-cell">{l.ip_address ?? "—"}</td>
                                <td className="px-6 py-4 text-white/20 text-[10px] hidden lg:table-cell max-w-xs truncate font-mono">
                                    {l.details ? JSON.stringify(l.details) : "—"}
                                </td>
                                <td className="px-6 py-4 text-white/40 text-xs whitespace-nowrap font-mono">
                                    {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
                                </td>
                            </tr>
                        ))}
                        {!loading && logs.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-white/25 italic">No logs recorded.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {logPages > 1 && (
                <div className="flex items-center gap-4 justify-end pt-4">
                    <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/40 hover:text-white disabled:opacity-20 transition-all hover:bg-white/5 border border-white/5">
                        ← Previous
                    </button>
                    <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/70">
                        {logPage} <span className="text-white/20 mx-1">/</span> {logPages}
                    </div>
                    <button onClick={() => setLogPage(p => Math.min(logPages, p + 1))} disabled={logPage === logPages}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/40 hover:text-white disabled:opacity-20 transition-all hover:bg-white/5 border border-white/5">
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
