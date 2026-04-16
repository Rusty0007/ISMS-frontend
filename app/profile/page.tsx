"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        try {
            const res = await fetch("/api/players/me", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (res.ok) {
                const data = await res.json();
                setProfile(data.profile);
                setRatings(data.ratings || []);
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
                                    {profile?.username[0].toUpperCase()}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">
                            @{profile?.username}
                        </h1>
                        <p className="text-slate-500 font-bold uppercase tracking-widest mt-1">
                            {profile?.first_name} {profile?.last_name}
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
                    <ProfileStat label="Total Battles" value={ratings.reduce((acc, r) => acc + r.matches_played, 0)} icon="⚔️" />
                    <ProfileStat label="Victories" value={ratings.reduce((acc, r) => acc + r.wins, 0)} icon="🏆" />
                    <ProfileStat label="Losses" value={ratings.reduce((acc, r) => acc + r.losses, 0)} icon="💀" />
                    <ProfileStat label="Elite Rating" value={ratings.length > 0 ? Math.max(...ratings.map(r => r.rating)) : 1500} icon="⭐" />
                </section>

                {/* Skills & Disciplines */}
                <section className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 px-2">Combat Disciplines</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {ratings.map(rating => (
                            <DetailedRatingCard key={`${rating.sport}-${rating.match_format}`} rating={rating} />
                        ))}
                    </div>
                </section>

            </main>
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

    return (
        <div className="bg-[#0a111a] border border-white/5 rounded-[2rem] p-8 space-y-8 relative overflow-hidden group">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl ${meta.bg} flex items-center justify-center text-3xl border border-white/5`}>
                        {meta.emoji}
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white uppercase italic">{meta.label}</h3>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{rating.match_format}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-black italic text-cyan-400">{Math.round(rating.rating)}</p>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Rank</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Combat Proficiency</p>
                    <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{rating.skill_level}</p>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, (rating.rating / 2500) * 100)}%` }} />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
                <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Win Rate</p>
                    <p className="text-lg font-black text-white">{Math.round(winRate)}%</p>
                </div>
                <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Victories</p>
                    <p className="text-lg font-black text-white">{rating.wins}</p>
                </div>
                <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Defeats</p>
                    <p className="text-lg font-black text-white">{rating.losses}</p>
                </div>
            </div>
        </div>
    );
}
