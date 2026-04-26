"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORTS = [
    { value: "badminton",    label: "Badminton",    icon: "🏸" },
    { value: "pickleball",   label: "Pickleball",   icon: "🥒" },
    { value: "lawn_tennis",  label: "Tennis",       icon: "🎾" },
    { value: "table_tennis", label: "Table Tennis", icon: "🏓" },
];

const FORMATS = [
    { value: "singles",       label: "Singles" },
    { value: "doubles",       label: "Doubles" },
    { value: "mixed_doubles", label: "Mixed" },
];

const GEO_LEVELS = [
    { value: "barangay",   label: "Barangay",     icon: "🌴" },
    { value: "city",       label: "City / Mun.",  icon: "🏙️" },
    { value: "provincial", label: "Provincial",   icon: "🌿" },
    { value: "regional",   label: "Regional",     icon: "👑" },
    { value: "national",   label: "National",     icon: "🌐" },
];

const NATIONAL_MIN_RATING  = 1900;
const NATIONAL_MIN_MATCHES = 10;

const TIER_CONFIG: Record<string, { color: string; bg: string; border: string; glow: string }> = {
    Novice:              { color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-slate-500/20",   glow: "" },
    "Advanced Beginner": { color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    glow: "shadow-[0_0_8px_rgba(6,182,212,0.4)]" },
    Competent:           { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", glow: "shadow-[0_0_8px_rgba(16,185,129,0.35)]" },
    Proficient:          { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   glow: "shadow-[0_0_8px_rgba(245,158,11,0.35)]" },
    Expert:              { color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    glow: "shadow-[0_0_8px_rgba(244,63,94,0.35)]" },
    Unranked:            { color: "text-zinc-400",    bg: "bg-zinc-500/10",    border: "border-zinc-500/20",    glow: "" },
};

const RANK_STYLES: Record<number, string> = {
    1: "bg-gradient-to-br from-yellow-400 to-amber-600 text-black font-black",
    2: "bg-gradient-to-br from-slate-300 to-slate-500 text-black font-black",
    3: "bg-gradient-to-br from-amber-600 to-amber-800 text-white font-black",
};

// ── PH Region Names ───────────────────────────────────────────────────────────

const PH_REGIONS: Record<string, string> = {
    "NCR":   "NCR",
    "CAR":   "CAR",
    "01":    "Region I",
    "02":    "Region II",
    "03":    "Region III",
    "04A":   "CALABARZON",
    "4A":    "CALABARZON",
    "04B":   "MIMAROPA",
    "4B":    "MIMAROPA",
    "05":    "Region V",
    "06":    "Region VI",
    "07":    "Region VII",
    "08":    "Region VIII",
    "09":    "Region IX",
    "10":    "Region X",
    "11":    "Region XI",
    "12":    "Region XII",
    "13":    "CARAGA",
    "BARMM": "BARMM",
};

function formatLocation(entry: LeaderboardEntry, geoLevel: string): string | null {
    if (geoLevel === "national" && entry.region_code) {
        return PH_REGIONS[entry.region_code] ?? `Region ${entry.region_code}`;
    }
    if (geoLevel === "regional" && entry.province_code) {
        return `Prov. ${entry.province_code}`;
    }
    if ((geoLevel === "provincial" || geoLevel === "city") && entry.city_mun_code) {
        return `City/Mun. ${entry.city_mun_code}`;
    }
    return null;
}

function geoLevelLabel(level: string): string {
    return GEO_LEVELS.find(g => g.value === level)?.label ?? level;
}

function rankTitle(rank: number, geoLevel: string): string {
    const label = geoLevelLabel(geoLevel);
    return `${label} No. ${rank}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
    rank:               number;
    user_id:            string;
    first_name:         string | null;
    last_name:          string | null;
    rating:             number;
    rating_deviation:   number;
    wins:               number;
    losses:             number;
    matches_played:     number;
    win_rate_pct:       number;
    current_win_streak: number;
    skill_tier:         string;
    region_code:        string | null;
    province_code:      string | null;
    city_mun_code:      string | null;
    is_me:              boolean;
}

interface MyRanking {
    sport:              string;
    match_format:       string;
    rating:             number;
    wins:               number;
    losses:             number;
    matches_played:     number;
    win_rate_pct:       number;
    skill_tier:         string;
    current_win_streak: number;
    rank:               number;
}

// ── Components ────────────────────────────────────────────────────────────────

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <div className={`absolute w-2 h-2 border-t border-l border-cyan-500/30 ${className}`} />
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
    const router = useRouter();

    const [sport,       setSport]      = useState("badminton");
    const [matchFormat, setMatchFormat] = useState("singles");
    const [geoLevel,    setGeoLevel]   = useState("barangay");

    const [entries,     setEntries]    = useState<LeaderboardEntry[]>([]);
    const [total,       setTotal]      = useState(0);
    const [myRank,      setMyRank]     = useState<number | null>(null);
    const [myRankings,  setMyRankings] = useState<MyRanking[]>([]);
    const [loading,     setLoading]    = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [offset,      setOffset]     = useState(0);
    const LIMIT = 25;

    const hasFetchedMyRankings = useRef(false);

    // ── Fetch leaderboard ──────────────────────────────────────────────────
    const fetchLeaderboard = useCallback(async (
        token: string, sp: string, fmt: string, geo: string,
        off: number, append: boolean
    ) => {
        const params = new URLSearchParams({
            sport: sp, match_format: fmt, geo_level: geo,
            limit: String(LIMIT), offset: String(off),
        });
        const res = await fetch(`/api/leaderboard?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (!res.ok) return;
        const d = await res.json();
        if (append) setEntries(prev => [...prev, ...(d.leaderboard ?? [])]);
        else setEntries(d.leaderboard ?? []);
        setTotal(d.total ?? 0);
        setMyRank(d.my_rank ?? null);
    }, [router]);

    // ── Fetch my rankings ──────────────────────────────────────────────────
    const fetchMyRankings = useCallback(async (token: string) => {
        if (hasFetchedMyRankings.current) return;
        hasFetchedMyRankings.current = true;
        const res = await fetch("/api/leaderboard/me", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const d = await res.json();
            setMyRankings(d.rankings ?? []);
        }
    }, []);

    // ── Initial load / filter change ───────────────────────────────────────
    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        setLoading(true);
        setOffset(0);
        Promise.all([
            fetchLeaderboard(token, sport, matchFormat, geoLevel, 0, false),
            fetchMyRankings(token),
        ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sport, matchFormat, geoLevel]);

    async function loadMore() {
        const token = getAccessToken(); if (!token) return;
        const newOffset = offset + LIMIT;
        setLoadingMore(true);
        await fetchLeaderboard(token, sport, matchFormat, geoLevel, newOffset, true);
        setOffset(newOffset);
        setLoadingMore(false);
    }

    const topThree = entries.slice(0, 3);
    const rest = entries.slice(3);

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute inset-0 animate-scanline pointer-events-none opacity-[0.01] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-20" />
            </div>

            <NavBar />
            
            <main className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 pb-32 pt-24">

                {/* Tactical Hero Section */}
                <div className="relative mb-12 p-8 lg:p-12 rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <HUDCorner className="top-6 left-6" />
                    <HUDCorner className="top-6 right-6 rotate-90" />
                    <HUDCorner className="bottom-6 left-6 -rotate-90" />
                    <HUDCorner className="bottom-6 right-6 rotate-180" />
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="text-center md:text-left space-y-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[10px] font-black uppercase tracking-widest text-cyan-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                Global Network
                            </div>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white uppercase italic">
                                Strategic <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-400">Rankings</span>
                            </h1>
                            <p className="text-slate-400 text-xs font-medium uppercase tracking-[0.2em] max-w-md mx-auto md:mx-0">
                                Location-based combat data • earn your title • dominate the sector
                            </p>
                        </div>

                        {myRank !== null && (
                            <div className="bg-cyan-500/5 border border-cyan-500/20 p-6 rounded-[2rem] text-center min-w-[200px] backdrop-blur-sm relative group overflow-hidden">
                                <div className="absolute inset-0 bg-cyan-500/[0.02] group-hover:bg-cyan-500/[0.05] transition-colors" />
                                <span className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] block mb-2">Your Current Rank</span>
                                <div className="text-3xl font-black text-white italic tracking-tighter">
                                    <span className="text-cyan-400 opacity-50 mr-1">#</span>{myRank}
                                </div>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 block">{geoLevelLabel(geoLevel)}</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                    
                    {/* LEFT SIDEBAR: Filters & Personal */}
                    <aside className="xl:col-span-1 space-y-8">
                        
                        {/* My Titles Card */}
                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] overflow-hidden">
                            <div className="p-5 border-b border-white/5">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Service Record</h3>
                            </div>
                            <div className="p-4 space-y-3">
                                {myRankings.filter(r => r.matches_played > 0).length > 0 ? (
                                    myRankings
                                        .filter(r => r.matches_played > 0)
                                        .map(r => {
                                            const tier = TIER_CONFIG[r.skill_tier] ?? TIER_CONFIG["Novice"];
                                            const sportMeta = SPORTS.find(s => s.value === r.sport);
                                            const active = r.sport === sport && r.match_format === matchFormat;
                                            return (
                                                <button
                                                    key={`${r.sport}-${r.match_format}`}
                                                    onClick={() => { setSport(r.sport); setMatchFormat(r.match_format); }}
                                                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group ${
                                                        active
                                                            ? "border-cyan-500/30 bg-cyan-500/10"
                                                            : "border-transparent bg-white/5 hover:bg-white/10"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-lg">{sportMeta?.icon}</span>
                                                        <div>
                                                            <p className="text-[9px] font-black text-white uppercase leading-none">{sportMeta?.label}</p>
                                                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">{r.match_format}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-black text-white italic leading-none">#{r.rank}</p>
                                                        <div className={`text-[7px] font-black px-1 py-0.5 rounded uppercase mt-1 ${tier.bg} ${tier.color}`}>
                                                            {r.skill_tier}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                ) : (
                                    <p className="text-[10px] text-slate-600 text-center py-4 font-black uppercase">No active records</p>
                                )}
                            </div>
                        </section>

                        {/* Filters Card */}
                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 space-y-8">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">Discipline</h4>
                                <div className="grid grid-cols-1 gap-2">
                                    {SPORTS.map(s => (
                                        <button
                                            key={s.value}
                                            onClick={() => setSport(s.value)}
                                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                                sport === s.value
                                                    ? "bg-white text-black border-white"
                                                    : "bg-white/5 text-slate-400 border-transparent hover:bg-white/10 hover:text-slate-300"
                                            }`}
                                        >
                                            <span>{s.icon}</span>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">Engagement</h4>
                                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                    {FORMATS.map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setMatchFormat(f.value)}
                                            className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                                matchFormat === f.value
                                                    ? "bg-white/10 text-white shadow-lg"
                                                    : "text-slate-500 hover:text-slate-300"
                                            }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">Ranking Scope</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {GEO_LEVELS.map(g => (
                                        <button
                                            key={g.value}
                                            onClick={() => setGeoLevel(g.value)}
                                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center gap-2 ${
                                                geoLevel === g.value
                                                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                                                    : "bg-white/5 border-transparent text-slate-500 hover:bg-white/10 hover:text-slate-300"
                                            }`}
                                        >
                                            <span className="text-xl">{g.icon}</span>
                                            <span className="text-[8px] font-black uppercase tracking-widest">{g.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </aside>

                    {/* CENTRAL CONTENT: Leaderboard & Podium */}
                    <div className="xl:col-span-3 space-y-12">
                        
                        {/* PODIUM SECTION */}
                        {!loading && entries.length > 0 && (
                            <section className="relative py-12 px-8 bg-[#0a111a]/40 rounded-[3rem] border border-white/5 overflow-hidden">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.05)_0%,transparent_70%)]" />
                                
                                <div className="flex flex-col items-center relative z-10">
                                    <div className="flex items-end justify-center gap-4 lg:gap-12 w-full max-w-4xl pt-10">
                                        {/* 2nd Place */}
                                        {topThree[1] && <PodiumSlot entry={topThree[1]} rank={2}  />}
                                        {/* 1st Place */}
                                        {topThree[0] && <PodiumSlot entry={topThree[0]} rank={1}  />}
                                        {/* 3rd Place */}
                                        {topThree[2] && <PodiumSlot entry={topThree[2]} rank={3}  />}
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* LEADERBOARD LIST */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 flex items-center gap-3">
                                        <span className="text-xl">{GEO_LEVELS.find(g => g.value === geoLevel)?.icon}</span>
                                        {geoLevelLabel(geoLevel)} Sector
                                    </h2>
                                    <div className="h-px w-24 bg-gradient-to-r from-white/10 to-transparent" />
                                    <span className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">
                                        {total} Operators
                                    </span>
                                </div>
                            </div>

                            {/* Eligibility Notice */}
                            {geoLevel === "national" && (
                                <div className="p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 backdrop-blur-sm flex items-start gap-4">
                                    <span className="text-2xl">🌐</span>
                                    <div>
                                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Elite Eligibility Required</h3>
                                        <p className="text-[10px] text-slate-500 font-black uppercase leading-relaxed tracking-widest opacity-80">
                                            National status requires Glicko-2 rating <span className="text-white font-bold">≥ {NATIONAL_MIN_RATING}</span> and <span className="text-white font-bold">{NATIONAL_MIN_MATCHES} ranked matches</span>.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                                    <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                                    <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] animate-pulse">Syncing Leaderboard...</p>
                                </div>
                            ) : entries.length === 0 ? (
                                <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-[3rem] py-32 text-center">
                                    <div className="text-6xl mb-6 opacity-20 grayscale">📊</div>
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">No Combat Records Found</h3>
                                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-2 max-w-xs mx-auto">Join active operations to establish your ranking in this sector.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {rest.map(entry => (
                                        <PlayerRow
                                            key={entry.user_id}
                                            entry={entry}
                                            geoLevel={geoLevel}
                                        />
                                    ))}

                                    {/* Load More */}
                                    {entries.length < total && (
                                        <button
                                            onClick={loadMore}
                                            disabled={loadingMore}
                                            className="w-full mt-8 py-6 bg-[#0a111a]/40 hover:bg-[#0a111a]/60 border border-white/5 rounded-[2rem] text-[10px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-[0.4em] transition-all disabled:opacity-50"
                                        >
                                            {loadingMore ? "Syncing..." : `Retrieve Next Data Block (${total - entries.length} Remaining)`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

// ── Podium Slot ────────────────────────────────────────────────────────────────

function PodiumSlot({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
    const tier = TIER_CONFIG[entry.skill_tier] ?? TIER_CONFIG["Novice"];
    const initial = (entry.first_name?.[0] || "?").toUpperCase();

    const rankConfig = {
        1: { height: "h-64", color: "from-yellow-400 to-amber-600", text: "text-yellow-400", glow: "shadow-yellow-500/20", icon: "🥇", accent: "bg-yellow-400" },
        2: { height: "h-48", color: "from-slate-300 to-slate-500",    text: "text-slate-300",    glow: "shadow-slate-500/10",    icon: "🥈", accent: "bg-slate-300" },
        3: { height: "h-40", color: "from-amber-600 to-amber-800", text: "text-amber-600",   glow: "shadow-amber-900/10",   icon: "🥉", accent: "bg-amber-700" },
    }[rank as 1|2|3];

    return (
        <div className={`flex flex-col items-center gap-6 w-full max-w-[200px] ${rank === 1 ? "order-2 z-20" : rank === 2 ? "order-1 z-10" : "order-3 z-10"}`}>
            {/* Player Avatar */}
            <div className="relative group">
                <div className={`absolute inset-0 bg-gradient-to-br ${rankConfig.color} rounded-[2rem] blur-2xl opacity-10 group-hover:opacity-30 transition-opacity`} />
                <div className={`relative w-24 h-24 lg:w-32 lg:h-32 rounded-[2.5rem] border-2 border-white/10 bg-[#0a111a] flex items-center justify-center text-4xl font-black shadow-2xl ${entry.is_me ? "ring-2 ring-cyan-500 ring-offset-4 ring-offset-[#050b14]" : ""}`}>
                    <span className="text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500">{initial}</span>
                    <div className="absolute -top-3 -right-3 w-10 h-10 rounded-2xl bg-[#0a111a] border border-white/10 flex items-center justify-center text-xl shadow-xl">
                        {rankConfig.icon}
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="text-center space-y-2">
                <p className="text-[11px] font-black text-white uppercase italic tracking-tighter truncate max-w-[140px] group-hover:text-cyan-400 transition-colors">{`${entry.first_name || ''} ${entry.last_name || ''}`.trim() || entry.user_id.slice(0, 8)}</p>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${tier.bg} ${tier.color} ${tier.border} ${tier.glow}`}>
                    <span className={`w-1 h-1 rounded-full ${rankConfig.accent}`} />
                    {entry.skill_tier}
                </div>
            </div>

            {/* The Pedestal */}
            <div className={`w-full ${rankConfig.height} bg-gradient-to-b ${rankConfig.color} rounded-t-[2.5rem] relative overflow-hidden flex flex-col items-center justify-start pt-8 border-t border-x border-white/20 shadow-2xl`}>
                <div className="absolute inset-0 bg-[#050b14]/60 mix-blend-overlay" />
                <div className="relative z-10 flex flex-col items-center">
                    <span className="text-3xl font-black text-white italic tabular-nums tracking-tighter">{entry.rating.toFixed(0)}</span>
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mt-2">Tactical SR</span>
                </div>
                
                {/* Decorative Elements */}
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute top-2 left-2 right-2 h-px bg-white/20" />
            </div>
        </div>
    );
}

// ── Player Row ─────────────────────────────────────────────────────────────────

function PlayerRow({
    entry,
    geoLevel,
}: {
    entry: LeaderboardEntry;
    geoLevel: string;
}) {
    const tier    = TIER_CONFIG[entry.skill_tier] ?? TIER_CONFIG["Novice"];
    const rankCls = RANK_STYLES[entry.rank];
    const initial = (entry.first_name?.[0] || "?").toUpperCase();
    const displayName = `${entry.first_name || ''} ${entry.last_name || ''}`.trim() || entry.user_id.slice(0, 8);
    const location = formatLocation(entry, geoLevel);
    const title = rankTitle(entry.rank, geoLevel);

    return (
        <div className={`flex items-center gap-4 px-6 py-4 rounded-[2rem] border transition-all group ${
            entry.is_me
                ? "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                : "bg-[#0a111a]/60 backdrop-blur-md border-white/5 hover:border-white/10 hover:-translate-x-1"
        }`}>
            {/* Rank badge */}
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs shrink-0 shadow-lg ${
                rankCls ?? "bg-white/5 text-slate-500 font-black border border-white/5"
            }`}>
                {entry.rank}
            </div>

            {/* Avatar */}
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 border border-white/10 shadow-inner ${
                entry.is_me ? "bg-white text-black" : "bg-zinc-800 text-slate-400"
            }`}>
                {initial}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-black text-white uppercase italic tracking-tight truncate group-hover:text-cyan-400 transition-colors">
                        {displayName}
                        {entry.is_me && <span className="ml-2 text-[9px] text-cyan-500/60 font-black uppercase tracking-widest">(Deployed Operator)</span>}
                    </span>
                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${tier.bg} ${tier.color} ${tier.border}`}>
                        {entry.skill_tier}
                    </div>
                    {entry.current_win_streak >= 3 && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[8px] font-black text-orange-400 uppercase tracking-widest animate-pulse">
                            🔥 {entry.current_win_streak} Streaking
                        </div>
                    )}
                </div>
                <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1.5 flex items-center gap-2 flex-wrap opacity-80 group-hover:opacity-100 transition-opacity">
                    <span className="text-cyan-500/50">{title}</span>
                    <span className="text-slate-800">•</span>
                    <span className="text-slate-400">{entry.wins}W <span className="text-slate-800">/</span> {entry.losses}L</span>
                    <span className="text-slate-800">•</span>
                    <span className="text-slate-400">{entry.win_rate_pct.toFixed(0)}% Efficiency</span>
                    <span className="text-slate-800">•</span>
                    <span className="text-slate-400">{entry.matches_played} Operations</span>
                    {location && (
                        <>
                            <span className="text-slate-800">•</span>
                            <span className="text-slate-500 flex items-center gap-1">📍 {location}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Rating */}
            <div className="text-right shrink-0">
                <div className="text-lg font-black text-white italic tracking-tighter leading-none">{entry.rating.toFixed(0)}</div>
                <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-1">±{entry.rating_deviation.toFixed(0)} SR</div>
            </div>
        </div>
    );
}
