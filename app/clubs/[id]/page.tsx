"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// ── Types ──────────────────────────────────────────────────────────────────

type HubTab = "about" | "open-play" | "court-rental";

interface LiveMatch {
    match_id:     string;
    sport:        string | null;
    match_format: string | null;
    player1_id:   string | null; player2_id: string | null;
    player3_id:   string | null; player4_id: string | null;
    player1_username: string | null; player2_username: string | null;
    player3_username: string | null; player4_username: string | null;
    player1_matches_played: number | null; player2_matches_played: number | null;
    player3_matches_played: number | null; player4_matches_played: number | null;
    referee_id:       string | null;
    referee_username: string | null;
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
    admin_username:  string | null;
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
    username:                string;
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

function fmtTime(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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

function fmtSessionDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function offsetDate(base: string, days: number): string {
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function dateDayLabel(iso: string, todayISO: string): string {
    if (iso === todayISO) return "Today";
    if (iso === offsetDate(todayISO, -1)) return "Yesterday";
    if (iso === offsetDate(todayISO, 1)) return "Tomorrow";
    return new Date(iso + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function buildTimeSlots(openTime: string, closeTime: string): string[] {
    const [oh, om] = openTime.split(":").map(Number);
    const [ch, cm] = closeTime.split(":").map(Number);
    const slots: string[] = [];
    let cur = oh * 60 + (om || 0);
    const end = ch * 60 + (cm || 0);
    while (cur < end) {
        const h = Math.floor(cur / 60);
        const m = cur % 60;
        slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
        cur += 60;
    }
    return slots;
}

function sessionHourSlot(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:00`;
}

function fmtHour(hhmm: string): string {
    const [h, m] = hhmm.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const display = h % 12 || 12;
    return m ? `${display}:${String(m).padStart(2, "0")} ${ampm}` : `${display} ${ampm}`;
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
    const [formTitle,    setFormTitle]    = useState("");
    const [formSport,    setFormSport]    = useState("badminton");
    const [formDate,     setFormDate]     = useState("");
    const [formMax,      setFormMax]      = useState("8");
    const [formPrice,    setFormPrice]    = useState("0");
    const [formCourt,    setFormCourt]    = useState("");
    const [formDesc,     setFormDesc]     = useState("");
    const [courts,       setCourts]       = useState<CourtBasic[]>([]);
    const [formSubmitting, setFormSubmitting] = useState(false);

    // Rankings state
    const [rankings,   setRankings]   = useState<RankingEntry[]>([]);
    const [rankLoading, setRankLoading] = useState(false);
    const [rankSport,  setRankSport]  = useState("badminton");
    const [rankFormat, setRankFormat] = useState<"singles" | "doubles">("singles");
    const [rankGender, setRankGender] = useState<"" | "male" | "female">("");

    // Court Rental state
    const [rentalDate,   setRentalDate]   = useState(todayISO());
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
            fetch(`/api/clubs/${clubId}/courts`,     { headers: { Authorization: `Bearer ${token}` } }),
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
            if (clubData.sport) setRankSport(clubData.sport);
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
        fetch(`/api/clubs/${clubId}/courts/availability?date=${rentalDate}`, { headers: { Authorization: `Bearer ${token}` } })
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
        }
        setJoiningId(null);
    }

    async function handleCreateSession(e: React.FormEvent) {
        e.preventDefault();
        const token = getToken();
        if (!token) return;
        setFormSubmitting(true);
        const res = await fetch(`/api/clubs/${clubId}/open-play`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                title:          formTitle,
                sport:          formSport,
                session_date:   formDate,
                max_players:    parseInt(formMax),
                price_per_head: parseFloat(formPrice) || 0,
                court_id:       formCourt || null,
                description:    formDesc || null,
            }),
        });
        if (res.ok) {
            setShowForm(false);
            setFormTitle(""); setFormDate(""); setFormDesc("");
            // Refresh sessions
            const token2 = getAccessToken();
            if (token2) {
                const r = await fetch(`/api/clubs/${clubId}/open-play?status=upcoming`, { headers: { Authorization: `Bearer ${token2}` } });
                if (r.ok) { const d = await r.json(); setSessions(d.sessions ?? []); }
            }
            showToast("Session created!");
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
                <NavBar backHref="/clubs" backLabel="← Clubs" />
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
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
            <NavBar backHref="/clubs" backLabel="← Clubs" />

            {/* Toast */}
            {toast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 border border-white/10 text-sm text-white px-5 py-3 rounded-2xl shadow-2xl">
                    {toast}
                </div>
            )}

            {/* Booking confirmation modal */}
            {bookingSlot && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4">
                        <h3 className="font-black text-lg">Confirm Booking</h3>
                        <p className="text-zinc-400 text-sm">
                            Book <span className="text-white font-semibold">{bookingSlot.courtName}</span> on{" "}
                            <span className="text-white font-semibold">{new Date(rentalDate).toLocaleDateString([], { month: "short", day: "numeric" })}</span>{" "}
                            at <span className="text-white font-semibold">{fmtSlotTime(bookingSlot.slot.start)}</span> for 1 hour?
                        </p>
                        <p className="text-xs text-zinc-600">Booking requires admin approval.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setBookingSlot(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm font-semibold hover:bg-white/5 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleBookSlot} disabled={bookingLoading} className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-sm font-black transition-colors disabled:opacity-50">
                                {bookingLoading ? "Booking..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">

                {/* Cover Banner */}
                <div className={`w-full rounded-2xl overflow-hidden mb-4 ${club.cover_url ? "h-44" : "h-2 bg-gradient-to-r from-zinc-800 to-zinc-700"}`}
                    style={club.cover_url ? { backgroundImage: `url(${club.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                />

                {/* Header */}
                <div className="flex items-start gap-4 mb-6">
                    {/* Logo — pulls up over the cover if present */}
                    <div className={`w-20 h-20 rounded-2xl bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center text-4xl flex-shrink-0 overflow-hidden shadow-xl ${club.cover_url ? "-mt-12" : ""}`}>
                        {club.logo_url
                            ? <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover" />
                            : sportEmoji
                        }
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black truncate">{club.name}</h1>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                            {club.category && (
                                <span className="text-xs bg-zinc-800 border border-white/10 text-zinc-400 px-2 py-0.5 rounded-full">
                                    {CATEGORY_LABELS[club.category] ?? club.category}
                                </span>
                            )}
                            {club.sport && (
                                <span className="text-xs bg-zinc-800 border border-white/10 text-zinc-400 px-2 py-0.5 rounded-full capitalize">
                                    {club.sport.replace("_", " ")}
                                </span>
                            )}
                            {club.membership_type === "invite_only" && (
                                <span className="text-xs bg-zinc-800 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full">
                                    Invite Only
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tab switcher */}
                <div className="flex gap-1 bg-zinc-900/60 border border-white/5 rounded-2xl p-1 mb-6">
                    {([
                        { key: "open-play",    label: "🤝 Open Play"    },
                        { key: "court-rental", label: "🏟️ Court Rental" },
                        { key: "about",        label: "ℹ️ About"        },
                    ] as { key: HubTab; label: string }[]).map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${
                                tab === t.key
                                    ? "bg-white text-zinc-950 shadow"
                                    : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── About Tab ─────────────────────────────────────────────────────── */}
                {tab === "about" && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-zinc-900 border border-white/10 rounded-xl p-3 text-center">
                                    <p className="text-xl font-black text-white">{club.member_count}</p>
                                    <p className="text-xs text-zinc-500">Members</p>
                                </div>
                                <div className="bg-zinc-900 border border-white/10 rounded-xl p-3 text-center">
                                    <p className="text-xl font-black text-white">{club.court_count}</p>
                                    <p className="text-xs text-zinc-500">Courts</p>
                                </div>
                                <div className={`${crowd.bg} border ${crowd.border} rounded-xl p-3 text-center`}>
                                    <div className="flex items-center justify-center gap-1">
                                        <span className={`w-2 h-2 rounded-full ${crowd.dot} animate-pulse`} />
                                        <p className={`text-sm font-black ${crowd.text}`}>{occupancy?.crowd_level ?? "—"}</p>
                                    </div>
                                    <p className="text-xs text-zinc-500">Crowd</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                {!isMember && club.membership_type !== "invite_only" && (
                                    <button onClick={handleJoin} className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold py-2.5 rounded-xl text-sm transition-colors">
                                        Join Club
                                    </button>
                                )}
                                {isMember && (
                                    <div className="w-full text-center text-sm text-emerald-400 font-semibold py-2.5 border border-emerald-500/30 bg-emerald-500/10 rounded-xl">
                                        ✓ Member
                                    </div>
                                )}
                                {isAdmin && (
                                    <Link href={`/clubs/${clubId}/admin`} className="w-full text-center text-sm font-bold py-2.5 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 rounded-xl transition-colors">
                                        Manage Club →
                                    </Link>
                                )}
                            </div>

                            {occupancy && occupancy.total > 0 && (
                                <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-zinc-400">Court Occupancy</span>
                                        <span className="text-xs text-zinc-600">{occupancy.occupied}/{occupancy.total} in use</span>
                                    </div>
                                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${
                                                occupancy.crowd_level === "High"     ? "bg-red-500" :
                                                occupancy.crowd_level === "Moderate" ? "bg-yellow-500" :
                                                "bg-emerald-500"
                                            }`}
                                            style={{ width: occupancy.total > 0 ? `${(occupancy.occupied / occupancy.total) * 100}%` : "0%" }}
                                        />
                                    </div>
                                    <p className="text-xs text-zinc-600 mt-1.5">Auto-refreshes every 8 seconds</p>
                                </div>
                            )}

                            {/* Description + address */}
                            {(club.description || club.address) && (
                                <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex flex-col gap-2">
                                    {club.description && <p className="text-sm text-zinc-400">{club.description}</p>}
                                    {club.address     && <p className="text-xs text-zinc-600">📍 {club.address}</p>}
                                    <p className="text-xs text-zinc-600">Managed by <span className="text-zinc-400">@{club.admin_username ?? "unknown"}</span></p>
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {occupancy && occupancy.total > 0 ? (
                                <div className="flex flex-col gap-3">
                                    <h2 className="text-sm font-bold text-zinc-300">🏟 Live Court Status</h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {occupancy.courts.map(court => (
                                            <PublicCourtCard key={court.court_id} court={court} />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-10 text-center text-zinc-500 text-sm flex items-center justify-center">
                                    <div>
                                        <div className="text-4xl mb-3">🏟</div>
                                        <p>No courts registered yet.</p>
                                        {isAdmin && (
                                            <Link href={`/clubs/${clubId}/admin`} className="text-cyan-400 hover:underline text-xs mt-1 block">
                                                Add courts →
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── Club Rankings ─────────────────────────────── */}
                            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <h2 className="text-sm font-bold text-zinc-300">🏆 Club Rankings</h2>
                                    <div className="flex gap-2 flex-wrap">
                                        <select
                                            value={rankSport}
                                            onChange={e => setRankSport(e.target.value)}
                                            className="bg-zinc-800 border border-white/10 rounded-xl px-2 py-1 text-xs text-white focus:outline-none"
                                        >
                                            <option value="badminton">Badminton</option>
                                            <option value="pickleball">Pickleball</option>
                                            <option value="lawn_tennis">Lawn Tennis</option>
                                            <option value="table_tennis">Table Tennis</option>
                                        </select>
                                        <select
                                            value={rankFormat}
                                            onChange={e => setRankFormat(e.target.value as "singles" | "doubles")}
                                            className="bg-zinc-800 border border-white/10 rounded-xl px-2 py-1 text-xs text-white focus:outline-none"
                                        >
                                            <option value="singles">Singles</option>
                                            <option value="doubles">Doubles</option>
                                        </select>
                                        <select
                                            value={rankGender}
                                            onChange={e => setRankGender(e.target.value as "" | "male" | "female")}
                                            className="bg-zinc-800 border border-white/10 rounded-xl px-2 py-1 text-xs text-white focus:outline-none"
                                        >
                                            <option value="">All Genders</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                    </div>
                                </div>

                                {rankLoading ? (
                                    <div className="flex flex-col gap-2">
                                        {[1,2,3].map(i => <div key={i} className="h-10 bg-zinc-800 rounded-xl animate-pulse" />)}
                                    </div>
                                ) : rankings.length === 0 ? (
                                    <div className="text-center text-zinc-600 text-xs py-6">
                                        No ranked players yet for this filter.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {rankings.map(p => (
                                            <div key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-800/50 transition-colors">
                                                <span className={`w-6 text-center text-xs font-black shrink-0 ${
                                                    p.rank === 1 ? "text-yellow-400" :
                                                    p.rank === 2 ? "text-zinc-300" :
                                                    p.rank === 3 ? "text-amber-600" :
                                                    "text-zinc-600"
                                                }`}>
                                                    {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : `#${p.rank}`}
                                                </span>
                                                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-sm shrink-0 overflow-hidden">
                                                    {p.avatar_url
                                                        ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                                                        : <span>{p.username?.[0]?.toUpperCase() ?? "?"}</span>
                                                    }
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-white truncate">
                                                        {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username}
                                                    </p>
                                                    <p className="text-xs text-zinc-500">@{p.username} · {p.wins}W {p.losses}L</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm font-black text-white">{Math.round(p.rating)}</p>
                                                    <p className="text-xs text-zinc-600">{p.rating_status === "CALIBRATING" ? "Calibrating" : "Rated"}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Open Play Tab ─────────────────────────────────────────────────── */}
                {tab === "open-play" && (() => {
                    const today       = todayISO();
                    const openTime    = club.opening_time  || "06:00";
                    const closeTime   = club.closing_time  || "22:00";
                    const timeSlots   = buildTimeSlots(openTime, closeTime);

                    // Date cards: yesterday · today · tomorrow + 4 more days
                    const dateCards = [-1, 0, 1, 2, 3, 4].map(d => offsetDate(today, d));

                    // Group sessions by hour slot
                    const bySlot: Record<string, SessionCard[]> = {};
                    for (const s of sessions) {
                        const slot = sessionHourSlot(s.session_date);
                        if (!bySlot[slot]) bySlot[slot] = [];
                        bySlot[slot].push(s);
                    }

                    return (
                        <div className="flex flex-col gap-5">

                            {/* ── Date card row ─────────────────────────────── */}
                            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                                {dateCards.map(d => {
                                    const isSelected = d === selectedDate;
                                    const label      = dateDayLabel(d, today);
                                    const dayNum     = new Date(d + "T00:00:00").getDate();
                                    const isPast     = d < today;
                                    return (
                                        <button
                                            key={d}
                                            onClick={() => setSelectedDate(d)}
                                            className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-4 py-3 rounded-2xl border transition-all min-w-[72px] ${
                                                isSelected
                                                    ? "bg-emerald-500 border-emerald-400 text-zinc-950 shadow-lg shadow-emerald-900/30"
                                                    : isPast
                                                    ? "bg-zinc-900/40 border-white/5 text-zinc-600 hover:border-white/10 hover:text-zinc-400"
                                                    : "bg-zinc-900 border-white/10 text-zinc-400 hover:border-emerald-500/30 hover:text-white"
                                            }`}
                                        >
                                            <span className={`text-xs font-semibold ${isSelected ? "text-zinc-900" : ""}`}>{label}</span>
                                            <span className={`text-2xl font-black leading-none ${isSelected ? "text-zinc-950" : "text-white"}`}>{dayNum}</span>
                                            {/* dot if sessions exist on this date */}
                                            <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                                                sessions.length > 0 && d === selectedDate ? "bg-zinc-950" :
                                                "bg-transparent"
                                            }`} />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── Club hours badge ──────────────────────────── */}
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-zinc-500">
                                    🕐 Open {fmtHour(openTime)} – {fmtHour(closeTime)}
                                </p>
                                {isAdmin && (
                                    <button
                                        onClick={() => setShowForm(f => !f)}
                                        className="text-xs font-bold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 px-3 py-1.5 rounded-xl transition-colors"
                                    >
                                        {showForm ? "Cancel" : "+ Schedule Session"}
                                    </button>
                                )}
                            </div>

                            {/* Create form (admin only) */}
                            {isAdmin && showForm && (
                                <form onSubmit={handleCreateSession} className="bg-zinc-900 border border-emerald-500/20 rounded-2xl p-5 flex flex-col gap-4">
                                    <h3 className="font-bold text-sm text-emerald-400">New Open Play Session</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-zinc-500">Title</label>
                                            <input required value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Saturday Open Play" className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-zinc-500">Sport</label>
                                            <select value={formSport} onChange={e => setFormSport(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/40">
                                                <option value="badminton">Badminton</option>
                                                <option value="pickleball">Pickleball</option>
                                                <option value="lawn_tennis">Lawn Tennis</option>
                                                <option value="table_tennis">Table Tennis</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-zinc-500">Date & Time</label>
                                            <input required type="datetime-local" value={formDate} onChange={e => setFormDate(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/40" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-zinc-500">Max Players</label>
                                            <input required type="number" min="2" value={formMax} onChange={e => setFormMax(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/40" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-zinc-500">Fee per Head (₱)</label>
                                            <input type="number" min="0" step="0.01" value={formPrice} onChange={e => setFormPrice(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/40" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-zinc-500">Court (optional)</label>
                                            <select value={formCourt} onChange={e => setFormCourt(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/40">
                                                <option value="">Any / TBD</option>
                                                {courts.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}{c.sport ? ` (${c.sport})` : ""}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-zinc-500">Description (optional)</label>
                                        <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2} className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 resize-none" />
                                    </div>
                                    <button type="submit" disabled={formSubmitting} className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                                        {formSubmitting ? "Creating..." : "Create Session"}
                                    </button>
                                </form>
                            )}

                            {/* ── Time-slot grid ────────────────────────────── */}
                            {sessLoading ? (
                                <div className="flex flex-col gap-2">
                                    {[1,2,3,4].map(i => <div key={i} className="h-14 bg-zinc-900 border border-white/5 rounded-2xl animate-pulse" />)}
                                </div>
                            ) : timeSlots.length === 0 ? (
                                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-10 text-center text-zinc-500 text-sm">
                                    Club hours not configured.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {timeSlots.map(slot => {
                                        const slotSessions = bySlot[slot] ?? [];
                                        const hasSession   = slotSessions.length > 0;
                                        return (
                                            <div key={slot} className={`rounded-2xl border transition-all ${
                                                hasSession
                                                    ? "bg-zinc-900 border-emerald-500/20"
                                                    : "bg-zinc-900/40 border-white/5"
                                            }`}>
                                                {/* Slot header */}
                                                <div className="flex items-center gap-3 px-4 py-2.5">
                                                    <span className={`text-xs font-black w-16 shrink-0 ${hasSession ? "text-emerald-400" : "text-zinc-700"}`}>
                                                        {fmtHour(slot)}
                                                    </span>
                                                    <div className={`flex-1 h-px ${hasSession ? "bg-emerald-500/20" : "bg-white/5"}`} />
                                                    {!hasSession && (
                                                        <span className="text-xs text-zinc-700">No session</span>
                                                    )}
                                                </div>

                                                {/* Sessions in this slot */}
                                                {hasSession && (
                                                    <div className="flex flex-col gap-2 px-3 pb-3">
                                                        {slotSessions.map(s => (
                                                            <SessionCardItem
                                                                key={s.id}
                                                                session={s}
                                                                joining={joiningId === s.id}
                                                                onJoin={() => handleJoinSession(s.id)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ── Court Rental Tab ──────────────────────────────────────────────── */}
                {tab === "court-rental" && (
                    <div className="flex flex-col gap-5">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xs font-black tracking-[0.3em] text-zinc-500 uppercase">Court Availability</h2>
                            <input
                                type="date"
                                value={rentalDate}
                                min={todayISO()}
                                onChange={e => setRentalDate(e.target.value)}
                                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                            />
                        </div>

                        {rentLoading ? (
                            <div className="flex flex-col gap-4">
                                {[1,2].map(i => <div key={i} className="h-40 bg-zinc-900 border border-white/5 rounded-2xl animate-pulse" />)}
                            </div>
                        ) : availability.length === 0 ? (
                            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-12 text-center text-zinc-500">
                                <div className="text-4xl mb-3">🏟️</div>
                                <p>No courts available for rental.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {availability.map(court => (
                                    <div key={court.court_id} className="bg-zinc-900 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-bold text-white">{court.court_name}</p>
                                                <p className="text-xs text-zinc-500">
                                                    {[court.sport?.replace(/_/g, " "), court.surface, court.is_indoor === true ? "Indoor" : court.is_indoor === false ? "Outdoor" : null].filter(Boolean).join(" · ")}
                                                </p>
                                            </div>
                                            {court.price_per_hour !== null && court.price_per_hour > 0 ? (
                                                <span className="text-sm font-black text-cyan-400">₱{court.price_per_hour}/hr</span>
                                            ) : (
                                                <span className="text-xs text-zinc-600">Price TBD</span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {court.slots.map(slot => {
                                                const key = slot.start + court.court_id;
                                                const isPending = bookedSlots.has(key);
                                                return (
                                                    <button
                                                        key={slot.start}
                                                        disabled={!slot.is_available || isPending}
                                                        onClick={() => slot.is_available && !isPending && setBookingSlot({ courtId: court.court_id, courtName: court.court_name, slot })}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                                                            isPending
                                                                ? "bg-amber-500/20 border-amber-500/40 text-amber-400 cursor-default"
                                                                : !slot.is_available
                                                                ? "bg-red-500/10 border-red-500/20 text-red-500/50 cursor-not-allowed"
                                                                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                                                        }`}
                                                    >
                                                        {fmtSlotTime(slot.start)}
                                                        {isPending && " ·pending"}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="flex gap-4 text-xs text-zinc-600">
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Available</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Pending</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Booked</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </main>
        </div>
    );
}

// ── Session Card ───────────────────────────────────────────────────────────────

function SessionCardItem({ session, joining, onJoin }: { session: SessionCard; joining: boolean; onJoin: () => void }) {
    const slotsLeft = session.max_players - session.confirmed_count;
    const isFull    = slotsLeft <= 0;

    return (
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-xl shrink-0">
                    {session.sport_emoji}
                </div>
                <div className="min-w-0">
                    <p className="font-bold text-white truncate">{session.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{fmtSessionDate(session.session_date)}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                        <span className={`text-xs font-semibold ${isFull ? "text-red-400" : slotsLeft <= 2 ? "text-amber-400" : "text-emerald-400"}`}>
                            {isFull ? "Full" : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`}
                        </span>
                        <span className="text-xs text-zinc-600">·</span>
                        <span className="text-xs text-zinc-400">
                            {session.price_per_head > 0 ? `₱${session.price_per_head}/head` : "Free"}
                        </span>
                        {session.court_name && (
                            <>
                                <span className="text-xs text-zinc-600">·</span>
                                <span className="text-xs text-zinc-500">{session.court_name}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="shrink-0">
                {session.is_joined ? (
                    <span className="text-xs font-bold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 rounded-xl">✓ Joined</span>
                ) : (
                    <button
                        onClick={onJoin}
                        disabled={joining}
                        className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {joining ? "..." : isFull ? "Waitlist" : "Join"}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Public Court Card ──────────────────────────────────────────────────────────

function PublicCourtCard({ court }: { court: CourtDetail }) {
    const m         = court.live_match;
    const isDoubles = m?.match_format === "doubles" || m?.match_format === "mixed_doubles";
    const mins      = m ? runningMins(m.started_at) : null;

    return (
        <div className={`border rounded-xl p-4 flex flex-col gap-3 ${
            court.status === "occupied"
                ? "border-red-500/30 bg-red-500/5"
                : "border-emerald-500/20 bg-emerald-500/5"
        }`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        court.status === "occupied" ? "bg-red-400 animate-pulse" : "bg-emerald-400"
                    }`} />
                    <p className="text-sm font-semibold text-zinc-200">{court.name}</p>
                    <span className="text-xs text-zinc-600">
                        {[court.sport?.replace(/_/g, " "), court.surface,
                          court.is_indoor === true ? "Indoor" : court.is_indoor === false ? "Outdoor" : null
                        ].filter(Boolean).join(" · ")}
                    </span>
                </div>
                <span className={`text-xs font-bold flex-shrink-0 ${
                    court.status === "occupied" ? "text-red-400" : "text-emerald-400"
                }`}>{court.status === "occupied" ? "In Use" : "Open"}</span>
            </div>

            {m && (
                <div className="bg-black/20 rounded-lg p-3 flex flex-col gap-2.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                        <span className="capitalize font-semibold text-zinc-400">{m.match_format?.replace(/_/g, " ")}</span>
                        {m.scheduled_at && <span>Sched. {fmtTime(m.scheduled_at)}</span>}
                        {m.started_at   && <span>Started {fmtTime(m.started_at)}</span>}
                        {mins !== null  && <span className="text-red-400 font-semibold">{mins} min</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-600">Referee:</span>
                        {m.referee_username
                            ? <span className="text-purple-400 font-semibold">@{m.referee_username}</span>
                            : <span className="text-zinc-700 italic">None</span>
                        }
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 flex flex-col items-center gap-1">
                            {[{ u: m.player1_username, mp: m.player1_matches_played },
                              isDoubles ? { u: m.player3_username, mp: m.player3_matches_played } : null
                            ].filter(Boolean).map((p, i) => p && (
                                <div key={i} className="text-center">
                                    <p className="text-sm font-semibold text-zinc-200 truncate">@{p.u ?? "?"}</p>
                                    {p.mp !== null && <p className="text-xs text-zinc-600">{p.mp} played</p>}
                                </div>
                            ))}
                        </div>
                        <span className="text-xs text-zinc-600 shrink-0">vs</span>
                        <div className="flex-1 flex flex-col items-center gap-1">
                            {[{ u: m.player2_username, mp: m.player2_matches_played },
                              isDoubles ? { u: m.player4_username, mp: m.player4_matches_played } : null
                            ].filter(Boolean).map((p, i) => p && (
                                <div key={i} className="text-center">
                                    <p className="text-sm font-semibold text-zinc-200 truncate">@{p.u ?? "?"}</p>
                                    {p.mp !== null && <p className="text-xs text-zinc-600">{p.mp} played</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <Link href={`/matches/${m.match_id}`} className="w-full text-center text-xs font-semibold text-red-400 border border-red-500/30 rounded-lg py-2 hover:bg-red-500/10 transition-colors">
                        View Live →
                    </Link>
                </div>
            )}
        </div>
    );
}
