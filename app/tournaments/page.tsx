"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { getTournamentFormatLabel } from "@/lib/tournamentFormats";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORTS = [
    { value: "",             label: "All Disciplines", icon: "🎯" },
    { value: "badminton",    label: "Badminton",       icon: "🏸" },
    { value: "pickleball",   label: "Pickleball",      icon: "🥒" },
    { value: "lawn_tennis",  label: "Tennis",          icon: "🎾" },
    { value: "table_tennis", label: "Table Tennis",    icon: "🏓" },
];

const STATUSES = [
    { value: "",                   label: "All Status" },
    { value: "upcoming",           label: "Upcoming" },
    { value: "registration_closed",label: "Reg. Closed" },
    { value: "ongoing",            label: "Ongoing" },
    { value: "completed",          label: "Completed" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; glow: string }> = {
    upcoming:             { label: "Upcoming",           color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", dot: "bg-cyan-400", glow: "shadow-[0_0_8px_rgba(6,182,212,0.4)]" },
    registration_closed:  { label: "Reg. Closed",        color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400", glow: "shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
    ongoing:              { label: "Ongoing",            color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400", glow: "shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
    completed:            { label: "Completed",          color: "bg-slate-500/10 text-slate-400 border-slate-500/20", dot: "bg-slate-400", glow: "" },
};

const SPORT_ICONS: Record<string, string> = {
    badminton:    "🏸",
    pickleball:   "🥒",
    lawn_tennis:  "🎾",
    table_tennis: "🏓",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tournament {
    id:                string;
    name:              string;
    description:       string | null;
    sport:             string;
    format:            string;
    match_format:      string;
    organizer_id:      string;
    status:            string;
    registration_open: boolean;
    max_participants:  number;
    participant_count: number;
    starts_at:         string | null;
    ends_at:           string | null;
}

// ── Components ────────────────────────────────────────────────────────────────

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <div className={`absolute w-2 h-2 border-t border-l border-cyan-500/30 ${className}`} />
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TournamentsPage() {
    const router = useRouter();

    const [tournaments,  setTournaments]  = useState<Tournament[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [sportFilter,  setSportFilter]  = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const fetchTournaments = useCallback(async (sport: string, status: string) => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        const params = new URLSearchParams();
        if (sport)  params.set("sport", sport);
        if (status) params.set("status", status);

        setLoading(true);
        try {
            const res = await fetch(`/api/tournaments?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (res.ok) {
                const d = await res.json();
                setTournaments(d.tournaments ?? []);
            }
        } catch (err) {
            console.error("Failed to fetch tournaments:", err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchTournaments(sportFilter, statusFilter);
    }, [sportFilter, statusFilter, fetchTournaments]);

    const ongoing   = tournaments.filter(t => t.status === "ongoing");
    const upcoming  = tournaments.filter(t => t.status === "upcoming");
    const past      = tournaments.filter(t => !["ongoing", "upcoming"].includes(t.status));

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute inset-0 animate-scanline pointer-events-none opacity-[0.01] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-20" />
            </div>

            <NavBar />

            <main className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 pb-32 pt-24">
                
                {/* Hero / Header Section */}
                <div className="relative mb-12 p-8 lg:p-12 rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <HUDCorner className="top-6 left-6" />
                    <HUDCorner className="top-6 right-6 rotate-90" />
                    <HUDCorner className="bottom-6 left-6 -rotate-90" />
                    <HUDCorner className="bottom-6 right-6 rotate-180" />
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="text-center md:text-left space-y-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[10px] font-black uppercase tracking-widest text-cyan-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                Combat Arena
                            </div>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white uppercase italic">
                                Strategic <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-400">Tournaments</span>
                            </h1>
                            <p className="text-slate-400 text-xs font-medium uppercase tracking-[0.2em] max-w-md mx-auto md:mx-0">
                                {loading ? "Scanning for active operations..." : `${tournaments.length} active engagements detected in the sector`}
                            </p>
                        </div>
                        
                        <Link
                            href="/tournaments/new"
                            className="group relative px-8 py-4 bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                        >
                            <span className="relative z-10">+ Initialize Tournament</span>
                        </Link>
                    </div>
                </div>

                {/* Filters Section */}
                <div className="space-y-6 mb-12 px-2">
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-2">
                            {SPORTS.map(s => (
                                <button
                                    key={s.value}
                                    onClick={() => setSportFilter(s.value)}
                                    className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl transition-all border whitespace-nowrap ${
                                        sportFilter === s.value
                                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                                            : "bg-[#0a111a]/60 text-slate-500 border-white/5 hover:border-white/10 hover:text-slate-300"
                                    }`}
                                >
                                    <span className="text-lg">{s.icon}</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest">{s.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
                            {STATUSES.map(s => (
                                <button
                                    key={s.value}
                                    onClick={() => setStatusFilter(s.value)}
                                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border whitespace-nowrap ${
                                        statusFilter === s.value
                                            ? "bg-white text-black border-white"
                                            : "bg-white/5 text-slate-500 border-transparent hover:bg-white/10 hover:text-slate-300"
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="space-y-12">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-4">
                            <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] animate-pulse">Syncing Intel...</p>
                        </div>
                    ) : tournaments.length === 0 ? (
                        <div className="relative rounded-[3rem] border border-dashed border-white/10 bg-white/[0.02] py-32 text-center group overflow-hidden">
                             <div className="absolute inset-0 bg-cyan-500/[0.01] group-hover:bg-cyan-500/[0.03] transition-colors" />
                             <div className="relative z-10 space-y-6">
                                <div className="text-6xl grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:scale-110">🏆</div>
                                <div className="space-y-2">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">No Active Deployments</p>
                                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest max-w-xs mx-auto">Intel indicates zero tournaments matching current filters in this sector.</p>
                                </div>
                                {(sportFilter || statusFilter) && (
                                    <button
                                        onClick={() => { setSportFilter(""); setStatusFilter(""); }}
                                        className="text-[9px] font-black text-cyan-500 uppercase tracking-widest hover:text-cyan-400 transition-colors border-b border-cyan-500/30 pb-1"
                                    >
                                        Reset System Filters
                                    </button>
                                )}
                             </div>
                        </div>
                    ) : (
                        <>
                            {ongoing.length > 0 && (
                                <TournamentSection title="Live Operations" icon="🔴" tournaments={ongoing} />
                            )}
                            {upcoming.length > 0 && (
                                <TournamentSection title="Future Engagements" icon="📅" tournaments={upcoming} />
                            )}
                            {past.length > 0 && (
                                <TournamentSection title="Archive / Offline" icon="📁" tournaments={past} muted />
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

// ── Helper Components ────────────────────────────────────────────────────────

function TournamentSection({ title, icon, tournaments, muted = false }: { title: string; icon: string; tournaments: Tournament[]; muted?: boolean }) {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 px-2">
                <div className={`text-xs font-black uppercase tracking-[0.4em] ${muted ? "text-slate-600" : "text-slate-500"}`}>
                    <span className="mr-3">{icon}</span>
                    {title}
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {tournaments.map(t => (
                    <TournamentCard key={t.id} t={t} />
                ))}
            </div>
        </div>
    );
}

function TournamentCard({ t }: { t: Tournament }) {
    const statusCfg = STATUS_CONFIG[t.status];
    const fillPct   = Math.min(100, Math.round((t.participant_count / t.max_participants) * 100));
    const isFull    = t.participant_count >= t.max_participants;
    
    return (
        <Link href={`/tournaments/${t.id}`} className="group block h-full">
            <div className={`relative h-full bg-[#0a111a]/60 backdrop-blur-md border rounded-[2rem] p-6 transition-all duration-300 group-hover:-translate-y-1 shadow-xl overflow-hidden ${
                t.status === "ongoing" ? "border-emerald-500/30 group-hover:border-emerald-500/50" : "border-white/5 group-hover:border-white/10"
            }`}>
                {/* Tactical Accent */}
                {t.status === "ongoing" && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
                )}
                
                <div className="relative z-10 flex flex-col h-full space-y-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-inner">
                                {SPORT_ICONS[t.sport] ?? "🎯"}
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${statusCfg?.color}`}>
                                        <span className={`w-1 h-1 rounded-full ${statusCfg?.dot} ${statusCfg?.glow}`} />
                                        {statusCfg?.label}
                                    </div>
                                    {t.registration_open && t.status === "upcoming" && (
                                        <div className="text-[8px] font-black text-cyan-400 uppercase tracking-widest px-2 py-0.5 rounded-full border border-cyan-500/20 bg-cyan-500/5">Open</div>
                                    )}
                                </div>
                                <h3 className="text-lg font-black text-white uppercase italic tracking-tight leading-tight group-hover:text-cyan-400 transition-colors line-clamp-1">{t.name}</h3>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {t.description && (
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed line-clamp-2 uppercase tracking-wide opacity-80">{t.description}</p>
                        )}
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Protocol / Format</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{getTournamentFormatLabel(t.format, "short")}</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-700" />
                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest capitalize">{t.match_format.replace("_", " ")}</span>
                                </div>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Deployment Date</p>
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                                    {t.starts_at ? new Date(t.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "TBD"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 mt-auto">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Participant Load</span>
                            <span className={`text-[10px] font-black ${isFull ? "text-rose-500" : "text-cyan-400"}`}>
                                {t.participant_count} <span className="text-slate-600">/</span> {t.max_participants}
                            </span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-px border border-white/5">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ${
                                    isFull ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "bg-gradient-to-r from-cyan-600 to-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                                }`}
                                style={{ width: `${fillPct}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
