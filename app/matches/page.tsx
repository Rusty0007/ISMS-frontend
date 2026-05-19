"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

// ── Meta maps ──────────────────────────────────────────────────────────────

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20"   },
};

const STATUS_META: Record<string, { label: string; dot: string; pill: string }> = {
    pending:   { label: "Pending",   dot: "bg-amber-400", pill: "bg-amber-400/10 text-amber-400 border border-amber-400/20" },
    ongoing:   { label: "Live",      dot: "bg-emerald-400 animate-pulse", pill: "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20" },
    completed: { label: "Logged",    dot: "bg-slate-500", pill: "bg-white/5 text-slate-400 border border-white/5"          },
    cancelled: { label: "Aborted",   dot: "bg-rose-500",  pill: "bg-rose-500/10 text-rose-400 border border-rose-500/20"          },
};

const TYPE_LABELS: Record<string, string> = {
    ranked:     "Ranked",
    friendly:   "Casual",
    queue:      "Casual",
    book:       "Booked",
    tournament: "Tournament",
};

const TYPE_COLORS: Record<string, string> = {
    ranked:     "text-cyan-400",
    tournament: "text-violet-400",
    friendly:   "text-slate-500",
    queue:      "text-slate-500",
    book:       "text-slate-500",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface Match {
    id: string;
    sport: string;
    match_type: string;
    match_format: string;
    status: string;
    player1_id: string;
    player2_id: string | null;
    winner_id: string | null;
    my_team?: "team1" | "team2";
    team1?: PlayerSummary[];
    team2?: PlayerSummary[];
    opponents?: PlayerSummary[];
    teammates?: PlayerSummary[];
    sets?: MatchSetScore[];
    score?: string | null;
    created_at: string;
    my_rating_change?: number | null;
}

interface PlayerSummary {
    id: string;
    name: string;
}

interface MatchSetScore {
    set_number: number;
    team1_score: number | null;
    team2_score: number | null;
}

interface HistoryEntry {
    id: string;
    event_type: string;
    team: string | null;
    player_id: string | null;
    player_name?: string | null;
    recorded_by: string | null;
    recorded_by_name?: string | null;
    description: string | null;
    set_number: number | null;
    team1_score: number | null;
    team2_score: number | null;
    meta?: Record<string, unknown> | null;
    created_at: string;
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function MatchesPage() {
    const router = useRouter();
    const [matches, setMatches]         = useState<Match[]>([]);
    const [loading, setLoading]         = useState(true);
    const [userId, setUserId]           = useState<string | null>(null);
    const [isDeviceOnline, setIsDeviceOnline] = useState(true);
    const [activeFilter, setActiveFilter]     = useState<"all" | "wins" | "losses" | "ranked">("all");
    const [selectedMatch, setSelectedMatch]   = useState<Match | null>(null);
    const [history, setHistory]               = useState<HistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError]     = useState<string | null>(null);

    async function inspectMatch(match: Match) {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        setSelectedMatch(match);
        setHistory([]);
        setHistoryError(null);
        setHistoryLoading(true);

        try {
            const res = await fetch(`/api/matches/${match.id}/history?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!res.ok) throw new Error("Unable to load match logs.");
            const data = await res.json();
            setHistory(data.history ?? []);
        } catch (err) {
            setHistoryError(err instanceof Error ? err.message : "Unable to load match logs.");
        } finally {
            setHistoryLoading(false);
        }
    }

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        Promise.all([
            fetch("/api/players/me",  { headers: { Authorization: `Bearer ${token}` } }).then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                return r.ok ? r.json() : null;
            }),
            fetch("/api/matches/my", { headers: { Authorization: `Bearer ${token}` } }).then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                return r.ok ? r.json() : null;
            }),
        ])
        .then(([me, matchData]) => {
            if (me?.profile) setUserId(me.profile.id);
            if (matchData?.matches) setMatches(matchData.matches);
        })
        .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setIsDeviceOnline(typeof navigator === "undefined" ? true : navigator.onLine);
        const on  = () => setIsDeviceOnline(true);
        const off = () => setIsDeviceOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050b14] flex items-center justify-center">
                <div className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse italic">Synchronizing Logs...</div>
            </div>
        );
    }

    const live      = matches.filter(m => m.status === "ongoing" || m.status === "awaiting_players" || m.status === "pending_approval");
    const completed = matches.filter(m => m.status === "completed");
    const cancelled = matches.filter(m => m.status === "cancelled");
    const wins      = completed.filter(m => m.winner_id === userId);
    const losses    = completed.filter(m => m.winner_id !== null && m.winner_id !== userId);
    const winRate   = completed.length > 0 ? Math.round((wins.length / completed.length) * 100) : null;

    const filteredHistory = (() => {
        const past = [...completed, ...cancelled].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (activeFilter === "wins")   return past.filter(m => m.winner_id === userId);
        if (activeFilter === "losses") return past.filter(m => m.status === "completed" && m.winner_id !== null && m.winner_id !== userId);
        if (activeFilter === "ranked") return past.filter(m => m.match_type === "ranked");
        return past;
    })();

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            <NavBar backHref="/dashboard" backLabel="DASHBOARD" />

            <main className="relative z-10 max-w-6xl mx-auto px-4 py-8 pb-32 pt-24 space-y-12">

                {/* Header Section */}
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-[1px] bg-cyan-500/50" />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500/70">Match Archives</p>
                        </div>
                        <h1 className="text-4xl lg:text-5xl font-black text-white uppercase italic tracking-tighter">Mission Log</h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Complete history and find match interface.</p>
                    </div>
                    {live.length > 0 && (
                        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md shadow-lg shadow-emerald-500/5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{live.length} ACTIVE MATCHES</span>
                        </div>
                    )}
                </header>

                {/* Offline Alert */}
                {!isDeviceOnline && (
                    <div className="mx-2 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-6 py-4 backdrop-blur-md flex items-center gap-4">
                        <span className="text-xl animate-bounce">📡</span>
                        <div>
                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Network Interruption</p>
                            <p className="text-[9px] text-rose-400/60 uppercase font-bold mt-0.5">Operating in limited local cache mode. Real-time sync suspended.</p>
                        </div>
                    </div>
                )}

                {/* Tactical Stats Grid */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-2">
                    <StatCard label="Total Matches" value={matches.length} trend="All Time" color="text-white" />
                    <StatCard label="Victories" value={wins.length} trend={`${Math.round((wins.length / (completed.length || 1)) * 100)}% Win Rate`} color="text-emerald-400" />
                    <StatCard label="Defeats" value={losses.length} trend="Logged" color="text-rose-500" />
                    <StatCard label="Win Rate" value={winRate !== null ? `${winRate}%` : "—"} trend="Efficiency" color="text-cyan-400" />
                </section>

                {/* Quick Deployments */}
                <section className="space-y-6">
                    <SectionHeader title="FIND MATCH HUB" note="Initiate new matches" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <DeployCard 
                            href="/matches/queue"
                            title="Ranked Queue"
                            tag="SR Sync"
                            desc="Glicko-2 rating + location finds your ideal opponent."
                            icon="⚡"
                            color="cyan"
                        />
                        <DeployCard 
                            href="/matches/party"
                            title="Doubles Team"
                            tag="Network"
                            desc="Form a tactical unit with a friend for doubles play."
                            icon="👥"
                            color="purple"
                        />
                        <DeployCard 
                            href="/matches/new"
                            title="Manual Match"
                            tag="Direct"
                            desc="Challenge specific players or schedule sessions."
                            icon="🎯"
                            color="slate"
                        />
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Live & History Area */}
                    <div className="lg:col-span-8 space-y-12">
                        
                        {/* Live Ops */}
                        {live.length > 0 && (
                            <section className="space-y-6">
                                <SectionHeader title="Live Operations" note="In-progress combat data" glow />
                                <div className="space-y-3">
                                    {live.map(m => <MatchLogEntry key={m.id} match={m} userId={userId} isDeviceOnline={isDeviceOnline} onInspect={inspectMatch} />)}
                                </div>
                            </section>
                        )}

                        {/* Logs / History */}
                        <section className="space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                                <SectionHeader title="Operation History" note="Archived mission data" />
                                <div className="flex p-1 bg-[#0a111a] border border-white/5 rounded-xl self-start sm:self-auto backdrop-blur-md">
                                    {(["all", "wins", "losses", "ranked"] as const).map(f => (
                                        <button 
                                            key={f} 
                                            onClick={() => setActiveFilter(f)}
                                            className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeFilter === f ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-white"}`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {filteredHistory.length === 0 ? (
                                <div className="rounded-[2.5rem] border border-white/5 bg-[#0a111a]/40 backdrop-blur-sm p-20 text-center space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-2xl mx-auto border border-white/5">📂</div>
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">No Archival Data Found</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredHistory.map(m => <MatchLogEntry key={m.id} match={m} userId={userId} isDeviceOnline={isDeviceOnline} onInspect={inspectMatch} />)}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Right Info Sidebar (Desktop only) */}
                    <div className="lg:col-span-4 space-y-8 sticky top-24">
                        <aside className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 border-b border-white/5 pb-4">Tactical Briefing</h3>
                            <div className="space-y-6">
                                <BriefingItem icon="🛡️" title="Verified Ops" desc="Only completed points recorded by a referee update your global SR." />
                                <BriefingItem icon="📍" title="Local Intelligence" desc="Matchmaking prioritizes players in your current facility circuit." />
                                <BriefingItem icon="📊" title="Calibration" desc="New operators require 10 matches to finalize global rank sync." />
                            </div>
                        </aside>

                        <div className="rounded-[2.5rem] bg-gradient-to-br from-cyan-500/10 to-transparent border border-white/5 p-8 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">⚔️</div>
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-2">Combat Ready?</h4>
                            <p className="text-[11px] text-slate-400 font-medium leading-relaxed mb-6">Your current efficiency is optimized for Intermediate-tier operations.</p>
                            <Link href="/matches/queue" className="block w-full py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl text-center hover:scale-[1.02] transition-transform">Initiate Sync</Link>
                        </div>
                    </div>
                </div>

                {/* Empty State global */}
                {matches.length === 0 && (
                    <div className="rounded-[3rem] border border-white/5 bg-[#0a111a]/60 backdrop-blur-xl p-20 text-center flex flex-col items-center gap-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.05)_0%,transparent_70%)]" />
                        <div className="w-20 h-20 rounded-[2rem] bg-white/5 border border-white/5 flex items-center justify-center text-4xl relative z-10">🛰️</div>
                        <div className="relative z-10 space-y-2">
                            <p className="text-xl font-black text-white uppercase italic tracking-tight">System Status: Null</p>
                            <p className="text-xs text-slate-500 uppercase tracking-widest max-w-xs mx-auto font-bold leading-relaxed">No operational history detected. Synchronize your first match to initialize logs.</p>
                        </div>
                        <Link href="/matches/queue" className="relative z-10 px-10 py-4 bg-cyan-500 text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:scale-105 transition-transform shadow-xl shadow-cyan-500/20">
                            Start First Operation
                        </Link>
                    </div>
                )}

            </main>

            {selectedMatch && (
                <MatchHistoryModal
                    match={selectedMatch}
                    history={history}
                    loading={historyLoading}
                    error={historyError}
                    onClose={() => setSelectedMatch(null)}
                />
            )}
        </div>
    );
}

// ── Helper Components ──────────────────────────────────────────────────────

function StatCard({ label, value, trend, color }: { label: string; value: string | number; trend: string; color: string }) {
    return (
        <div className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 space-y-2 relative overflow-hidden group transition-all hover:border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
            <p className={`text-3xl font-black italic tracking-tighter ${color}`}>{value}</p>
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{trend}</p>
        </div>
    );
}

function DeployCard({ href, title, tag, desc, icon, color }: { href: string; title: string; tag: string; desc: string; icon: string; color: string }) {
    const colorClasses: Record<string, string> = {
        cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
        purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
        slate: "text-slate-400 bg-white/5 border-white/10"
    };
    return (
        <Link href={href} className="group relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 p-8 transition-all hover:-translate-y-1 hover:border-white/20 backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="relative space-y-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border ${colorClasses[color]} group-hover:scale-110 transition-transform shadow-2xl`}>
                    {icon}
                </div>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{tag}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-800" />
                    </div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">{title}</h3>
                    <p className="text-[10px] text-slate-500 font-bold leading-relaxed uppercase">{desc}</p>
                </div>
                <div className="pt-2">
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] group-hover:text-cyan-400 transition-colors">Find Match →</span>
                </div>
            </div>
        </Link>
    );
}

function SectionHeader({ title, note, accent, glow }: { title: string; note: string; accent?: string; glow?: boolean }) {
    return (
        <div className="px-2 space-y-1">
            <div className="flex items-center gap-3">
                <h2 className={`text-[10px] font-black uppercase tracking-[0.3em] ${accent ?? "text-slate-500"}`}>{title}</h2>
                {glow && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,1)]" />}
            </div>
            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">{note}</p>
        </div>
    );
}

function BriefingItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
    return (
        <div className="flex gap-4">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0">{icon}</div>
            <div className="space-y-1">
                <p className="text-[10px] font-black text-white uppercase tracking-widest">{title}</p>
                <p className="text-[9px] text-slate-500 font-medium leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}

function MatchLogEntry({ match, userId, isDeviceOnline, onInspect }: { match: Match; userId: string | null; isDeviceOnline: boolean; onInspect: (match: Match) => void }) {
    const sport      = SPORTS_META[match.sport] || SPORTS_META.pickleball;
    const statusMeta = STATUS_META[match.status] ?? STATUS_META.pending;
    const typeLabel  = TYPE_LABELS[match.match_type] ?? match.match_type;
    const typeColor  = TYPE_COLORS[match.match_type] ?? "text-slate-500";
    const isCompleted = match.status === "completed";
    const isWinner    = isCompleted && match.winner_id === userId;
    const isLoss      = isCompleted && match.winner_id !== null && match.winner_id !== userId;
    const showOffline = (match.status === "ongoing" || match.status === "pending_approval") && !isDeviceOnline;
    const date = new Date(match.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    const opponentNames = match.opponents?.map(p => p.name).join(" / ") || (match.player2_id ? `Player ${match.player2_id.slice(0, 8)}` : "Opponent TBA");
    const teammateNames = match.teammates?.map(p => p.name).join(" / ");
    const scoreLabel = match.score || "No score recorded";

    return (
        <button
            type="button"
            onClick={() => onInspect(match)}
            className="group relative w-full text-left overflow-hidden rounded-2xl border border-white/5 bg-[#0a111a]/60 backdrop-blur-md px-6 py-5 transition-all hover:border-white/20 hover:bg-[#0a111a]/80 flex flex-col md:flex-row md:items-center justify-between gap-6">
            
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.01] to-transparent -translate-x-full group-hover:animate-shimmer" />

            <div className="flex items-center gap-6 relative z-10 min-w-0">
                <div className="relative">
                    <div className={`absolute inset-0 ${sport.bg} blur-lg rounded-full opacity-40`} />
                    <div className={`relative w-12 h-12 rounded-xl ${sport.bg} border ${sport.border} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-2xl`}>
                        {sport.emoji}
                    </div>
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-sm font-black uppercase italic tracking-tight ${sport.color}`}>{sport.label}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-800" />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${typeColor}`}>{typeLabel}</span>
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">/</span>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{match.match_format}</span>
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-slate-600 uppercase tracking-widest">{date}</p>
                    <p className="mt-3 text-sm font-black text-white uppercase tracking-tight truncate">vs {opponentNames}</p>
                    {teammateNames && <p className="mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">with {teammateNames}</p>}
                </div>
            </div>

            <div className="flex items-center gap-4 relative z-10 shrink-0 self-end md:self-auto">
                <div className="text-right">
                    <p className="text-lg font-black text-white italic tracking-tight">{scoreLabel}</p>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Score</p>
                </div>

                {isCompleted && (
                    <div className={`px-4 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-[0.2em] shadow-lg ${isWinner ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : isLoss ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-white/5 border-white/10 text-slate-400"}`}>
                        {isWinner ? "Win" : isLoss ? "Loss" : "Draw"}
                    </div>
                )}

                {isCompleted && match.my_rating_change != null && (
                    <div className={`px-3 py-1.5 rounded-lg border text-[10px] font-black tracking-widest shadow-lg ${
                        match.my_rating_change > 0
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : match.my_rating_change < 0
                            ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                            : "bg-white/5 border-white/5 text-slate-500"
                    }`}>
                        {match.my_rating_change > 0 ? "+" : ""}{match.my_rating_change.toFixed(1)} pts
                    </div>
                )}
                
                <div className={`px-4 py-1.5 rounded-lg border flex items-center gap-2 ${statusMeta.pill} shadow-lg`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot} shadow-[0_0_6px_currentColor]`} />
                    <span className="text-[9px] font-black uppercase tracking-widest">{statusMeta.label}</span>
                </div>

                {showOffline && (
                    <div className="px-4 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 text-[9px] font-black uppercase tracking-widest">OFFLINE</div>
                )}

                <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center text-slate-600 group-hover:text-white group-hover:border-white/20 transition-all ml-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </div>
            </div>
        </button>
    );
}

function MatchHistoryModal({ match, history, loading, error, onClose }: {
    match: Match;
    history: HistoryEntry[];
    loading: boolean;
    error: string | null;
    onClose: () => void;
}) {
    const opponentNames = match.opponents?.map(p => p.name).join(" / ") || "Opponent TBA";
    const team1Names = match.team1?.map(p => p.name).join(" / ") || "Team 1";
    const team2Names = match.team2?.map(p => p.name).join(" / ") || "Team 2";
    const scoreLabel = match.score || "No score recorded";
    const detailHref = `/matches/${match.id}${match.status === "awaiting_players" ? "/lobby" : ""}`;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-3xl border border-white/10 bg-[#07101a] shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400">Match Detail</p>
                        <h3 className="mt-2 text-2xl font-black uppercase italic tracking-tight text-white truncate">vs {opponentNames}</h3>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{team1Names} against {team2Names}</p>
                    </div>
                    <button onClick={onClose} className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors" aria-label="Close match history">
                        X
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-5 border-b border-white/10">
                    <ModalStat label="Final Score" value={scoreLabel} />
                    <ModalStat label="Status" value={STATUS_META[match.status]?.label ?? match.status} />
                    <ModalStat label="Sets" value={String(match.sets?.length ?? 0)} />
                </div>

                <div className="max-h-[48vh] overflow-y-auto px-6 py-5">
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Actions & Logs</p>
                        <Link href={detailHref} className="text-[10px] font-black uppercase tracking-widest text-cyan-400 hover:text-cyan-300">
                            Open Match
                        </Link>
                    </div>

                    {loading && <p className="py-10 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 animate-pulse">Loading logs...</p>}
                    {error && <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-300">{error}</p>}
                    {!loading && !error && history.length === 0 && (
                        <p className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-slate-500">
                            No actions recorded for this match.
                        </p>
                    )}
                    {!loading && !error && history.length > 0 && (
                        <div className="space-y-3">
                            {history.map(entry => <HistoryRow key={entry.id} entry={entry} />)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ModalStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-white uppercase tracking-tight">{value}</p>
        </div>
    );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
    const time = new Date(entry.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const score = entry.team1_score !== null && entry.team2_score !== null ? `${entry.team1_score}-${entry.team2_score}` : null;
    const actor = entry.player_name || entry.recorded_by_name;
    const title = entry.description || humanizeEvent(entry.event_type);

    return (
        <div className="rounded-2xl border border-white/5 bg-[#0a111a]/70 px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-slate-400">{humanizeEvent(entry.event_type)}</span>
                        {entry.set_number !== null && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Set {entry.set_number}</span>}
                        {actor && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{actor}</span>}
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-200">{title}</p>
                    {entry.recorded_by_name && <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">Recorded by {entry.recorded_by_name}</p>}
                </div>
                <div className="text-left sm:text-right shrink-0">
                    {score && <p className="text-lg font-black italic text-white">{score}</p>}
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{time}</p>
                </div>
            </div>
        </div>
    );
}

function humanizeEvent(value: string) {
    return value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
}
