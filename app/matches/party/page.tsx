"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PartyMember {
    user_id:  string;
    username: string | null;
    role:     "leader" | "member";
}

interface PendingInvite {
    invitation_id:    string;
    invitee_id:       string;
    invitee_username: string | null;
}

interface Party {
    id:              string;
    sport:           string;
    match_format:    string;
    status:          "forming" | "ready" | "in_queue" | "match_found" | "disbanded";
    leader_id:       string;
    members:         PartyMember[];
    pending_invites: PendingInvite[];
    match_id:         string | null;
    queue_started_at: string | null;
}

type CardState = "no_party" | "forming" | "invite_sent" | "ready" | "in_queue" | "match_found";

// ── Helpers ────────────────────────────────────────────────────────────────────

const SPORTS_META: Record<string, { label: string; emoji: string; accent: string; border: string; bg: string; gradient: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", accent: "text-cyan-400",    border: "border-cyan-500/30",    bg: "bg-cyan-500/5",    gradient: "from-cyan-500/20 to-blue-600/20" },
    badminton:    { label: "Badminton",    emoji: "🏸", accent: "text-purple-400",  border: "border-purple-500/30",  bg: "bg-purple-500/5",  gradient: "from-purple-500/20 to-pink-600/20" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", accent: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5", gradient: "from-emerald-500/20 to-teal-600/20" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", accent: "text-orange-400",  border: "border-orange-500/30",  bg: "bg-orange-500/5",  gradient: "from-orange-500/20 to-red-600/20" },
};

const FORMAT_LABELS: Record<string, string> = {
    doubles:       "2v2 Doubles",
    mixed_doubles: "2v2 Mixed Doubles",
};

function cardState(party: Party | null, _myId: string | null): CardState {
    if (!party) return "no_party";
    if (party.status === "disbanded") return "no_party";
    if (party.status === "match_found") return "match_found";
    if (party.status === "in_queue") return "in_queue";
    if (party.status === "ready") return "ready";
    // forming: check if invite has been sent
    if (party.pending_invites.length > 0) return "invite_sent";
    return "forming";
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconSearch({ className = "w-5 h-5" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" /></svg>;
}

function IconUsers({ className = "w-5 h-5" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
}

function IconX({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
}

function IconChevronRight({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>;
}

function IconShield({ className = "w-5 h-5" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
}

// ── Components ─────────────────────────────────────────────────────────────────

function Background() {
    return (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/10 blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-600/10 blur-[120px] animate-pulse [animation-delay:2s]" />
            <div className="absolute top-[20%] right-[15%] w-[20%] h-[20%] rounded-full bg-indigo-600/5 blur-[80px]" />
        </div>
    );
}

function StatusBadge({ state }: { state: CardState }) {
    const config = {
        no_party:    { label: "New Party",   color: "text-zinc-400 bg-zinc-800/50 border-zinc-700/50" },
        forming:     { label: "Forming",     color: "text-zinc-400 bg-zinc-800/50 border-zinc-700/50" },
        invite_sent: { label: "Invited",     color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
        ready:       { label: "Ready",       color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
        in_queue:    { label: "In Queue",    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30 animate-pulse" },
        match_found: { label: "Found!",      color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
    }[state];

    return (
        <span className={`text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full border shadow-sm ${config.color}`}>
            {config.label}
        </span>
    );
}

// ── Player search dropdown ─────────────────────────────────────────────────────

interface PlayerResult {
    id:       string;
    username: string;
    rating:   number | null;
}

function PlayerSearchInput({
    onSelect,
    disabled,
}: {
    onSelect: (p: PlayerResult) => void;
    disabled?: boolean;
}) {
    const [query, setQuery]     = useState("");
    const [results, setResults] = useState<PlayerResult[]>([]);
    const [open, setOpen]       = useState(false);
    const debounce              = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapRef               = useRef<HTMLDivElement>(null);

    const search = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); setOpen(false); return; }
        const token = getAccessToken();
        const res   = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.players ?? data ?? []);
        setOpen(true);
    }, []);

    useEffect(() => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => search(query), 300);
    }, [query, search]);

    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    return (
        <div ref={wrapRef} className="relative z-50">
            <div className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-sm border border-zinc-700/50 rounded-2xl px-4 py-3 group focus-within:border-violet-500/50 transition-all shadow-lg">
                <IconSearch className="w-5 h-5 text-zinc-500 group-focus-within:text-violet-400 transition-colors shrink-0" />
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search partner by username…"
                    disabled={disabled}
                    className="flex-1 bg-transparent text-white placeholder-zinc-500 outline-none"
                />
            </div>
            {open && results.length > 0 && (
                <ul className="absolute top-full mt-2 left-0 right-0 bg-zinc-900/95 backdrop-blur-md border border-zinc-700/50 rounded-2xl overflow-hidden shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    {results.map(p => (
                        <li key={p.id}>
                            <button
                                className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-zinc-800/80 text-left transition-all group"
                                onMouseDown={e => { e.preventDefault(); onSelect(p); setQuery(""); setOpen(false); }}
                            >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center text-sm font-bold text-violet-300 border border-violet-500/20 group-hover:scale-110 transition-transform">
                                    {p.username[0]?.toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <span className="block text-sm font-bold text-white group-hover:text-violet-300 transition-colors">@{p.username}</span>
                                    {p.rating != null && (
                                        <span className="text-[10px] font-bold text-zinc-500 tracking-wider">SKILL RATING: {Math.round(p.rating)}</span>
                                    )}
                                </div>
                                <IconChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── Duo Queue Card ─────────────────────────────────────────────────────────────

function PlayerSlot({ member, isYou, label }: { member: PartyMember | null; isYou?: boolean; label?: string }) {
    if (!member) {
        return (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/40 border border-dashed border-zinc-800 group transition-all">
                <div className="w-12 h-12 rounded-full bg-zinc-900 border-2 border-dashed border-zinc-800 flex items-center justify-center group-hover:border-zinc-700 transition-colors">
                    <span className="text-zinc-700 text-xl font-black group-hover:text-zinc-600">?</span>
                </div>
                <div>
                    <p className="text-xs font-bold text-zinc-600 tracking-widest uppercase mb-0.5">{label ?? "Partner"}</p>
                    <p className="text-sm font-medium text-zinc-500">Waiting for invitation…</p>
                </div>
            </div>
        );
    }
    return (
        <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all shadow-lg ${
            isYou ? "bg-violet-500/5 border-violet-500/20" : "bg-zinc-900/60 border-zinc-800"
        }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black border shadow-inner ${
                isYou 
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/30" 
                    : "bg-zinc-800 text-zinc-400 border-zinc-700/50"
            }`}>
                {member.username?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-base font-black text-white truncate">@{member.username}</p>
                    {isYou && (
                        <span className="text-[9px] font-black tracking-tighter text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-md uppercase border border-violet-500/20">You</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                    {member.role === "leader" && <IconShield className="w-3 h-3 text-amber-500" />}
                    <p className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase">
                        {member.role === "leader" ? "Party Leader" : "Team Member"}
                    </p>
                </div>
            </div>
            <div className="flex flex-col items-end gap-1">
                <div className="flex gap-0.5">
                    {[1,2,3].map(i => <div key={i} className={`w-1 h-1 rounded-full ${isYou ? "bg-violet-500/30" : "bg-zinc-800"}`} />)}
                </div>
            </div>
        </div>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PartyQueuePage() {
    const router = useRouter();

    const [myId,    setMyId]    = useState<string | null>(null);
    const [party,   setParty]   = useState<Party | null>(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);
    const [busy,    setBusy]    = useState(false);
    const [searchKey, setSearchKey] = useState(0); // bump to reset PlayerSearchInput
    const [confirmLeave, setConfirmLeave] = useState(false);

    // Create-party form
    const [sport,        setSport]        = useState("pickleball");
    const [matchFormat,  setMatchFormat]  = useState("doubles");

    // Queue timer — ticks every second, elapsed is computed from server's queue_started_at
    const [now, setNow] = useState(Date.now());
    const queueTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const state: CardState = cardState(party, myId);

    // ── Fetch my party ─────────────────────────────────────────────────────────
    const fetchParty = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.push("/login"); return; }
        try {
            const res = await fetch("/api/parties/me", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.push("/login"); return; }
            const data = await res.json();
            setParty(data.party ?? null);
        } catch {
            // ignore network errors on poll
        }
    }, [router]);

    // ── Boot ───────────────────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            const token = getAccessToken();
            if (!token) { router.push("/login"); return; }
            // Get my profile id
            const me = await fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } });
            if (isUnauthorized(me.status)) { clearAuthSession(); router.push("/login"); return; }
            const meData = await me.json();
            setMyId(meData.profile?.id ?? meData.id ?? meData.user_id ?? null);
            await fetchParty();
            setLoading(false);
        })();
    }, [router, fetchParty]);

    // ── Poll in invite_sent state (waiting for partner to respond) ────────────
    useEffect(() => {
        if (state === "invite_sent") {
            const id = setInterval(fetchParty, 4000);
            return () => clearInterval(id);
        }
    }, [state, fetchParty]);

    // ── Poll in ready state — partner needs to know when leader starts queue ──
    useEffect(() => {
        if (state === "ready") {
            const id = setInterval(fetchParty, 3000);
            return () => clearInterval(id);
        }
    }, [state, fetchParty]);

    // ── Poll while in queue ────────────────────────────────────────────────────
    useEffect(() => {
        if (state === "in_queue") {
            const id = setInterval(fetchParty, 3000);
            queueTimer.current = setInterval(() => setNow(Date.now()), 1000);
            return () => { clearInterval(id); if (queueTimer.current) clearInterval(queueTimer.current); };
        } else {
            setConfirmLeave(false);
            if (queueTimer.current) { clearInterval(queueTimer.current); queueTimer.current = null; }
        }
    }, [state, fetchParty]);

    // ── Redirect to match when found ───────────────────────────────────────────
    useEffect(() => {
        if (state !== "match_found" || !party?.match_id) return;
        // Verify the match isn't invalidated before redirecting
        const token = getAccessToken();
        if (!token) return;
        fetch(`/api/matches/${party.match_id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
                const s = d?.status ?? d?.match?.status;
                if (s && s !== "invalidated" && s !== "cancelled") {
                    const target = s === "awaiting_players"
                        ? `/matches/${party.match_id}/lobby`
                        : `/matches/${party.match_id}`;
                    router.push(target);
                } else {
                    // Match is dead — force a re-fetch so backend disbands the party
                    fetchParty();
                }
            })
            .catch(() => { router.push(`/matches/${party.match_id}/lobby`); });
    }, [state, party, router, fetchParty]);

    // ── Actions ────────────────────────────────────────────────────────────────
    async function apiCall(path: string, method = "POST", body?: object) {
        setBusy(true);
        setError(null);
        try {
            const token = getAccessToken();
            const res = await fetch(`/api${path}`, {
                method,
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail ?? "Something went wrong");
            return data;
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Error");
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function handleCreate() {
        const data = await apiCall("/parties", "POST", { sport, match_format: matchFormat });
        if (data) setParty(data);
    }

    async function handleInvite(player: PlayerResult) {
        if (!party) return;
        const data = await apiCall(`/parties/${party.id}/invite`, "POST", { invitee_id: player.id });
        if (data) {
            setParty(data);
        } else {
            // Reset the search input so the user can try a different player
            setSearchKey(k => k + 1);
        }
    }

    async function handleCancelInvite(invitationId: string) {
        const data = await apiCall(`/parties/invitation/${invitationId}`, "DELETE");
        if (data) setParty(data);
    }

    async function handleQueueJoin() {
        if (!party) return;
        const data = await apiCall(`/parties/${party.id}/queue`);
        if (data) {
            // Match found immediately — redirect the leader straight to the match
            if (data.status === "matched" && data.match_id) {
                const token = getAccessToken();
                if (!token) { router.push(`/matches/${data.match_id}/lobby`); return; }
                try {
                    const res = await fetch(`/api/matches/${data.match_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    const detail = await res.json();
                    const s = detail?.status ?? detail?.match?.status;
                    const target = s === "awaiting_players"
                        ? `/matches/${data.match_id}/lobby`
                        : `/matches/${data.match_id}`;
                    router.push(target);
                } catch {
                    router.push(`/matches/${data.match_id}/lobby`);
                }
                return;
            }
            await fetchParty();
        }
    }

    async function handleLeaveQueue() {
        if (!party) return;
        const data = await apiCall(`/parties/${party.id}/leave-queue`);
        if (data) await fetchParty();
    }

    async function handleDisband() {
        if (!party) return;
        await apiCall(`/parties/${party.id}/disband`);
        setParty(null);
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <>
                <NavBar />
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                </div>
            </>
        );
    }

    const sportMeta  = SPORTS_META[party?.sport ?? sport] ?? SPORTS_META.pickleball;
    const myMember   = party?.members.find(m => m.user_id === myId) ?? null;
    const partnerMem = party?.members.find(m => m.user_id !== myId) ?? null;
    const isLeader   = party ? party.leader_id === myId : true;
    const fmtLabel   = FORMAT_LABELS[party?.match_format ?? matchFormat] ?? "Doubles";
    const queueSecs  = party?.queue_started_at
        ? Math.max(0, Math.floor((now - new Date(party.queue_started_at).getTime()) / 1000))
        : 0;
    const queueTime  = `${String(Math.floor(queueSecs / 60)).padStart(2, "0")}:${String(queueSecs % 60).padStart(2, "0")}`;

    return (
        <div className="relative min-h-screen bg-zinc-950 text-white overflow-x-hidden">
            <NavBar />
            <Background />
            
            <div className="pt-24 pb-12 px-4">
                <div className="max-w-lg mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                    {/* Header */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                            </span>
                            <span className="text-[10px] font-black tracking-widest text-violet-400 uppercase">Competitive Duo Queue</span>
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500">
                            Play Together
                        </h1>
                        <p className="text-zinc-500 text-sm max-w-[280px] mx-auto">
                            Invite a partner and dominate the court as a synchronized team.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/5 border border-red-500/20 text-red-400 text-sm rounded-2xl p-4 flex flex-col gap-3 shadow-2xl shadow-red-500/5 animate-in zoom-in-95 duration-300">
                            <div className="flex items-start gap-3">
                                <span className="mt-0.5">⚠️</span>
                                <span className="flex-1 font-medium leading-relaxed">{error}</span>
                                <button onClick={() => setError(null)} className="p-1 hover:bg-red-500/10 rounded-lg transition-colors"><IconX className="w-4 h-4" /></button>
                            </div>
                            {error.toLowerCase().includes("already in an active party") && (
                                <div className="flex items-center gap-3 pt-3 border-t border-red-500/10">
                                    <p className="text-[11px] text-red-400/60 italic">Maybe they just disbanded? Try refreshing.</p>
                                    <button
                                        onClick={() => { setError(null); fetchParty(); }}
                                        className="ml-auto px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-black hover:bg-red-500/20 transition-all"
                                    >
                                        REFRESH
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STATE: no_party — Create card ── */}
                    {state === "no_party" && (
                        <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 blur-3xl -mr-16 -mt-16 group-hover:bg-violet-600/10 transition-colors" />
                            
                            <div className="space-y-1">
                                <p className="text-xs font-black tracking-[0.2em] text-violet-400 uppercase">Step 1</p>
                                <h2 className="text-2xl font-black text-white">Initialize Party</h2>
                            </div>

                            <div className="space-y-6">
                                {/* Sport picker */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black tracking-widest text-zinc-500 uppercase flex justify-between items-center">
                                        Select Sport
                                        <span className="w-12 h-px bg-zinc-800" />
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {Object.entries(SPORTS_META).map(([key, meta]) => (
                                            <button
                                                key={key}
                                                onClick={() => setSport(key)}
                                                className={`relative flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all duration-300 group overflow-hidden ${
                                                    sport === key
                                                        ? `${meta.border} bg-zinc-900/80 shadow-lg shadow-black/20`
                                                        : "bg-zinc-950/20 border-zinc-800/50 text-zinc-500 hover:border-zinc-700"
                                                }`}
                                            >
                                                {sport === key && (
                                                    <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-100`} />
                                                )}
                                                <span className={`relative text-2xl transition-transform duration-500 ${sport === key ? "scale-110" : "grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100"}`}>
                                                    {meta.emoji}
                                                </span>
                                                <span className={`relative text-sm font-bold ${sport === key ? "text-white" : "group-hover:text-zinc-300"}`}>
                                                    {meta.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Format picker */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black tracking-widest text-zinc-500 uppercase flex justify-between items-center">
                                        Match Format
                                        <span className="w-12 h-px bg-zinc-800" />
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(["doubles", "mixed_doubles"] as const).map(fmt => (
                                            <button
                                                key={fmt}
                                                onClick={() => setMatchFormat(fmt)}
                                                className={`px-4 py-4 rounded-2xl border text-sm font-bold transition-all ${
                                                    matchFormat === fmt
                                                        ? "bg-violet-500/10 border-violet-500/40 text-violet-300 shadow-lg shadow-violet-500/5"
                                                        : "bg-zinc-950/20 border-zinc-800/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                                                }`}
                                            >
                                                {FORMAT_LABELS[fmt]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleCreate}
                                disabled={busy}
                                className="w-full py-5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all shadow-xl shadow-violet-600/20 active:scale-[0.98] flex items-center justify-center gap-3 group"
                            >
                                {busy ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <span>Create Team Lobby</span>
                                        <IconChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>

                            <div className="pt-6 border-t border-zinc-800/50 text-center">
                                <Link href="/matches/queue" className="text-[11px] font-bold text-zinc-500 hover:text-violet-400 tracking-wider uppercase transition-colors">
                                    Prefer solo queue? Switch here →
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* ── STATE: forming / invite_sent / ready — Duo Queue Card ── */}
                    {(state === "forming" || state === "invite_sent" || state === "ready") && party && (
                        <div className={`bg-zinc-900/40 backdrop-blur-xl border rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden ${sportMeta.border}`}>
                            <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-br ${sportMeta.gradient} opacity-10 blur-3xl -mr-24 -mt-24`} />
                            
                            {/* Card header */}
                            <div className="flex items-center justify-between relative">
                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 rounded-2xl bg-zinc-900 border ${sportMeta.border} flex items-center justify-center text-3xl shadow-inner`}>
                                        {sportMeta.emoji}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-white">{sportMeta.label}</h2>
                                        <p className={`text-xs font-black tracking-widest uppercase ${sportMeta.accent}`}>{fmtLabel}</p>
                                    </div>
                                </div>
                                <StatusBadge state={state} />
                            </div>

                            {/* Player slots */}
                            <div className="grid gap-3">
                                <PlayerSlot member={myMember} isYou label="You" />
                                <div className="relative py-1 flex justify-center">
                                    <div className="absolute inset-0 flex items-center"><div className="w-full h-px bg-zinc-800/50" /></div>
                                    <div className="relative bg-zinc-900/80 px-4 py-1 rounded-full border border-zinc-800 text-[10px] font-black text-zinc-600 tracking-tighter uppercase backdrop-blur-md">Tactical Duo</div>
                                </div>
                                <PlayerSlot member={partnerMem} label="Partner" />
                            </div>

                            {/* Invite section — only leader & not yet ready */}
                            {isLeader && state === "forming" && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                                        <label className="text-[10px] font-black tracking-[0.15em] text-zinc-400 uppercase">Recruit your partner</label>
                                    </div>
                                    <PlayerSearchInput key={searchKey} onSelect={handleInvite} disabled={busy} />
                                </div>
                            )}

                            {/* Invite pending notice */}
                            {state === "invite_sent" && party.pending_invites[0] && (
                                <div className="space-y-3 animate-in fade-in duration-500">
                                    <div className="flex flex-col gap-3 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 shadow-lg shadow-amber-500/5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-xl">📨</div>
                                            <div className="flex-1">
                                                <p className="text-sm font-black text-amber-200 uppercase tracking-wide">
                                                    Invitation Dispatched
                                                </p>
                                                <p className="text-[11px] text-zinc-500 font-medium">Waiting for @{party.pending_invites[0].invitee_username ?? "player"} to respond…</p>
                                            </div>
                                            <button
                                                onClick={fetchParty}
                                                className="p-2 hover:bg-amber-500/10 rounded-xl transition-colors text-amber-400"
                                                title="Refresh"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCancelInvite(party.pending_invites[0].invitation_id)}
                                        disabled={busy}
                                        className="w-full py-3 text-[10px] font-black text-zinc-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                                    >
                                        Retract invitation & choose another
                                    </button>
                                </div>
                            )}

                            {/* Ready CTA */}
                            {state === "ready" && (
                                <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-2 shadow-lg shadow-emerald-500/5 animate-in zoom-in-95 duration-500">
                                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2">🤝</div>
                                    <p className="text-sm font-black text-emerald-400 uppercase tracking-widest">Team Synchronized</p>
                                    <p className="text-xs text-zinc-500 max-w-[200px] mx-auto leading-relaxed font-medium">
                                        {isLeader ? "You are the leader. Initiate the queue sequence when both are ready." : "Awaiting the party leader to initiate the combat sequence…"}
                                    </p>
                                    {!isLeader && (
                                        <div className="flex justify-center pt-2">
                                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[9px] font-black text-zinc-500 tracking-wider">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                LIVE MONITORING
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                {state === "ready" && isLeader && (
                                    <button
                                        onClick={handleQueueJoin}
                                        disabled={busy}
                                        className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-600/20 active:scale-[0.98] uppercase tracking-widest text-sm"
                                    >
                                        {busy ? "Activating…" : "Initialize Queue"}
                                    </button>
                                )}
                                <button
                                    onClick={handleDisband}
                                    disabled={busy}
                                    className="flex-1 py-4 bg-zinc-950/40 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 font-bold rounded-2xl transition-all text-xs uppercase tracking-widest"
                                >
                                    {isLeader ? "Disband" : "Leave Party"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── STATE: in_queue — Waiting spinner ── */}
                    {state === "in_queue" && party && (
                        <div className={`bg-zinc-900/40 backdrop-blur-xl border rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden ${sportMeta.border}`}>
                            <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-br ${sportMeta.gradient} opacity-10 blur-3xl -mr-24 -mt-24`} />
                            
                            <div className="flex items-center justify-between relative">
                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 rounded-2xl bg-zinc-900 border ${sportMeta.border} flex items-center justify-center text-3xl shadow-inner`}>
                                        {sportMeta.emoji}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-white">{sportMeta.label}</h2>
                                        <p className={`text-xs font-black tracking-widest uppercase ${sportMeta.accent}`}>{fmtLabel}</p>
                                    </div>
                                </div>
                                <StatusBadge state={state} />
                            </div>

                            {/* Animated queue indicator */}
                            <div className="flex flex-col items-center py-6 gap-6 relative">
                                <div className="relative w-24 h-24">
                                    <div className="absolute inset-0 rounded-full border-2 border-violet-500/10 animate-[ping_2s_linear_infinite]" />
                                    <div className="absolute inset-4 rounded-full border-2 border-violet-500/20 animate-[ping_2s_linear_infinite_0.5s]" />
                                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500 border-r-violet-500/30 animate-[spin_1.5s_linear_infinite]" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="bg-zinc-900 w-12 h-12 rounded-full flex items-center justify-center border border-zinc-800 shadow-2xl">
                                            <IconUsers className="w-6 h-6 text-violet-400" />
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-xl font-black text-white tracking-tight uppercase">Scanning for Rivals</p>
                                    <p className="text-zinc-500 text-[10px] font-bold tracking-widest uppercase">Targeting equivalent duo skillsets</p>
                                </div>
                                <div className="px-6 py-2 rounded-2xl bg-zinc-950/50 border border-zinc-800 font-mono text-3xl font-black text-violet-400 tabular-nums shadow-inner">
                                    {queueTime}
                                </div>
                            </div>

                            {/* Team slots */}
                            <div className="grid gap-3">
                                <div className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-1">Your Strike Team</div>
                                <PlayerSlot member={myMember} isYou />
                                <PlayerSlot member={partnerMem} />
                            </div>

                            {/* VS divider */}
                            <div className="flex items-center gap-4 py-2">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-zinc-800" />
                                <div className="text-[10px] font-black text-zinc-700 tracking-[0.3em] uppercase">VS</div>
                                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-zinc-800" />
                            </div>

                            <div className="flex items-center gap-5 p-5 rounded-2xl bg-zinc-950/40 border border-dashed border-zinc-800/60 relative overflow-hidden group transition-all hover:border-zinc-700">
                                <div className="relative w-12 h-12">
                                    <div className="absolute inset-0 rounded-full bg-zinc-900 border-2 border-dashed border-zinc-800 flex items-center justify-center group-hover:border-zinc-700 transition-colors">
                                        <span className="text-zinc-800 text-xl font-black">?</span>
                                    </div>
                                    <div className="absolute inset-0 rounded-full border border-violet-500/20 animate-pulse" />
                                </div>
                                <div className="flex-1 space-y-2">
                                    <p className="text-xs font-black text-zinc-600 uppercase tracking-widest">Searching Targets…</p>
                                    <div className="flex gap-1.5">
                                        <div className="w-16 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                                            <div className="w-full h-full bg-zinc-800 animate-[shimmer_2s_infinite]" />
                                        </div>
                                        <div className="w-12 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                                            <div className="w-full h-full bg-zinc-800 animate-[shimmer_2s_infinite_0.5s]" />
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[10px] font-black text-zinc-700 animate-pulse tracking-tighter uppercase">Analyzing</div>
                            </div>

                            <div className="flex flex-col gap-2">
                                {isLeader && (
                                    <button
                                        onClick={handleLeaveQueue}
                                        disabled={busy}
                                        className="w-full py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-zinc-300 font-bold rounded-2xl transition-all text-xs uppercase tracking-widest active:scale-[0.98]"
                                    >
                                        Abort Queue
                                    </button>
                                )}
                                {confirmLeave ? (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setConfirmLeave(false)}
                                            className="flex-1 py-3 text-sm font-semibold text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-2xl transition-all"
                                        >
                                            Stay
                                        </button>
                                        <button
                                            onClick={async () => { setConfirmLeave(false); await handleDisband(); }}
                                            disabled={busy}
                                            className="flex-1 py-3 text-sm font-semibold text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 bg-red-500/5 hover:bg-red-500/10 rounded-2xl transition-all disabled:opacity-50"
                                        >
                                            {busy ? "Leaving…" : "Yes, leave"}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmLeave(true)}
                                        className="w-full py-3 text-xs text-zinc-600 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-2xl transition-all uppercase tracking-widest"
                                    >
                                        Leave Party
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── STATE: match_found — Flash ── */}
                    {state === "match_found" && party && (
                        <div className="bg-zinc-900/40 backdrop-blur-2xl border border-emerald-500/40 rounded-[2.5rem] p-12 flex flex-col items-center gap-6 text-center shadow-[0_0_50px_rgba(16,185,129,0.1)] animate-in zoom-in-95 duration-500 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 animate-pulse" />
                                <div className="text-7xl relative">⚔️</div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black text-white tracking-tight uppercase italic">Rivals Located</h2>
                                <p className="text-emerald-400/80 text-[10px] font-black tracking-[0.3em] uppercase">Prepare for engagement</p>
                            </div>
                            <div className="w-12 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                                <div className="h-full bg-emerald-500 animate-[shimmer_1.5s_infinite]" />
                            </div>
                            <p className="text-zinc-500 text-xs font-medium">Synchronizing systems and entering arena…</p>
                        </div>
                    )}

                    {/* Tip */}
                    {state === "no_party" && (
                        <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-zinc-600 tracking-widest uppercase">
                            <span className="w-1 h-1 rounded-full bg-zinc-800" />
                            Partner will receive instant notification
                            <span className="w-1 h-1 rounded-full bg-zinc-800" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
