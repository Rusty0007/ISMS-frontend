"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import ImageUpload from "@/components/ImageUpload";

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

const SPORT_EMOJI: Record<string, string> = {
    badminton:    "🏸",
    pickleball:   "🏓",
    lawn_tennis:  "🎾",
    table_tennis: "🏓",
};

function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CourtHubPage() {
    const { id } = useParams<{ id: string }>();
    const router  = useRouter();

    const [court,      setCourt]      = useState<CourtDetail | null>(null);
    const [loading,    setLoading]    = useState(true);
    const [tab,        setTab]        = useState<"book" | "manage">("book");

    // Book tab state
    const [date,       setDate]       = useState(todayIso());
    const [slots,      setSlots]      = useState<Slot[]>([]);
    const [slotsLoad,  setSlotsLoad]  = useState(false);
    const [selected,   setSelected]   = useState<Slot | null>(null);
    const [duration,   setDuration]   = useState(1);
    const [notes,      setNotes]      = useState("");
    const [booking,    setBooking]    = useState(false);
    const [toast,      setToast]      = useState<string | null>(null);

    // Manage tab state
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

    // ── Load court detail ────────────────────────────────────────────────────

    const fetchCourt = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/courts/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) { router.replace("/courts"); return; }
            setCourt(await res.json() as CourtDetail);
        } finally {
            setLoading(false);
        }
    }, [id, router]);

    useEffect(() => { void fetchCourt(); }, [fetchCourt]);

    // ── Load availability slots ──────────────────────────────────────────────

    const fetchSlots = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        setSlotsLoad(true);
        try {
            const res = await fetch(`/api/courts/${id}/availability?date=${date}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const d = await res.json() as { slots: Slot[] };
                setSlots(d.slots);
                setSelected(null);
            }
        } finally {
            setSlotsLoad(false);
        }
    }, [id, date]);

    useEffect(() => {
        if (tab === "book") void fetchSlots();
    }, [tab, fetchSlots]);

    // ── Load manage bookings ─────────────────────────────────────────────────

    const fetchBookings = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        setMgmtLoad(true);
        try {
            const params = mgmtFilter === "all" ? "" : `?status=${mgmtFilter}`;
            const res = await fetch(`/api/courts/${id}/bookings${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const d = await res.json() as { bookings: Booking[] };
                setBookings(d.bookings);
            }
        } finally {
            setMgmtLoad(false);
        }
    }, [id, mgmtFilter]);

    useEffect(() => {
        if (tab === "manage" && isOwner) void fetchBookings();
    }, [tab, isOwner, fetchBookings]);

    // ── Submit rental ────────────────────────────────────────────────────────

    async function handleRent() {
        if (!selected) return;
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        // Build scheduled_at from selected slot start + chosen duration
        const startDt = new Date(selected.start);
        setBooking(true);
        try {
            const res = await fetch(`/api/courts/${id}/rent`, {
                method:  "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    scheduled_at:   startDt.toISOString(),
                    duration_hours: duration,
                    notes:          notes || null,
                }),
            });
            const d = await res.json() as { message?: string; detail?: string };
            if (res.ok) {
                showToast("Rental request sent! Waiting for owner approval.");
                setSelected(null);
                setNotes("");
                void fetchSlots();
            } else {
                showToast(d.detail ?? "Failed to send rental request.");
            }
        } finally {
            setBooking(false);
        }
    }

    // ── Approve / Reject booking ─────────────────────────────────────────────

    async function handleApprove(bookingId: string) {
        const token = getAccessToken();
        if (!token) return;
        setActing(bookingId);
        try {
            const res = await fetch(`/api/courts/bookings/${bookingId}/approve`, {
                method:  "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) { showToast("Booking approved!"); void fetchBookings(); }
            else { const d = await res.json() as { detail?: string }; showToast(d.detail ?? "Failed."); }
        } finally { setActing(null); }
    }

    async function handleReject() {
        if (!rejectId) return;
        const token = getAccessToken();
        if (!token) return;
        setActing(rejectId);
        try {
            const params = rejectNote ? `?reason=${encodeURIComponent(rejectNote)}` : "";
            const res = await fetch(`/api/courts/bookings/${rejectId}/reject${params}`, {
                method:  "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                showToast("Booking rejected.");
                setRejectId(null);
                setRejectNote("");
                void fetchBookings();
            } else {
                const d = await res.json() as { detail?: string };
                showToast(d.detail ?? "Failed.");
            }
        } finally { setActing(null); }
    }

    // ── Slots visible given chosen duration ──────────────────────────────────

    // A slot is bookable only if all hours in [slot, slot+duration) are available
    function isSlotBookable(slot: Slot): boolean {
        if (!slot.is_available) return false;
        if (duration <= 1) return true;
        const slotIdx = slots.indexOf(slot);
        for (let i = slotIdx; i < slotIdx + duration; i++) {
            if (!slots[i] || !slots[i].is_available) return false;
        }
        return true;
    }

    // ── Render ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
                <NavBar backHref="/courts" backLabel="← Courts" />
                <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm animate-pulse">Loading court...</div>
            </div>
        );
    }

    if (!court) return null;

    const sportEmoji = court.sport ? (SPORT_EMOJI[court.sport] ?? "🏟️") : "🏟️";

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col pb-10">
            {/* Premium background grid */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
                style={{ backgroundImage: `linear-gradient(rgba(6,182,212,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.5) 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />

            <NavBar backHref="/courts" backLabel="← Hubs" />

            {toast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/80 backdrop-blur-xl border border-white/10 text-xs font-bold text-white px-6 py-3.5 rounded-2xl shadow-2xl whitespace-nowrap">
                    {toast}
                </div>
            )}

            {/* ── HEADER ────────────────────────────────────────────────────── */}
            <header className="relative z-10 px-6 pt-6 pb-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black tracking-tight truncate">{court.name}</h1>
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Court Availability</p>
                    </div>
                    {isOwner && (
                        <button
                            onClick={() => setTab(tab === "book" ? "manage" : "book")}
                            className="bg-zinc-900/50 border border-white/10 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors"
                        >
                            {tab === "book" ? "⚙️ Manage" : "📅 Booking"}
                        </button>
                    )}
                </div>
            </header>

            {/* ══ BOOKING FLOW ══════════════════════════════════════════════════ */}
            {tab === "book" && (
                <main className="relative z-10 flex flex-col gap-6">

                    {/* Choose Sport Section */}
                    <section className="px-6">
                        <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-3">Choose your sport</h2>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            {["pickleball", "badminton", "lawn_tennis", "table_tennis"].map(s => (
                                <button
                                    key={s}
                                    className={`whitespace-nowrap px-4 py-2.5 rounded-2xl border text-xs font-black transition-all ${
                                        court.sport === s
                                            ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                            : "bg-zinc-900/40 border-white/5 text-zinc-500 opacity-50 grayscale"
                                    }`}
                                >
                                    {SPORT_EMOJI[s]} {s.replace("_", " ").charAt(0).toUpperCase() + s.replace("_", " ").slice(1)}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Date Navigation */}
                    <section className="px-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => {
                                    const d = new Date(date);
                                    d.setDate(d.getDate() - 1);
                                    const iso = d.toISOString().slice(0, 10);
                                    if (iso >= todayIso()) setDate(iso);
                                }}
                                className="w-10 h-10 flex items-center justify-center bg-zinc-900/40 border border-white/10 rounded-xl text-zinc-400 disabled:opacity-20"
                                disabled={date === todayIso()}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/></svg>
                            </button>
                            <div className="text-center">
                                <p className="text-lg font-black">{date === todayIso() ? "Today" : fmtDate(date)}</p>
                                <p className="text-[10px] font-bold text-cyan-500/60 uppercase tracking-widest">2 courts available</p>
                            </div>
                            <button
                                onClick={() => {
                                    const d = new Date(date);
                                    d.setDate(d.getDate() + 1);
                                    setDate(d.toISOString().slice(0, 10));
                                }}
                                className="w-10 h-10 flex items-center justify-center bg-zinc-900/40 border border-white/10 rounded-xl text-zinc-400"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/></svg>
                            </button>
                        </div>
                        <div className="bg-zinc-900/40 border border-white/10 px-3 py-2 rounded-xl text-[10px] font-black text-zinc-500 uppercase">
                            Cutoff: 10 PM
                        </div>
                    </section>

                    {/* Legend */}
                    <section className="px-6 flex flex-wrap gap-4 py-2 border-y border-white/5 bg-zinc-900/20 backdrop-blur-sm">
                        {[
                            { label: "Open", color: "bg-zinc-800 border-white/10" },
                            { label: "Selected", color: "bg-cyan-500 border-cyan-400" },
                            { label: "Booked", color: "bg-red-500/20 border-red-500/40" },
                            { label: "My Booking", color: "bg-violet-500 border-violet-400" },
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full border ${item.color}`} />
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</span>
                            </div>
                        ))}
                    </section>

                    {/* Structured Time-Slot Grid */}
                    <section className="px-4 overflow-x-auto no-scrollbar">
                        <div className="min-w-[320px] bg-zinc-900/40 backdrop-blur-md border border-white/10 rounded-[32px] overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[80px_1fr_1fr] border-b border-white/5 bg-white/5">
                                <div className="p-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Time</div>
                                <div className="p-4 text-center text-[10px] font-black text-cyan-400 uppercase tracking-widest border-l border-white/5">Court 1</div>
                                <div className="p-4 text-center text-[10px] font-black text-cyan-400 uppercase tracking-widest border-l border-white/5">Court 2</div>
                            </div>

                            {/* Schedule Rows */}
                            {slotsLoad ? (
                                <div className="p-10 text-center text-zinc-500 text-xs animate-pulse">Scanning availability...</div>
                            ) : slots.length === 0 ? (
                                <div className="p-10 text-center text-zinc-500 text-xs italic">Schedule data unavailable for this date.</div>
                            ) : (
                                <div className="flex flex-col">
                                    {slots.filter((_, idx) => idx % 2 === 0).map((slot, idx) => {
                                        // Mocking a second court for visualization of the requested 2-court UI
                                        const bookable1 = isSlotBookable(slot);
                                        const isSel1   = selected?.start === slot.start;

                                        return (
                                            <div key={slot.start} className="grid grid-cols-[80px_1fr_1fr] border-b border-white/5 last:border-0 h-16 group">
                                                <div className="flex items-center px-4 text-xs font-black text-zinc-500 tabular-nums">
                                                    {fmtTime(slot.start).replace(":00", "")}
                                                </div>

                                                {/* Court 1 Slot */}
                                                <div className="p-1 border-l border-white/5">
                                                    <button
                                                        disabled={!bookable1}
                                                        onClick={() => setSelected(isSel1 ? null : slot)}
                                                        className={`w-full h-full rounded-[14px] border transition-all flex flex-col items-center justify-center gap-0.5 ${
                                                            !bookable1
                                                                ? "bg-red-500/5 border-red-500/10 text-red-900/40 cursor-not-allowed"
                                                                : isSel1
                                                                    ? "bg-cyan-500 border-cyan-400 text-zinc-950 shadow-[0_0_15px_rgba(6,182,212,0.4)] scale-[0.98]"
                                                                    : "bg-zinc-800/40 border-white/5 text-zinc-500 hover:border-white/20 hover:bg-zinc-800/80 active:scale-[0.96]"
                                                        }`}
                                                    >
                                                        <span className="text-[10px] font-black uppercase tracking-tighter">
                                                            {isSel1 ? "Selected" : !bookable1 ? "Booked" : "Open"}
                                                        </span>
                                                        {bookable1 && !isSel1 && <span className="text-[8px] font-bold opacity-30">₱{court.price_per_hour}</span>}
                                                    </button>
                                                </div>

                                                {/* Court 2 Slot (Simulated/Past) */}
                                                <div className="p-1 border-l border-white/5">
                                                    <button
                                                        disabled
                                                        className="w-full h-full rounded-[14px] border bg-zinc-950/20 border-white/[0.02] text-zinc-700/30 flex flex-col items-center justify-center grayscale opacity-40"
                                                    >
                                                        <span className="text-[10px] font-black uppercase tracking-tighter">Past</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </main>
            )}

            {/* ══ MANAGE TAB ════════════════════════════════════════════════ */}
            {tab === "manage" && isOwner && (
                <main className="relative z-10 px-6 py-4 flex flex-col gap-5">
                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                        {(["pending_approval", "approved", "rejected", "all"] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setMgmtFilter(f)}
                                className={`whitespace-nowrap px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                                    mgmtFilter === f
                                        ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                        : "bg-zinc-900/40 border-white/5 text-zinc-500"
                                }`}
                            >
                                {f.replace("_", " ")}
                            </button>
                        ))}
                    </div>

                    {mgmtLoad ? (
                        <div className="text-center py-10 animate-pulse text-zinc-600 text-xs">Accessing rental records...</div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {bookings.map(b => (
                                <div key={b.id} className="bg-zinc-900/40 backdrop-blur-md border border-white/10 rounded-[24px] p-5 space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="font-black text-sm">{b.requester_name}</p>
                                            <p className="text-[10px] font-bold text-zinc-500 mt-0.5">{fmtDate(b.scheduled_at!)} · {fmtTime(b.scheduled_at!)}</p>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            b.status === "approved" ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"
                                        }`}>
                                            {b.status}
                                        </div>
                                    </div>
                                    {b.status === "pending_approval" && (
                                        <div className="flex gap-2">
                                            <button onClick={() => void handleApprove(b.id)} className="flex-1 bg-cyan-500 py-2.5 rounded-[14px] text-zinc-950 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Approve</button>
                                            <button onClick={() => setRejectId(b.id)} className="flex-1 bg-white/5 py-2.5 rounded-[14px] text-red-400 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Decline</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            )}

            {/* ── BOOKING BOTTOM SHEET ────────────────────────────────────────── */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={() => setSelected(null)} />
                    <div className="relative w-full max-w-md bg-zinc-900 border-t border-white/10 rounded-t-[40px] p-8 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] pointer-events-auto animate-in slide-in-from-bottom duration-300">
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8" />

                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black tracking-tight">Confirm Booking</h3>
                                    <p className="text-zinc-500 text-xs font-medium mt-1">{fmtDate(selected.start)} · {fmtTime(selected.start)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-black text-cyan-400">₱{(court.price_per_hour || 0) * duration}</p>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{duration} Hour Rental</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                {[1, 2, 3, 4].map(h => (
                                    <button
                                        key={h}
                                        onClick={() => setDuration(h)}
                                        className={`py-3 rounded-[18px] border text-[10px] font-black uppercase tracking-widest transition-all ${
                                            duration === h ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400" : "bg-white/5 border-white/5 text-zinc-500"
                                        }`}
                                    >
                                        {h} Hour{h > 1 ? "s" : ""}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Booking Notes (Optional)</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="e.g. Bringing own rackets, 4 players..."
                                    rows={2}
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-cyan-500/30 resize-none"
                                />
                            </div>

                            <button
                                onClick={() => void handleRent()}
                                disabled={booking}
                                className="w-full py-5 rounded-[24px] bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-sm font-black transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                            >
                                {booking ? "Finalizing..." : "Confirm Booking"}
                            </button>

                            <p className="text-center text-zinc-600 text-[10px] font-medium leading-relaxed">
                                You won&apos;t be charged until the hub owner approves your request.<br/>Cancellation is free up to 2 hours before the slot.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── REJECT REASON MODAL ────────────────────────────────────────── */}
            {rejectId && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-4 pb-4">
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-sm p-5 flex flex-col gap-4">
                        <h3 className="font-black text-white">Decline Booking</h3>
                        <textarea
                            value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)}
                            placeholder="Reason (optional)..."
                            rows={3}
                            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setRejectId(null)}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm font-semibold hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleReject()}
                                disabled={!!acting}
                                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                                {acting ? "..." : "Decline"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
