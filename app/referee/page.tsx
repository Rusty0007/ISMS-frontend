"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

const SPORTS_META: Record<string, { label: string; emoji: string; color: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-orange-400" },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-blue-400" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-lime-400" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-red-400" },
};

const STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
    ongoing:   { label: "Live",      className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-500" },
    completed: { label: "Finished",  className: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20", dot: "bg-zinc-500" },
    pending:   { label: "Upcoming",  className: "bg-amber-500/10 text-amber-400 border border-amber-500/20", dot: "bg-amber-500" },
};

interface LobbyStatus {
    team1_in_lobby: boolean;
    team2_in_lobby: boolean;
    ref_in_lobby:   boolean;
    all_ready:       boolean;
}

interface RefereeMatch {
    id: string;
    sport: string;
    match_type: string;
    match_format: string;
    status: string;
    tournament_id: string | null;
    player1_id: string;
    player2_id: string | null;
    player3_id: string | null;
    player4_id: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    lobby: LobbyStatus | null;
}

type SectionKey = "ongoing" | "upcoming" | "completed";

export default function RefereeDashboardPage() {
    const router = useRouter();
    const [data,        setData]        = useState<Record<SectionKey, RefereeMatch[]>>({ ongoing: [], upcoming: [], completed: [] });
    const [loading,     setLoading]     = useState(true);
    const [inviteCount, setInviteCount] = useState(0);
    const [activeTab,   setActiveTab]   = useState<SectionKey>("ongoing");

    async function fetchMatches() {
        const token = getAccessToken();
        if (!token) return;
        const res = await fetch("/api/referee/my-matches", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
            const d = await res.json();
            setData({ ongoing: d.ongoing ?? [], upcoming: d.upcoming ?? [], completed: d.completed ?? [] });
        }
    }

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        Promise.all([
            fetch("/api/referee/my-matches", { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/referee/my-invites",  { headers: { Authorization: `Bearer ${token}` } }),
        ])
        .then(async ([matchRes, inviteRes]) => {
            if (isUnauthorized(matchRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (matchRes.ok) {
                const d = await matchRes.json();
                const ongoing = d.ongoing ?? [];
                const upcoming = d.upcoming ?? [];
                const completed = d.completed ?? [];
                setData({ ongoing, upcoming, completed });
                
                // Auto-switch tab if no ongoing matches but there are upcoming ones
                if (ongoing.length === 0 && upcoming.length > 0) {
                    setActiveTab("upcoming");
                } else if (ongoing.length === 0 && upcoming.length === 0 && completed.length > 0) {
                    setActiveTab("completed");
                }
            }
            if (inviteRes.ok) {
                const d = await inviteRes.json();
                setInviteCount(d.count ?? 0);
            }
        })
        .catch(err => console.error("[referee/page]", err))
        .finally(() => setLoading(false));
    }, [router]);

    const stats = useMemo(() => ({
        live: data.ongoing.length,
        upcoming: data.upcoming.length,
        done: data.completed.length,
        total: data.ongoing.length + data.upcoming.length + data.completed.length
    }), [data]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050608] text-white flex flex-col items-center justify-center p-6 text-center">
                <div className="relative w-16 h-16 mb-6">
                    <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <h2 className="text-xl font-bold mb-2">Syncing Dashboard</h2>
                <p className="text-zinc-500 text-sm max-w-xs">Connecting to the officiating network to fetch your assignments...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050608] text-white flex flex-col pb-24 sm:pb-10">
            {/* Grid background effect */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                    backgroundSize: "40px 40px",
                }}
            />
            
            <NavBar backHref="/dashboard" backLabel="Dashboard" title="Referee Console" />

            <main className="relative z-10 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-8">
                
                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-1 bg-blue-500 rounded-full" />
                            <h1 className="text-3xl font-black tracking-tight">OFFICIATING</h1>
                        </div>
                        <p className="text-zinc-500 text-sm font-medium">Manage your assigned matches and track progress.</p>
                    </div>

                    <Link
                        href="/referee/invites"
                        className={`group relative flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all duration-300 ${
                            inviteCount > 0
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50"
                                : "bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/10"
                        }`}
                    >
                        <span className="text-lg">📩</span>
                        <div className="flex flex-col items-start leading-none">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Pending</span>
                            <span className="text-sm font-bold">Invites</span>
                        </div>
                        {inviteCount > 0 && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-black animate-pulse">
                                {inviteCount}
                            </span>
                        )}
                        <span className="ml-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
                    </Link>
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Live" value={stats.live} color="emerald" active={stats.live > 0} />
                    <StatCard label="Upcoming" value={stats.upcoming} color="amber" active={stats.upcoming > 0} />
                    <StatCard label="Finished" value={stats.done} color="zinc" active={false} />
                </div>

                {/* Main Content Area */}
                <div className="flex flex-col gap-6">
                    {/* Custom Tabs */}
                    <div className="flex items-center gap-1 p-1 bg-zinc-900/50 border border-white/5 rounded-2xl self-start">
                        <TabButton 
                            active={activeTab === "ongoing"} 
                            onClick={() => setActiveTab("ongoing")}
                            label="Live"
                            count={data.ongoing.length}
                        />
                        <TabButton 
                            active={activeTab === "upcoming"} 
                            onClick={() => setActiveTab("upcoming")}
                            label="Upcoming"
                            count={data.upcoming.length}
                        />
                        <TabButton 
                            active={activeTab === "completed"} 
                            onClick={() => setActiveTab("completed")}
                            label="History"
                            count={data.completed.length}
                        />
                    </div>

                    {/* Tab Panels */}
                    <div className="min-h-[300px]">
                        {activeTab === "ongoing" && (
                            <MatchList 
                                matches={data.ongoing} 
                                onRefresh={fetchMatches} 
                                emptyTitle="No live matches"
                                emptyDesc="Matches will appear here once they are ready to start or are currently in progress."
                            />
                        )}
                        {activeTab === "upcoming" && (
                            <MatchList 
                                matches={data.upcoming} 
                                onRefresh={fetchMatches}
                                emptyTitle="No upcoming assignments"
                                emptyDesc="You don't have any scheduled matches. Check your invites for new opportunities."
                            />
                        )}
                        {activeTab === "completed" && (
                            <MatchList 
                                matches={data.completed} 
                                emptyTitle="No match history"
                                emptyDesc="Completed matches where you officiated will be archived here."
                            />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

function StatCard({ label, value, color, active }: { label: string, value: number, color: string, active: boolean }) {
    const colorClasses: Record<string, string> = {
        emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
        amber: "text-amber-400 border-amber-500/20 bg-amber-500/5",
        zinc: "text-zinc-400 border-zinc-500/20 bg-zinc-500/5"
    };

    return (
        <div className={`p-4 rounded-2xl border transition-all ${colorClasses[color]} ${active ? "ring-1 ring-inset ring-current/20" : "opacity-60"}`}>
            <span className="block text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">{label}</span>
            <span className="text-2xl font-black">{value}</span>
        </div>
    );
}

function TabButton({ active, onClick, label, count }: { active: boolean, onClick: () => void, label: string, count: number }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                active 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}
        >
            {label}
            {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${active ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-500"}`}>
                    {count}
                </span>
            )}
        </button>
    );
}

function MatchList({ matches, onRefresh, emptyTitle, emptyDesc }: {
    matches: RefereeMatch[];
    onRefresh?: () => void;
    emptyTitle: string;
    emptyDesc: string;
}) {
    if (matches.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-zinc-900/20 border border-dashed border-white/5 rounded-[2rem] animate-in fade-in zoom-in-95 duration-500">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center text-2xl mb-4 grayscale opacity-40">
                    📉
                </div>
                <h3 className="text-lg font-bold text-zinc-300">{emptyTitle}</h3>
                <p className="text-sm text-zinc-500 mt-1 max-w-xs">{emptyDesc}</p>
                <Link href="/referee/invites" className="mt-6 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
                    View Invitations →
                </Link>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {matches.map(m => (
                <RefereeMatchCard key={m.id} match={m} onRefresh={onRefresh} />
            ))}
        </div>
    );
}

function RefereeMatchCard({ match: m, onRefresh }: { match: RefereeMatch; onRefresh?: () => void }) {
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState("");

    const sport  = SPORTS_META[m.sport];
    const status = STATUS_META[m.status] ?? STATUS_META.pending;
    const isDoubles = m.match_format === "doubles" || m.match_format === "mixed_doubles";
    const lobby = m.lobby;
    const canStart = m.status === "pending" && lobby?.all_ready && !!m.tournament_id;

    async function handleStartMatch() {
        if (!m.tournament_id) return;
        setStartError(""); setStarting(true);
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/${m.tournament_id}/matches/${m.id}/start`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            onRefresh?.();
        } else {
            const d = await res.json().catch(() => ({}));
            setStartError(d.detail || "Failed to start match.");
        }
        setStarting(false);
    }

    return (
        <div className={`group relative bg-zinc-900/40 border rounded-[2rem] overflow-hidden transition-all duration-300 hover:bg-zinc-900/60 ${
            m.status === "ongoing" ? "border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]" :
            canStart ? "border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-white/5"
        }`}>
            {/* Sport Indicator Bar */}
            <div className={`absolute top-0 left-0 w-1 h-full opacity-40 ${sport?.color.replace('text', 'bg') ?? "bg-zinc-700"}`} />

            <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-2xl shadow-inner border border-white/5 group-hover:scale-110 transition-transform">
                            {sport?.emoji ?? "🏅"}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-lg leading-tight">{sport?.label ?? m.sport}</h3>
                                <span className={`w-1.5 h-1.5 rounded-full ${status.dot} animate-pulse`} />
                            </div>
                            <p className="text-xs text-zinc-500 font-medium capitalize">
                                {m.match_type.replace("_", " ")} • {isDoubles ? "Doubles" : "Singles"}
                            </p>
                        </div>
                    </div>
                    
                    <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${status.className}`}>
                        {status.label}
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Time / Schedule Info */}
                    <div className="flex items-center gap-4 text-xs">
                        {m.scheduled_at && m.status === "pending" && (
                            <div className="flex items-center gap-2 text-zinc-400">
                                <span className="opacity-50">📅</span>
                                <span>{new Date(m.scheduled_at).toLocaleDateString()} at {new Date(m.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        )}
                        {m.started_at && m.status === "ongoing" && (
                            <div className="flex items-center gap-2 text-emerald-400/80 font-medium">
                                <span className="opacity-70">⏱️</span>
                                <span>Started {new Date(m.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                        )}
                        {m.completed_at && m.status === "completed" && (
                            <div className="flex items-center gap-2 text-zinc-500">
                                <span className="opacity-50">🏁</span>
                                <span>Finished {new Date(m.completed_at).toLocaleDateString()}</span>
                            </div>
                        )}
                    </div>

                    {/* Lobby Status Visualization */}
                    {lobby && m.status !== "completed" && (
                        <div className="bg-black/20 rounded-2xl p-3 border border-white/5">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-2">Readiness Check</span>
                            <div className="grid grid-cols-3 gap-2">
                                <ReadinessBadge active={lobby.team1_in_lobby} label="Team 1" />
                                <ReadinessBadge active={lobby.team2_in_lobby} label="Team 2" />
                                <ReadinessBadge active={lobby.ref_in_lobby}   label="Referee" />
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2">
                        {canStart ? (
                            <button
                                onClick={handleStartMatch}
                                disabled={starting}
                                className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {starting ? (
                                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <><span>▶</span> START MATCH</>
                                )}
                            </button>
                        ) : (
                            <Link
                                href={m.status === "ongoing" ? `/matches/${m.id}/referee` : `/matches/${m.id}`}
                                className={`flex-1 h-11 flex items-center justify-center gap-2 font-bold rounded-xl transition-all border ${
                                    m.status === "ongoing" 
                                        ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500" 
                                        : "bg-zinc-800 border-white/5 text-zinc-300 hover:bg-zinc-700"
                                }`}
                            >
                                {m.status === "ongoing" ? "SCOREBOARD →" : "DETAILS →"}
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {startError && (
                <div className="px-6 pb-4">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                        <p className="text-[10px] font-bold text-red-400">⚠️ {startError}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function ReadinessBadge({ active, label }: { active: boolean; label: string }) {
    return (
        <div className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors ${active ? "bg-emerald-500/10" : "bg-zinc-900/50 grayscale opacity-40"}`}>
            <div className={`w-2 h-2 rounded-full ${active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-700"}`} />
            <span className={`text-[9px] font-bold tracking-tight ${active ? "text-emerald-400" : "text-zinc-500"}`}>{label}</span>
        </div>
    );
}
