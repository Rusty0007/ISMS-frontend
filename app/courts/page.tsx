"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import ImageUpload from "@/components/ImageUpload";

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORT_OPTIONS = [
    { value: "",             label: "All Sports"   },
    { value: "badminton",    label: "🏸 Badminton"  },
    { value: "pickleball",   label: "🏓 Pickleball" },
    { value: "lawn_tennis",  label: "🎾 Tennis"     },
    { value: "table_tennis", label: "🏓 Table Tennis"},
];

const SPORT_EMOJI: Record<string, string> = {
    badminton:    "🏸",
    pickleball:   "🏓",
    lawn_tennis:  "🎾",
    table_tennis: "🏓",
};

const SPORT_SURFACES: Record<string, string[]> = {
    badminton:    ["Wooden", "PVC Mat", "Synthetic", "Vinyl"],
    pickleball:   ["Acrylic", "Concrete", "Modular Tiles", "Asphalt"],
    lawn_tennis:  ["Hard Court", "Clay", "Grass", "Synthetic Grass"],
    table_tennis: ["Wood", "Rubber Mat", "Vinyl"],
    default:      ["Wooden", "Concrete", "Acrylic", "Synthetic"],
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CourtsPage() {
    const router = useRouter();

    const [courts,     setCourts]    = useState<StandaloneCourt[]>([]);
    const [loading,    setLoading]   = useState(true);
    const [search,     setSearch]    = useState("");
    const [sport,      setSport]     = useState("");
    const [showForm,   setShowForm]  = useState(false);
    const [toast,      setToast]     = useState<string | null>(null);
    const [newCourtId, setNewCourtId] = useState<string | null>(null);

    // Form state
    const [fName,     setFName]     = useState("");
    const [fSport,    setFSport]    = useState("");
    const [fSurface,  setFSurface]  = useState("");
    const [fIndoor,   setFIndoor]   = useState(true);
    const [fCapacity, setFCapacity] = useState("");
    const [fAddress,  setFAddress]  = useState("");
    const [fRegion,   setFRegion]   = useState("");
    const [fProvince, setFProvince] = useState("");
    const [fCity,     setFCity]     = useState("");
    const [fNotes,    setFNotes]    = useState("");
    const [fPrice,    setFPrice]    = useState("");
    const [submitting, setSubmitting] = useState(false);

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
    }

    const fetchCourts = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (sport)  params.set("sport", sport);
        if (search) params.set("q", search);
        const res = await fetch(`/api/courts?${params}`);
        if (res.ok) {
            const d = await res.json();
            setCourts(d.courts ?? []);
        }
        setLoading(false);
    }, [sport, search]);

    useEffect(() => {
        const t = setTimeout(fetchCourts, 300);
        return () => clearTimeout(t);
    }, [fetchCourts]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!fName.trim()) return;
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        setSubmitting(true);
        try {
            const res = await fetch("/api/courts", {
                method:  "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name:           fName.trim(),
                    sport:          fSport || null,
                    surface:        fSurface || null,
                    is_indoor:      fIndoor,
                    capacity:       fCapacity ? parseInt(fCapacity) : null,
                    address:        fAddress || null,
                    region_code:    fRegion || null,
                    province_code:  fProvince || null,
                    city_mun_code:  fCity || null,
                    notes:          fNotes || null,
                    price_per_hour: fPrice ? parseFloat(fPrice) : null,
                }),
            });
            if (res.ok) {
                const d = await res.json();
                const newCourt: StandaloneCourt = d.court;
                setCourts(prev => [newCourt, ...prev]);
                setNewCourtId(newCourt.id);
                setShowForm(false);
                setFName(""); setFSport(""); setFSurface(""); setFIndoor(true);
                setFCapacity(""); setFAddress(""); setFRegion(""); setFProvince("");
                setFCity(""); setFNotes(""); setFPrice("");
                showToast("Court registered!");
            } else {
                const d = await res.json().catch(() => ({}));
                showToast(d.detail ?? "Failed to register court.");
            }
        } finally {
            setSubmitting(false);
        }
    }

    const currentUserId = (() => {
        const token = getAccessToken();
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            return payload.sub as string;
        } catch { return null; }
    })();

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col pb-20">
            {/* Premium background gradient & grid */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/5 blur-[120px] rounded-full" />
                <div className="absolute inset-0 opacity-[0.03]"
                    style={{ backgroundImage: `linear-gradient(rgba(6,182,212,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.5) 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />
            </div>

            <NavBar backHref="/dashboard" backLabel="← Dashboard" />

            {toast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/80 backdrop-blur-xl border border-white/10 text-xs font-bold text-white px-6 py-3.5 rounded-2xl shadow-2xl">
                    {toast}
                </div>
            )}

            <main className="relative z-10 max-w-lg mx-auto w-full px-5 py-8 flex flex-col gap-8">

                {/* Header: Premium Hub Style */}
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
                            Court Rental
                        </h1>
                        <p className="text-zinc-500 text-sm font-medium tracking-wide">Book courts fast and easy</p>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 active:scale-90 transition-all shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                        title="Register Court"
                    >
                        <span className="text-2xl font-light">+</span>
                    </button>
                </div>

                {/* Discovery & Search Bar: Futuristic Glassmorphism */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-cyan-500/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative flex items-center bg-zinc-900/40 backdrop-blur-md border border-white/10 rounded-[24px] p-1.5 focus-within:border-cyan-500/40 transition-all">
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Find a sports hub..."
                            className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none"
                        />
                        <div className="h-10 w-px bg-white/5 mx-1" />
                        <select
                            value={sport}
                            onChange={e => setSport(e.target.value)}
                            className="bg-transparent px-3 py-3 text-xs font-bold text-zinc-400 focus:outline-none appearance-none cursor-pointer"
                        >
                            {SPORT_OPTIONS.map(o => (
                                <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
                            ))}
                        </select>
                        <div className="bg-cyan-500 p-3 rounded-[18px] text-zinc-950 shadow-lg shadow-cyan-500/20">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                </div>

                {/* Venue List */}
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Available Sports Hubs</h2>
                        {courts.length > 0 && <span className="text-[10px] font-bold text-cyan-500/60 tracking-wider">{courts.length} venues found</span>}
                    </div>

                    {loading ? (
                        <div className="flex flex-col gap-4 py-10">
                            {[1,2,3].map(i => (
                                <div key={i} className="h-64 rounded-3xl bg-zinc-900/50 animate-pulse border border-white/5" />
                            ))}
                        </div>
                    ) : courts.length === 0 ? (
                        <div className="text-center py-20 bg-zinc-900/20 rounded-[40px] border border-white/5">
                            <div className="text-5xl mb-4 grayscale opacity-30">🏟️</div>
                            <p className="text-zinc-500 text-sm font-medium">No hubs found near you</p>
                            <button onClick={() => {setSearch(""); setSport("");}} className="mt-4 text-xs font-bold text-cyan-400 underline underline-offset-4">Reset Filters</button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {courts.map(court => (
                                <VenueCard
                                    key={court.id}
                                    court={court}
                                    isOwner={!!currentUserId && court.created_by === currentUserId}
                                    onImageUpload={url => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, image_url: url } : c))}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Premium Bottom Navigation Simulation */}
            <div className="fixed bottom-0 left-0 right-0 z-40 px-5 pb-6 pointer-events-none">
                <div className="max-w-md mx-auto h-16 bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-[28px] shadow-2xl flex items-center justify-around px-4 pointer-events-auto">
                    <button className="p-3 text-cyan-400 transition-transform active:scale-90">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                    </button>
                    <button className="p-3 text-zinc-600 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </button>
                    <button className="p-3 text-zinc-600 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    </button>
                    <button className="p-3 text-zinc-600 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </button>
                </div>
            </div>

            {/* Create form slide-up (existing logic) */}
            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center px-0 pb-0">
                    <div className="bg-zinc-900 border-t border-white/10 rounded-t-[40px] w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
                        <div className="sticky top-0 bg-zinc-900/90 backdrop-blur-md border-b border-white/5 px-8 py-6 flex items-center justify-between z-20">
                            <div>
                                <h2 className="font-black text-xl">Register Hub</h2>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">New Venue Application</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full text-zinc-400 hover:text-white transition-colors">✕</button>
                        </div>
                        <form onSubmit={handleCreate} className="p-8 flex flex-col gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] block mb-2 px-1">Venue Identity</label>
                                    <input
                                        type="text"
                                        value={fName}
                                        onChange={e => setFName(e.target.value)}
                                        placeholder="e.g. Skyline Pickleball Club"
                                        required
                                        className="w-full bg-zinc-800/50 border border-white/5 rounded-[20px] px-5 py-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] block mb-2 px-1">Primary Sport</label>
                                        <select
                                            value={fSport}
                                            onChange={e => { setFSport(e.target.value); setFSurface(""); }}
                                            className="w-full bg-zinc-800/50 border border-white/5 rounded-[20px] px-5 py-4 text-sm text-white focus:outline-none focus:border-cyan-500/30 transition-all appearance-none"
                                        >
                                            <option value="">Any sport</option>
                                            <option value="badminton">Badminton</option>
                                            <option value="pickleball">Pickleball</option>
                                            <option value="lawn_tennis">Lawn Tennis</option>
                                            <option value="table_tennis">Table Tennis</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] block mb-2 px-1">Hourly Rate (₱)</label>
                                        <input
                                            type="number" min={0} step="0.01"
                                            value={fPrice}
                                            onChange={e => setFPrice(e.target.value)}
                                            placeholder="e.g. 150"
                                            className="w-full bg-zinc-800/50 border border-white/5 rounded-[20px] px-5 py-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] block mb-2 px-1">Location Details</label>
                                    <input
                                        type="text"
                                        value={fAddress}
                                        onChange={e => setFAddress(e.target.value)}
                                        placeholder="Full Hub Address"
                                        className="w-full bg-zinc-800/50 border border-white/5 rounded-[20px] px-5 py-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/30 transition-all"
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={submitting || !fName.trim()}
                                className="w-full py-5 rounded-[24px] bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-sm font-black transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 disabled:opacity-50">
                                {submitting ? "Finalizing..." : "Select Sports Hub"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Venue Card: Premium High-Fidelity ───────────────────────────────────────

function VenueCard({
    court,
    isOwner,
    onImageUpload,
}: {
    court:         StandaloneCourt;
    isOwner:       boolean;
    onImageUpload: (url: string) => void;
}) {
    return (
        <div className="group relative bg-zinc-900/40 backdrop-blur-md border border-white/10 rounded-[32px] overflow-hidden flex flex-col transition-all duration-300 hover:border-cyan-500/30 hover:bg-zinc-900/60 hover:-translate-y-1 shadow-xl">
            {/* Hero Image Section */}
            <div className="relative h-60 w-full overflow-hidden">
                <Link href={`/courts/${court.id}`} className="absolute inset-0 z-10" />

                {court.image_url ? (
                    <img src={court.image_url} alt={court.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                ) : (
                    <div className="w-full h-full bg-zinc-800/50 flex flex-col items-center justify-center gap-3">
                        <span className="text-6xl opacity-20">🏟️</span>
                        <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Premium Hub</div>
                    </div>
                )}

                {/* Glassmorphic Badges */}
                <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                    <span className="bg-green-500/80 backdrop-blur-md text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg">
                        Available Today
                    </span>
                    {court.sport && (
                        <span className="bg-zinc-950/40 backdrop-blur-md text-white text-[10px] font-black px-3 py-1.5 rounded-full border border-white/10 uppercase tracking-wider">
                            {SPORT_EMOJI[court.sport]} {court.sport.replace("_", " ")}
                        </span>
                    )}
                </div>

                <div className="absolute top-4 right-4 z-20">
                    <div className="bg-zinc-950/60 backdrop-blur-md border border-white/10 p-2.5 rounded-2xl">
                        <span className="text-cyan-400 font-black text-sm">₱{court.price_per_hour?.toLocaleString() ?? "???"}</span>
                        <span className="text-[10px] text-zinc-500 ml-0.5">/hr</span>
                    </div>
                </div>

                {/* Image Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80" />
            </div>

            {/* Hub Details */}
            <div className="p-6 flex flex-col gap-5">
                <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                        <h3 className="text-xl font-black text-white tracking-tight">{court.name}</h3>
                        <p className="text-xs text-zinc-500 font-medium leading-relaxed max-w-[85%]">
                            {court.address ?? "Premium location information available on request."}
                        </p>
                    </div>
                    {isOwner && (
                        <div className="relative z-20">
                            <ImageUpload
                                currentUrl={null}
                                uploadEndpoint={`/api/upload/court/${court.id}/photo`}
                                onSuccess={onImageUpload}
                                shape="rect"
                                size="sm"
                                placeholder="📷"
                                recommendedSize="1200 × 800 px"
                            />
                        </div>
                    )}
                </div>

                {/* Action Row */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex gap-4">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Contact</span>
                            <span className="text-[11px] text-zinc-400 font-bold">+63 900 000 0000</span>
                        </div>
                        <div className="flex flex-col border-l border-white/10 pl-4">
                            <span className="text-[8px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-0.5">Status</span>
                            <span className="text-[11px] text-cyan-400 font-bold">2 Courts Open</span>
                        </div>
                    </div>

                    <Link
                        href={`/courts/${court.id}`}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                        Select Sports Hub
                    </Link>
                </div>
            </div>
        </div>
    );
}
