"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import OpenPlayDiscoveryV2 from "@/components/clubs/OpenPlayDiscoveryV2";

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
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-blue-400",    border: "border-blue-500/20",    bg: "bg-blue-500/10"    },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  border: "border-purple-500/20",  bg: "bg-purple-500/10"  },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/10" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  border: "border-orange-500/20",  bg: "bg-orange-500/10"  },
};

const PROXIMITY_META: Record<string, { label: string; color: string; bg: string }> = {
    city:     { label: "Same City",     color: "text-cyan-400",    bg: "bg-cyan-500/10"    },
    province: { label: "Same Province", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    region:   { label: "Same Region",   color: "text-blue-400",    bg: "bg-blue-500/10"    },
};

const TAB_HINTS: Record<Tab, string> = {
    nearby:  "Facilities in your current operational circuit",
    explore: "Global network discovery and expansion",
    mine:    "Your registered facilities and command hubs",
    invites: "Incoming affiliation requests from hub administrators",
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
    logo_url:    string | null;
    cover_url:   string | null;
}

interface ClubInvite {
    invite_id: string;
    club_id: string;
    club_name: string | null;
    sport: string | null;
    category: string | null;
    invited_by_name: string | null;
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
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}

function IconUsers({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string): number {
    const diff = new Date(isoDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
}

function normalizeMyClubs(value: unknown): MyClubs {
    const data = value && typeof value === "object" ? value as Partial<MyClubs> : {};
    return {
        admin: asArray<MyClubs["admin"][number]>(data.admin),
        member: asArray<MyClubs["member"][number]>(data.member),
        member_club_ids: asArray<string>(data.member_club_ids),
    };
}

function normalizeOpenSessions(value: unknown): OpenPlaySession[] {
    if (Array.isArray(value)) return value as OpenPlaySession[];
    if (value && typeof value === "object" && Array.isArray((value as { sessions?: unknown }).sessions)) {
        return (value as { sessions: OpenPlaySession[] }).sessions;
    }
    return [];
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2.5rem] overflow-hidden animate-pulse shadow-2xl">
            <div className="h-32 bg-white/5" />
            <div className="p-8 space-y-4">
                <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/10" />
                    <div className="flex-1 space-y-2 py-2">
                        <div className="h-4 bg-white/10 rounded w-3/4" />
                        <div className="h-3 bg-white/5 rounded w-1/2" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="h-6 bg-white/5 rounded w-20" />
                    <div className="h-6 bg-white/5 rounded w-20" />
                </div>
            </div>
        </div>
    );
}

function TabSwitcher({ active, onChange, inviteCount }: { active: Tab; onChange: (t: Tab) => void; inviteCount: number }) {
    const tabs: { key: Tab; label: string }[] = [
        { key: "nearby",  label: "Circuit" },
        { key: "explore", label: "Global"  },
        { key: "mine",    label: "My Hubs" },
        { key: "invites", label: "Intel"   },
    ];

    return (
        <div className="flex p-1.5 border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl rounded-2xl shadow-2xl">
            {tabs.map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    className={`flex-1 relative py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all duration-300 ${
                        active === key
                            ? "bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_12px_rgba(6,182,212,0.1)] border border-cyan-500/20"
                            : "text-slate-500 hover:text-white"
                    }`}
                >
                    {label}
                    {key === "invites" && inviteCount > 0 && (
                        <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)] animate-pulse" />
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
            <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                    <IconSearch className="w-5 h-5" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by facility name..."
                    className="w-full bg-[#0a111a]/60 border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-sm text-white focus:outline-none focus:border-cyan-500/30 backdrop-blur-xl transition-all placeholder:text-slate-600 placeholder:uppercase placeholder:text-[10px] placeholder:tracking-[0.2em] font-medium"
                />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {["", "pickleball", "badminton", "lawn_tennis", "table_tennis"].map(s => {
                    const meta = s ? SPORTS_META[s] : null;
                    const isActive = sport === s;
                    return (
                        <button
                            key={s}
                            onClick={() => setSport(s)}
                            className={`flex-shrink-0 text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl border transition-all duration-300 whitespace-nowrap ${
                                isActive
                                    ? "bg-cyan-500/10 border-cyan-500/30 text-white"
                                    : "border-white/5 bg-white/5 text-slate-500 hover:text-white hover:border-white/10"
                            }`}
                        >
                            {s ? `${meta?.emoji} ${meta?.label}` : "🌍 All Circuits"}
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
    const clubHref = `/clubs/${club.id}${playMode ? `?tab=${playMode}` : ""}`;

    return (
        <div className="relative bg-[#0a111a]/60 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-white/20 hover:-translate-y-1 transition-all duration-500 group h-full shadow-2xl backdrop-blur-md">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a111a]/80 pointer-events-none z-10" />
            
            {/* Cover */}
            <div className="relative h-32 bg-[#050b14] overflow-hidden">
                {club.cover_url ? (
                    <Image src={club.cover_url} alt="" fill className="object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" />
                ) : (
                    <div className={`absolute inset-0 opacity-20 ${meta?.bg ?? "bg-white/5"}`} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a111a] to-transparent" />
            </div>

            {/* Logo overlaps cover */}
            <div className="relative px-8 -mt-10 z-20">
                <div className="h-20 w-20 rounded-[1.5rem] overflow-hidden bg-[#0a111a] border-4 border-[#0a111a] flex items-center justify-center shrink-0 shadow-2xl">
                    {club.logo_url
                        ? <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover" />
                        : <span className="text-3xl group-hover:scale-110 transition-transform duration-500">{meta?.emoji ?? "🏘"}</span>
                    }
                </div>
            </div>

            <div className="p-8 pt-4 relative z-20 space-y-6">
                <div className="min-w-0 space-y-2">
                    <Link href={clubHref} className="block font-black text-xl leading-tight text-white hover:text-cyan-400 transition-colors uppercase italic tracking-tighter line-clamp-1">
                        {club.name}
                    </Link>
                    {club.description && (
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold line-clamp-2 leading-relaxed h-10">
                            {club.description}
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/5">
                        <IconUsers className="w-3 h-3 text-slate-600" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{club.member_count} Operators</span>
                    </div>
                    {meta && (
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${meta.border} ${meta.bg}`}>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
                        </div>
                    )}
                    {proximity && (
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border border-white/5 ${proximity.bg}`}>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${proximity.color}`}>{proximity.label}</span>
                        </div>
                    )}
                </div>

                <div className="pt-2">
                    {isAdmin ? (
                        <Link href={`/clubs/${club.id}/admin`} className="flex items-center justify-center w-full py-3.5 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-[1.02] shadow-xl">Manage Hub</Link>
                    ) : isMember ? (
                        <Link href={clubHref} className="flex items-center justify-center w-full py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:bg-emerald-500/20">Access Hub</Link>
                    ) : (
                        <button
                            onClick={() => onJoin(club.id)}
                            disabled={joining === club.id}
                            className="flex items-center justify-center w-full py-3.5 rounded-2xl bg-cyan-500 text-black text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-[1.02] disabled:opacity-40 shadow-xl shadow-cyan-500/10"
                        >
                            {joining === club.id ? "Affiliating…" : "Affiliate with Hub"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClubsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#050b14] flex items-center justify-center">
                <div className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Syncing Facility Network...</div>
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
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
    const [loading, setLoading]     = useState(true);
    const [joining, setJoining]     = useState<string | null>(null);
    const [responding, setResponding] = useState<string | null>(null);
    const [openSessions, setOpenSessions]     = useState<OpenPlaySession[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

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
            if (mineRes.ok) setMyClubs(normalizeMyClubs(await mineRes.json()));
            if (invRes.ok) {
                const d = asArray<ClubInvite>(await invRes.json());
                setInviteCount(d.length);
                setInvites(d);
            }
        });
    }, [router]);

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
            .then(r => r.ok ? r.json() : [])
            .then(d => { if (d) setClubs(asArray<ClubItem>(d)); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (tab === "invites") { 
            setLoading(true);
            const token = getAccessToken();
            fetch("/api/clubs/my-invites", { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : [])
                .then(d => {
                    const list = asArray<ClubInvite>(d);
                    setInvites(list);
                    setInviteCount(list.length);
                })
                .finally(() => setLoading(false));
            return; 
        }
        if (tab === "mine") { setLoading(false); return; }
        fetchClubs(tab, sport, debouncedSearch);
    }, [tab, sport, debouncedSearch, fetchClubs]);

    function switchTab(t: Tab) {
        setTab(t);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", t);
        router.push(`/clubs?${params.toString()}`);
    }

    useEffect(() => {
        if (playMode !== "open-play") return;
        const token = getAccessToken();
        if (!token) return;
        setLoadingSessions(true);
        Promise.all([
            fetch("/api/open-play/sessions?status=ongoing&limit=20", { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`/api/open-play/sessions?date=${selectedDate}&limit=50`, { headers: { Authorization: `Bearer ${token}` } }),
        ]).then(async ([liveRes, dateRes]) => {
            const liveData = liveRes.ok ? await liveRes.json() : { sessions: [] };
            const dateData = dateRes.ok ? await dateRes.json() : { sessions: [] };
            const merged = [...normalizeOpenSessions(liveData), ...normalizeOpenSessions(dateData)];
            const deduped = Array.from(new Map(merged.map((s) => [s.id, s])).values());
            deduped.sort((a, b) => (Number(b.status === "ongoing") - Number(a.status === "ongoing")) || new Date(a.session_date).getTime() - new Date(b.session_date).getTime());
            setOpenSessions(deduped);
        }).finally(() => setLoadingSessions(false));
    }, [playMode, selectedDate]);

    async function handleJoin(clubId: string) {
        const token = getAccessToken();
        if (!token) return;
        setJoining(clubId);
        try {
            const res = await fetch(`/api/clubs/${clubId}/join`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                setMyClubs(prev => ({ ...prev, member_club_ids: [...prev.member_club_ids, clubId] }));
                setClubs(prev => prev.map(c => c.id === clubId ? { ...c, member_count: c.member_count + 1 } : c));
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

    const adminIds  = new Set(myClubs.admin.map(c => c.id));
    const memberIds = new Set(myClubs.member_club_ids);

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            <NavBar hideLogo backHref="/dashboard" backLabel="DASHBOARD" />

            {playMode === "open-play" ? (
                <OpenPlayDiscoveryV2
                    clubs={clubs}
                    sessions={openSessions}
                    memberIds={memberIds}
                    loadingSessions={loadingSessions}
                    onJoin={handleJoin}
                    onJoinSession={async (sid) => {
                        const token = getAccessToken();
                        const res = await fetch(`/api/open-play/${sid}/join`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                        if (res.ok) setOpenSessions(p => p.map(s => s.id === sid ? { ...s, is_joined: true, confirmed_count: s.confirmed_count + 1 } : s));
                    }}
                    onClose={() => setPlayMode(null)}
                    searchValue={search}
                    onSearchChange={setSearch}
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                />
            ) : (

            <main className="relative z-10 max-w-7xl mx-auto px-4 py-8 pb-32 pt-24 space-y-12">
                
                {/* Header Section */}
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-[1px] bg-cyan-500/50" />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500/70">Facility Intelligence</p>
                        </div>
                        <h1 className="text-4xl lg:text-5xl font-black text-white uppercase italic tracking-tighter">Facility Hub</h1>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Access regional operational hubs and community networks.</p>
                    </div>
                    <Link href="/clubs/create" className="px-8 py-3.5 bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:scale-105 transition-transform shadow-xl">Establish Hub</Link>
                </header>

                {/* Tabs & Discovery */}
                <div className="space-y-6 px-2">
                    <div className="max-w-md">
                        <TabSwitcher active={tab} onChange={switchTab} inviteCount={inviteCount} />
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-4 ml-1 italic">{TAB_HINTS[tab]}</p>
                    </div>
                    {(tab === "nearby" || tab === "explore") && (
                        <DiscoveryBar sport={sport} setSport={setSport} search={search} setSearch={setSearch} />
                    )}
                </div>

                {/* Main Content Area */}
                <div className="min-h-[400px]">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <SkeletonCard key={i} />)}
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {(tab === "nearby" || tab === "explore") && (
                                <>
                                    {clubs.length === 0 ? (
                                        <EmptyHub icon="🌍" title="No Facilities Detected" desc={search || sport ? "Adjust synchronization filters to locate more hubs." : "Operational range contains zero registered hubs."} />
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                            {clubs.map((club, i) => (
                                                <div key={club.id} className="relative h-full">
                                                    {tab === "explore" && i < 3 && (
                                                        <span className="absolute -left-2 -top-2 z-30 text-[10px] font-black bg-cyan-500 text-black rounded-lg w-8 h-8 flex items-center justify-center shadow-2xl">0{i + 1}</span>
                                                    )}
                                                    <ClubCard club={club} isMember={memberIds.has(club.id)} isAdmin={adminIds.has(club.id)} joining={joining} onJoin={handleJoin} showProximity={tab === "nearby"} playMode={playMode} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {tab === "mine" && (
                                <div className="space-y-12">
                                    {myClubs.admin.length === 0 && myClubs.member.length === 0 ? (
                                        <EmptyHub icon="🏢" title="Hub Inventory Empty" desc="You are not affiliated with any facility hubs. Explore the circuit to establish membership." />
                                    ) : (
                                        <>
                                            {myClubs.admin.length > 0 && (
                                                <div className="space-y-6">
                                                    <SectionHeading title="Administrator Access" note={`Control over ${myClubs.admin.length} facilities`} />
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                        {myClubs.admin.map(c => <Link key={c.id} href={`/clubs/${c.id}`} className="group relative bg-[#0a111a]/60 border border-white/5 rounded-3xl p-6 flex items-center justify-between hover:border-white/20 backdrop-blur-md transition-all">
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-3xl group-hover:scale-110 transition-transform">{SPORTS_META[c.sport || ""]?.emoji ?? "🏘"}</span>
                                                                <div>
                                                                    <p className="text-sm font-black text-white uppercase italic">{c.name}</p>
                                                                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mt-1">Status: Primary Admin</p>
                                                                </div>
                                                            </div>
                                                            <Link href={`/clubs/${c.id}/admin`} className="px-4 py-2 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-lg">Manage</Link>
                                                        </Link>)}
                                                    </div>
                                                </div>
                                            )}
                                            {myClubs.member.length > 0 && (
                                                <div className="space-y-6">
                                                    <SectionHeading title="Active Affiliations" note={`${myClubs.member.length} facility memberships`} />
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                        {myClubs.member.map(c => <Link key={c.id} href={`/clubs/${c.id}`} className="group bg-[#0a111a]/60 border border-white/5 rounded-3xl p-6 flex items-center justify-between hover:border-white/20 backdrop-blur-md transition-all">
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-3xl group-hover:scale-110 transition-transform">{SPORTS_META[c.sport || ""]?.emoji ?? "🏘"}</span>
                                                                <div>
                                                                    <p className="text-sm font-black text-white uppercase italic">{c.name}</p>
                                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Status: Active Member</p>
                                                                </div>
                                                            </div>
                                                            <span className="text-slate-700 group-hover:text-white transition-colors">→</span>
                                                        </Link>)}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {tab === "invites" && (
                                <div className="max-w-2xl mx-auto w-full">
                                    {invites.length === 0 ? (
                                        <EmptyHub icon="💌" title="Intelligence Clear" desc="No pending affiliation requests detected in your secure channel." />
                                    ) : (
                                        <div className="space-y-4">
                                            {invites.map(inv => <InviteCard key={inv.invite_id} invite={inv} responding={responding} onRespond={handleRespond} />)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
            )}
        </div>
    );
}

function SectionHeading({ title, note }: { title: string; note: string }) {
    return (
        <div className="px-2 space-y-1">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{title}</h2>
            <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">{note}</p>
        </div>
    );
}

function EmptyHub({ icon, title, desc }: { icon: string; title: string; desc: string }) {
    return (
        <div className="bg-[#0a111a]/40 border border-white/5 rounded-[3rem] p-20 text-center flex flex-col items-center gap-6 shadow-2xl relative overflow-hidden backdrop-blur-sm">
            <div className="w-20 h-20 rounded-[2rem] bg-white/5 border border-white/5 flex items-center justify-center text-4xl">{icon}</div>
            <div className="space-y-2">
                <p className="text-xl font-black text-white uppercase italic tracking-tight">{title}</p>
                <p className="text-xs text-slate-600 uppercase tracking-widest max-w-sm mx-auto font-bold leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}

function InviteCard({ invite, responding, onRespond }: { invite: ClubInvite; responding: string | null; onRespond: (id: string, r: "accepted" | "declined") => void }) {
    const meta = invite.sport ? SPORTS_META[invite.sport] : null;
    const isResponding = responding === invite.invite_id;
    return (
        <div className="bg-[#0a111a]/80 border border-white/5 rounded-[2.5rem] p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-8">
                <div className="flex-1 space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-3xl shadow-2xl">{meta?.emoji ?? "🏘"}</div>
                        <div>
                            <h3 className="font-black text-xl text-white uppercase italic tracking-tight">{invite.club_name}</h3>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-400 mt-1">Affiliation Request</p>
                        </div>
                    </div>
                    <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-3">Transmission from {invite.invited_by_name || "Unknown"}:</p>
                        <p className="text-slate-300 text-xs italic leading-relaxed font-medium">&ldquo;{invite.message || "No message attached to this transmission."}&rdquo;</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Channel closes in {daysUntil(invite.expires_at)} days</span>
                    </div>
                </div>
                <div className="flex flex-row sm:flex-col gap-3 w-full sm:w-32">
                    <button onClick={() => onRespond(invite.invite_id, "accepted")} disabled={isResponding} className="flex-1 py-3.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-40">Confirm</button>
                    <button onClick={() => onRespond(invite.invite_id, "declined")} disabled={isResponding} className="flex-1 py-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 disabled:opacity-40">Reject</button>
                </div>
            </div>
        </div>
    );
}
