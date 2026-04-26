"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import NavBar from "@/components/NavBar";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";

// --- Types ---

interface Profile {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    city_mun_code: string | null;
}

interface Rating {
    sport: string;
    match_format: string;
    rating: number;
    skill_level: string;
    matches_played: number;
    wins: number;
    losses: number;
    rating_status: string;
    calibration_matches_played: number;
    is_matchmaking_eligible?: boolean;
    is_leaderboard_eligible?: boolean;
    performance_rating?: number;
    performance_confidence?: number;
    performance_reliable?: boolean;
    performance_coverage_pct?: number;
}

interface ActiveMatch {
    id: string;
    sport: string;
    match_type: string;
    match_format: string;
    status: string;
    player1_id: string;
    player2_id: string | null;
    created_at: string;
}

interface QueueStatus {
    in_queue: boolean;
    sport: string | null;
    match_format: string | null;
    match_id: string | null;
    match_status: string | null;
}

interface PerformanceStat {
    label: string;
    count: number;
}

interface SportPerformance {
    shots: PerformanceStat[];
    errors: PerformanceStat[];
}

interface Friend {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    is_online: boolean;
}

interface NearbyPlayer {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    club_id: string;
}

// --- Constants ---

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; bg: string; icon: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-blue-400",    bg: "bg-blue-500/10",    icon: "🎾" },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  bg: "bg-purple-500/10",  icon: "🏸" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: "🎾" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  bg: "bg-orange-400/10",  icon: "🏓" },
};

// --- Components ---

function DashboardSkeleton() {
    return (
        <div className="min-h-screen bg-[#050b14] p-6 animate-pulse space-y-8">
            <div className="h-64 bg-white/5 rounded-[2.5rem]" />
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="hidden lg:block h-96 bg-white/5 rounded-3xl" />
                <div className="lg:col-span-2 space-y-8">
                    <div className="h-48 bg-white/5 rounded-3xl" />
                    <div className="h-96 bg-white/5 rounded-3xl" />
                </div>
                <div className="h-96 bg-white/5 rounded-3xl" />
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const pathname = usePathname();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [ratings, setRatings] = useState<Rating[]>([]);
    const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
    const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
    const [performance, setPerformance] = useState<Record<string, SportPerformance>>({});
    const [friends, setFriends] = useState<Friend[]>([]);
    const [nearby, setNearby] = useState<NearbyPlayer[]>([]);
    const [selectedSport, setSelectedSport] = useState<string>("");
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        try {
            const [profileRes, queueRes, matchesRes, statsRes, friendsRes, nearbyRes] = await Promise.all([
                fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/matches/queue/me", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/matches/my", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/players/me/performance-stats", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/friends", { headers: { Authorization: `Bearer ${token}` } }),
                fetch("/api/friends/nearby", { headers: { Authorization: `Bearer ${token}` } })
            ]);

            if (isUnauthorized(profileRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            
            if (profileRes.ok) {
                const data = await profileRes.json();
                setProfile(data.profile);
                const activeRatings = data.ratings || [];
                setRatings(activeRatings);
                if (activeRatings.length > 0 && !selectedSport) {
                    setSelectedSport(activeRatings[0].sport);
                }
            }
            if (queueRes.ok) setQueueStatus(await queueRes.json());
            if (matchesRes.ok) {
                const data = await matchesRes.json();
                setActiveMatches((data.matches || []).slice(0, 5));
            }
            if (statsRes.ok) setPerformance(await statsRes.json());
            if (friendsRes.ok) {
                const data = await friendsRes.json();
                setFriends(data.friends || []);
            }
            if (nearbyRes.ok) {
                const data = await nearbyRes.json();
                setNearby(data.nearby || []);
            }

        } catch (err) {
            console.error("Dashboard data fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [router, selectedSport]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading) return <DashboardSkeleton />;

    const bestRating = ratings.length > 0
        ? [...ratings].sort((a, b) => b.rating - a.rating)[0]
        : null;

    const headlineSkill = bestRating?.skill_level === "Calibrating"
        ? "Developing Player"
        : bestRating?.skill_level || "Standard Player";

    const currentStats = performance[selectedSport] || { shots: [], errors: [] };
    const hasPerformanceData = currentStats.shots.length > 0 || currentStats.errors.length > 0;

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            <NavBar />

            <main className="relative z-10 max-w-[1600px] mx-auto px-4 py-8 pb-32 pt-24">
                <div className="flex flex-col lg:flex-row gap-8">
                    
                    {/* LEFT SIDEBAR: Navigation */}
                    <aside className="hidden lg:block w-64 shrink-0 space-y-6 sticky top-24 self-start max-h-[calc(100vh-120px)] overflow-y-auto no-scrollbar pb-8">
                        {/* Identity Module */}
                        <div className="flex flex-col items-center text-center space-y-4 px-4">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-50" />
                                <div className="relative w-16 h-16 rounded-[1.2rem] border border-white/10 overflow-hidden bg-[#0a111a] shadow-xl">
                                    {profile?.avatar_url ? (
                                        <Image src={profile.avatar_url} alt="Avatar" fill className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xl font-black text-cyan-500 bg-cyan-500/5">
                                            {profile?.first_name?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase italic tracking-tight leading-tight">{profile?.first_name} {profile?.last_name}</h3>
                                <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mt-0.5">{headlineSkill}</p>
                            </div>
                        </div>

                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-3 space-y-1">
                            <SidebarTab href="/dashboard" label="DASHBOARD" icon="🏠" active={pathname === "/dashboard"} />
                            <SidebarTab href="/feed" label="NEWSFEED" icon="📡" active={pathname.startsWith("/feed")} />
                            <SidebarTab href="/matches" label="MATCHES" icon="🎾" active={pathname.startsWith("/matches") && !pathname.includes("queue") && !pathname.includes("party")} />
                            <SidebarTab href="/matches/queue" label="FIND MATCH" icon="⚡" active={pathname.includes("queue")} />
                            <SidebarTab href="/clubs" label="Facilities" icon="🏢" active={pathname.startsWith("/clubs")} />
                            <SidebarTab href="/tournaments" label="Tournaments" icon="🏆" active={pathname.startsWith("/tournaments")} />
                            <SidebarTab href="/leaderboard" label="Rankings" icon="📊" active={pathname.startsWith("/leaderboard")} />
                            <SidebarTab href="/friends" label="Network" icon="👥" active={pathname.startsWith("/friends")} />
                        </section>
                    </aside>

                    {/* CENTRAL CONTENT: Main Feed */}
                    <div className="flex-1 space-y-8 min-w-0">
                        {/* Hero Profile */}
                        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl p-8 lg:p-12">
                            {/* Decorative Background Element */}
                            <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 blur-[100px] rounded-full -mr-48 -mt-48" />
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/5 blur-[80px] rounded-full -ml-32 -mb-32" />
                            
                            <div className="relative z-10 flex flex-col gap-10">
                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                                    <div className="space-y-6">
                                        <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">
                                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                                            Active Player
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-3">
                                                <div className="h-[2px] w-8 bg-cyan-500/30" />
                                                <p className="text-[10px] font-black text-cyan-500/50 uppercase tracking-[0.4em]">SYSTEM ONLINE</p>
                                            </div>
                                            <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-white uppercase italic leading-none">
                                                Welcome, <br />
                                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                                    {profile?.first_name} {profile?.last_name}
                                                </span>
                                            </h1>
                                            <p className="text-xs lg:text-sm font-black text-slate-500 uppercase tracking-[0.4em] italic pl-1">
                                                SKILL LEVEL: <span className="text-cyan-400">{headlineSkill}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-6 w-full md:w-auto md:items-end">
                                        {/* Performance Status Bar */}
                                        <div className="w-full md:w-72 space-y-3 bg-white/[0.02] border border-white/5 p-4 rounded-2xl backdrop-blur-sm">
                                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-[0.2em]">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-500">System Status</span>
                                                    <span className="text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-400/10 border border-cyan-400/20">Optimal</span>
                                                </div>
                                                <span className="text-cyan-400">98.2%</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-px border border-white/5">
                                                <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]" style={{ width: "98%" }} />
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-wrap gap-3">
                                            <Link href="/profile" className="px-8 py-3.5 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl text-center hover:bg-cyan-50 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/5">My Profile</Link>
                                            <Link href="/matches/queue" className="px-8 py-3.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest rounded-xl text-center hover:bg-cyan-500/20 transition-all hover:scale-105 active:scale-95">Find Match</Link>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 border-t border-white/5">
                                    <StatItem label="Global SR" value={Math.round(bestRating?.rating || 1500)} />
                                    <StatItem label="Victories" value={ratings.reduce((acc, r) => acc + r.wins, 0)} />
                                    <StatItem label="Total Matches" value={ratings.reduce((acc, r) => acc + r.matches_played, 0)} />
                                    <StatItem label="Win Rate" value={ratings.length > 0 ? `${Math.round((ratings.reduce((acc, r) => acc + r.wins, 0) / (ratings.reduce((acc, r) => acc + r.matches_played, 0) || 1)) * 100)}%` : "0%"} />
                                </div>
                            </div>
                        </section>

                        {/* Active Matches */}
                        {queueStatus?.in_queue || activeMatches.some(m => ["ongoing", "awaiting_players", "pending_approval"].includes(m.status)) ? (
                            <section className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Live Matches</h2>
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                                {queueStatus?.in_queue && (
                                    <Link href="/matches/queue" className="block relative overflow-hidden bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-[2rem] p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="text-2xl animate-pulse">🎾</div>
                                                <div>
                                                    <p className="text-sm font-black text-amber-400 uppercase italic">In Match Queue</p>
                                                    <p className="text-[9px] text-amber-500/60 font-black uppercase tracking-widest">Searching for {queueStatus.sport}...</p>
                                                </div>
                                            </div>
                                            <div className="px-4 py-2 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest rounded-lg">Tracker</div>
                                        </div>
                                    </Link>
                                )}
                                <div className="grid gap-4">
                                    {activeMatches.filter(m => ["ongoing", "awaiting_players", "pending_approval"].includes(m.status)).map(match => (
                                        <MatchCard key={match.id} match={match} />
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {/* Performance Analytics */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Performance Analytics</h2>
                                {ratings.length > 1 && (
                                    <select 
                                        value={selectedSport} 
                                        onChange={(e) => setSelectedSport(e.target.value)}
                                        className="bg-[#0a111a] border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-lg px-3 py-1 outline-none focus:border-cyan-500/50"
                                    >
                                        {Array.from(new Set(ratings.map(r => r.sport))).map(s => (
                                            <option key={s} value={s}>{SPORTS_META[s]?.label || s}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            {hasPerformanceData ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <PerformanceChart title="Dominant Winning Shots" data={currentStats.shots} color="#06b6d4" />
                                    <PerformanceChart title="Critical Error Analysis" data={currentStats.errors} color="#ef4444" />
                                </div>
                            ) : (
                                <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-8 text-center text-slate-700 text-[10px] font-black uppercase tracking-widest">Analytics pending...</div>
                            )}
                        </section>

                        {/* Quick Deployment */}
                        <section className="space-y-4">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 px-2">Facility Operations</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <QuickAction label="Open-Play Session" icon="🎮" href="/clubs?mode=open-play" color="bg-cyan-500" />
                                <QuickAction label="Court Rental" icon="🏟️" href="/courts" color="bg-purple-500" />
                            </div>
                        </section>

                        {/* Sports Disciplines */}
                        <section className="space-y-6">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 px-2">Sports Disciplines</h2>
                            <div className="grid grid-cols-1 gap-6">
                                {ratings.length > 0 ? (
                                    Object.entries(
                                        ratings.reduce((acc, r) => {
                                            if (!acc[r.sport]) acc[r.sport] = [];
                                            acc[r.sport].push(r);
                                            return acc;
                                        }, {} as Record<string, Rating[]>)
                                    ).map(([sport, sportRatings]) => (
                                        <RatingCard key={sport} sport={sport} ratings={sportRatings} queueStatus={queueStatus} />
                                    ))
                                ) : (
                                    <div className="rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-12 text-center">
                                        <p className="text-xs font-black text-slate-600 uppercase tracking-widest">No Match Data</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* RIGHT SIDEBAR: Activity & Network */}
                    <aside className="hidden xl:block w-72 shrink-0 space-y-6 sticky top-24 self-start max-h-[calc(100vh-120px)] overflow-y-auto no-scrollbar pb-8">
                        {/* Friends Online */}
                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] overflow-hidden flex flex-col">
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Online Friends</h3>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-emerald-500 uppercase">{friends.filter(f => f.is_online).length}</span>
                                </div>
                            </div>
                            <div className="p-4 space-y-3">
                                {friends.length > 0 ? (
                                    friends.map(friend => (
                                        <FriendRow key={friend.id} friend={friend} />
                                    ))
                                ) : (
                                    <p className="text-[10px] text-slate-600 text-center py-4 font-black uppercase">No friends found</p>
                                )}
                            </div>
                            <Link href="/friends" className="p-3 bg-white/5 text-[9px] font-black uppercase text-center text-slate-500 hover:text-white transition-colors">Manage Network</Link>
                        </section>

                        {/* Nearby Players */}
                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] overflow-hidden">
                            <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Nearby Players</h3>
                                <span className="text-[10px] font-black text-cyan-500 uppercase">{nearby.length}</span>
                            </div>
                            <div className="p-4 space-y-3">
                                {nearby.length > 0 ? (
                                    nearby.map(player => (
                                        <NearbyRow key={player.id} player={player} />
                                    ))
                                ) : (
                                    <div className="p-4 text-center space-y-2">
                                        <p className="text-[9px] text-slate-600 font-black uppercase leading-relaxed">Check in to a facility to see nearby players</p>
                                        <Link href="/clubs" className="inline-block text-[9px] font-black text-cyan-500 uppercase hover:underline">View Facilities →</Link>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Recent News Feed */}
                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 space-y-6">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">NEWSFEED</h3>
                            <div className="space-y-6">
                                <FeedItem title="Tournament Incoming" date="2h ago" />
                                <FeedItem title="New Club Venue" date="1d ago" />
                            </div>
                        </section>
                    </aside>

                </div>
            </main>
        </div>
    );
}

// --- Helper Components ---

function SidebarTab({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
    return (
        <Link href={href} className={`flex items-center gap-4 px-4 py-2.5 rounded-2xl transition-all group ${active ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"}`}>
            <span className={`text-lg group-hover:scale-110 transition-transform ${active ? "opacity-100" : "opacity-50"}`}>{icon}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
            {active && <div className="ml-auto w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,1)]" />}
        </Link>
    );
}

function FriendRow({ friend }: { friend: Friend }) {
    return (
        <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-white/5 overflow-hidden relative">
                    {friend.avatar_url ? (
                        <Image src={friend.avatar_url} alt={`${friend.first_name} ${friend.last_name}`} fill className="object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-black text-slate-500">{friend.first_name?.[0]}</div>
                    )}
                </div>
                {friend.is_online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0a111a]" />}
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-black text-white uppercase truncate group-hover:text-cyan-400 transition-colors">{friend.first_name} {friend.last_name}</p>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{friend.first_name} {friend.last_name}</p>
            </div>
        </div>
    );
}

function NearbyRow({ player }: { player: NearbyPlayer }) {
    return (
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-white/5 overflow-hidden relative shrink-0">
                {player.avatar_url ? (
                    <Image src={player.avatar_url} alt={`${player.first_name} ${player.last_name}`} fill className="object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-500">{player.first_name?.[0]}</div>
                )}
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-black text-white uppercase truncate">{player.first_name} {player.last_name}</p>
                <p className="text-[8px] font-black text-cyan-500/50 uppercase tracking-widest mt-0.5">Nearby</p>
            </div>
            <span className="ml-auto text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">👋</span>
        </div>
    );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="px-5 py-4 rounded-2xl bg-white/[0.02] border border-white/5 relative group overflow-hidden transition-all hover:bg-white/[0.04] hover:border-white/10">
            <div className="absolute top-0 left-0 w-1 h-0 bg-cyan-500 group-hover:h-full transition-all duration-300" />
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">{label}</p>
            <p className="text-2xl font-black italic text-white tracking-tighter">{value}</p>
        </div>
    );
}

type ChartTickProps = {
    x?: number;
    y?: number;
    index?: number;
    payload?: { value?: string | number };
};

function PerformanceChart({ title, data, color }: { title: string; data: PerformanceStat[]; color: string }) {
    const [activeIndex, setActiveIndex] = useState(-1);
    const displayData = [...data].sort((a, b) => b.count - a.count).slice(0, 4);

    const CustomTick = ({ x = 0, y = 0, payload, index }: ChartTickProps) => {
        return (
            <g transform={`translate(${x},${y})`}>
                <text
                    x={0}
                    y={0}
                    dy={3}
                    textAnchor="end"
                    fill={index === activeIndex ? "#fff" : "#475569"}
                    fontSize={8}
                    fontWeight={900}
                    className="uppercase tracking-widest transition-colors duration-200 italic"
                >
                    {payload?.value}
                </text>
            </g>
        );
    };

    return (
        <div className="bg-[#0a111a] border border-white/5 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500">{title}</h3>
            <div className="h-[120px] w-full">
                {displayData.length > 0 ? (
                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                        initialDimension={{ width: 320, height: 120 }}
                    >
                        <BarChart
                            data={displayData}
                            layout="vertical" 
                            margin={{ top: 0, right: 20, left: 30, bottom: 0 }}
                            onMouseMove={(state) => {
                                if (state.activeTooltipIndex != null) {
                                    setActiveIndex(Number(state.activeTooltipIndex));
                                } else {
                                    setActiveIndex(-1);
                                }
                            }}
                            onMouseLeave={() => setActiveIndex(-1)}
                        >
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="label" 
                                type="category" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={<CustomTick />}
                                width={60} 
                            />
                            <Tooltip 
                                cursor={{ fill: 'rgba(255,255,255,0.03)' }} 
                                contentStyle={{ 
                                    backgroundColor: '#0a111a', 
                                    border: '1px solid rgba(255,255,255,0.1)', 
                                    borderRadius: '8px', 
                                    fontSize: '8px', 
                                    fontWeight: '900', 
                                    textTransform: 'uppercase',
                                    color: '#fff'
                                }} 
                                itemStyle={{ color: '#fff' }}
                                labelStyle={{ color: '#64748b', marginBottom: '4px', fontSize: '7px' }}
                            />
                            <Bar dataKey="count" radius={[0, 2, 2, 0]} barSize={12}>
                                {displayData.map((entry, index) => (
                                    <Cell 
                                        key={`cell-${index}`} 
                                        fill={color} 
                                        fillOpacity={index === activeIndex ? 1 : 0.4 + (0.6 * (entry.count / Math.max(...displayData.map(d => d.count))))}
                                        className="transition-all duration-300"
                                    />
                                ))}
                                <LabelList 
                                    dataKey="count" 
                                    position="right" 
                                    fill="#fff" 
                                    fontSize={8} 
                                    fontWeight={900} 
                                    offset={8}
                                    className="transition-opacity duration-300"
                                    style={{ 
                                        opacity: 1, 
                                        fill: '#fff',
                                        textShadow: '0 0 4px rgba(0,0,0,0.5)'
                                    }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center font-black text-[8px] uppercase text-slate-800 tracking-widest">No Data</div>
                )}
            </div>
        </div>
    );
}

function MatchCard({ match }: { match: ActiveMatch }) {
    const meta = SPORTS_META[match.sport] || SPORTS_META.pickleball;
    return (
        <Link href={`/matches/${match.id}${match.status === "awaiting_players" ? "/lobby" : ""}`} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a111a] p-5 hover:border-cyan-500/30 transition-all shadow-xl">
            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${meta.bg} flex items-center justify-center text-2xl border border-white/5 group-hover:scale-110 transition-transform`}>
                        {meta.emoji}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-white uppercase italic">{meta.label} Match</h4>
                            <span className="w-1 h-1 rounded-full bg-zinc-800" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{match.match_format}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                            Status: <span className="text-emerald-400">{match.status.replace("_", " ")}</span>
                        </p>
                    </div>
                </div>
                <div className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-[10px] font-black uppercase tracking-widest group-hover:bg-white text-white group-hover:text-black transition-all">
                    Enter
                </div>
            </div>
        </Link>
    );
}

function RatingCard({ sport, ratings, queueStatus }: { sport: string; ratings: Rating[]; queueStatus: QueueStatus | null }) {
    const meta = SPORTS_META[sport] || SPORTS_META.pickleball;
    const singles = ratings.find(r => r.match_format === "singles");
    const doubles = ratings.find(r => r.match_format === "doubles");
    const mixed = ratings.find(r => r.match_format === "mixed_doubles");

    return (
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0a111a]/60 backdrop-blur-md p-6 group transition-all hover:border-white/20">
            <div className="absolute top-0 right-0 p-8 text-8xl opacity-[0.02] group-hover:opacity-[0.05] transition-all -rotate-12 group-hover:rotate-0 pointer-events-none font-black italic">{meta.label}</div>
            <div className="relative flex flex-col 2xl:flex-row gap-10 items-start 2xl:items-center">
                <div className="flex items-center gap-6 min-w-[280px]">
                    <div className="relative">
                        <div className={`absolute inset-0 ${meta.bg} blur-xl rounded-full opacity-50`} />
                        <div className={`relative w-20 h-20 rounded-3xl ${meta.bg} flex items-center justify-center text-4xl border border-white/10 shadow-2xl group-hover:scale-105 transition-transform duration-500`}>{meta.emoji}</div>
                    </div>
                    <div>
                        <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">{meta.label}</h4>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Circuit</span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 flex flex-wrap gap-5 w-full">
                    {[singles, doubles, mixed].filter(Boolean).map(r => {
                        if (!r) return null;
                        const isLeaderboardReady = r.rating_status === "RATED" || Boolean(r.is_leaderboard_eligible);
                        const isMlReady = Boolean(r.is_matchmaking_eligible) && !isLeaderboardReady;
                        const badgeClass = isLeaderboardReady
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : isMlReady
                              ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                              : "border-amber-500/20 bg-amber-500/10 text-amber-400";
                        const dotClass = isLeaderboardReady
                            ? "bg-emerald-400 animate-pulse"
                            : isMlReady
                              ? "bg-cyan-400 animate-pulse"
                              : "bg-amber-400";
                        const badgeLabel = isLeaderboardReady ? "Verified" : isMlReady ? "ML Ready" : "Syncing";
                        const hasPerformanceSignal = Boolean(r.performance_reliable) || (r.performance_confidence ?? 0) > 0 || (r.performance_coverage_pct ?? 0) > 0;
                        return (
                        <div key={r.match_format} className="flex-1 min-w-[220px] flex flex-col p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:border-white/20 transition-all hover:-translate-y-1 relative group/card">
                            <div className="flex items-center justify-between mb-6">
                                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/5"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{r.match_format.replace('_', ' ')}</span></div>
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${badgeClass}`}>
                                    <div className={`w-1 h-1 rounded-full ${dotClass}`} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">{badgeLabel}</span>
                                </div>
                            </div>
                            <div className="flex items-end justify-between gap-4 mb-8">
                                <div>
                                    <div className="flex items-baseline gap-1">
                                        <p className="text-5xl font-black italic text-white tracking-tighter">{Math.round(r.rating)}</p>
                                        <span className="text-xs font-black text-cyan-500/50 italic uppercase">SR</span>
                                    </div>
                                    <p className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] mt-1">{r.skill_level}</p>
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.18em] mt-2">
                                        {hasPerformanceSignal
                                            ? `Impact ${Math.round(r.performance_rating ?? 50)} • ${Math.round(r.performance_confidence ?? 0)}% confidence`
                                            : "Impact tracking"}
                                    </p>
                                </div>
                                <div className="text-right space-y-0.5">
                                    <p className="text-xs font-black text-white italic">{r.wins}W <span className="text-slate-600">/</span> {r.losses}L</p>
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{r.matches_played} Total</p>
                                </div>
                            </div>
                            <div className="mt-auto">
                                <Link href={`/matches/queue?sport=${sport}&format=${r.match_format}`} className={`w-full block text-center py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group/btn ${queueStatus?.in_queue && queueStatus.sport === sport && queueStatus.match_format === r.match_format ? "bg-amber-500 text-black shadow-xl" : "bg-white/5 border border-white/10 text-white hover:border-cyan-500/50 hover:text-cyan-400"}`}>
                                    <span className="relative z-10">{queueStatus?.in_queue && queueStatus.sport === sport && queueStatus.match_format === r.match_format ? "Resume Ops" : "Initiate"}</span>
                                </Link>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function QuickAction({ label, icon, href, color }: { label: string; icon: string; href: string; color: string }) {
    return (
        <Link href={href} className="group flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-[#0a111a] hover:border-white/10 transition-all">
            <div className={`w-10 h-10 rounded-xl ${color} bg-opacity-10 flex items-center justify-center text-xl group-hover:scale-110 transition-transform`}>{icon}</div>
            <span className="text-xs font-black text-white uppercase tracking-widest group-hover:text-cyan-400 transition-colors">{label}</span>
            <span className="ml-auto text-slate-500 group-hover:translate-x-1 transition-transform">→</span>
        </Link>
    );
}

function FeedItem({ title, date }: { title: string; date: string }) {
    return (
        <div className="flex items-start gap-4">
            <div className="w-1 h-1 rounded-full bg-cyan-500 mt-1.5 shrink-0" />
            <div className="min-w-0">
                <p className="text-[10px] font-bold text-white truncate uppercase tracking-widest leading-none">{title}</p>
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mt-1">{date}</p>
            </div>
        </div>
    );
}
