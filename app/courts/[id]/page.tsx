"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import ImageUpload from "@/components/ImageUpload";

// ── Types ──────────────────────────────────────────────────────────────────

interface CourtDetail {
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
    owner_name:     string | null;
}

interface Slot {
    start:        string;
    end:          string;
    is_available: boolean;
    booking_id:   string | null;
}

interface Booking {
    id:             string;
    requested_by:   string;
    requester_name: string;
    scheduled_at:   string | null;
    duration_hours: number;
    booking_type:   string;
    status:         string;
    admin_notes:    string | null;
    decided_at:     string | null;
    created_at:     string | null;
}

interface Friend {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SPORT_META: Record<string, { label: string; color: string; bg: string; border: string; accent: string }> = {
    badminton:    { label: "Badminton",    color: "text-fuchsia-400", bg: "bg-fuchsia-400/10", border: "border-fuchsia-400/20", accent: "shadow-fuchsia-500/20" },
    pickleball:   { label: "Pickleball",   color: "text-cyan-400",    bg: "bg-cyan-400/10",    border: "border-cyan-400/20",    accent: "shadow-cyan-500/20"    },
    lawn_tennis:  { label: "Lawn Tennis",  color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", accent: "shadow-emerald-500/20" },
    table_tennis: { label: "Table Tennis", color: "text-orange-400",  bg: "bg-orange-400/10",  border: "border-orange-400/20",  accent: "shadow-orange-500/20"   },
};

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number) {
    const d = new Date(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

function fmtWeekday(iso: string) {
    return new Date(iso).toLocaleDateString([], { weekday: "short" });
}

function fmtDayNum(iso: string) {
    return new Date(iso).toLocaleDateString([], { day: "numeric" });
}

function fmtMonth(iso: string) {
    return new Date(iso).toLocaleDateString([], { month: "long", year: "numeric" });
}

function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CourtHubPage() {
    const { id } = useParams<{ id: string }>();
    const router  = useRouter();

    const [court,      setCourt]      = useState<CourtDetail | null>(null);
    const [loading,    setLoading]    = useState(true);
    const [tab,        setTab]        = useState<"book" | "manage">("book");

    // Book tab
    const [date,       setDate]       = useState(todayIso());
    const [slots,      setSlots]      = useState<Slot[]>([]);
    const [slotsLoad,  setSlotsLoad]  = useState(false);
    const [selected,   setSelected]   = useState<Slot | null>(null);
    const [duration,   setDuration]   = useState(1);
    const [notes,      setNotes]      = useState("");
    const [booking,    setBooking]    = useState(false);
    const [toast,      setToast]      = useState<string | null>(null);

    // Advanced Configuration
    const [sessionType, setSessionType] = useState("private");
    const [equipment, setEquipment] = useState({ paddles: 0, balls: 0, machine: false });
    const [invitees, setInvitees] = useState<Friend[]>([]);
    const [splitPayment, setSplitPayment] = useState(false);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [searchFriend, setSearchFriend] = useState("");

    // Manage tab
    const [mgmtFilter, setMgmtFilter] = useState<"pending_approval" | "approved" | "rejected" | "all">("pending_approval");
    const [bookings,   setBookings]   = useState<Booking[]>([]);
    const [mgmtLoad,   setMgmtLoad]   = useState(false);
    const [acting,     setActing]     = useState<string | null>(null);
    const [rejectId,   setRejectId]   = useState<string | null>(null);
    const [rejectNote, setRejectNote] = useState("");

    const currentUserId = (() => {
        const token = getAccessToken();
        if (!token) return null;
        try { return (JSON.parse(atob(token.split(".")[1])) as { sub: string }).sub; }
        catch { return null; }
    })();

    const isOwner = !!court && court.created_by === currentUserId;

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
    }

    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(todayIso(), i));

    // ── Fetch ──────────────────────────────────────────────────────────────

    const fetchCourt = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/courts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) { router.replace("/courts"); return; }
            setCourt(await res.json() as CourtDetail);
        } finally { setLoading(false); }
    }, [id, router]);

    const fetchFriends = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        try {
            const res = await fetch("/api/friends", { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setFriends(data.friends || []);
            }
        } catch (err) { console.error(err); }
    }, []);

    useEffect(() => { 
        void fetchCourt(); 
        void fetchFriends();
    }, [fetchCourt, fetchFriends]);

    const fetchSlots = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        setSlotsLoad(true);
        try {
            const res = await fetch(`/api/courts/${id}/availability?date=${date}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                setSlots((await res.json() as { slots: Slot[] }).slots);
                setSelected(null);
            }
        } finally { setSlotsLoad(false); }
    }, [id, date]);

    useEffect(() => { if (tab === "book") void fetchSlots(); }, [tab, fetchSlots]);

    const fetchBookings = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        setMgmtLoad(true);
        try {
            const params = mgmtFilter === "all" ? "" : `?status=${mgmtFilter}`;
            const res = await fetch(`/api/courts/${id}/bookings${params}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setBookings((await res.json() as { bookings: Booking[] }).bookings);
        } finally { setMgmtLoad(false); }
    }, [id, mgmtFilter]);

    useEffect(() => { if (tab === "manage" && isOwner) void fetchBookings(); }, [tab, isOwner, fetchBookings]);

    // ── Booking ────────────────────────────────────────────────────────────

    async function handleRent() {
        if (!selected) return;
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        setBooking(true);
        try {
            const res = await fetch(`/api/courts/${id}/rent`, {
                method:  "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ 
                    scheduled_at: new Date(selected.start).toISOString(), 
                    duration_hours: duration, 
                    notes: notes || null,
                    session_type: sessionType,
                    equipment,
                    invitees: invitees.map(f => f.id),
                    split_payment: splitPayment
                }),
            });
            const d = await res.json() as { message?: string; detail?: string };
            if (res.ok) {
                showToast("Mission Parameters Uplinked. Awaiting Tactical Approval.");
                setSelected(null); setNotes("");
                void fetchSlots();
            } else { showToast(d.detail ?? "Protocol Failure."); }
        } finally { setBooking(false); }
    }

    async function handleApprove(bookingId: string) {
        const token = getAccessToken();
        if (!token) return;
        setActing(bookingId);
        try {
            const res = await fetch(`/api/courts/bookings/${bookingId}/approve`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { showToast("Deployment Authorized."); void fetchBookings(); }
            else { const d = await res.json() as { detail?: string }; showToast(d.detail ?? "Authorization Revoked."); }
        } finally { setActing(null); }
    }

    async function handleReject() {
        if (!rejectId) return;
        const token = getAccessToken();
        if (!token) return;
        setActing(rejectId);
        try {
            const params = rejectNote ? `?reason=${encodeURIComponent(rejectNote)}` : "";
            const res = await fetch(`/api/courts/bookings/${rejectId}/reject${params}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { showToast("Mission Cancelled."); setRejectId(null); setRejectNote(""); void fetchBookings(); }
            else { const d = await res.json() as { detail?: string }; showToast(d.detail ?? "System Error."); }
        } finally { setActing(null); }
    }

    function isSlotBookable(slot: Slot): boolean {
        if (!slot.is_available) return false;
        if (duration <= 1) return true;
        const idx = slots.indexOf(slot);
        for (let i = idx; i < idx + (duration * 2); i++) { // duration * 2 because slots are 30min
            if (!slots[i] || !slots[i].is_available) return false;
        }
        return true;
    }

    const filteredFriends = useMemo(() => {
        if (!searchFriend) return [];
        return friends.filter(f =>
            f.first_name.toLowerCase().includes(searchFriend.toLowerCase()) ||
            f.last_name.toLowerCase().includes(searchFriend.toLowerCase())
        ).filter(f => !invitees.find(i => i.id === f.id));
    }, [friends, searchFriend, invitees]);

    // ── Loading ────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050b14] flex items-center justify-center">
                <div className="text-cyan-500 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Syncing Tactical Hub...</div>
            </div>
        );
    }
    if (!court) return null;

    const sportMeta = court.sport ? SPORT_META[court.sport] : SPORT_META.pickleball;

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30 pb-32">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            <NavBar backHref="/courts" backLabel="BACK TO SECTOR" />

            {toast && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-cyan-500 text-black text-[10px] font-black uppercase tracking-widest px-8 py-3 rounded-full shadow-[0_0_30px_rgba(6,182,212,0.4)]">
                    {toast}
                </div>
            )}

            <main className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 pt-24 space-y-8">
                
                {/* HERO SECTION */}
                <section className="relative h-80 rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl group">
                    {court.image_url ? (
                        <img src={court.image_url} alt={court.name} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                    ) : (
                        <div className="w-full h-full bg-[#0a111a]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050b14] via-[#050b14]/40 to-transparent" />
                    
                    <div className="absolute bottom-12 left-12 right-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className={`px-4 py-1 rounded-full border bg-black/40 backdrop-blur-xl text-[9px] font-black uppercase tracking-widest ${sportMeta.color} ${sportMeta.border}`}>
                                    {sportMeta.label}
                                </span>
                                <span className="px-4 py-1 rounded-full border border-white/10 bg-black/40 backdrop-blur-xl text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    {court.surface || "Synthetic Terrain"}
                                </span>
                            </div>
                            <h1 className="text-5xl lg:text-7xl font-black text-white uppercase italic tracking-tighter leading-none">{court.name}</h1>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="text-cyan-500">📍</span> {court.address || "Sector Unspecified"}
                            </p>
                        </div>
                        
                        <div className="flex flex-col items-end gap-3">
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tactical Value</p>
                                <p className="text-4xl font-black text-cyan-400 italic">₱{court.price_per_hour}<span className="text-sm not-italic opacity-40 ml-1">/HR</span></p>
                            </div>
                            {isOwner && (
                                <ImageUpload
                                    currentUrl={null}
                                    uploadEndpoint={`/api/upload/court/${court.id}/photo`}
                                    onSuccess={url => setCourt(prev => prev ? { ...prev, image_url: url } : prev)}
                                    shape="rect" size="sm" placeholder="📷 UPLOAD INTEL" recommendedSize="1600 × 600 px"
                                />
                            )}
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* LEFT COLUMN: Booking Engine */}
                    <div className="lg:col-span-2 space-y-8">
                        
                        {/* Tab Selector */}
                        <div className="flex bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-1 self-start">
                            <button onClick={() => setTab("book")}
                                className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === "book" ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white"}`}>
                                Initiate Booking
                            </button>
                            {isOwner && (
                                <button onClick={() => setTab("manage")}
                                    className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === "manage" ? "bg-white text-black shadow-xl" : "text-slate-500 hover:text-white"}`}>
                                    Command Console
                                </button>
                            )}
                        </div>

                        {tab === "book" ? (
                            <div className="space-y-8">
                                {/* Date Strip */}
                                <section className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">Temporal Synchronization</h2>
                                        <p className="text-[10px] font-black text-white uppercase italic">{fmtMonth(date)}</p>
                                    </div>
                                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                        {weekDates.map(d => {
                                            const isSelected = d === date;
                                            return (
                                                <button key={d} onClick={() => setDate(d)}
                                                    className={`flex flex-col items-center gap-1 px-5 py-4 rounded-2xl min-w-[70px] transition-all border ${
                                                        isSelected
                                                            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                                                            : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10 hover:text-white"
                                                    }`}>
                                                    <span className="text-[9px] font-black uppercase tracking-widest mb-1">{fmtWeekday(d)}</span>
                                                    <span className="text-xl font-black">{fmtDayNum(d)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                {/* Time Grid */}
                                <section className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-[3rem] overflow-hidden shadow-2xl">
                                    <div className="grid grid-cols-[100px_1fr] border-b border-white/5 bg-white/[0.02]">
                                        <div className="p-4 text-[9px] font-black uppercase tracking-widest text-slate-500 text-center border-r border-white/5">Time</div>
                                        <div className="p-4 text-[9px] font-black uppercase tracking-widest text-cyan-500 px-8">Operational Slots</div>
                                    </div>
                                    
                                    {slotsLoad ? (
                                        <div className="p-20 text-center text-[10px] font-black uppercase tracking-[0.4em] text-slate-700 animate-pulse">Syncing Availability...</div>
                                    ) : (
                                        <div className="max-h-[600px] overflow-y-auto no-scrollbar">
                                            {slots.map((slot, idx) => {
                                                const bookable = isSlotBookable(slot);
                                                const isSel    = selected?.start === slot.start;
                                                return (
                                                    <div key={slot.start} className={`grid grid-cols-[100px_1fr] border-b border-white/[0.02] last:border-0 hover:bg-white/[0.01] transition-colors ${idx % 2 === 0 ? "bg-white/[0.01]" : ""}`}>
                                                        <div className="p-4 text-[10px] font-black text-slate-500 text-center flex items-center justify-center border-r border-white/5 tabular-nums">
                                                            {fmtTime(slot.start)}
                                                        </div>
                                                        <div className="p-3 px-6">
                                                            <button
                                                                disabled={!bookable}
                                                                onClick={() => setSelected(isSel ? null : slot)}
                                                                className={`w-full group relative overflow-hidden py-3.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                                                                    !bookable
                                                                        ? "bg-red-500/[0.02] border-red-500/10 text-red-500/30 cursor-not-allowed"
                                                                        : isSel
                                                                            ? "bg-cyan-500 border-cyan-400 text-black shadow-[0_0_30px_rgba(6,182,212,0.3)]"
                                                                            : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-cyan-500/30 hover:text-cyan-400"
                                                                }`}
                                                            >
                                                                {bookable && (
                                                                    <div className={`absolute inset-0 bg-cyan-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ${isSel ? "hidden" : ""}`} />
                                                                )}
                                                                <span className={`w-1.5 h-1.5 rounded-full ${!bookable ? "bg-red-500/30" : isSel ? "bg-black animate-pulse" : "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]"}`} />
                                                                <span className="relative z-10">{!bookable ? "SECURED" : isSel ? "SELECTED" : "AVAILABLE"}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </div>
                        ) : (
                            /* MANAGE VIEW */
                            <div className="space-y-6">
                                <div className="flex gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-1 self-start">
                                    {(["pending_approval", "approved", "rejected", "all"] as const).map(f => (
                                        <button key={f} onClick={() => setMgmtFilter(f)}
                                            className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${mgmtFilter === f ? "bg-white/10 text-white" : "text-slate-600 hover:text-slate-400"}`}>
                                            {f.replace("_", " ")}
                                        </button>
                                    ))}
                                </div>

                                {mgmtLoad ? (
                                    <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-700 animate-pulse">Syncing Command Logs...</div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {bookings.map(b => (
                                            <div key={b.id} className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl">👤</div>
                                                    <div>
                                                        <p className="text-sm font-black text-white uppercase italic">{b.requester_name}</p>
                                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">{b.scheduled_at ? fmtDateTime(b.scheduled_at) : "—"} · {b.duration_hours}H Deployment</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                                        b.status === "approved"         ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                        b.status === "rejected"         ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                                        "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                                                    }`}>
                                                        {b.status.replace("_", " ")}
                                                    </span>
                                                    {b.status === "pending_approval" && (
                                                        <div className="flex gap-2">
                                                            <button onClick={() => void handleApprove(b.id)} disabled={acting === b.id} className="px-4 py-2 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-cyan-400 transition-colors">Approve</button>
                                                            <button onClick={() => setRejectId(b.id)} className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-red-500/30 transition-colors">Decline</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Configuration Panel */}
                    <aside className="space-y-8">
                        <section className="bg-[#0a111a]/60 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl sticky top-24">
                            <div>
                                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500 mb-6">Mission Configuration</h2>
                                
                                <div className="space-y-6">
                                    {/* Protocol Selection */}
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Operation Protocol</label>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[
                                                { id: "private", label: "PRIVATE DEPLOYMENT", icon: "🔒" },
                                                { id: "open_play", label: "OPEN-PLAY SESSION", icon: "🌐" },
                                                { id: "ranked", label: "RANKED ENGAGEMENT", icon: "⚡" }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => setSessionType(opt.id)}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                                                        sessionType === opt.id 
                                                            ? "bg-cyan-500/10 border-cyan-500/30 text-white" 
                                                            : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"
                                                    }`}
                                                >
                                                    <span className="text-lg">{opt.icon}</span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest">{opt.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Skill Integration (Mock) */}
                                    {sessionType === "ranked" && (
                                        <div className="p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 animate-in fade-in slide-in-from-top-2">
                                            <p className="text-[8px] font-black text-cyan-500 uppercase tracking-widest mb-2">NEURAL SYNC REQUIRED</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-white italic">MINIMUM RATING:</span>
                                                <span className="text-xl font-black text-cyan-400">1800 SR</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Duration */}
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Mission Duration</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[1, 2, 3, 4].map(h => (
                                                <button key={h} onClick={() => setDuration(h)}
                                                    className={`py-2 rounded-lg text-[10px] font-black border transition-all ${duration === h ? "bg-white text-black" : "bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/10"}`}>
                                                    {h}H
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Equipment Rentals */}
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Logistics Support</label>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                                <span className="text-[9px] font-black uppercase text-slate-400">Paddles / Rackets</span>
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => setEquipment(e => ({ ...e, paddles: Math.max(0, e.paddles - 1) }))} className="text-slate-500 hover:text-white">－</button>
                                                    <span className="text-xs font-black text-white w-4 text-center">{equipment.paddles}</span>
                                                    <button onClick={() => setEquipment(e => ({ ...e, paddles: e.paddles + 1 }))} className="text-slate-500 hover:text-white">＋</button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                                <span className="text-[9px] font-black uppercase text-slate-400">Ball Buckets</span>
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => setEquipment(e => ({ ...e, balls: Math.max(0, e.balls - 1) }))} className="text-slate-500 hover:text-white">－</button>
                                                    <span className="text-xs font-black text-white w-4 text-center">{equipment.balls}</span>
                                                    <button onClick={() => setEquipment(e => ({ ...e, balls: e.balls + 1 }))} className="text-slate-500 hover:text-white">＋</button>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setEquipment(e => ({ ...e, machine: !e.machine }))}
                                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${equipment.machine ? "bg-purple-500/10 border-purple-500/30 text-purple-400" : "bg-white/[0.02] border-white/5 text-slate-500"}`}
                                            >
                                                <span className="text-[9px] font-black uppercase">Ball Machine</span>
                                                <span className="text-xs">{equipment.machine ? "ON" : "OFF"}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Invitee Management */}
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Unit Roster</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={searchFriend}
                                                onChange={(e) => setSearchFriend(e.target.value)}
                                                placeholder="SEARCH OPERATORS..."
                                                className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2.5 text-[9px] font-black text-white outline-none focus:border-cyan-500/30"
                                            />
                                            {filteredFriends.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a111a] border border-white/10 rounded-xl overflow-hidden z-20 shadow-2xl">
                                                    {filteredFriends.map(f => (
                                                        <button 
                                                            key={f.id} 
                                                            onClick={() => { setInvitees([...invitees, f]); setSearchFriend(""); }}
                                                            className="w-full p-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                                                        >
                                                            <div className="w-6 h-6 rounded bg-zinc-800 border border-white/5" />
                                                            <span className="text-[10px] font-black text-white uppercase">{f.first_name} {f.last_name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {invitees.map(f => (
                                                <div key={f.id} className="flex items-center gap-2 px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg group">
                                                    <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">{f.first_name} {f.last_name}</span>
                                                    <button onClick={() => setInvitees(invitees.filter(i => i.id !== f.id))} className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Split Payment Toggle */}
                                    <button 
                                        onClick={() => setSplitPayment(!splitPayment)}
                                        className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${splitPayment ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "bg-white/[0.02] border-white/5 text-slate-500"}`}
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className="text-[10px] font-black uppercase tracking-widest">Resource Splitting</span>
                                            <span className="text-[7px] font-bold opacity-60 mt-0.5">Divide costs among roster</span>
                                        </div>
                                        <div className={`w-8 h-4 rounded-full relative transition-colors ${splitPayment ? "bg-emerald-500" : "bg-white/10"}`}>
                                            <div className={`absolute top-0.5 bottom-0.5 w-3 rounded-full bg-white transition-all ${splitPayment ? "right-0.5" : "left-0.5"}`} />
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </section>
                    </aside>

                </div>
            </main>

            {/* ACTION BAR: STICKY CONFIRMATION */}
            {selected && tab === "book" && (
                <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-white/5 bg-[#050b14]/80 backdrop-blur-2xl px-12 py-8 animate-in slide-in-from-bottom duration-500">
                    <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
                        <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500/50">Mission Parameters Confirmed</p>
                            <div className="flex items-center gap-6">
                                <div>
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Temporal Window</p>
                                    <p className="text-xl font-black text-white italic">{fmtDateTime(selected.start)} · {duration}H</p>
                                </div>
                                <div className="w-px h-10 bg-white/5" />
                                <div>
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Resource Value</p>
                                    <p className="text-3xl font-black text-white italic">₱{(court.price_per_hour || 0) * duration}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <button onClick={() => setSelected(null)} className="flex-1 md:flex-none px-10 py-4 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white hover:border-white/20 transition-all">Abadon Mission</button>
                            <button 
                                onClick={() => void handleRent()} 
                                disabled={booking}
                                className="flex-1 md:flex-none px-12 py-4 bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-cyan-400 transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-white/5"
                            >
                                {booking ? "SYNCING..." : "CONFIRM DEPLOYMENT"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* REJECT MODAL */}
            {rejectId && (
                <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#0a111a] border border-white/10 rounded-[3rem] w-full max-w-md p-10 space-y-8 shadow-2xl animate-in zoom-in duration-300">
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Decline Deployment</h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Specify protocol breach or reason.</p>
                        </div>
                        <textarea 
                            value={rejectNote} 
                            onChange={e => setRejectNote(e.target.value)}
                            placeholder="REASON FOR CANCELLATION..." 
                            rows={3}
                            className="w-full rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-red-500/30 transition-all resize-none" 
                        />
                        <div className="flex gap-4">
                            <button onClick={() => setRejectId(null)} className="flex-1 py-4 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-all">Abadon</button>
                            <button 
                                onClick={() => void handleReject()} 
                                disabled={!!acting}
                                className="flex-1 py-4 bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"
                            >
                                {acting ? "..." : "CONFIRM CANCELLATION"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
