"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/auth";

interface AdminTournament {
    id: string;
    name: string;
    sport: string;
    status: string;
    format: string;
    organizer: string | null;
    organizer_id: string;
    participants: number;
    max_players: number | null;
    created_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
    upcoming: "bg-blue-500/15 text-blue-300 border-blue-500/20",
    ongoing:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
    completed:"bg-zinc-700/40 text-zinc-400 border-zinc-600/40",
    cancelled:"bg-red-500/15 text-red-400 border-red-500/20",
};

function authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${getAccessToken()}`, "Content-Type": "application/json" };
}

export default function TournamentsAdminPage() {
    const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
    const [tournTotal, setTournTotal] = useState(0);
    const [tournPage, setTournPage] = useState(1);
    const [tournQ, setTournQ] = useState("");
    const [tournSearch, setTournSearch] = useState("");
    const tournDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [deletingTournId, setDeletingTournId] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchTournaments = useCallback(async (q: string, page: number) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/admin/tournaments?q=${encodeURIComponent(q)}&page=${page}&limit=20`, { headers: authHeaders() });
            if (!res.ok) throw new Error("Failed to load tournaments");
            const data = await res.json();
            setTournaments(data.tournaments);
            setTournTotal(data.total);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTournaments(tournQ, tournPage);
    }, [tournQ, tournPage, fetchTournaments]);

    async function deleteTournament(id: string) {
        try {
            const res = await fetch(`/api/admin/tournaments/${id}`, { method: "DELETE", headers: authHeaders() });
            if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
            setTournaments(prev => prev.filter(t => t.id !== id));
            setDeletingTournId(null);
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Failed to delete");
        }
    }

    const tournPages = Math.ceil(tournTotal / 20);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <input
                    value={tournSearch}
                    onChange={e => {
                        setTournSearch(e.target.value);
                        if (tournDebounce.current) clearTimeout(tournDebounce.current);
                        tournDebounce.current = setTimeout(() => {
                            setTournQ(e.target.value);
                            setTournPage(1);
                        }, 300);
                    }}
                    placeholder="Search tournaments..."
                    className="w-full max-w-sm rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                />
                <div className="text-xs text-white/40">
                    Total: <span className="text-white/70 font-bold">{tournTotal}</span> tournaments
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
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase">Tournament</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden md:table-cell">Sport</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase">Status</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden lg:table-cell">Organizer</th>
                            <th className="px-6 py-4 text-left text-xs text-white/40 font-semibold tracking-widest uppercase hidden lg:table-cell">Participants</th>
                            <th className="px-6 py-4" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={6} className="px-6 py-12 text-center text-white/30 italic">Loading tournaments...</td></tr>
                        )}
                        {!loading && tournaments.map((t, i) => (
                            <tr
                                key={t.id}
                                style={{ borderBottom: i < tournaments.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                                className="hover:bg-white/[0.04] transition-colors group"
                            >
                                <td className="px-6 py-4">
                                    <p className="font-semibold text-white">{t.name}</p>
                                    <p className="text-[10px] text-white/20 font-mono mt-0.5 uppercase tracking-tighter">{t.format.replace(/_/g, " ")}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-white/50 capitalize text-xs bg-white/5 px-2 py-1 rounded-md border border-white/5">{t.sport.replace(/_/g, " ")}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_COLORS[t.status] ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
                                        {t.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-white/50 hidden lg:table-cell text-xs">{t.organizer ?? "—"}</td>
                                <td className="px-6 py-4 text-white/50 hidden lg:table-cell">
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-blue-500/50" 
                                                style={{ width: `${Math.min(100, (t.participants / (t.max_players || 1)) * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-mono">{t.participants}{t.max_players ? `/${t.max_players}` : ""}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        {deletingTournId === t.id ? (
                                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1 animate-in fade-in zoom-in duration-200">
                                                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider mr-1">Confirm?</span>
                                                <button onClick={() => deleteTournament(t.id)} className="text-[10px] font-bold px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-400 transition-colors uppercase">Delete</button>
                                                <button onClick={() => setDeletingTournId(null)} className="text-[10px] font-bold px-2 py-1 rounded-md bg-white/10 text-white/60 hover:bg-white/20 transition-colors uppercase">Cancel</button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => setDeletingTournId(t.id)} 
                                                className="p-2 rounded-xl text-red-400/40 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                                                title="Delete Tournament"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && tournaments.length === 0 && (
                            <tr><td colSpan={6} className="px-6 py-12 text-center text-white/25 italic">No tournaments found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {tournPages > 1 && (
                <div className="flex items-center gap-4 justify-end pt-4">
                    <button onClick={() => setTournPage(p => Math.max(1, p - 1))} disabled={tournPage === 1}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/40 hover:text-white disabled:opacity-20 transition-all hover:bg-white/5 border border-white/5">
                        ← Previous
                    </button>
                    <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/70">
                        {tournPage} <span className="text-white/20 mx-1">/</span> {tournPages}
                    </div>
                    <button onClick={() => setTournPage(p => Math.min(tournPages, p + 1))} disabled={tournPage === tournPages}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white/40 hover:text-white disabled:opacity-20 transition-all hover:bg-white/5 border border-white/5">
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
