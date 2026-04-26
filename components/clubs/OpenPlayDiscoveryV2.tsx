"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

// --- Types ---

type OpenPlaySession = {
    id: string;
    club_id: string;
    club_name: string;
    title: string;
    sport: string;
    session_date: string;
    duration_hours: number;
    max_players: number;
    confirmed_count: number;
    waitlisted_count: number;
    price_per_head: number;
    status: string;
    is_joined: boolean;
    court_name: string | null;
    skill_min: number | null;
    skill_max: number | null;
    participants?: {
        user_id: string;
        status: string;
        joined_at: string | null;
        profile: {
            id: string;
            username: string;
            first_name: string | null;
            last_name: string | null;
            avatar_url?: string | null;
        } | null;
    }[];
};

type ClubItem = {
    id: string;
    name: string;
    description: string | null;
    sport: string | null;
    category: string | null;
    admin_id: string;
    city_mun_code: string | null;
    province_code: string | null;
    member_count: number;
    court_count: number;
    proximity: string | null;
    logo_url: string | null;
    cover_url: string | null;
    opening_time?: string | null;
    closing_time?: string | null;
};

type FilterKey = "open_now" | "free_slots" | "beginner_friendly" | "followed_clubs";

type Props = {
    clubs: ClubItem[];
    sessions: OpenPlaySession[];
    memberIds: Set<string>;
    loadingSessions: boolean;
    onJoin: (id: string) => void;
    onJoinSession: (id: string) => void;
    onClose: () => void;
    searchValue: string;
    onSearchChange: (q: string) => void;
    selectedDate: string; // YYYY-MM-DD
    onDateChange: (date: string) => void;
};

const SPORTS_META: Record<string, { label: string; image: string; accent: string; border: string; tint: string; code: string; icon: string }> = {
    pickleball: { label: "Pickleball", image: "/sports/pickleball.jpg.png", accent: "text-cyan-400", border: "border-cyan-500/30", tint: "bg-cyan-500/5", code: "PB", icon: "🎾" },
    badminton: { label: "Badminton", image: "/sports/badminton.jpg.png", accent: "text-fuchsia-400", border: "border-fuchsia-500/30", tint: "bg-fuchsia-500/5", code: "BD", icon: "🏸" },
    lawn_tennis: { label: "Lawn Tennis", image: "/sports/lawn-tennis.jpg.png", accent: "text-emerald-400", border: "border-emerald-500/30", tint: "bg-emerald-500/5", code: "LT", icon: "🎾" },
    table_tennis: { label: "Table Tennis", image: "/sports/table-tennis.jpg.png", accent: "text-amber-400", border: "border-amber-500/30", tint: "bg-amber-500/5", code: "TT", icon: "🏓" },
};

// --- HUD Helper Components ---

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <svg className={`absolute w-4 h-4 text-white/20 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 0H0V24" strokeLinecap="square" />
        </svg>
    );
}

function StatusBadge({ label, active = true, variant = "cyan" }: { label: string; active?: boolean; variant?: "cyan" | "emerald" | "amber" | "fuchsia" }) {
    const variants = {
        cyan: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
        emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
        fuchsia: "bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400",
    };
    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${variants[variant]}`}>
            <span className={`w-1 h-1 rounded-full bg-current ${active ? "animate-pulse" : "opacity-40"}`} />
            {label}
        </div>
    );
}

function DataBar({ value, max = 100, color = "bg-cyan-500" }: { value: number; max?: number; color?: string }) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div className="h-1 w-full bg-white/5 overflow-hidden rounded-full">
            <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
        </div>
    );
}

// --- Search & Date Header ---

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" /></svg>
            </div>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="SEARCH ACTIVE MISSIONS OR VENUES..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-[10px] font-black uppercase tracking-widest text-white placeholder-slate-600 outline-none focus:border-cyan-500/50 transition-all shadow-xl"
            />
        </div>
    );
}

function DateSelector({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
    const dates = useMemo(() => {
        const list = [];
        const today = new Date();
        for (let i = 0; i < 14; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            list.push({
                full: d.toISOString().split("T")[0],
                day: d.getDate().toString().padStart(2, "0"),
                month: (d.getMonth() + 1).toString().padStart(2, "0"),
                weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
                isToday: i === 0
            });
        }
        return list;
    }, []);

    return (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {dates.map((d) => (
                <button
                    key={d.full}
                    onClick={() => onSelect(d.full)}
                    className={`flex flex-col items-center min-w-[64px] p-3 rounded-2xl border transition-all ${
                        selected === d.full
                            ? "bg-cyan-500 border-cyan-400 text-black shadow-[0_0_20px_rgba(6,182,212,0.3)] scale-105"
                            : "bg-white/5 border-white/5 text-slate-500 hover:border-white/20 hover:text-white"
                    }`}
                >
                    <span className="text-[8px] font-black tracking-widest mb-1">{d.isToday ? "TODAY" : d.weekday}</span>
                    <span className="text-sm font-black italic">{d.day}/{d.month}</span>
                </button>
            ))}
        </div>
    );
}

// --- Main Component ---

export default function OpenPlayDiscoveryV2({ sessions, loadingSessions, onJoinSession, searchValue, onSearchChange, selectedDate, onDateChange }: Props) {
    const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
        open_now: false,
        free_slots: true,
        beginner_friendly: false,
        followed_clubs: false,
    });

    const toggleFilter = (k: FilterKey) => setFilters(p => ({ ...p, [k]: !p[k] }));

    const groupedSessions = useMemo(() => {
        let list = [...sessions];
        
        // Filter by search
        const q = searchValue.toLowerCase();
        if (q) {
            list = list.filter(s => s.club_name.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || s.court_name?.toLowerCase().includes(q));
        }

        // Filter by date
        list = list.filter(s => s.session_date.startsWith(selectedDate));

        if (filters.free_slots) {
            list = list.filter(s => s.confirmed_count < s.max_players);
        }
        
        // Group by club
        const groups: Record<string, { clubName: string; clubId: string; sessions: OpenPlaySession[] }> = {};
        list.forEach(s => {
            if (!groups[s.club_id]) {
                groups[s.club_id] = { clubName: s.club_name, clubId: s.club_id, sessions: [] };
            }
            groups[s.club_id].sessions.push(s);
        });

        // Sort sessions within groups
        Object.values(groups).forEach(g => {
            g.sessions.sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());
        });

        return Object.values(groups).sort((a, b) => a.clubName.localeCompare(b.clubName));
    }, [sessions, searchValue, filters, selectedDate]);

    return (
        <div className="flex flex-col gap-10 animate-in fade-in duration-500">
            
            {/* Header Module */}
            <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl p-8 lg:p-12 shadow-2xl group">
                <HUDCorner className="top-4 left-4" />
                <HUDCorner className="top-4 right-4 rotate-90" />
                
                <div className="absolute inset-0 opacity-10 grayscale transition-all group-hover:opacity-20 group-hover:grayscale-0">
                    <Image src="/hero-athlete.jpg.png" alt="Hero" fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#050b14] via-[#050b14]/90 to-transparent" />
                </div>

                <div className="relative flex flex-col lg:flex-row items-center justify-between gap-12">
                    <div className="max-w-xl space-y-6 text-center lg:text-left">
                        <div className="space-y-4">
                            <StatusBadge label="Open Play Discovery Active" />
                            <h1 className="mt-1 text-4xl font-black tracking-tight text-white lg:text-5xl uppercase italic">
                                Tactical <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-500">Schedule</span>
                            </h1>
                            <p className="text-lg text-slate-400 leading-relaxed font-light">
                                Browse and deploy to scheduled <span className="text-white italic font-medium">Open Play</span> sessions. Filter by date to plan your next engagement.
                            </p>
                        </div>
                    </div>

                    <div className="w-full lg:max-w-md space-y-6">
                        <SearchBar value={searchValue} onChange={onSearchChange} />
                        <div className="space-y-3">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] px-1">Engagement Date</p>
                            <DateSelector selected={selectedDate} onSelect={onDateChange} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Content Module */}
            <div className="space-y-8">
                <div className="flex items-end justify-between px-2">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Scheduled Operations</p>
                        <h2 className="text-2xl font-black uppercase italic tracking-tight">Active Deployments</h2>
                    </div>
                    <div className="flex items-center gap-4">
                         {(Object.keys(filters) as FilterKey[]).map(k => (
                            <button 
                                key={k} 
                                onClick={() => toggleFilter(k)}
                                className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
                                    filters[k] ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border-white/5 bg-white/5 text-slate-500"
                                }`}
                            >
                                {k.replace(/_/g, " ")}
                            </button>
                        ))}
                    </div>
                </div>

                {loadingSessions ? (
                    <div className="space-y-8">
                        {[1,2].map(i => (
                            <div key={i} className="space-y-4">
                                <div className="h-6 w-48 bg-white/5 rounded-lg animate-pulse" />
                                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                    {[1,2,3].map(j => <div key={j} className="h-48 rounded-[2rem] border border-white/5 bg-white/[0.02] animate-pulse" />)}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : groupedSessions.length === 0 ? (
                    <div className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-20 text-center">
                        <div className="relative z-10 space-y-4">
                            <span className="text-5xl block opacity-20 animate-float">📡</span>
                            <h3 className="text-xl font-black uppercase italic tracking-tight text-white/40">No Sessions Detected</h3>
                            <p className="text-sm text-slate-600 font-light max-w-sm mx-auto">No open play missions found for the selected date. Try selecting another date or adjusting filters.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {groupedSessions.map(group => (
                            <section key={group.clubId} className="space-y-6">
                                <div className="flex items-center gap-4 px-2">
                                    <h3 className="text-xl font-black uppercase italic tracking-tight text-white">{group.clubName}</h3>
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                                    <Link href={`/clubs/${group.clubId}`} className="text-[10px] font-black uppercase tracking-widest text-cyan-500 hover:text-cyan-400 transition-colors">View Facility HQ →</Link>
                                </div>

                                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                                    {group.sessions.map(session => {
                                        const meta = SPORTS_META[session.sport] || SPORTS_META.pickleball;
                                        const isFull = session.confirmed_count >= session.max_players;
                                        const startTime = new Date(session.session_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        
                                        return (
                                            <article key={session.id} className={`group relative overflow-hidden rounded-[2rem] border transition-all hover:-translate-y-2 hover:shadow-2xl ${
                                                session.is_joined ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/5 bg-[#0a111a]"
                                            }`}>
                                                <div className="absolute inset-0 opacity-[0.05] grayscale transition-all group-hover:opacity-[0.1] group-hover:grayscale-0">
                                                    <Image src={meta.image} alt={meta.label} fill className="object-cover" />
                                                </div>
                                                <HUDCorner className="top-4 left-4" />
                                                
                                                <div className="relative p-6 space-y-5">
                                                    <div className="flex items-start justify-between">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xl">{meta.icon}</span>
                                                                <h4 className={`text-lg font-black uppercase italic tracking-tight text-white group-hover:${meta.accent} transition-colors`}>{session.title}</h4>
                                                            </div>
                                                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{session.court_name || "Main Arena"}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-lg font-black italic text-cyan-400 leading-none">{startTime}</p>
                                                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">START TIME</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="rounded-2xl bg-white/5 p-3 border border-white/5">
                                                            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-600">Access Fee</p>
                                                            <p className="mt-1 text-xs font-black italic text-white">₱{Math.round(session.price_per_head)}</p>
                                                        </div>
                                                        <div className="rounded-2xl bg-white/5 p-3 border border-white/5">
                                                            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-600">Capacity</p>
                                                            <p className="mt-1 text-xs font-black italic text-white">{session.max_players} Players</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                            <span>Squad Status</span>
                                                            <span>{session.confirmed_count}/{session.max_players}</span>
                                                        </div>
                                                        <DataBar value={session.confirmed_count} max={session.max_players} color={isFull ? "bg-amber-500" : `bg-gradient-to-r from-cyan-500 to-blue-600`} />
                                                    </div>

                                                    <div className="pt-2">
                                                        {session.is_joined ? (
                                                            <div className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                                Enrolled
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                disabled={isFull}
                                                                onClick={() => onJoinSession(session.id)}
                                                                className={`w-full group/btn relative overflow-hidden rounded-xl py-3 text-[10px] font-black uppercase tracking-[0.2em] transition ${
                                                                    isFull ? "bg-white/5 text-slate-500 cursor-not-allowed" : "bg-white text-black hover:scale-[1.02] active:scale-[0.98]"
                                                                }`}
                                                            >
                                                                <span className="relative z-10">{isFull ? "Mission Full" : "Request Deployment"}</span>
                                                                {!isFull && <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/5 to-transparent transition-transform group-hover/btn:translate-x-full duration-1000" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
