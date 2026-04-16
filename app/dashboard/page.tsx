"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import NavBar from "@/components/NavBar";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";

// --- Types ---

interface Profile {
    id: string;
    username: string;
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

// --- Constants ---

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; bg: string; icon: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-blue-400",    bg: "bg-blue-500/10",    icon: "🎾" },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  bg: "bg-purple-500/10",  icon: "🏸" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: "🎾" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  bg: "bg-orange-500/10",  icon: "🏓" },
};

// --- Components ---

function DashboardSkeleton() {
    return (
        <div className="min-h-screen bg-[#050b14] p-6 animate-pulse space-y-8">
            <div className="h-64 bg-white/5 rounded-[2.5rem]" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="h-48 bg-white/5 rounded-3xl" />
                    <div className="h-96 bg-white/5 rounded-3xl" />
                </div>
                <div className="space-y-8">
                    <div className="h-64 bg-white/5 rounded-3xl" />
                    <div className="h-64 bg-white/5 rounded-3xl" />
                </div>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [ratings, setRatings] = useState<Rating[]>([]);
    const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([]);
    const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        try {
            // Fetch Profile & Ratings
            const profileRes = await fetch("/api/players/me", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (isUnauthorized(profileRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (profileRes.ok) {
                const data = await profileRes.json();
                setProfile(data.profile);
                setRatings(data.ratings || []);
            }

            // Fetch Queue Status
            const queueRes = await fetch("/api/matches/queue/me", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (queueRes.ok) {
                const data = await queueRes.json();
                setQueueStatus(data);
            }

            // Fetch My Matches (Recent/Active)
            const matchesRes = await fetch("/api/matches/mine?limit=5", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (matchesRes.ok) {
                const data = await matchesRes.json();
                setActiveMatches(data.matches || []);
            }

        } catch (err) {
            console.error("Dashboard data fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading) return <DashboardSkeleton />;

    const bestRating = ratings.length > 0 
        ? [...ratings].sort((a, b) => b.rating - a.rating)[0] 
        : null;

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute inset-0 animate-scanline opacity-[0.02] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-20" />
            </div>

            <NavBar />

            <main className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 pb-32 pt-24 space-y-8">
                
                {/* Hero Profile Section */}
                <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl p-8 lg:p-12">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <span className="text-9xl font-black italic select-none">ISMS</span>
                    </div>
                    
                    <div className="flex flex-col lg:flex-row items-center gap-10">
                        <div className="relative group">
                            <div className="absolute inset-0 bg-cyan-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative w-32 h-32 lg:w-40 lg:h-40 rounded-[2.5rem] border-2 border-cyan-500/30 overflow-hidden bg-zinc-800 shadow-2xl">
                                {profile?.avatar_url ? (
                                    <Image src={profile.avatar_url} alt="Avatar" fill className="object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-4xl font-black text-cyan-500 bg-cyan-500/5">
                                        {profile?.username[0].toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-emerald-500 w-6 h-6 rounded-full border-4 border-[#0a111a] shadow-lg" />
                        </div>

                        <div className="flex-1 text-center lg:text-left space-y-4">
                            <div>
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                    Active Operator
                                </div>
                                <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white uppercase italic">
                                    Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-400">@{profile?.username}</span>
                                </h1>
                                <p className="text-slate-400 font-medium mt-1">
                                    {profile?.first_name} {profile?.last_name} • Tactical Level: {bestRating?.skill_level || "Calibrating"}
                                </p>
                            </div>

                            <div className="flex flex-wrap justify-center lg:justify-start gap-3">
                                <StatItem label="Global Rating" value={Math.round(bestRating?.rating || 1500)} />
                                <StatItem label="Matches Won" value={ratings.reduce((acc, r) => acc + r.wins, 0)} />
                                <StatItem label="Win Rate" value={ratings.length > 0 ? `${Math.round((ratings.reduce((acc, r) => acc + r.wins, 0) / (ratings.reduce((acc, r) => acc + r.matches_played, 0) || 1)) * 100)}%` : "0%"} />
                            </div>
                        </div>

                        <div className="w-full lg:w-auto flex flex-col gap-3">
                            <Link href="/profile" className="px-8 py-3 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] transition-transform text-center">
                                View Full Profile
                            </Link>
                            <Link href="/matches/queue" className="px-8 py-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-cyan-500/20 transition-all text-center">
                                New Deployment
                            </Link>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Main Content Area */}
                    <div className="lg:col-span-2 space-y-8">
                        
                        {/* Queue Status / Active Matches */}
                        {queueStatus?.in_queue ? (
                            <section className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-[2rem] p-8">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center text-3xl animate-pulse">
                                            🛰️
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-amber-400 uppercase italic">Deployment in Progress</h3>
                                            <p className="text-xs text-amber-400/60 font-bold uppercase tracking-widest mt-1">
                                                Searching for {queueStatus.sport} {queueStatus.match_format} match...
                                            </p>
                                        </div>
                                    </div>
                                    <Link href="/matches/queue" className="w-full sm:w-auto px-6 py-3 bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-amber-500/20">
                                        View Tracking
                                    </Link>
                                </div>
                            </section>
                        ) : activeMatches.some(m => ["ongoing", "awaiting_players", "pending_approval"].includes(m.status)) ? (
                            <section className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Active Operations</h2>
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                                <div className="grid gap-4">
                                    {activeMatches.filter(m => ["ongoing", "awaiting_players", "pending_approval"].includes(m.status)).map(match => (
                                        <MatchCard key={match.id} match={match} />
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {/* Tactical Intelligence (Skill Levels) */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Tactical Intelligence</h2>
                                <Link href="/leaderboard" className="text-[10px] font-black uppercase tracking-widest text-cyan-400 hover:underline">
                                    Global Standings →
                                </Link>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {ratings.length > 0 ? (
                                    ratings.map(rating => (
                                        <RatingCard key={`${rating.sport}-${rating.match_format}`} rating={rating} />
                                    ))
                                ) : (
                                    <div className="col-span-full rounded-3xl border border-white/5 bg-white/[0.02] p-12 text-center">
                                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">No Combat Data Found</p>
                                        <Link href="/matches/queue" className="inline-block px-8 py-3 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-colors">
                                            Register for Combat
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Recent History */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Operation History</h2>
                                <Link href="/matches" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white">
                                    Full Archive
                                </Link>
                            </div>
                            <div className="rounded-3xl border border-white/5 bg-[#0a111a]/80 overflow-hidden">
                                {activeMatches.filter(m => m.status === "completed").length > 0 ? (
                                    <div className="divide-y divide-white/5">
                                        {activeMatches.filter(m => m.status === "completed").map(match => (
                                            <HistoryRow key={match.id} match={match} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-12 text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                                        No recent operations recorded.
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Sidebar Area */}
                    <div className="space-y-8">
                        
                        {/* Quick Deployment Actions */}
                        <section className="space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 px-2">Quick Deployment</h2>
                            <div className="grid grid-cols-1 gap-3">
                                <QuickAction label="Match Queue" icon="⚡" href="/matches/queue" color="bg-cyan-500" />
                                <QuickAction label="Clubs & Facilities" icon="🏢" href="/clubs" color="bg-purple-500" />
                                <QuickAction label="Friends Network" icon="👥" href="/friends" color="bg-emerald-500" />
                                <QuickAction label="Tournament Hub" icon="🏆" href="/tournaments" color="bg-amber-500" />
                            </div>
                        </section>

                        {/* Training Data Insights (Placeholder) */}
                        <section className="rounded-3xl border border-white/5 bg-gradient-to-br from-cyan-500/10 to-transparent p-6 space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-cyan-400">Tactical Insights</h3>
                            <div className="space-y-4">
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-lg">💡</div>
                                    <p className="text-[10px] font-medium leading-relaxed text-slate-400">
                                        You are currently <span className="text-white">Intermediate</span> in Badminton. Complete 5 more matches to recalibrate your global rank.
                                    </p>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-cyan-500 w-[60%]" />
                                </div>
                            </div>
                        </section>

                        {/* Recent News/Feed (Simple version) */}
                        <section className="rounded-3xl border border-white/5 bg-[#0a111a]/80 p-6 space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Network Feed</h3>
                            <div className="space-y-6">
                                <FeedItem title="Tournament Incoming" date="2h ago" />
                                <FeedItem title="Friend Request" date="5h ago" />
                                <FeedItem title="New Club Venue" date="1d ago" />
                            </div>
                        </section>
                    </div>

                </div>
            </main>
        </div>
    );
}

// --- Helper Components ---

function StatItem({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="px-5 py-3 rounded-2xl border border-white/5 bg-white/[0.02]">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">{label}</p>
            <p className="text-xl font-black italic text-white">{value}</p>
        </div>
    );
}

function MatchCard({ match }: { match: ActiveMatch }) {
    const meta = SPORTS_META[match.sport] || SPORTS_META.pickleball;
    return (
        <Link href={`/matches/${match.id}${match.status === "awaiting_players" ? "/lobby" : ""}`} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a111a] p-5 hover:border-cyan-500/30 transition-all shadow-xl">
            <div className="flex items-center justify-between">
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
                    Enter Operation
                </div>
            </div>
        </Link>
    );
}

function RatingCard({ rating }: { rating: Rating }) {
    const meta = SPORTS_META[rating.sport] || SPORTS_META.pickleball;
    return (
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a111a] p-6 group">
            <div className={`absolute top-0 right-0 p-4 text-4xl opacity-5 group-hover:opacity-10 transition-opacity`}>
                {meta.emoji}
            </div>
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center text-xl`}>
                        {meta.emoji}
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-white uppercase italic">{meta.label}</h4>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{rating.match_format}</p>
                    </div>
                </div>
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-2xl font-black italic text-white">{Math.round(rating.rating)}</p>
                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{rating.skill_level}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-white">{rating.wins}W - {rating.losses}L</p>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Duty</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function HistoryRow({ match }: { match: ActiveMatch }) {
    const meta = SPORTS_META[match.sport] || SPORTS_META.pickleball;
    return (
        <Link href={`/matches/${match.id}`} className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors group">
            <div className="flex items-center gap-4">
                <span className="text-lg opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all">{meta.emoji}</span>
                <div className="min-w-0">
                    <p className="text-xs font-black text-white uppercase italic truncate">@{match.player1_id.slice(0, 8)} vs Opponent</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{meta.label} • {match.match_format}</p>
                </div>
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                {new Date(match.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
        </Link>
    );
}

function QuickAction({ label, icon, href, color }: { label: string; icon: string; href: string; color: string }) {
    return (
        <Link href={href} className="group flex items-center gap-4 p-4 rounded-2xl border border-white/5 bg-[#0a111a] hover:border-white/10 transition-all">
            <div className={`w-10 h-10 rounded-xl ${color} bg-opacity-10 flex items-center justify-center text-xl group-hover:scale-110 transition-transform`}>
                {icon}
            </div>
            <span className="text-xs font-black text-white uppercase tracking-widest group-hover:text-cyan-400 transition-colors">{label}</span>
            <span className="ml-auto text-slate-500 group-hover:translate-x-1 transition-transform">→</span>
        </Link>
    );
}

function FeedItem({ title, date }: { title: string; date: string }) {
    return (
        <div className="flex items-start gap-4">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1.5 shrink-0" />
            <div className="min-w-0">
                <p className="text-[11px] font-bold text-white truncate">{title}</p>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{date}</p>
            </div>
        </div>
    );
}
