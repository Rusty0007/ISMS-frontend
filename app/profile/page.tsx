"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import NavBar from "@/components/NavBar";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

// --- Types ---

interface Profile {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    city_mun_code: string | null;
    created_at: string;
}

interface Rating {
    sport: string;
    match_format: string;
    rating: number;
    skill_level: string;
    matches_played: number;
    wins: number;
    losses: number;
    performance_rating?: number;
    performance_confidence?: number;
    performance_reliable?: boolean;
    performance_coverage_pct?: number;
}

interface PerformanceStat {
    label: string;
    count: number;
}

interface SportPerformance {
    shots: PerformanceStat[];
    errors: PerformanceStat[];
}

// --- Constants ---

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-blue-400",    bg: "bg-blue-500/10" },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  bg: "bg-purple-500/10" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  bg: "bg-orange-500/10" },
};

export default function ProfilePage() {
    const router = useRouter();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [ratings, setRatings] = useState<Rating[]>([]);
    const [performance, setPerformance] = useState<Record<string, SportPerformance>>({});
    const [selectedSport, setSelectedSport] = useState<string>("");
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        try {
            const [profileRes, statsRes] = await Promise.all([
                fetch("/api/players/me", {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch("/api/players/me/performance-stats", {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (isUnauthorized(profileRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            
            if (profileRes.ok) {
                const data = await profileRes.json();
                setProfile(data.profile);
                const activeRatings = data.ratings || [];
                setRatings(activeRatings);
                
                // Default to first active sport
                if (activeRatings.length > 0) {
                    setSelectedSport(activeRatings[0].sport);
                }
            }

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setPerformance(statsData);
            }
        } catch (err) {
            console.error("Profile fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050b14] flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse uppercase tracking-[0.3em] font-black">Synchronizing Identity...</div>
            </div>
        );
    }

    const currentStats = performance[selectedSport] || { shots: [], errors: [] };
    const hasPerformanceData = currentStats.shots.length > 0 || currentStats.errors.length > 0;
    const topRating = ratings.length > 0 ? Math.max(...ratings.map(r => r.rating || 0)) : 1500;
    const bestRatedDiscipline =
        ratings.length > 0
            ? [...ratings].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0]
            : null;
    const headlineSkill = bestRatedDiscipline?.skill_level === "Calibrating"
        ? "Developing Player"
        : bestRatedDiscipline?.skill_level || "Player Profile";

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            <NavBar hideLogo backHref="/dashboard" backLabel="Dashboard" />

            <main className="relative z-10 max-w-5xl mx-auto px-4 py-8 pb-32 pt-24 space-y-12">
                
                {/* Header Identity */}
                <section className="flex flex-col items-center text-center space-y-6">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full opacity-50" />
                        <div className="relative w-32 h-32 rounded-[2.5rem] border-4 border-[#0a111a] overflow-hidden bg-zinc-800 shadow-2xl">
                            {profile?.avatar_url ? (
                                <Image src={profile.avatar_url} alt="Avatar" fill className="object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl font-black text-cyan-500 bg-cyan-500/5">
                                    {profile?.first_name?.[0]?.toUpperCase() || "O"}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">
                            {profile?.first_name} {profile?.last_name}
                        </h1>
                        <p className="text-slate-500 font-bold uppercase tracking-widest mt-1">
                            {headlineSkill}
                        </p>
                        <div className="flex items-center justify-center gap-4 mt-4">
                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest border border-white/5 px-3 py-1 rounded-full">
                                Joined {new Date(profile?.created_at || "").toLocaleDateString([], { month: "long", year: "numeric" })}
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Operator Verified</span>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button className="px-8 py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-transform">
                            Edit Identification
                        </button>
                        <button className="px-8 py-3 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-colors">
                            Share Profile
                        </button>
                    </div>
                </section>

                {/* Tactical Stats Grid */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <ProfileStat label="Total Battles" value={ratings.reduce((acc, r) => acc + (r.matches_played || 0), 0)} icon="⚔️" />
                    <ProfileStat label="Victories" value={ratings.reduce((acc, r) => acc + (r.wins || 0), 0)} icon="🏆" />
                    <ProfileStat label="Losses" value={ratings.reduce((acc, r) => acc + (r.losses || 0), 0)} icon="💀" />
                    <ProfileStat label="Top Rating" value={topRating} icon="⭐" />
                </section>

                {/* Performance Analytics */}
                <section className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500">Performance Analytics</h2>
                        {ratings.length > 0 && (
                            <select 
                                value={selectedSport} 
                                onChange={(e) => setSelectedSport(e.target.value)}
                                className="bg-[#0a111a] border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-lg px-4 py-2 outline-none focus:border-cyan-500/50"
                            >
                                {ratings.map(r => (
                                    <option key={r.sport} value={r.sport}>{SPORTS_META[r.sport]?.label || r.sport}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {hasPerformanceData ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartCard title="Dominant Winning Shots" data={currentStats.shots} color="#06b6d4" />
                            <ChartCard title="Critical Error Analysis" data={currentStats.errors} color="#ef4444" />
                        </div>
                    ) : (
                        <div className="bg-[#0a111a] border border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-2xl">📊</div>
                            <div className="space-y-1">
                                <p className="text-sm font-black uppercase tracking-widest text-slate-500">Insufficient Combat Data</p>
                                <p className="text-xs text-slate-600 max-w-xs">Detailed shot and error analytics will populate as you record points with a referee.</p>
                            </div>
                        </div>
                    )}
                </section>

                {/* Skills & Disciplines */}
                <section className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 px-2">Combat Disciplines</h2>
                    {ratings.filter(r => r.matches_played > 0).length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {ratings.filter(r => r.matches_played > 0).map(rating => (
                                <DetailedRatingCard key={`${rating.sport}-${rating.match_format}`} rating={rating} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                            <p className="text-3xl">⚔️</p>
                            <p className="text-sm font-black uppercase tracking-widest text-slate-500">No battles recorded yet</p>
                            <p className="text-xs text-slate-600">Complete your first match to see your combat disciplines here.</p>
                        </div>
                    )}
                </section>

            </main>
        </div>
    );
}

function ChartCard({ title, data, color }: { title: string; data: PerformanceStat[]; color: string }) {
    return (
        <div className="bg-[#0a111a] border border-white/5 rounded-[2rem] p-6 space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">{title}</h3>
            <div className="h-[250px] w-full">
                {data.length > 0 ? (
                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                        initialDimension={{ width: 400, height: 250 }}
                    >
                        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="label" 
                                type="category" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }}
                                width={80}
                            />
                            <Tooltip 
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ 
                                    backgroundColor: '#0a111a', 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    fontSize: '10px',
                                    fontWeight: '900',
                                    textTransform: 'uppercase'
                                }}
                            />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={color} fillOpacity={0.2 + (0.8 * (entry.count / Math.max(...data.map(d => d.count))))} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">No events recorded</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProfileStat({ label, value, icon }: { label: string; value: string | number; icon: string }) {
    return (
        <div className="bg-[#0a111a] border border-white/5 rounded-3xl p-6 text-center space-y-2 relative overflow-hidden group hover:border-cyan-500/20 transition-colors">
            <span className="text-2xl block group-hover:scale-110 transition-transform">{icon}</span>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-3xl font-black italic text-white">{value}</p>
        </div>
    );
}

function DetailedRatingCard({ rating }: { rating: Rating }) {
    const meta = SPORTS_META[rating.sport] || SPORTS_META.pickleball;
    const winRate = rating.matches_played > 0 ? (rating.wins / rating.matches_played) * 100 : 0;
    const hasPerformanceSignal = Boolean(rating.performance_reliable) || (rating.performance_confidence ?? 0) > 0 || (rating.performance_coverage_pct ?? 0) > 0;

    return (
        <div className="bg-[#0a111a]/60 backdrop-blur-md border border-white/10 rounded-[2.5rem] p-8 space-y-8 relative overflow-hidden group transition-all hover:border-white/20">
            {/* Subtle Inner Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            
            <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <div className={`absolute inset-0 ${meta.bg} blur-lg rounded-xl opacity-40`} />
                        <div className={`relative w-16 h-16 rounded-2xl ${meta.bg} flex items-center justify-center text-3xl border border-white/10 shadow-inner group-hover:scale-110 transition-transform duration-500`}>
                            {meta.emoji}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">{meta.label}</h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">{rating.match_format}</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-baseline justify-end gap-1">
                        <p className="text-4xl font-black italic text-cyan-400 tracking-tighter">{Math.round(rating.rating)}</p>
                        <span className="text-[10px] font-black text-cyan-500/40 uppercase italic">SR</span>
                    </div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">Combat Efficiency</p>
                </div>
            </div>

            <div className="space-y-4 relative z-10">
                <div className="flex justify-between items-end px-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Combat Proficiency</p>
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{rating.skill_level}</p>
                    </div>
                </div>
                <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                    <div 
                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]" 
                        style={{ width: `${Math.min(100, (rating.rating / 2700) * 100)}%` }} 
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2 px-1 pt-2">
                    <span className="rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-white/70">
                        {hasPerformanceSignal ? `Impact ${Math.round(rating.performance_rating ?? 50)}` : "Impact tracking"}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">
                        {hasPerformanceSignal
                            ? `${Math.round(rating.performance_confidence ?? 0)}% confidence • ${Math.round(rating.performance_coverage_pct ?? 0)}% coverage`
                            : "Referee-tagged points needed"}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6 border-t border-white/5 pt-8 relative z-10">
                <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Win Rate</p>
                    <p className="text-2xl font-black italic text-white leading-none">{Math.round(winRate)}%</p>
                </div>
                <div className="space-y-1 border-x border-white/5 px-4 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Victories</p>
                    <p className="text-2xl font-black italic text-emerald-400 leading-none">{rating.wins}</p>
                </div>
                <div className="space-y-1 text-right">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Defeats</p>
                    <p className="text-2xl font-black italic text-rose-500 leading-none">{rating.losses}</p>
                </div>
            </div>
        </div>
    );
}
