"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import ClubOpenPlayPanel from "@/components/clubs/ClubOpenPlayPanel";
import CourtRentalGrid from "@/components/clubs/CourtRentalGrid";

// ── Types ──────────────────────────────────────────────────────────────────

type HubTab = "about" | "open-play" | "court-rental";

interface LiveMatch {
    match_id:     string;
    sport:        string | null;
    match_format: string | null;
    player1_id:   string | null; player2_id: string | null;
    player3_id:   string | null; player4_id: string | null;
    player1_name: string | null; player2_name: string | null;
    player3_name: string | null; player4_name: string | null;
    player1_matches_played: number | null; player2_matches_played: number | null;
    player3_matches_played: number | null; player4_matches_played: number | null;
    referee_id:   string | null;
    referee_name: string | null;
    scheduled_at: string | null;
    started_at:   string | null;
}

interface CourtDetail {
    court_id:   string;
    name:       string;
    sport:      string | null;
    status:     string;
    surface:    string | null;
    is_indoor:  boolean | null;
    live_match: LiveMatch | null;
}

interface Occupancy {
    club_id:     string;
    total:       number;
    occupied:    number;
    vacant:      number;
    crowd_level: string;
    courts:      CourtDetail[];
}

interface ClubInfo {
    id:              string;
    name:            string;
    description:     string | null;
    sport:           string | null;
    category:        string | null;
    membership_type: string | null;
    address:         string | null;
    admin_id:        string;
    admin_name:      string | null;
    member_count:    number;
    court_count:     number;
    logo_url:        string | null;
    cover_url:       string | null;
    opening_time:    string;   // "HH:MM"
    closing_time:    string;   // "HH:MM"
}

interface SessionCard {
    id:               string;
    club_id:          string;
    club_name:        string;
    title:            string;
    sport:            string;
    sport_emoji:      string;
    session_date:     string;
    duration_hours:   number;
    max_players:      number;
    confirmed_count:  number;
    waitlisted_count: number;
    price_per_head:   number;
    status:           string;
    is_joined:        boolean;
    court_name:       string | null;
    skill_min:        number | null;
    skill_max:        number | null;
    description:      string | null;
    notes:            string | null;
}

interface CourtSlot {
    start:        string;
    end:          string;
    is_available: boolean;
    booking_id:   string | null;
}

interface CourtAvailability {
    court_id:       string;
    court_name:     string;
    sport:          string | null;
    surface:        string | null;
    is_indoor:      boolean | null;
    price_per_hour: number | null;
    slots:          CourtSlot[];
}

interface CourtBasic {
    id:   string;
    name: string;
    sport: string | null;
}

interface RankingEntry {
    rank:                    number;
    id:                      string;
    first_name:              string | null;
    last_name:               string | null;
    avatar_url:              string | null;
    gender:                  string | null;
    rating:                  number;
    rating_deviation:        number;
    matches_played:          number;
    wins:                    number;
    losses:                  number;
    rating_status:           string;
    is_leaderboard_eligible: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CROWD_COLORS: Record<string, { text: string; bg: string; border: string; dot: string }> = {
    Empty:    { text: "text-zinc-400",    bg: "bg-zinc-800",       border: "border-zinc-700",       dot: "bg-zinc-500"    },
    Low:      { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400" },
    Moderate: { text: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/30",  dot: "bg-yellow-400"  },
    High:     { text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30",     dot: "bg-red-400"     },
};

const SPORT_EMOJI: Record<string, string> = {
    badminton:    "🏸",
    pickleball:   "🏓",
    lawn_tennis:  "🎾",
    table_tennis: "🏓",
};

const CATEGORY_LABELS: Record<string, string> = {
    community: "Community",
    school:    "School",
    private:   "Private",
    municipal: "Municipal",
    barangay:  "Barangay",
    academy:   "Academy",
    venue:     "Venue",
};

function runningMins(startedAt: string | null) {
    if (!startedAt) return null;
    const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
    return diff > 0 ? diff : null;
}

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function fmtSlotTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Default export — Suspense boundary ────────────────────────────────────

export default function ClubDetailPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading club...</div>
            </div>
        }>
            <ClubHubContent />
        </Suspense>
    );
}

// ── Inner component ────────────────────────────────────────────────────────

function ClubHubContent() {
    const { id: clubId } = useParams<{ id: string }>();
    const router         = useRouter();
    const searchParams   = useSearchParams();

    const initialTab = (searchParams.get("tab") as HubTab) ?? "about";
    const initialDate = searchParams.get("date") ?? todayISO();

    const [club,      setClub]      = useState<ClubInfo | null>(null);
    const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
    const [isMember,  setIsMember]  = useState(false);
    const [isAdmin,   setIsAdmin]   = useState(false);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState("");
    const [tab,       setTab]       = useState<HubTab>(initialTab);

    // Open Play state
    const [sessions,     setSessions]     = useState<SessionCard[]>([]);
    const [sessLoading,  setSessLoading]  = useState(false);
    const [joiningId,    setJoiningId]    = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState(todayISO());
    const [showForm,     setShowForm]     = useState(false);
    const [formSport,    setFormSport]    = useState("badminton");
    const [formMatchFormat, setFormMatchFormat] = useState("doubles");
    const [formQueueMode, setFormQueueMode] = useState("fifo");
    const [formRotationMode, setFormRotationMode] = useState("four_on_four_off");
    const [formSkillMin, setFormSkillMin] = useState("");
    const [formSkillMax, setFormSkillMax] = useState("");
    const [formDate,     setFormDate]     = useState("");
    const [formEndTime,  setFormEndTime]  = useState("");
    const [formMax,      setFormMax]      = useState("32");
    const [formPrice,    setFormPrice]    = useState("0");
    const [formCourt,    setFormCourt]    = useState("");
    const [courts,       setCourts]       = useState<CourtBasic[]>([]);
    const [formSubmitting, setFormSubmitting] = useState(false);

    // Rankings state
    const [rankings,   setRankings]   = useState<RankingEntry[]>([]);
    const [rankLoading, setRankLoading] = useState(false);
    const [rankSport,  setRankSport]  = useState("badminton");
    const [rankFormat, setRankFormat] = useState<"singles" | "doubles">("singles");
    const [rankGender] = useState<"" | "male" | "female">("");

    // Court Rental state
    const [rentalDate,   setRentalDate]   = useState(initialDate);
    const [availability, setAvailability] = useState<CourtAvailability[]>([]);
    const [rentLoading,  setRentLoading]  = useState(false);
    const [bookingSlot,  setBookingSlot]  = useState<{ courtId: string; courtName: string; slot: CourtSlot } | null>(null);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookedSlots,  setBookedSlots]  = useState<Set<string>>(new Set());
    const [toast,        setToast]        = useState<string | null>(null);

    function getToken() {
        const t = getAccessToken();
        if (!t) { clearAuthSession(); router.replace("/login"); }
        return t;
    }

    function showToast(msg: string) {
        setToast(msg);
        setTimeout(() => setToast(null), 4000);
    }

    const fetchOccupancy = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/clubs/${clubId}/occupancy`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setOccupancy(await res.json());
    }, [clubId]);

    // Initial load
    useEffect(() => {
        const token = getToken();
        if (!token) return;
        setLoading(true);
        Promise.all([
            fetch(`/api/clubs/${clubId}`,            { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`/api/clubs/${clubId}/occupancy`,  { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/clubs/mine",                 { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`/api/matches/clubs/${clubId}/courts`, { headers: { Authorization: `Bearer ${token}` } }),
        ])
        .then(async ([clubRes, occRes, mineRes, courtsRes]) => {
            if (isUnauthorized(clubRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!clubRes.ok) { setError("Club not found."); return; }

            const [clubData, occData, mineData, courtsData] = await Promise.all([
                clubRes.json(),
                occRes.ok ? occRes.json() : null,
                mineRes.ok ? mineRes.json() : null,
                courtsRes.ok ? courtsRes.json() : null,
            ]);

            setClub(clubData);
            if (clubData.sport) {
                setRankSport(clubData.sport);
                setFormSport(clubData.sport);
            }
            if (occData) setOccupancy(occData);
            if (courtsData?.courts) setCourts(courtsData.courts.map((c: { id: string; name: string; sport: string | null }) => ({ id: c.id, name: c.name, sport: c.sport })));

            if (mineData) {
                const memberIds: string[] = mineData.member_club_ids ?? [];
                const adminList: { id: string }[] = mineData.admin ?? [];
                const adminIds = adminList.map(c => c.id);
                setIsMember(memberIds.includes(clubId) || adminIds.includes(clubId));
                setIsAdmin(adminIds.includes(clubId));
            }
        })
        .catch(() => setError("Failed to load club."))
        .finally(() => setLoading(false));
    }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Poll occupancy every 8s
    useEffect(() => {
        const interval = setInterval(fetchOccupancy, 8000);
        return () => clearInterval(interval);
    }, [fetchOccupancy]);

    // Fetch sessions when Open Play tab is active or date changes
    useEffect(() => {
        if (tab !== "open-play") return;
        const token = getAccessToken();
        if (!token) return;
        setSessLoading(true);
        fetch(`/api/clubs/${clubId}/open-play?date=${selectedDate}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : { sessions: [] })
            .then(d => setSessions(d.sessions ?? []))
            .finally(() => setSessLoading(false));
    }, [tab, clubId, selectedDate]);

    // Fetch rankings when About tab is active or filters change
    useEffect(() => {
        if (tab !== "about" || !club) return;
        const token = getAccessToken();
        if (!token) return;
        const sport = rankSport || club.sport || "badminton";
        const params = new URLSearchParams({ sport, match_format: rankFormat });
        if (rankGender) params.set("gender", rankGender);
        setRankLoading(true);
        fetch(`/api/clubs/${clubId}/rankings?${params}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : { rankings: [] })
            .then(d => setRankings(d.rankings ?? []))
            .finally(() => setRankLoading(false));
    }, [tab, clubId, rankSport, rankFormat, rankGender, club]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch availability when Court Rental tab is active or date changes
    useEffect(() => {
        if (tab !== "court-rental") return;
        const token = getAccessToken();
        if (!token) return;
        setRentLoading(true);
        fetch(`/api/matches/clubs/${clubId}/courts/availability?date=${rentalDate}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : { courts: [] })
            .then(d => setAvailability(d.courts ?? []))
            .finally(() => setRentLoading(false));
    }, [tab, clubId, rentalDate]);

    async function handleJoin() {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`/api/clubs/${clubId}/join`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            setIsMember(true);
            if (club) setClub({ ...club, member_count: club.member_count + 1 });
        }
    }

    async function handleJoinSession(sessionId: string) {
        const token = getToken();
        if (!token) return;
        setJoiningId(sessionId);
        const res = await fetch(`/api/open-play/${sessionId}/join`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const data = await res.json();
            setSessions(prev => prev.map(s =>
                s.id === sessionId
                    ? { ...s, is_joined: data.status === "confirmed", confirmed_count: data.status === "confirmed" ? s.confirmed_count + 1 : s.confirmed_count }
                    : s
            ));
            showToast(data.status === "confirmed" ? "You're confirmed!" : "Added to waitlist.");
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.detail || "Could not join this session.");
        }
        setJoiningId(null);
    }

    async function handleCreateSession(e: React.FormEvent) {
        e.preventDefault();
        const token = getToken();
        if (!token) return;
        setFormSubmitting(true);
        // Auto-generate title from sport + date
        const SPORT_LABELS: Record<string, string> = {
            badminton: "Badminton", pickleball: "Pickleball",
            lawn_tennis: "Lawn Tennis", table_tennis: "Table Tennis",
        };
        // Compose full datetimes from the already-selected date card + time-only inputs
        const sessionStartISO = formDate ? `${selectedDate}T${formDate}` : "";
        const sessionEndISO   = formEndTime ? `${selectedDate}T${formEndTime}` : "";

        const dateLabel = selectedDate
            ? new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : "";
        const autoTitle = `${SPORT_LABELS[formSport] ?? formSport} Open Play${dateLabel ? ` · ${dateLabel}` : ""}`;

        // Compute duration_hours from start + end time
        let durationHours = 2.0;
        if (sessionStartISO && sessionEndISO) {
            const start = new Date(sessionStartISO).getTime();
            const end   = new Date(sessionEndISO).getTime();
            if (end > start) durationHours = (end - start) / 3_600_000;
        }

        const res = await fetch(`/api/clubs/${clubId}/open-play`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                title:          autoTitle,
                sport:          formSport,
                match_format:   formMatchFormat,
                queue_mode:     formQueueMode,
                rotation_mode:  formRotationMode,
                session_date:   sessionStartISO,
                duration_hours: durationHours,
                max_players:    parseInt(formMax),
                price_per_head: parseFloat(formPrice) || 0,
                court_id:       formCourt || null,
                skill_min:      formSkillMin ? Number(formSkillMin) : null,
                skill_max:      formSkillMax ? Number(formSkillMax) : null,
                description:    null,
            }),
        });
        if (res.ok) {
            setShowForm(false);
            setFormDate(""); setFormEndTime("");
            setFormMatchFormat("doubles"); setFormQueueMode("fifo"); setFormRotationMode("four_on_four_off");
            setFormSkillMin(""); setFormSkillMax("");
            // Refresh sessions
            const token2 = getAccessToken();
            if (token2) {
                const r = await fetch(`/api/clubs/${clubId}/open-play?status=upcoming`, { headers: { Authorization: `Bearer ${token2}` } });
                if (r.ok) { const d = await r.json(); setSessions(d.sessions ?? []); }
            }
            showToast("Session created!");
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.detail || "Could not create the session.");
        }
        setFormSubmitting(false);
    }

    async function handleBookSlot() {
        if (!bookingSlot) return;
        const token = getToken();
        if (!token) return;
        setBookingLoading(true);
        const res = await fetch(`/api/courts/${bookingSlot.courtId}/rent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ scheduled_at: bookingSlot.slot.start, duration_hours: 1 }),
        });
        if (res.ok) {
            setBookedSlots(prev => new Set(prev).add(bookingSlot.slot.start + bookingSlot.courtId));
            showToast("Booking request sent! Waiting for admin approval.");
        } else {
            const d = await res.json().catch(() => ({}));
            showToast(d.detail ?? "Failed to book. Try again.");
        }
        setBookingSlot(null);
        setBookingLoading(false);
    }

    // ── Loading / Error ─────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading club...</div>
            </div>
        );
    }

    if (error || !club) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
                <NavBar hideLogo backHref="/clubs" backLabel="← Clubs" />
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-zinc-500">{error || "Club not found."}</p>
                </div>
            </div>
        );
    }

    const crowd      = occupancy ? CROWD_COLORS[occupancy.crowd_level] ?? CROWD_COLORS.Empty : CROWD_COLORS.Empty;
    const sportEmoji = club.sport ? (SPORT_EMOJI[club.sport] ?? "🏟️") : "🏟️";

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#050b14] text-white flex flex-col font-sans selection:bg-cyan-500/30">
            {/* Tactical Background Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-500/5 blur-[100px] rounded-full" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050b14]/50 to-[#050b14]" />
            </div>

            <NavBar hideLogo backHref="/clubs" backLabel="← ALL FACILITIES" />

            {/* Toast */}
            {toast && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#0a111a] border border-cyan-500/30 text-[10px] font-black uppercase tracking-widest text-cyan-400 px-6 py-3 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.2)] backdrop-blur-xl animate-in fade-in slide-in-from-top-4">
                    <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        {toast}
                    </span>
                </div>
            )}

            {/* Booking confirmation modal */}
            {bookingSlot && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4">
                    <div className="bg-[#0a111a] border border-white/10 rounded-[2rem] p-8 max-w-sm w-full flex flex-col gap-6 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-emerald-500" />
                        <div className="space-y-2">
                            <h3 className="font-black text-2xl uppercase italic tracking-tight">Confirm Booking</h3>
                            <div className="h-0.5 w-12 bg-cyan-500/30" />
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            Requesting deployment for <span className="text-white font-bold">@{bookingSlot.courtName}</span> on{" "}
                            <span className="text-cyan-400 font-bold">{new Date(rentalDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>{" "}
                            at <span className="text-cyan-400 font-bold">{fmtSlotTime(bookingSlot.slot.start)}</span>.
                        </p>
                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Note</p>
                            <p className="text-[10px] text-slate-400 mt-1 uppercase italic">Requires operator clearance (admin approval).</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setBookingSlot(null)} className="flex-1 py-3.5 rounded-xl border border-white/10 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">
                                Abort
                            </button>
                            <button onClick={handleBookSlot} disabled={bookingLoading} className="flex-1 py-3.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-cyan-50 transition-all disabled:opacity-50">
                                {bookingLoading ? "Processing..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 py-8 lg:px-8">

                {/* Tactical Hero Header */}
                <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/60 backdrop-blur-xl shadow-2xl mb-8 group">
                    {/* Background Visuals */}
                    <div className="absolute inset-0 opacity-20 transition-opacity group-hover:opacity-30">
                        {club.cover_url ? (
                            <img src={club.cover_url} alt="" className="w-full h-full object-cover grayscale blur-sm" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-cyan-500/20 via-transparent to-emerald-500/10" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a111a] via-[#0a111a]/80 to-transparent" />
                    </div>

                    <div className="relative z-10 p-8 lg:p-12">
                        <div className="flex flex-col md:flex-row gap-10 items-start md:items-end">
                            {/* Club Logo/Identity */}
                            <div className="relative shrink-0">
                                <div className="absolute inset-0 bg-cyan-500/20 blur-2xl rounded-full opacity-50" />
                                <div className="relative w-32 h-32 rounded-[2rem] border-2 border-cyan-500/30 overflow-hidden bg-zinc-900 shadow-2xl flex items-center justify-center">
                                    {club.logo_url ? (
                                        <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-5xl">{sportEmoji}</span>
                                    )}
                                </div>
                                <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-4 border-[#0a111a] flex items-center justify-center ${crowd.bg} ${crowd.text} text-xs shadow-xl animate-pulse`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${crowd.dot}`} />
                                </div>
                            </div>

                            <div className="flex-1 space-y-4">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-400">
                                            FACILITY DETECTED
                                        </div>
                                        {club.category && (
                                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 border border-white/5 px-3 py-1 rounded-full bg-white/5">
                                                {CATEGORY_LABELS[club.category] ?? club.category}
                                            </div>
                                        )}
                                        {club.membership_type === 'invite_only' && (
                                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500 border border-amber-500/20 px-3 py-1 rounded-full bg-amber-500/10">
                                                RESTRICTED ACCESS
                                            </div>
                                        )}
                                    </div>
                                    <h1 className="text-4xl lg:text-6xl font-black tracking-tighter text-white uppercase italic leading-none drop-shadow-2xl">
                                        {club.name}
                                    </h1>
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-6">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol:</span>
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded italic">
                                            {club.sport?.replace('_', ' ') || 'Multi-sport'}
                                        </span>
                                    </div>
                                    {club.address && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Loc:</span>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[200px] italic">
                                                {club.address}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 w-full md:w-auto">
                                {!isMember && club.membership_type !== 'invite_only' && (
                                    <button onClick={handleJoin} className="px-8 py-3.5 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl text-center hover:bg-cyan-50 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/5">
                                        Request Access
                                    </button>
                                )}
                                {isMember && !isAdmin && (
                                    <div className="px-8 py-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl text-center backdrop-blur-sm">
                                        Access Granted
                                    </div>
                                )}
                                {isAdmin && (
                                    <Link href={`/clubs/${clubId}/admin`} className="px-8 py-3.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest rounded-xl text-center hover:bg-cyan-500/20 transition-all">
                                        Admin Interface
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Tactical Navigation */}
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Tabs */}
                    <aside className="lg:w-72 shrink-0 space-y-6">
                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-3 space-y-1">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 px-4 mb-3 mt-2">Navigation</h2>
                            {[
                                { key: 'open-play', label: 'OPEN PLAY', icon: '🤝' },
                                { key: 'court-rental', label: 'COURT RENTAL', icon: '🏟️' },
                                { key: 'about', label: 'INTELLIGENCE', icon: 'ℹ️' },
                            ].map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setTab(t.key as HubTab)}
                                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all group ${
                                        tab === t.key
                                            ? "bg-white text-black shadow-lg shadow-white/5 scale-[1.02]"
                                            : "text-slate-500 hover:text-white hover:bg-white/5"
                                    }`}
                                >
                                    <span className={`text-lg transition-transform group-hover:scale-110 ${tab === t.key ? 'grayscale-0' : 'grayscale opacity-50'}`}>{t.icon}</span>
                                    {t.label}
                                    {tab === t.key && (
                                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                                    )}
                                </button>
                            ))}
                        </section>

                        {/* Facility Stats (Compact) */}
                        <section className="bg-[#0a111a]/40 backdrop-blur-sm border border-white/5 rounded-[2rem] p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Population</p>
                                    <p className="text-xl font-black italic text-white leading-none">{club.member_count}</p>
                                </div>
                                <div className="flex justify-between items-end">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Units</p>
                                    <p className="text-xl font-black italic text-white leading-none">{club.court_count}</p>
                                </div>
                                <div className="pt-4 border-t border-white/5">
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-2">
                                        <span className="text-slate-500">Facility Load</span>
                                        <span className={crowd.text}>{occupancy?.crowd_level || 'UNKNOWN'}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-px border border-white/5">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-1000 ${
                                                occupancy?.crowd_level === 'High' ? 'bg-red-500' : 
                                                occupancy?.crowd_level === 'Moderate' ? 'bg-yellow-500' : 'bg-cyan-500'
                                            }`} 
                                            style={{ width: occupancy?.total ? `${(occupancy.occupied / occupancy.total) * 100}%` : '0%' }} 
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>
                    </aside>

                    {/* Main Interface Area */}
                    <div className="flex-1 min-w-0">
                        {/* ── Intelligence Tab (About) ─────────────────────────────────────────────────────── */}
                        {tab === 'about' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Operational Description */}
                                {club.description && (
                                    <section className="bg-[#0a111a]/40 border border-white/5 rounded-[2.5rem] p-8 lg:p-10 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-8">
                                            <div className="text-4xl opacity-5 group-hover:opacity-10 transition-opacity uppercase italic font-black font-sans">BIO</div>
                                        </div>
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500 mb-6 flex items-center gap-3">
                                            <span className="w-8 h-[1px] bg-cyan-500/30" />
                                            Mission Briefing
                                        </h2>
                                        <p className="text-slate-400 text-sm leading-relaxed max-w-2xl italic">
                                            &ldquo;{club.description}&rdquo;
                                        </p>
                                        <div className="mt-8 flex items-center gap-3 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                            <span>SIGNATURE:</span>
                                            <span className="text-slate-400 italic">{club.admin_name || 'SYSTEM'}</span>
                                        </div>
                                    </section>
                                )}

                                {/* Live Court Grid */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between px-2">
                                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-3">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            LIVE UNIT STATUS
                                        </h2>
                                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest italic">REAL-TIME FEED ACTIVATED</span>
                                    </div>

                                    {occupancy && occupancy.total > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {occupancy.courts.map(court => (
                                                <PublicCourtCard key={court.court_id} court={court} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-[#0a111a]/40 border border-white/5 border-dashed rounded-[2.5rem] p-12 text-center">
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">No active units detected in this facility.</p>
                                        </div>
                                    )}
                                </section>

                                {/* Rankings Redesign */}
                                <section className="bg-[#0a111a]/80 backdrop-blur-xl border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
                                    <div className="p-8 lg:p-10 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                        <div className="space-y-1">
                                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">OPERATOR RANKINGS</h2>
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic leading-tight">Elite facility personnel filtered by protocol</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <select
                                                value={rankSport}
                                                onChange={e => setRankSport(e.target.value)}
                                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white outline-none focus:border-cyan-500/50"
                                            >
                                                <option value="pickleball">Pickleball</option>
                                                <option value="badminton">Badminton</option>
                                                <option value="lawn_tennis">Tennis</option>
                                                <option value="table_tennis">Table Tennis</option>
                                            </select>
                                            <select
                                                value={rankFormat}
                                                onChange={e => setRankFormat(e.target.value as 'singles' | 'doubles')}
                                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white outline-none focus:border-cyan-500/50"
                                            >
                                                <option value="singles">Singles</option>
                                                <option value="doubles">Doubles</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="p-4 lg:p-6">
                                        {rankLoading ? (
                                            <div className="space-y-2 p-4">
                                                {[1,2,3].map(i => <div key={i} className="h-14 bg-white/5 rounded-2xl animate-pulse" />)}
                                            </div>
                                        ) : rankings.length === 0 ? (
                                            <div className="py-12 text-center">
                                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">No ranked data available for current protocol.</p>
                                            </div>
                                        ) : (
                                            <div className="grid gap-2">
                                                {rankings.map(p => (
                                                    <div key={p.id} className="group flex items-center gap-4 p-4 rounded-[1.5rem] hover:bg-white/[0.03] transition-all border border-transparent hover:border-white/5">
                                                        <div className={`w-10 text-center text-xs font-black shrink-0 ${
                                                            p.rank === 1 ? 'text-cyan-400' : 
                                                            p.rank === 2 ? 'text-slate-300' : 
                                                            p.rank === 3 ? 'text-emerald-500' : 'text-slate-600'
                                                        }`}>
                                                            {p.rank === 1 ? '01' : p.rank === 2 ? '02' : p.rank === 3 ? '03' : p.rank < 10 ? `0${p.rank}` : p.rank}
                                                        </div>
                                                        <div className="relative shrink-0">
                                                            <div className="w-12 h-12 rounded-2xl border border-white/10 overflow-hidden bg-zinc-900 shadow-lg group-hover:border-cyan-500/30 transition-colors">
                                                                {p.avatar_url ? (
                                                                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center text-xs font-black text-cyan-500 uppercase">
                                                                        {p.first_name?.[0]}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {p.rank === 1 && (
                                                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center border-2 border-[#0a111a] text-[8px] text-black font-black">★</div>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-black text-white uppercase italic group-hover:text-cyan-400 transition-colors">
                                                                {`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id.slice(0, 8)}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{p.wins}W / {p.losses}L</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xl font-black italic text-white leading-none tracking-tighter group-hover:scale-110 transition-transform">{Math.round(p.rating)}</div>
                                                            <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1">SR RATING</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* ── Open Play Tab ─────────────────────────────────────────────────── */}
                        {tab === 'open-play' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <ClubOpenPlayPanel
                                    clubName={club.name}
                                    clubSport={club.sport}
                                    openingTime={club.opening_time || "06:00"}
                                    closingTime={club.closing_time || "22:00"}
                                    sessions={sessions}
                                    sessLoading={sessLoading}
                                    joiningId={joiningId}
                                    selectedDate={selectedDate}
                                    isAdmin={isAdmin}
                                    showForm={showForm}
                                    formSport={formSport}
                                    formMatchFormat={formMatchFormat}
                                    formQueueMode={formQueueMode}
                                    formRotationMode={formRotationMode}
                                    formSkillMin={formSkillMin}
                                    formSkillMax={formSkillMax}
                                    formDate={formDate}
                                    formEndTime={formEndTime}
                                    formMax={formMax}
                                    formPrice={formPrice}
                                    formCourt={formCourt}
                                    courts={courts}
                                    formSubmitting={formSubmitting}
                                    onSelectDate={setSelectedDate}
                                    onJoinSession={handleJoinSession}
                                    onToggleForm={() => {
                                        if (!showForm) {
                                            if (club.sport) setFormSport(club.sport);
                                            setFormDate(club.opening_time || "06:00");
                                            setFormEndTime(club.closing_time || "22:00");
                                        }
                                        setShowForm((value) => !value);
                                    }}
                                    onCreateSession={handleCreateSession}
                                    setFormSport={setFormSport}
                                    setFormMatchFormat={setFormMatchFormat}
                                    setFormQueueMode={setFormQueueMode}
                                    setFormRotationMode={setFormRotationMode}
                                    setFormSkillMin={setFormSkillMin}
                                    setFormSkillMax={setFormSkillMax}
                                    setFormDate={setFormDate}
                                    setFormEndTime={setFormEndTime}
                                    setFormMax={setFormMax}
                                    setFormPrice={setFormPrice}
                                    setFormCourt={setFormCourt}
                                />
                            </div>
                        )}

                        {/* ── Deployment Tab (Court Rental) ──────────────────────────────────────────────── */}
                        {tab === 'court-rental' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-2">
                                        <div className="space-y-1">
                                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">UNIT DEPLOYMENT</h2>
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Reserve tactical space for private operations</p>
                                        </div>
                                        <input
                                            type="date"
                                            value={rentalDate}
                                            min={todayISO()}
                                            onChange={e => setRentalDate(e.target.value)}
                                            className="bg-[#0a111a]/80 border border-white/10 rounded-2xl px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white outline-none focus:border-cyan-500/50 backdrop-blur-sm shadow-xl"
                                        />
                                    </div>
                                    <div className="bg-[#0a111a]/40 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl">ℹ️</div>
                                        <div>
                                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Facility Intel</p>
                                            <p className="text-[10px] font-black text-white uppercase italic truncate">{club.address || "Sector Restricted"}</p>
                                            <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-tighter mt-0.5">{club.opening_time || "06:00"} - {club.closing_time || "22:00"} OPERATIONAL</p>
                                        </div>
                                    </div>
                                </div>

                                {rentLoading ? (
                                    <div className="grid gap-4">
                                        {[1,2,3].map(i => <div key={i} className="h-48 bg-white/5 rounded-[2.5rem] animate-pulse" />)}
                                    </div>
                                ) : availability.length === 0 ? (
                                    <div className="bg-[#0a111a]/40 border border-white/5 border-dashed rounded-[2.5rem] p-20 flex flex-col items-center justify-center text-center space-y-4">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-2xl opacity-20">🏟️</div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">No units available for deployment</p>
                                            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest italic">Current cycle: {rentalDate}</p>
                                        </div>
                                        <p className="text-[9px] text-slate-600 max-w-xs uppercase leading-relaxed font-bold">
                                            This facility may have no registered courts or all units are offline for the selected timeframe. 
                                            Contact club admin {club.admin_name || "SYSTEM"} for clearance.
                                        </p>
                                    </div>
                                ) : (
                                    <CourtRentalGrid 
                                        availability={availability}
                                        selectedDate={rentalDate}
                                        bookedSlots={bookedSlots}
                                        onBookSlot={(courtId, courtName, slot) => setBookingSlot({ courtId, courtName, slot })}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </main>
        </div>
    );
}

// ── Public Court Card Redesign ──────────────────────────────────────────────────────────

function PublicCourtCard({ court }: { court: CourtDetail }) {
    const m         = court.live_match;
    const isDoubles = m?.match_format === 'doubles' || m?.match_format === 'mixed_doubles';
    const mins      = m ? runningMins(m.started_at) : null;

    return (
        <div className={`relative overflow-hidden rounded-[2rem] border transition-all group ${
            court.status === 'occupied'
                ? 'border-red-500/20 bg-red-500/5'
                : 'border-emerald-500/20 bg-emerald-500/5'
        }`}>
            <div className="p-6 relative z-10 space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                                court.status === 'occupied' ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            }`} />
                            <p className="text-sm font-black text-white uppercase italic truncate tracking-tight leading-none group-hover:text-white/80 transition-colors">@{court.name}</p>
                        </div>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] italic leading-none pl-5">
                            {[court.sport?.replace(/_/g, ' '), court.surface,
                              court.is_indoor === true ? 'INDOOR' : court.is_indoor === false ? 'OUTDOOR' : null
                            ].filter(Boolean).join(' // ')}
                        </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shrink-0 border ${
                        court.status === 'occupied' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                        {court.status === 'occupied' ? 'ENGAGED' : 'STANDBY'}
                    </div>
                </div>

                {m ? (
                    <div className="bg-[#0a111a]/60 backdrop-blur-md rounded-2xl p-5 border border-white/5 space-y-4 shadow-xl">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-500">
                            <div className="flex items-center gap-2">
                                <span className="text-red-400 italic font-black">{m.match_format?.replace('_', ' ')}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-800" />
                                <span>OP CODE: {m.match_id.slice(0, 8)}</span>
                            </div>
                            {mins !== null && (
                                <div className="flex items-center gap-1 text-red-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                    T+{mins}M
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 relative">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-black text-slate-700 italic z-10 bg-[#0a111a] px-2">VS</div>
                            <div className="space-y-2">
                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] text-center">ALPHA</p>
                                <div className="space-y-1">
                                    {[{ u: m.player1_name }, isDoubles ? { u: m.player3_name } : null].filter(Boolean).map((p, i) => p && (
                                        <div key={i} className="bg-white/5 border border-white/5 px-2 py-1.5 rounded-lg text-center">
                                            <p className="text-[10px] font-black text-white uppercase italic truncate tracking-widest">{p.u || '???'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2 text-right">
                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] text-center">BRAVO</p>
                                <div className="space-y-1">
                                    {[{ u: m.player2_name }, isDoubles ? { u: m.player4_name } : null].filter(Boolean).map((p, i) => p && (
                                        <div key={i} className="bg-white/5 border border-white/5 px-2 py-1.5 rounded-lg text-center">
                                            <p className="text-[10px] font-black text-white uppercase italic truncate tracking-widest">{p.u || '???'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <Link href={`/matches/${m.match_id}`} className="block w-full text-center py-2.5 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-cyan-50 transition-all shadow-lg shadow-white/5">
                            ENTER OBSERVATION
                        </Link>
                    </div>
                ) : (
                    <div className="h-[148px] flex flex-col items-center justify-center border border-white/5 border-dashed rounded-2xl bg-white/[0.02] group/empty">
                        <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic group-hover/empty:text-slate-400 transition-colors">Waiting for assignment</div>
                    </div>
                )}
            </div>
        </div>
    );
}
