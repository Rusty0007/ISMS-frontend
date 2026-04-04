"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = "nearby" | "explore" | "mine" | "invites";

interface OpenPlaySession {
    id:               string;
    club_id:          string;
    club_name:        string;
    title:            string;
    sport:            string;
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
}

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; border: string; bg: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-cyan-400",    border: "border-cyan-500/40",    bg: "bg-cyan-500/10"    },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  border: "border-purple-500/40",  bg: "bg-purple-500/10"  },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  border: "border-orange-500/40",  bg: "bg-orange-500/10"  },
};

const PROXIMITY_META: Record<string, { label: string; color: string; bg: string }> = {
    city:     { label: "Same City",     color: "text-cyan-400",    bg: "bg-cyan-500/10"    },
    province: { label: "Same Province", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    region:   { label: "Same Region",   color: "text-blue-400",    bg: "bg-blue-500/10"    },
};

interface ClubItem {
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
    logo_url:  string | null;
    cover_url: string | null;
}

interface ClubInvite {
    invite_id: string;
    club_id: string;
    club_name: string | null;
    sport: string | null;
    category: string | null;
    invited_by_username: string | null;
    message: string | null;
    expires_at: string;
    created_at: string;
}

interface MyClubs {
    admin: { id: string; name: string; sport: string | null }[];
    member: { id: string; name: string; sport: string | null }[];
    member_club_ids: string[];
}

// ── Icons ──────────────────────────────────────────────────────────────────

function IconSearch({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}

function IconUsers({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
}

function IconCourt({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string): number {
    const diff = new Date(isoDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 animate-pulse">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-3">
                    <div className="h-6 w-1/3 bg-white/10 rounded-lg" />
                    <div className="h-4 w-2/3 bg-white/5 rounded-lg" />
                    <div className="flex gap-4">
                        <div className="h-4 w-20 bg-white/5 rounded-lg" />
                        <div className="h-4 w-20 bg-white/5 rounded-lg" />
                    </div>
                </div>
                <div className="w-20 h-8 bg-white/10 rounded-xl" />
            </div>
        </div>
    );
}

function TabSwitcher({ active, onChange, inviteCount }: { active: Tab; onChange: (t: Tab) => void; inviteCount: number }) {
    const tabs: { key: Tab; label: string }[] = [
        { key: "nearby",  label: "Near Me"  },
        { key: "explore", label: "Explore"  },
        { key: "mine",    label: "My Clubs" },
        { key: "invites", label: "Invites"  },
    ];

    return (
        <div className="flex p-1 bg-zinc-900/80 backdrop-blur-md border border-white/5 rounded-2xl">
            {tabs.map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    className={`flex-1 relative py-2.5 text-xs font-bold rounded-xl transition-all duration-300 ${
                        active === key
                            ? "bg-zinc-800 text-white shadow-xl shadow-black/20"
                            : "text-zinc-500 hover:text-zinc-300"
                    }`}
                >
                    {label}
                    {key === "invites" && inviteCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-black text-white flex items-center justify-center">
                            {inviteCount > 9 ? "9+" : inviteCount}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

function DiscoveryBar({
    sport,
    setSport,
    search,
    setSearch,
}: {
    sport: string;
    setSport: (s: string) => void;
    search: string;
    setSearch: (s: string) => void;
}) {
    return (
        <div className="space-y-4">
            {/* Search Input */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-cyan-400 transition-colors">
                    <IconSearch className="w-5 h-5" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search clubs by name..."
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/40 transition-all placeholder:text-zinc-600"
                />
            </div>

            {/* Sport Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                {["", "pickleball", "badminton", "lawn_tennis", "table_tennis"].map(s => {
                    const meta = s ? SPORTS_META[s] : null;
                    const isActive = sport === s;
                    return (
                        <button
                            key={s}
                            onClick={() => setSport(s)}
                            className={`flex-shrink-0 text-xs font-bold px-4 py-2 rounded-full border transition-all duration-300 whitespace-nowrap ${
                                isActive
                                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                                    : "bg-zinc-900/30 border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                            }`}
                        >
                            {s ? `${meta?.emoji} ${meta?.label}` : "🌍 All Sports"}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ClubCard({
    club,
    isMember,
    isAdmin,
    joining,
    onJoin,
    showProximity = false,
    playMode = null,
}: {
    club: ClubItem;
    isMember: boolean;
    isAdmin: boolean;
    joining: string | null;
    onJoin: (id: string) => void;
    showProximity?: boolean;
    playMode?: "open-play" | "court-rental" | null;
}) {
    const meta = club.sport ? SPORTS_META[club.sport] : null;
    const proximity = showProximity && club.proximity ? PROXIMITY_META[club.proximity] : null;
    const clubHref = playMode === "court-rental"
        ? `/clubs/${club.id}?tab=court-rental`
        : playMode === "open-play"
        ? `/clubs/${club.id}?tab=open-play`
        : `/clubs/${club.id}`;

    return (
        <div className="bg-zinc-900/40 backdrop-blur-sm border border-white/5 rounded-[2rem] overflow-hidden hover:bg-zinc-900/60 hover:border-white/10 transition-all duration-300 group">
            {/* Cover strip */}
            {club.cover_url ? (
                <div
                    className="w-full h-20 bg-zinc-800"
                    style={{ backgroundImage: `url(${club.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }}
                />
            ) : (
                <div className="w-full h-2 bg-gradient-to-r from-zinc-800 to-zinc-700" />
            )}

            <div className="p-6">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {/* Logo or sport emoji */}
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center flex-shrink-0 -mt-8 ring-2 ring-zinc-950">
                            {club.logo_url
                                ? <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover" />
                                : <span className="text-base group-hover:scale-110 transition-transform">{meta?.emoji ?? "🏟️"}</span>
                            }
                        </div>
                        <Link
                            href={clubHref}
                            className="font-black text-lg text-white hover:text-cyan-400 transition-colors truncate"
                        >
                            {club.name}
                        </Link>
                        {proximity && (
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${proximity.bg} ${proximity.color}`}>
                                {proximity.label}
                            </span>
                        )}
                    </div>
                    
                    {club.description && (
                        <p className="text-sm text-zinc-500 line-clamp-2 mb-4 leading-relaxed">{club.description}</p>
                    )}

                    <div className="flex items-center gap-6 text-[11px] font-bold text-zinc-400">
                        <div className="flex items-center gap-1.5">
                            <IconUsers className="w-3.5 h-3.5 text-zinc-600" />
                            <span>{club.member_count} Members</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <IconCourt className="w-3.5 h-3.5 text-zinc-600" />
                            <span>{club.court_count} Courts</span>
                        </div>
                        {meta && (
                            <span className={`${meta.color} font-black uppercase tracking-widest text-[9px]`}>{meta.label}</span>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                    {isAdmin ? (
                        <Link
                            href={`/clubs/${club.id}/admin`}
                            className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-black px-4 py-2 rounded-xl transition-all shadow-lg shadow-cyan-500/10 text-center"
                        >
                            Manage
                        </Link>
                    ) : isMember ? (
                        <Link
                            href={clubHref}
                            className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black px-4 py-2 rounded-xl transition-all text-center"
                        >
                            View
                        </Link>
                    ) : (
                        <button
                            onClick={() => onJoin(club.id)}
                            disabled={joining === club.id}
                            className="bg-white/5 hover:bg-white/10 border border-white/5 text-white text-xs font-black px-5 py-2.5 rounded-xl transition-all disabled:opacity-40"
                        >
                            {joining === club.id ? "Joining..." : "Join Club"}
                        </button>
                    )}
                </div>
            </div>
            </div> {/* /p-6 */}
        </div>
    );
}

function SessionCard({ session, onJoin }: { session: OpenPlaySession; onJoin: (id: string) => void }) {
    const meta       = SPORTS_META[session.sport] ?? { emoji: "🏸", color: "text-cyan-400" };
    const slotsLeft  = session.max_players - session.confirmed_count;
    const dateObj    = new Date(session.session_date);
    const dateLabel  = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timeLabel  = dateObj.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const priceLabel = session.price_per_head === 0 ? "Free" : `₱${session.price_per_head}/head`;
    const isFull     = slotsLeft <= 0;

    return (
        <div className="bg-zinc-900/50 border border-white/5 hover:border-emerald-500/20 rounded-3xl p-5 flex flex-col gap-3 transition-all">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{meta.emoji}</span>
                    <div className="min-w-0">
                        <p className="font-black text-white truncate">{session.title}</p>
                        <p className="text-xs text-zinc-500 truncate">{session.club_name}</p>
                    </div>
                </div>
                <span className={`text-xs font-black shrink-0 ${session.price_per_head === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                    {priceLabel}
                </span>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full">📅 {dateLabel} · {timeLabel}</span>
                <span className="bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full">⏱ {session.duration_hours}h</span>
                {session.court_name && (
                    <span className="bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full">🏟 {session.court_name}</span>
                )}
                {(session.skill_min != null || session.skill_max != null) && (
                    <span className="bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full">
                        ⭐ {session.skill_min ?? "?"} – {session.skill_max ?? "?"}
                    </span>
                )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                    <div className={`text-xs font-black ${isFull ? "text-red-400" : "text-emerald-400"}`}>
                        {isFull ? "Full" : `${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} left`}
                    </div>
                    <div className="text-zinc-600 text-xs">
                        · {session.confirmed_count}/{session.max_players}
                        {session.waitlisted_count > 0 && ` (+${session.waitlisted_count} waitlist)`}
                    </div>
                </div>
                {session.is_joined ? (
                    <Link
                        href={`/clubs/${session.club_id}?tab=open-play`}
                        className="text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 rounded-xl"
                    >
                        Joined ✓
                    </Link>
                ) : (
                    <button
                        onClick={() => onJoin(session.id)}
                        disabled={isFull}
                        className="text-xs font-black bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 px-4 py-1.5 rounded-xl transition-all"
                    >
                        {isFull ? "Full" : "Join"}
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClubsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                    <div className="text-zinc-500 text-xs font-black tracking-widest uppercase animate-pulse">Initializing...</div>
                </div>
            </div>
        }>
            <ClubsPageContent />
        </Suspense>
    );
}

function ClubsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [tab, setTab]             = useState<Tab>((searchParams.get("tab") as Tab) ?? "nearby");
    const [playMode, setPlayMode]   = useState<"open-play" | "court-rental" | null>(
        (searchParams.get("mode") as "open-play" | "court-rental") ?? null
    );
    const [sport, setSport]         = useState("");
    const [search, setSearch]       = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    
    const [clubs, setClubs]         = useState<ClubItem[]>([]);
    const [myClubs, setMyClubs]     = useState<MyClubs>({ admin: [], member: [], member_club_ids: [] });
    const [invites, setInvites]     = useState<ClubInvite[]>([]);
    const [inviteCount, setInviteCount] = useState(0);
    const [loading, setLoading]     = useState(true);
    const [joining, setJoining]     = useState<string | null>(null);
    const [responding, setResponding] = useState<string | null>(null);
    const [openSessions, setOpenSessions]     = useState<OpenPlaySession[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);

    // ── Search Debouncing ────────────────────────────────────────────────

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

    // ── Auth guard + bootstrap (mine + invite count) ──────────────────────

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        Promise.all([
            fetch("/api/clubs/mine",      { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/clubs/my-invites", { headers: { Authorization: `Bearer ${token}` } }),
        ]).then(async ([mineRes, invRes]) => {
            if (isUnauthorized(mineRes.status) || isUnauthorized(invRes.status)) {
                clearAuthSession(); router.replace("/login"); return;
            }
            if (mineRes.ok) {
                const d = await mineRes.json();
                setMyClubs({ admin: d.admin ?? [], member: d.member ?? [], member_club_ids: d.member_club_ids ?? [] });
            }
            if (invRes.ok) {
                const d: ClubInvite[] = await invRes.json();
                setInviteCount(d.length);
                setInvites(d);
            }
        });
    }, [router]);

    // ── Tab-driven data fetch ─────────────────────────────────────────────

    const fetchClubs = useCallback((activeTab: Tab, activeSport: string, query: string) => {
        if (activeTab === "mine" || activeTab === "invites") return;
        const token = getAccessToken();
        if (!token) return;
        setLoading(true);
        const mode = activeTab === "nearby" ? "nearby" : "explore";
        let url  = `/api/clubs?mode=${mode}`;
        if (activeSport) url += `&sport=${activeSport}`;
        if (query) url += `&q=${encodeURIComponent(query)}`;

        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                return r.ok ? r.json() : [];
            })
            .then(d => { if (d) setClubs(d); })
            .finally(() => setLoading(false));
    }, [router]);

    const fetchInvites = useCallback(() => {
        const token = getAccessToken();
        if (!token) return;
        setLoading(true);
        fetch("/api/clubs/my-invites", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then((d: ClubInvite[]) => { setInvites(d); setInviteCount(d.length); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (tab === "invites") { fetchInvites(); return; }
        if (tab === "mine") { setLoading(false); return; }
        fetchClubs(tab, sport, debouncedSearch);
    }, [tab, sport, debouncedSearch, fetchClubs, fetchInvites]);

    // Sync tab to URL param
    function switchTab(t: Tab) {
        setTab(t);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", t);
        router.push(`/clubs?${params.toString()}`);
    }

    // ── Open Play global session fetch ────────────────────────────────────

    useEffect(() => {
        if (playMode !== "open-play") return;
        const token = getAccessToken();
        if (!token) return;
        setLoadingSessions(true);
        fetch("/api/open-play/sessions?status=upcoming", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then((d: OpenPlaySession[]) => setOpenSessions(d))
            .finally(() => setLoadingSessions(false));
    }, [playMode]);

    async function handleJoinSession(sessionId: string) {
        const token = getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/open-play/${sessionId}/join`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            setOpenSessions(prev => prev.map(s =>
                s.id === sessionId
                    ? { ...s, is_joined: true, confirmed_count: s.confirmed_count + 1 }
                    : s
            ));
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────

    async function handleJoin(clubId: string) {
        const token = getAccessToken();
        if (!token) return;
        setJoining(clubId);
        try {
            const res = await fetch(`/api/clubs/${clubId}/join`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setMyClubs(prev => ({
                    ...prev,
                    member_club_ids: [...prev.member_club_ids, clubId],
                }));
                setClubs(prev => prev.map(c =>
                    c.id === clubId ? { ...c, member_count: c.member_count + 1 } : c
                ));
            }
        } finally { setJoining(null); }
    }

    async function handleRespond(inviteId: string, response: "accepted" | "declined") {
        const token = getAccessToken();
        if (!token) return;
        setResponding(inviteId);
        try {
            const res = await fetch(`/api/clubs/invites/${inviteId}/respond`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ response }),
            });
            if (res.ok) {
                setInvites(prev => prev.filter(i => i.invite_id !== inviteId));
                setInviteCount(prev => Math.max(0, prev - 1));
            }
        } finally { setResponding(null); }
    }

    // ── Derived ───────────────────────────────────────────────────────────

    const adminIds   = new Set(myClubs.admin.map(c => c.id));
    const memberIds  = new Set(myClubs.member_club_ids);

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col selection:bg-cyan-500/30">
            {/* Background Polish */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-cyan-500/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full" />
                <div className="absolute inset-0"
                    style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)`, backgroundSize: "80px 80px" }} />
            </div>

            <NavBar backHref="/dashboard" backLabel="Dashboard" />

            <main className="relative z-10 max-w-4xl mx-auto w-full px-4 py-12 flex flex-col gap-8">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight mb-2">Club Ecosystem</h1>
                        <p className="text-zinc-500 text-sm font-medium">Join local communities and dominate the court.</p>
                    </div>
                    <Link
                        href="/clubs/create"
                        className="bg-white text-zinc-950 font-black text-xs px-6 py-3 rounded-2xl hover:scale-105 transition-transform shadow-xl shadow-white/5 inline-flex items-center justify-center gap-2"
                    >
                        <span>+</span> Create New Club
                    </Link>
                </div>

                {/* Mode Banner */}
                {playMode && (
                    <div className={`flex items-center justify-between gap-4 px-5 py-4 rounded-2xl border ${
                        playMode === "open-play"
                            ? "bg-emerald-500/5 border-emerald-500/20"
                            : "bg-cyan-500/5 border-cyan-500/20"
                    }`}>
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{playMode === "open-play" ? "🤝" : "🏟️"}</span>
                            <div>
                                <p className={`text-sm font-black ${playMode === "open-play" ? "text-emerald-400" : "text-cyan-400"}`}>
                                    {playMode === "open-play" ? "Finding Open Play Sessions" : "Finding Courts to Rent"}
                                </p>
                                <p className="text-xs text-zinc-500">
                                    {playMode === "open-play"
                                        ? "Click a club to view its sessions and join one."
                                        : "Click a club to view court availability and book a slot."}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setPlayMode(null)} className="text-zinc-500 hover:text-white transition-colors text-lg shrink-0">✕</button>
                    </div>
                )}

                {/* Open Play Session Cards */}
                {playMode === "open-play" && (
                    <div className="flex flex-col gap-3">
                        <h2 className="text-xs font-black tracking-[0.3em] text-zinc-500 uppercase flex items-center gap-3">
                            <span className="w-6 h-px bg-zinc-800" /> Upcoming Sessions
                        </h2>
                        {loadingSessions ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                            </div>
                        ) : openSessions.length === 0 ? (
                            <div className="text-center py-10 text-zinc-500 text-sm">
                                No upcoming sessions found. Browse a club below to schedule one.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {openSessions.map(s => (
                                    <SessionCard key={s.id} session={s} onJoin={handleJoinSession} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Tabs & Discovery */}
                <div className="flex flex-col gap-6">
                    <TabSwitcher active={tab} onChange={switchTab} inviteCount={inviteCount} />
                    {(tab === "nearby" || tab === "explore") && (
                        <DiscoveryBar
                            sport={sport}
                            setSport={setSport}
                            search={search}
                            setSearch={setSearch}
                        />
                    )}
                </div>

                {/* Content Area */}
                <div className="min-h-[400px]">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            
                            {/* ── Near Me / Explore ── */}
                            {(tab === "nearby" || tab === "explore") && (
                                <>
                                    {clubs.length === 0 ? (
                                        <EmptyState
                                            title="No Clubs Found"
                                            message={search || sport ? "Try adjusting your filters to find more clubs." : "We couldn&apos;t find any clubs in your area yet."}
                                            icon="🌍"
                                        />
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {clubs.map((club, i) => (
                                                <div key={club.id} className="relative">
                                                    {tab === "explore" && i < 3 && (
                                                        <span className="absolute -left-2 -top-2 z-10 text-[10px] font-black bg-zinc-800 border border-white/10 rounded-full w-6 h-6 flex items-center justify-center text-cyan-400 shadow-xl">
                                                            {i + 1}
                                                        </span>
                                                    )}
                                                    <ClubCard
                                                        club={club}
                                                        isMember={memberIds.has(club.id)}
                                                        isAdmin={adminIds.has(club.id)}
                                                        joining={joining}
                                                        onJoin={handleJoin}
                                                        showProximity={tab === "nearby"}
                                                        playMode={playMode}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── My Clubs ── */}
                            {tab === "mine" && (
                                <div className="space-y-12">
                                    {myClubs.admin.length === 0 && myClubs.member.length === 0 ? (
                                        <EmptyState
                                            title="Your Bag is Empty"
                                            message="You haven&apos;t joined any clubs yet. Time to get active!"
                                            cta={{ label: "Explore Clubs", onClick: () => switchTab("nearby") }}
                                            icon="🏸"
                                        />
                                    ) : (
                                        <>
                                            {myClubs.admin.length > 0 && (
                                                <section>
                                                    <header className="flex items-center gap-4 mb-6">
                                                        <h2 className="text-xs font-black text-zinc-600 uppercase tracking-[0.2em]">Administering</h2>
                                                        <div className="h-px bg-zinc-900 flex-1" />
                                                    </header>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {myClubs.admin.map(c => {
                                                            const meta = c.sport ? SPORTS_META[c.sport] : null;
                                                            return (
                                                                <Link key={c.id} href={`/clubs/${c.id}`} className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 flex items-center justify-between hover:bg-zinc-900/60 transition-colors group">
                                                                    <div className="flex items-center gap-4">
                                                                        <span className="text-2xl group-hover:scale-110 transition-transform">{meta?.emoji ?? "🏘"}</span>
                                                                        <div>
                                                                            <p className="font-black text-white">{c.name}</p>
                                                                            {meta && <p className={`text-[10px] font-black uppercase tracking-wider ${meta.color}`}>{meta.label}</p>}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <Link href={`/clubs/${c.id}/admin`} className="bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors">Manage</Link>
                                                                    </div>
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                </section>
                                            )}
                                            {myClubs.member.length > 0 && (
                                                <section>
                                                    <header className="flex items-center gap-4 mb-6">
                                                        <h2 className="text-xs font-black text-zinc-600 uppercase tracking-[0.2em]">Member of</h2>
                                                        <div className="h-px bg-zinc-900 flex-1" />
                                                    </header>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {myClubs.member.map(c => {
                                                            const meta = c.sport ? SPORTS_META[c.sport] : null;
                                                            return (
                                                                <Link key={c.id} href={`/clubs/${c.id}`} className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 flex items-center justify-between hover:bg-zinc-900/60 transition-colors group">
                                                                    <div className="flex items-center gap-4">
                                                                        <span className="text-2xl group-hover:scale-110 transition-transform">{meta?.emoji ?? "🏘"}</span>
                                                                        <div>
                                                                            <p className="font-black text-white">{c.name}</p>
                                                                            {meta && <p className={`text-[10px] font-black uppercase tracking-wider ${meta.color}`}>{meta.label}</p>}
                                                                        </div>
                                                                    </div>
                                                                    <span className="text-zinc-600 group-hover:text-white transition-colors">→</span>
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                </section>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── Invites ── */}
                            {tab === "invites" && (
                                <div className="max-w-2xl mx-auto w-full">
                                    {invites.length === 0 ? (
                                        <EmptyState
                                            title="No Active Invites"
                                            message="When clubs invite you to join, they&apos;ll appear here."
                                            icon="💌"
                                        />
                                    ) : (
                                        <div className="flex flex-col gap-4">
                                            {invites.map(inv => {
                                                const meta = inv.sport ? SPORTS_META[inv.sport] : null;
                                                const days = daysUntil(inv.expires_at);
                                                const isResponding = responding === inv.invite_id;
                                                return (
                                                    <div key={inv.invite_id} className="bg-zinc-900/40 border border-white/5 rounded-[2rem] p-8">
                                                        <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-3 mb-2">
                                                                    <span className="text-3xl">{meta?.emoji ?? "🏘"}</span>
                                                                    <div>
                                                                        <h3 className="font-black text-xl text-white">{inv.club_name}</h3>
                                                                        <p className="text-xs font-black text-cyan-400 uppercase tracking-widest">{inv.category}</p>
                                                                    </div>
                                                                </div>
                                                                <p className="text-zinc-400 text-sm mb-4">
                                                                    Invited by <span className="text-white font-bold">@{inv.invited_by_username}</span>
                                                                </p>
                                                                {inv.message && (
                                                                    <div className="bg-zinc-950/50 rounded-2xl p-4 border border-white/5 mb-4">
                                                                        <p className="text-zinc-400 text-xs italic leading-relaxed">&ldquo;{inv.message}&rdquo;</p>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                                    <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Expires in {days} day{days !== 1 ? "s" : ""}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-32">
                                                                <button
                                                                    onClick={() => handleRespond(inv.invite_id, "accepted")}
                                                                    disabled={isResponding}
                                                                    className="flex-1 bg-white text-zinc-950 text-xs font-black py-3 rounded-2xl hover:scale-105 transition-transform disabled:opacity-40"
                                                                >
                                                                    {isResponding ? "..." : "Accept"}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRespond(inv.invite_id, "declined")}
                                                                    disabled={isResponding}
                                                                    className="flex-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-black py-3 rounded-2xl hover:bg-red-500/20 transition-colors disabled:opacity-40"
                                                                >
                                                                    Decline
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function EmptyState({ title, message, icon, cta }: { title: string; message: string; icon: string; cta?: { label: string; onClick: () => void } }) {
    return (
        <div className="bg-zinc-900/20 border border-white/5 rounded-[3rem] p-16 text-center flex flex-col items-center gap-4">
            <span className="text-5xl mb-2">{icon}</span>
            <h3 className="text-xl font-black text-white">{title}</h3>
            <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">{message}</p>
            {cta && (
                <button
                    onClick={cta.onClick}
                    className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-black px-8 py-3 rounded-2xl transition-all"
                >
                    {cta.label}
                </button>
            )}
        </div>
    );
}
