"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Image from "next/image";
import { ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface StandaloneCourt {
    id:             string;
    name:           string;
    sport:          string | null;
    surface:        string | null;
    is_indoor:      boolean | null;
    lighting:       string | null;
    capacity:       number | null;
    notes:          string | null;
    status:         string;
    image_url:      string | null;
    address:        string | null;
    region_code:    string | null;
    province_code:  string | null;
    city_mun_code:  string | null;
    price_per_hour: number | null;
    created_by:     string | null;
    is_available?:  boolean;
}

interface ClubFacility {
    id:           string;
    name:         string;
    description:  string | null;
    sport:        string | null;
    category:     string | null;
    member_count: number;
    court_count:  number;
    logo_url:     string | null;
    cover_url:    string | null;
}

interface CourtBooking {
    id: string;
    court_name: string;
    sport: string;
    scheduled_at: string;
    duration_hours: number;
    status: string;
    is_indoor: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SPORT_OPTIONS = [
    { value: "pickleball",   label: "Pickleball",   emoji: "🏓" },
    { value: "badminton",    label: "Badminton",    emoji: "🏸" },
    { value: "lawn_tennis",  label: "Lawn Tennis",  emoji: "🎾" },
    { value: "table_tennis", label: "Table Tennis", emoji: "🏓" },
];

const SURFACE_MATERIALS = ["Hardcourt", "Wood", "Polyurethane", "Concrete", "Asphalt", "Acrylic", "Grass", "Clay"];

const SESSION_TYPES = [
    { value: "private", label: "Private Booking", desc: "Reserve the full court for your group" },
    { value: "open_play", label: "Open Play", desc: "Join an existing group session" },
    { value: "ranked", label: "Ranked Match", desc: "Competitive matchmaking sessions" },
];

const SPORT_META: Record<string, { label: string; color: string; bg: string; border: string; accent: string; emoji: string }> = {
    badminton:    { label: "Badminton",    color: "text-fuchsia-400", bg: "bg-fuchsia-400/10", border: "border-fuchsia-400/20", accent: "shadow-fuchsia-500/20", emoji: "🏸" },
    pickleball:   { label: "Pickleball",   color: "text-cyan-400",    bg: "bg-cyan-400/10",    border: "border-cyan-400/20",    accent: "shadow-cyan-500/20",    emoji: "🏓" },
    lawn_tennis:  { label: "Lawn Tennis",  color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", accent: "shadow-emerald-500/20", emoji: "🎾" },
    table_tennis: { label: "Table Tennis", color: "text-orange-400",  bg: "bg-orange-400/10",  border: "border-orange-400/20",  accent: "shadow-orange-500/20",  emoji: "🏓" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function formatClubCategory(category: string | null) {
    if (!category) return null;
    return category
        .split(/[_-]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CourtsPage() {
    const [courts,         setCourts]         = useState<StandaloneCourt[]>([]);
    const [clubFacilities, setClubFacilities] = useState<ClubFacility[]>([]);
    const [bookings,       setBookings]       = useState<CourtBooking[]>([]);
    const [loading,        setLoading]        = useState(true);
    
    // UI State
    const [activeTab,  setActiveTab] = useState<"discovery" | "dashboard">("discovery");
    
    // Search & Filter State
    const [search,     setSearch]    = useState("");
    const [sport,      setSport]     = useState("");
    const [date,       setDate]      = useState(todayIso());
    const [surface,    setSurface]   = useState<string[]>([]);
    const [isIndoor,   setIsIndoor]  = useState<boolean | null>(null);
    const [sessionType, setSessionType] = useState("private");

    const [viewMode,   setViewMode]  = useState<"grid" | "map">("grid");
    const [hoveredCourt, setHoveredCourt] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const token = getAccessToken();
        const courtParams = new URLSearchParams();
        const clubParams = new URLSearchParams({ mode: "explore" });
        if (sport) {
            courtParams.set("sport", sport);
            clubParams.set("sport", sport);
        }
        if (search) {
            courtParams.set("q", search);
            clubParams.set("q", search);
        }
        
        try {
            const [courtsRes, clubsRes, bookingsRes] = await Promise.all([
                fetch(`/api/courts?${courtParams}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
                token ? fetch(`/api/clubs?${clubParams}`, { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null),
                token ? fetch("/api/courts/my-bookings", { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null)
            ]);

            if (courtsRes.ok) {
                const d = await courtsRes.json();
                setCourts((d.courts ?? []).map((c: StandaloneCourt) => ({ ...c, is_available: Math.random() > 0.3 })));
            } else {
                setCourts([]);
            }
            if (clubsRes && clubsRes.ok) {
                const d = await clubsRes.json();
                setClubFacilities(Array.isArray(d) ? d : []);
            } else {
                setClubFacilities([]);
            }
            if (bookingsRes && bookingsRes.ok) {
                const d = await bookingsRes.json();
                setBookings(d.bookings ?? []);
            }
        } finally {
            setLoading(false);
        }
    }, [sport, search]);

    useEffect(() => {
        const t = setTimeout(fetchData, 300);
        return () => clearTimeout(t);
    }, [fetchData]);

    const filteredCourts = useMemo(() => {
        return courts.filter(c => {
            if (surface.length > 0 && c.surface && !surface.includes(c.surface)) return false;
            if (isIndoor !== null && c.is_indoor !== isIndoor) return false;
            return true;
        });
    }, [courts, surface, isIndoor]);

    const hasDiscoveryResults = clubFacilities.length > 0 || filteredCourts.length > 0;

    const toggleSurface = (s: string) => {
        setSurface(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    };

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                
                <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/10 blur-[120px] rounded-full" />
            </div>

            <NavBar backHref="/dashboard" backLabel="DASHBOARD" />

            <main className="relative z-10 max-w-[1600px] mx-auto px-4 py-8 pb-32 pt-24 space-y-8">
                
                {/* GLOBAL TABS */}
                <div className="inline-flex items-center gap-1 bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-1 self-start mb-8">
                    <button onClick={() => setActiveTab("discovery")}
                        className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "discovery" ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white"}`}>
                        Hub Discovery
                    </button>
                    <button onClick={() => setActiveTab("dashboard")}
                        className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "dashboard" ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white"}`}>
                        Operations Intel
                    </button>
                </div>

                {activeTab === "discovery" ? (
                    <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-700">
                        {/* LEFT SIDEBAR: Advanced Filters */}
                        <aside className="w-full lg:w-80 shrink-0 space-y-6">
                            <section className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-6 space-y-8 shadow-2xl">
                                <div>
                                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500 mb-6">Tactical Filters</h2>
                                    
                                    {/* Session Type */}
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Mission Protocol</label>
                                        <div className="grid grid-cols-1 gap-2">
                                            {SESSION_TYPES.map(type => (
                                                <button
                                                    key={type.value}
                                                    onClick={() => setSessionType(type.value)}
                                                    className={`flex flex-col items-start p-3 rounded-2xl border transition-all text-left ${
                                                        sessionType === type.value
                                                            ? "bg-cyan-500/10 border-cyan-500/30 text-white"
                                                            : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
                                                    }`}
                                                >
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{type.label}</span>
                                                    <span className="text-[8px] font-medium opacity-60 mt-0.5 leading-tight">{type.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Date Picker */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Deployment Date</label>
                                    <input 
                                        type="date" 
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-cyan-500/30 transition-all uppercase"
                                    />
                                </div>

                                {/* Sport Selector */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Combat Discipline</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SPORT_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setSport(sport === opt.value ? "" : opt.value)}
                                                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                                                    sport === opt.value
                                                        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                                                        : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
                                                }`}
                                            >
                                                <span className="text-sm">{opt.emoji}</span>
                                                <span className="text-[9px] font-black uppercase tracking-widest truncate">{opt.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Surface Materials */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Terrain Composition</label>
                                    <div className="flex flex-wrap gap-2">
                                        {SURFACE_MATERIALS.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => toggleSurface(s)}
                                                className={`px-3 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all ${
                                                    surface.includes(s)
                                                        ? "bg-purple-500/20 border-purple-500/30 text-purple-400"
                                                        : "bg-white/[0.02] border-white/5 text-slate-600 hover:text-slate-400"
                                                }`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Setting Toggle */}
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Atmospheric Setting</label>
                                    <div className="flex p-1 bg-white/[0.02] border border-white/5 rounded-xl">
                                        {[
                                            { val: null, label: "ALL" },
                                            { val: true, label: "INDOOR" },
                                            { val: false, label: "OUTDOOR" }
                                        ].map(opt => (
                                            <button
                                                key={String(opt.val)}
                                                onClick={() => setIsIndoor(opt.val)}
                                                className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${
                                                    isIndoor === opt.val
                                                        ? "bg-white/10 text-white shadow-xl"
                                                        : "text-slate-600 hover:text-slate-400"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </aside>

                        {/* CENTRAL CONTENT: Hub Discovery */}
                        <div className="flex-1 space-y-8 min-w-0">
                            
                            {/* Header & Search */}
                            <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-8 h-[1px] bg-cyan-500/50" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500/70">Intelligence Feed</p>
                                    </div>
                                    <h1 className="text-4xl lg:text-5xl font-black text-white uppercase italic tracking-tighter">Court Rental</h1>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Club hubs and independent courts synchronized across every sport.</p>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="SEARCH HUBS..."
                                            className="bg-[#0a111a]/60 border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-[10px] font-black text-white outline-none focus:border-cyan-500/30 transition-all placeholder:text-slate-700 w-64"
                                        />
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600">🔍</span>
                                    </div>
                                    <div className="flex bg-white/[0.02] border border-white/5 rounded-xl p-1">
                                        <button 
                                            onClick={() => setViewMode("grid")}
                                            className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white/10 text-cyan-400" : "text-slate-600"}`}
                                        >
                                            ⊞
                                        </button>
                                        <button 
                                            onClick={() => setViewMode("map")}
                                            className={`p-2 rounded-lg transition-all ${viewMode === "map" ? "bg-white/10 text-cyan-400" : "text-slate-600"}`}
                                        >
                                            🗺️
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {/* Main View Area */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="space-y-1">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">Club Facilities</h2>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Open every club rental network by sport.</p>
                                    </div>
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{clubFacilities.length} Hubs</span>
                                </div>

                                {loading ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`club-skeleton-${i}`} />)}
                                    </div>
                                ) : clubFacilities.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                        {clubFacilities.map(club => (
                                            <ClubRentalCard key={club.id} club={club} date={date} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 text-center space-y-3 bg-white/[0.01] border border-dashed border-white/5 rounded-[3rem]">
                                        <span className="text-3xl opacity-20">🏟️</span>
                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No club hubs matched the active sport filter.</p>
                                    </div>
                                )}
                            </section>

                            <div className="flex items-center justify-between px-2">
                                <div className="space-y-1">
                                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">Independent Courts</h2>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Direct rentals outside club-admin hubs.</p>
                                </div>
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{filteredCourts.length} Courts</span>
                            </div>

                            {viewMode === "grid" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {loading ? (
                                        Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                                    ) : filteredCourts.length > 0 ? (
                                        filteredCourts.map(court => (
                                            <CourtCard key={court.id} court={court} />
                                        ))
                                    ) : (
                                        <div className="col-span-full py-20 text-center space-y-4 bg-white/[0.01] border border-dashed border-white/5 rounded-[3rem]">
                                            <span className="text-4xl opacity-20">📡</span>
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{hasDiscoveryResults ? "No standalone courts matched the terrain filter." : "No matching facilities detected in current sector."}</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* INTERACTIVE COURT MAP VIEW */
                                <section className="relative aspect-[16/9] w-full bg-[#0a111a] border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl p-12 flex items-center justify-center">
                                    <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
                                    
                                    <div className="relative z-10 grid grid-cols-4 gap-8 max-w-5xl w-full">
                                        {filteredCourts.length > 0 ? filteredCourts.map((court, i) => (
                                            <div 
                                                key={court.id}
                                                className="relative group"
                                                onMouseEnter={() => setHoveredCourt(court.id)}
                                                onMouseLeave={() => setHoveredCourt(null)}
                                            >
                                                {/* Court Rectangle */}
                                                <div className={`aspect-[3/5] rounded-xl border-2 transition-all duration-500 cursor-pointer flex items-center justify-center overflow-hidden relative ${
                                                    court.is_available 
                                                        ? "border-emerald-500/20 bg-emerald-500/5 group-hover:border-emerald-400 group-hover:shadow-[0_0_30px_rgba(52,211,153,0.2)]" 
                                                        : "border-red-500/20 bg-red-500/5 opacity-40 grayscale pointer-events-none"
                                                }`}>
                                                    {/* Tennis Court Lines */}
                                                    <div className="absolute inset-2 border border-white/10 flex flex-col">
                                                        <div className="flex-1 border-b border-white/10" />
                                                        <div className="h-0 border-b-2 border-white/30" />
                                                        <div className="flex-1" />
                                                    </div>
                                                    
                                                    <span className={`text-xl font-black italic transition-all duration-500 ${court.is_available ? "text-emerald-500/40 group-hover:text-emerald-400 group-hover:scale-125" : "text-red-500/40"}`}>
                                                        {i + 1}
                                                    </span>

                                                    {/* Availability Glow */}
                                                    {court.is_available && (
                                                        <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    )}
                                                </div>

                                                {/* GLASSMORPHIC DETAIL CARD (HOVER) */}
                                                {hoveredCourt === court.id && (
                                                    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-4 w-56 animate-in fade-in zoom-in duration-200">
                                                        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[1.5rem] p-4 shadow-2xl">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <span className="text-[9px] font-black uppercase text-cyan-400 tracking-widest">COURT {i + 1}</span>
                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[7px] font-black uppercase">AVAILABLE</span>
                                                            </div>
                                                            <h4 className="text-[11px] font-black uppercase italic text-white truncate">{court.name}</h4>
                                                            <div className="mt-3 space-y-1.5 pt-3 border-t border-white/5">
                                                                <div className="flex justify-between text-[8px] font-black uppercase">
                                                                    <span className="text-slate-500">Surface</span>
                                                                    <span className="text-white">{court.surface || "Synthetic"}</span>
                                                                </div>
                                                                <div className="flex justify-between text-[8px] font-black uppercase">
                                                                    <span className="text-slate-500">Next Slot</span>
                                                                    <span className="text-cyan-400">14:00 PM</span>
                                                                </div>
                                                            </div>
                                                            <Link 
                                                                href={`/courts/${court.id}`}
                                                                className="mt-4 block w-full py-2 bg-white text-black text-[8px] font-black uppercase tracking-widest text-center rounded-lg hover:bg-cyan-400 transition-colors"
                                                            >
                                                                Initialize Booking
                                                            </Link>
                                                        </div>
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white/10" />
                                                    </div>
                                                )}
                                            </div>
                                        )) : (
                                            <div className="col-span-full py-16 text-center space-y-3">
                                                <span className="text-3xl opacity-20">🗺️</span>
                                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No standalone courts are available for the active filters.</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Map Legend */}
                                    <div className="absolute bottom-8 right-8 flex gap-6 px-6 py-3 bg-[#050b14]/80 backdrop-blur-md border border-white/5 rounded-2xl">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Operational</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-red-500/40" />
                                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">Booked / Offline</span>
                                        </div>
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                ) : (
                    /* COURT RENTAL DASHBOARD & ANALYTICS */
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-in slide-in-from-right duration-700">
                        
                        {/* Play Statistics Card */}
                        <section className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-[3rem] p-8 space-y-8 shadow-2xl">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">Play Statistics</h2>
                            
                            <div className="space-y-8">
                                <div className="h-48 relative">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                        minWidth={0}
                                        initialDimension={{ width: 320, height: 192 }}
                                    >
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { name: 'Wins', value: 45 },
                                                    { name: 'Losses', value: 15 }
                                                ]}
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={8}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                <Cell fill="#06b6d4" />
                                                <Cell fill="#ef4444" opacity={0.1} />
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-3xl font-black italic text-white leading-none">60</span>
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-2">Hub Hours</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    <StatRow label="Deployment Hours" value="92.5H" color="text-cyan-400" />
                                    <StatRow label="Tactical Win Rate" value="75%" color="text-emerald-400" />
                                    <StatRow label="Primary Terrain" value="Wood (60%)" color="text-purple-400" />
                                </div>
                            </div>
                        </section>

                        {/* Upcoming Reservations List */}
                        <div className="xl:col-span-2 space-y-8">
                            <section className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-[3rem] p-8 space-y-8 shadow-2xl">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">Upcoming Reservations</h2>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{bookings.length} DEPLOYMENTS</span>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {bookings.length > 0 ? (
                                        bookings.slice(0, 4).map(booking => (
                                            <BookingCard key={booking.id} booking={booking} />
                                        ))
                                    ) : (
                                        <div className="py-20 text-center border border-dashed border-white/10 rounded-[3rem] bg-white/[0.01]">
                                            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No scheduled missions found.</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                    </div>
                )}
            </main>
        </div>
    );
}

// ── Components ─────────────────────────────────────────────────────────────

function BookingCard({ booking }: { booking: CourtBooking }) {
    const meta = SPORT_META[booking.sport] || SPORT_META.pickleball;
    const date = new Date(booking.scheduled_at);
    
    return (
        <div className="group bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-white/10 transition-all">
            <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl ${meta.bg} border ${meta.border} flex items-center justify-center text-3xl shadow-2xl group-hover:scale-110 transition-transform`}>
                    {meta.emoji}
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">{booking.is_indoor ? "Indoor Hub" : "Outdoor Field"}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{booking.duration_hours}H Deployment</span>
                    </div>
                    <h4 className="text-xl font-black text-white uppercase italic tracking-tighter truncate">{booking.court_name}</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        {date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} • {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-6">
                {!booking.is_indoor && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-cyan-500/5 border border-cyan-500/10 rounded-xl">
                        <span className="text-xl">☀️</span>
                        <div>
                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Weather</p>
                            <p className="text-[10px] font-black text-cyan-400 italic">28°C CLEAR</p>
                        </div>
                    </div>
                )}
                <div className="flex gap-2">
                    <button className="px-6 py-3 bg-white/[0.05] border border-white/5 text-[9px] font-black uppercase text-slate-500 hover:text-white rounded-xl transition-all">Modify</button>
                    <button className="px-6 py-3 bg-red-500/10 border border-red-500/20 text-[9px] font-black uppercase text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all">Abort</button>
                </div>
            </div>
        </div>
    );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-colors">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
            <span className={`text-[10px] font-black uppercase italic ${color} group-hover:scale-105 transition-transform`}>{value}</span>
        </div>
    );
}

function CourtCard({ court }: { court: StandaloneCourt }) {
    const meta = court.sport ? SPORT_META[court.sport] : SPORT_META.pickleball;
    
    return (
        <div className="group relative bg-[#0a111a]/60 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-white/20 transition-all duration-500 shadow-2xl backdrop-blur-md">
            <div className="relative h-48 bg-[#050b14] overflow-hidden">
                {court.image_url ? (
                    <img src={court.image_url} alt={court.name} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" />
                ) : (
                    <div className={`absolute inset-0 opacity-20 ${meta.bg}`} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a111a] to-transparent" />
                
                <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-black/40 backdrop-blur-md text-[8px] font-black uppercase tracking-widest ${court.is_available ? "text-emerald-400 border-emerald-500/20" : "text-red-400 border-red-500/20"}`}>
                        <span className={`w-1 h-1 rounded-full ${court.is_available ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                        {court.is_available ? "Operational" : "Booked"}
                    </span>
                    <span className={`inline-flex px-3 py-1 rounded-full border bg-black/40 backdrop-blur-md text-[8px] font-black uppercase tracking-widest ${meta.color} ${meta.border}`}>
                        {meta.label}
                    </span>
                </div>

                {court.price_per_hour && (
                    <div className="absolute top-6 right-6 px-3 py-1.5 rounded-xl bg-cyan-500 text-black font-black italic text-sm shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                        ₱{court.price_per_hour}<span className="text-[8px] opacity-60 not-italic ml-0.5">/HR</span>
                    </div>
                )}
            </div>

            <div className="p-8 pt-4 space-y-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] font-black uppercase text-cyan-500 tracking-[0.3em]">HUB ID: {court.id.slice(0, 4)}</span>
                    </div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter truncate group-hover:text-cyan-400 transition-colors">
                        {court.name}
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold line-clamp-1 flex items-center gap-2">
                        <span className="text-sm">📍</span> {court.address || "Sector Restricted"}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                    <div className="space-y-1">
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Surface</span>
                        <p className="text-[10px] font-black text-white uppercase italic">{court.surface || "Synthetic"}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Atmosphere</span>
                        <p className="text-[10px] font-black text-white uppercase italic">{court.is_indoor ? "Indoor Hub" : "Outdoor Field"}</p>
                    </div>
                </div>

                <Link 
                    href={`/courts/${court.id}`}
                    className="flex items-center justify-center w-full py-4 rounded-2xl bg-white/[0.03] border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-white hover:text-black hover:scale-[1.02] shadow-xl group/btn"
                >
                    Initialize Booking
                    <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                </Link>
            </div>
        </div>
    );
}

function ClubRentalCard({ club, date }: { club: ClubFacility; date: string }) {
    const meta = club.sport ? SPORT_META[club.sport] : SPORT_META.pickleball;
    const categoryLabel = formatClubCategory(club.category);

    return (
        <div className="group relative bg-[#0a111a]/60 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-white/20 transition-all duration-500 shadow-2xl backdrop-blur-md">
            <div className="relative h-48 bg-[#050b14] overflow-hidden">
                {club.cover_url ? (
                    <Image src={club.cover_url} alt={club.name} fill className="object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" />
                ) : (
                    <div className={`absolute inset-0 opacity-20 ${meta.bg}`} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a111a] to-transparent" />

                <div className="absolute top-6 left-6 flex flex-col gap-2">
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-black/40 backdrop-blur-md text-[8px] font-black uppercase tracking-widest ${meta.color} ${meta.border}`}>
                        <span>{meta.emoji}</span>
                        {meta.label}
                    </span>
                    {categoryLabel && (
                        <span className="inline-flex px-3 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-md text-[8px] font-black uppercase tracking-widest text-slate-300">
                            {categoryLabel}
                        </span>
                    )}
                </div>

                <div className="absolute right-6 bottom-6 h-16 w-16 rounded-[1.25rem] overflow-hidden border border-white/10 bg-[#0a111a]/80 backdrop-blur-md flex items-center justify-center">
                    {club.logo_url ? (
                        <Image src={club.logo_url} alt={club.name} fill className="object-cover" />
                    ) : (
                        <span className="text-3xl">{meta.emoji}</span>
                    )}
                </div>
            </div>

            <div className="p-8 pt-4 space-y-6">
                <div className="space-y-2">
                    <span className="text-[8px] font-black uppercase text-cyan-500 tracking-[0.3em]">CLUB HUB</span>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter truncate group-hover:text-cyan-400 transition-colors">
                        {club.name}
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold line-clamp-2 min-h-[2.5rem]">
                        {club.description || "Club-managed courts ready for sport-specific bookings."}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                    <div className="space-y-1">
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Operators</span>
                        <p className="text-[10px] font-black text-white uppercase italic">{club.member_count}</p>
                    </div>
                    <div className="space-y-1">
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Courts</span>
                        <p className="text-[10px] font-black text-white uppercase italic">{club.court_count}</p>
                    </div>
                </div>

                <Link
                    href={`/clubs/${club.id}?tab=court-rental&date=${date}`}
                    className="flex flex-col items-center justify-center w-full py-4 rounded-2xl bg-white/[0.03] border border-white/10 text-white transition-all hover:bg-white hover:text-black hover:scale-[1.02] shadow-xl group/btn gap-1"
                >
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
                        View Club Courts
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                    <span className="text-[7px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">Access Availability Grid</span>
                </Link>
            </div>
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2.5rem] overflow-hidden animate-pulse">
            <div className="h-48 bg-white/5" />
            <div className="p-8 space-y-4">
                <div className="h-4 bg-white/10 rounded w-1/4" />
                <div className="h-6 bg-white/10 rounded w-3/4" />
                <div className="h-20 bg-white/5 rounded" />
            </div>
        </div>
    );
}
