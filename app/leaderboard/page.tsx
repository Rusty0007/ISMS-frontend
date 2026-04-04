"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";

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
    { value: "barangay",   label: "Barangay",     icon: "🌴", color: "text-orange-300" },
    { value: "city",       label: "City / Mun.",  icon: "🏙️", color: "text-blue-300" },
    { value: "provincial", label: "Provincial",   icon: "🌿", color: "text-green-300" },
    { value: "regional",   label: "Regional",     icon: "👑", color: "text-yellow-300" },
    { value: "national",   label: "National",     icon: "🌐", color: "text-slate-300" },
];

const NATIONAL_MIN_RATING  = 1900;
const NATIONAL_MIN_MATCHES = 10;

const TIER_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
    Beginner:     { color: "text-zinc-400",   bg: "bg-zinc-700/40",    border: "border-zinc-600/40" },
    Intermediate: { color: "text-blue-300",   bg: "bg-blue-500/10",    border: "border-blue-500/20" },
    Advanced:     { color: "text-violet-300", bg: "bg-violet-500/10",  border: "border-violet-500/20" },
    Expert:       { color: "text-amber-300",  bg: "bg-amber-500/10",   border: "border-amber-500/20" },
    Elite:        { color: "text-rose-300",   bg: "bg-rose-500/10",    border: "border-rose-500/20" },
};

const RANK_STYLES: Record<number, string> = {
    1: "bg-yellow-500 text-black font-bold",
    2: "bg-zinc-300 text-black font-bold",
    3: "bg-amber-700 text-white font-bold",
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
    username:           string;
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
        <div className="min-h-screen bg-zinc-950 text-white selection:bg-blue-500/30">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)
                        `,
                        backgroundSize: "40px 40px",
                    }}
                />
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
            </div>

            <NavBar />
            
            <main className="relative z-10 max-w-5xl mx-auto px-6 py-10">

                {/* Back + Header */}
                <div className="mb-10">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors group mb-4">
                        <span className="group-hover:-translate-x-1 transition-transform">←</span> Dashboard
                    </Link>
                    <h1 className="text-5xl font-black tracking-tight">Leaderboard</h1>
                    <p className="text-zinc-500 font-medium mt-2">
                        Location-based rankings • earn your title • dominate the court
                    </p>
                </div>

                {/* My Titles — Premium Strip */}
                {myRankings.filter(r => r.matches_played > 0).length > 0 && (
                    <div className="mb-10">
                        <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
                            <span className="w-8 h-px bg-zinc-800" />
                            Your Ranking Titles
                        </h2>
                        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                            {myRankings
                                .filter(r => r.matches_played > 0)
                                .map(r => {
                                    const tier = TIER_CONFIG[r.skill_tier] ?? TIER_CONFIG["Beginner"];
                                    const sportMeta = SPORTS.find(s => s.value === r.sport);
                                    const active = r.sport === sport && r.match_format === matchFormat;
                                    return (
                                        <button
                                            key={`${r.sport}-${r.match_format}`}
                                            onClick={() => { setSport(r.sport); setMatchFormat(r.match_format); }}
                                            className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all text-left min-w-[160px] relative overflow-hidden group ${
                                                active
                                                    ? "border-blue-500/30 bg-blue-500/10 shadow-lg shadow-blue-500/5"
                                                    : "border-white/5 bg-zinc-900/50 hover:bg-zinc-900 hover:border-white/10"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between relative z-10">
                                                <span className="text-2xl group-hover:scale-110 transition-transform">{sportMeta?.icon}</span>
                                                <span className="text-lg font-black text-white">#{r.rank}</span>
                                            </div>
                                            <div className="relative z-10">
                                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{sportMeta?.label} • {r.match_format}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${tier.bg} ${tier.color} border ${tier.border}`}>
                                                        {r.skill_tier}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-zinc-400">
                                                        {r.rating.toFixed(0)} pts
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* Main Filter Section */}
                <div className="bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-3xl p-8 mb-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Left: Sport & Format */}
                        <div className="flex flex-col gap-8">
                            <div>
                                <label className="text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase mb-4 block">Select Sport</label>
                                <div className="flex flex-wrap gap-2">
                                    {SPORTS.map(s => (
                                        <button
                                            key={s.value}
                                            onClick={() => setSport(s.value)}
                                            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                                sport === s.value
                                                    ? "bg-white text-black shadow-xl scale-105"
                                                    : "bg-zinc-800/50 text-zinc-400 hover:text-white border border-white/5"
                                            }`}
                                        >
                                            <span>{s.icon}</span>
                                            <span>{s.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase mb-4 block">Match Format</label>
                                <div className="flex bg-zinc-800/50 p-1.5 rounded-2xl border border-white/5 w-fit">
                                    {FORMATS.map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => setMatchFormat(f.value)}
                                            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                                matchFormat === f.value
                                                    ? "bg-zinc-700 text-white shadow-lg"
                                                    : "text-zinc-500 hover:text-zinc-300"
                                            }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right: Geo Level Selector */}
                        <div>
                            <label className="text-[10px] font-black tracking-[0.2em] text-zinc-500 uppercase mb-4 block text-center lg:text-left">Ranking Scope</label>
                            <div className="flex gap-4 overflow-x-auto lg:justify-start justify-center pb-2 no-scrollbar">
                                <GeoBadge level="barangay"   active={geoLevel === "barangay"}   onClick={() => setGeoLevel("barangay")} />
                                <GeoBadge level="city"       active={geoLevel === "city"}       onClick={() => setGeoLevel("city")} />
                                <GeoBadge level="provincial" active={geoLevel === "provincial"} onClick={() => setGeoLevel("provincial")} />
                                <GeoBadge level="regional"   active={geoLevel === "regional"}   onClick={() => setGeoLevel("regional")} />
                                <GeoBadge level="national"   active={geoLevel === "national"}   onClick={() => setGeoLevel("national")} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* THE PODIUM (Top 3) */}
                {!loading && entries.length > 0 && (
                    <section className="mb-16">
                        <div className="flex flex-col items-center justify-center pt-10 pb-20 relative">
                            {/* Podium Background Glow */}
                            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/0 to-zinc-950/0 pointer-events-none" />
                            
                            <div className="flex items-end justify-center gap-4 lg:gap-8 relative z-10 w-full max-w-3xl">
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

                {/* Leaderboard list */}
                <section className="relative">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-black tracking-tight flex items-center gap-3">
                                <span className="text-2xl">{GEO_LEVELS.find(g => g.value === geoLevel)?.icon}</span>
                                {geoLevelLabel(geoLevel)} Rankings
                            </h2>
                            <span className="bg-zinc-800 text-zinc-500 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                                {total} Players
                            </span>
                        </div>
                        {myRank !== null && (
                            <div className="bg-blue-500/10 border border-blue-500/20 px-4 py-2 rounded-2xl text-right">
                                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block">Your Rank</span>
                                <span className="text-sm font-black text-white">{rankTitle(myRank, geoLevel)}</span>
                            </div>
                        )}
                    </div>

                    {/* National eligibility notice */}
                    {geoLevel === "national" && (
                        <div className="mb-8 p-6 rounded-3xl bg-slate-900/50 border border-slate-700/30 backdrop-blur-sm flex items-start gap-4">
                            <span className="text-2xl">🌐</span>
                            <div>
                                <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-1">National Eligibility</h3>
                                <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                                    The national leaderboard is exclusive to elite competitors. Requires a Glicko-2 rating of <span className="text-white font-bold">≥ {NATIONAL_MIN_RATING}</span> and a minimum of <span className="text-white font-bold">{NATIONAL_MIN_MATCHES} ranked matches</span>.
                                </p>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                            <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">Fetching Champions...</p>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl py-20 text-center">
                            <div className="text-6xl mb-6 opacity-20">📊</div>
                            <h3 className="text-lg font-black text-zinc-400 uppercase tracking-widest">No Rankings Found</h3>
                            <p className="text-sm text-zinc-600 mt-2">Earn your spot by playing matches in this category.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {rest.map(entry => (
                                <PlayerRow
                                    key={entry.user_id}
                                    entry={entry}
                                    geoLevel={geoLevel}
                                />
                            ))}

                            {/* Load more */}
                            {entries.length < total && (
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="w-full mt-6 py-4 bg-zinc-900/50 hover:bg-zinc-900 border border-white/5 rounded-2xl text-xs font-black text-zinc-500 hover:text-white uppercase tracking-[0.3em] transition-all disabled:opacity-50"
                                >
                                    {loadingMore ? "Synchronizing..." : `Show More (${total - entries.length} Remaining)`}
                                </button>
                            )}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

// ── Podium Slot ────────────────────────────────────────────────────────────────

function PodiumSlot({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
    const tier = TIER_CONFIG[entry.skill_tier] ?? TIER_CONFIG["Beginner"];
    const initial = (entry.first_name?.[0] || entry.username?.[0] || "?").toUpperCase();
    
    const rankConfig = {
        1: { height: "h-48", color: "from-yellow-400 to-amber-600", text: "text-yellow-400", shadow: "shadow-yellow-500/20", icon: "🥇" },
        2: { height: "h-36", color: "from-zinc-300 to-zinc-500",    text: "text-zinc-300",    shadow: "shadow-zinc-500/10",    icon: "🥈" },
        3: { height: "h-28", color: "from-amber-600 to-amber-800", text: "text-amber-600",   shadow: "shadow-amber-900/10",   icon: "🥉" },
    }[rank as 1|2|3];

    return (
        <div className={`flex flex-col items-center gap-4 w-1/3 max-w-[180px] ${rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3"}`}>
            {/* Player Avatar */}
            <div className="relative group">
                <div className={`absolute inset-0 bg-gradient-to-br ${rankConfig.color} rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity`} />
                <div className={`relative w-20 h-20 lg:w-24 lg:h-24 rounded-3xl border-2 border-white/10 bg-zinc-900 flex items-center justify-center text-3xl font-black ${entry.is_me ? "ring-2 ring-blue-500 ring-offset-4 ring-offset-zinc-950" : ""}`}>
                    {initial}
                    <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-lg shadow-lg">
                        {rankConfig.icon}
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="text-center">
                <p className="text-sm font-black text-white truncate max-w-[120px]">{entry.first_name || entry.username}</p>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${tier.bg} ${tier.color} ${tier.border}`}>
                        {entry.skill_tier}
                    </span>
                </div>
            </div>

            {/* The Pedestal */}
            <div className={`w-full ${rankConfig.height} bg-gradient-to-b ${rankConfig.color} rounded-t-3xl relative overflow-hidden flex flex-col items-center justify-start pt-6 border-t border-x border-white/20 ${rankConfig.shadow}`}>
                <div className="absolute inset-0 bg-zinc-950/40 mix-blend-overlay" />
                <span className="text-4xl font-black text-white/40 tabular-nums relative z-10">{entry.rating.toFixed(0)}</span>
                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] relative z-10 mt-1">Rating</span>
            </div>
        </div>
    );
}

// ── Geo Badge ─────────────────────────────────────────────────────────────────

const GEO_BADGE_CONFIG = {
    national: {
        label:        "National",
        sublabel:     "All Regions",
        icon:         "🌐",
        outerBg:      "bg-gradient-to-b from-slate-600 to-slate-800",
        innerBg:      "bg-gradient-to-b from-slate-700 to-slate-900",
        bannerBg:     "bg-gradient-to-r from-slate-600 via-slate-500 to-slate-600",
        border:       "border-slate-500",
        activeBorder: "ring-2 ring-slate-400",
        labelColor:   "text-slate-100",
        subColor:     "text-slate-400",
        crownColor:   "text-slate-400",
    },
    regional: {
        label:        "Regional",
        sublabel:     "Your Region",
        icon:         "👑",
        outerBg:      "bg-gradient-to-b from-yellow-500 to-yellow-700",
        innerBg:      "bg-gradient-to-b from-amber-800 to-amber-950",
        bannerBg:     "bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600",
        border:       "border-yellow-500",
        activeBorder: "ring-2 ring-yellow-400",
        labelColor:   "text-yellow-100",
        subColor:     "text-yellow-300",
        crownColor:   "text-yellow-400",
    },
    provincial: {
        label:        "Provincial",
        sublabel:     "Your Province",
        icon:         "🌿",
        outerBg:      "bg-gradient-to-b from-green-500 to-green-800",
        innerBg:      "bg-gradient-to-b from-green-800 to-green-950",
        bannerBg:     "bg-gradient-to-r from-green-600 via-green-500 to-green-600",
        border:       "border-green-500",
        activeBorder: "ring-2 ring-green-400",
        labelColor:   "text-green-100",
        subColor:     "text-green-300",
        crownColor:   "text-yellow-400",
    },
    city: {
        label:        "City / Mun.",
        sublabel:     "Your City",
        icon:         "🏙️",
        outerBg:      "bg-gradient-to-b from-blue-500 to-blue-800",
        innerBg:      "bg-gradient-to-b from-blue-800 to-blue-950",
        bannerBg:     "bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600",
        border:       "border-blue-500",
        activeBorder: "ring-2 ring-blue-400",
        labelColor:   "text-blue-100",
        subColor:     "text-blue-300",
        crownColor:   "text-blue-300",
    },
    barangay: {
        label:        "Barangay",
        sublabel:     "Your Barangay",
        icon:         "🌴",
        outerBg:      "bg-gradient-to-b from-orange-500 to-orange-800",
        innerBg:      "bg-gradient-to-b from-orange-800 to-amber-950",
        bannerBg:     "bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600",
        border:       "border-orange-500",
        activeBorder: "ring-2 ring-orange-400",
        labelColor:   "text-orange-100",
        subColor:     "text-orange-300",
        crownColor:   "text-yellow-400",
    },
} as const;

function GeoBadge({
    level,
    active,
    onClick,
}: {
    level: keyof typeof GEO_BADGE_CONFIG;
    active: boolean;
    onClick: () => void;
}) {
    const cfg = GEO_BADGE_CONFIG[level];

    return (
        <button
            onClick={onClick}
            className={`relative shrink-0 flex flex-col items-center gap-1 transition-all focus:outline-none ${
                active ? "scale-105" : "opacity-70 hover:opacity-90"
            }`}
        >
            <div
                className={`relative w-20 rounded-t-xl rounded-b-[40%] overflow-hidden border-2 ${cfg.border} ${cfg.outerBg} ${active ? cfg.activeBorder : ""} shadow-lg`}
                style={{ height: "88px" }}
            >
                <div className={`absolute inset-1 rounded-t-lg rounded-b-[35%] ${cfg.innerBg} flex flex-col items-center justify-between py-1.5`}>
                    <span className={`text-base leading-none ${cfg.crownColor}`}>{cfg.icon}</span>
                    <div className="text-center">
                        <div className="text-[9px] font-black tracking-widest text-white/80 leading-none">ISMS</div>
                    </div>
                    <div className={`w-full ${cfg.bannerBg} py-0.5 px-1`}>
                        <div className={`text-[8px] font-bold text-center tracking-wide leading-tight ${cfg.labelColor}`}>
                            {cfg.label}
                        </div>
                    </div>
                </div>
                {active && (
                    <div className="absolute inset-0 rounded-t-xl rounded-b-[40%] ring-inset ring-2 ring-white/20 pointer-events-none" />
                )}
            </div>
            <span className={`text-[10px] font-medium transition-colors ${active ? "text-white" : "text-zinc-500"}`}>
                {cfg.sublabel}
            </span>
        </button>
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
    const tier    = TIER_CONFIG[entry.skill_tier] ?? TIER_CONFIG["Beginner"];
    const rankCls = RANK_STYLES[entry.rank];
    const initial = (entry.first_name?.[0] || entry.username?.[0] || "?").toUpperCase();
    const displayName = entry.first_name && entry.last_name
        ? `${entry.first_name} ${entry.last_name}`
        : entry.username;
    const location = formatLocation(entry, geoLevel);
    const title = rankTitle(entry.rank, geoLevel);

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
            entry.is_me
                ? "bg-white/5 border-white/15"
                : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
        }`}>
            {/* Rank badge */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 ${
                rankCls ?? "bg-zinc-800 text-zinc-400 font-mono"
            }`}>
                {entry.rank}
            </div>

            {/* Avatar */}
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                entry.is_me ? "bg-white text-black" : "bg-zinc-700 text-zinc-200"
            }`}>
                {initial}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">
                        {displayName}
                        {entry.is_me && <span className="ml-1 text-xs text-zinc-400">(you)</span>}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${tier.bg} ${tier.color} ${tier.border}`}>
                        {entry.skill_tier}
                    </span>
                    {entry.current_win_streak >= 3 && (
                        <span className="text-[10px] text-orange-400 font-semibold">
                            🔥 {entry.current_win_streak}
                        </span>
                    )}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1 flex-wrap">
                    <span className="text-zinc-400 font-medium">{title}</span>
                    <span className="text-zinc-700">·</span>
                    <span>{entry.wins}W {entry.losses}L</span>
                    <span className="text-zinc-700">·</span>
                    <span>{entry.win_rate_pct.toFixed(0)}% WR</span>
                    <span className="text-zinc-700">·</span>
                    <span>{entry.matches_played} matches</span>
                    {location && (
                        <>
                            <span className="text-zinc-700">·</span>
                            <span className="text-zinc-600">📍{location}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Rating */}
            <div className="text-right shrink-0">
                <div className="text-sm font-bold text-white">{entry.rating.toFixed(0)}</div>
                <div className="text-[10px] text-zinc-600">±{entry.rating_deviation.toFixed(0)}</div>
            </div>
        </div>
    );
}
