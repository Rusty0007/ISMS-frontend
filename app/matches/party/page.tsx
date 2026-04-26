"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// --- Types ---

interface Rating {
    sport: string;
    match_format: string;
    rating: number;
    rating_status: "CALIBRATING" | "RATED";
    calibration_matches_played: number;
    is_matchmaking_eligible?: boolean;
    is_leaderboard_eligible?: boolean;
    matchmaking_target?: number;
    leaderboard_target?: number;
    matches_played?: number;
}

type PartyMatchFormat = "doubles" | "mixed_doubles";
type PartyQueueMode = "normal" | "ranked";

interface PartyMember {
    user_id: string;
    role: "leader" | "member";
    avatar_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    ratings?: Rating[];
    gender?: "male" | "female" | "other" | null;
}

interface PendingInvite {
    invitation_id: string;
    invitee_id: string;
    invitee_first_name: string | null;
    invitee_last_name: string | null;
}

interface Party {
    id: string;
    sport: string;
    match_format: string;
    status: "forming" | "ready" | "in_queue" | "match_found" | "disbanded";
    leader_id: string;
    members: PartyMember[];
    pending_invites: PendingInvite[];
    match_id: string | null;
    queue_started_at: string | null;
}

type CardState = "no_party" | "forming" | "invite_sent" | "ready" | "in_queue" | "match_found";

const PARTY_QUEUE_TIMEOUT_SECONDS = 180;

const SPORTS_META: Record<string, { label: string; image: string; accent: string; border: string; tint: string; code: string; icon: string }> = {
    pickleball: { label: "Pickleball", image: "/sports/pickleball.jpg.png", accent: "text-cyan-400", border: "border-cyan-500/30", tint: "bg-cyan-500/5", code: "PB", icon: "🎾" },
    badminton: { label: "Badminton", image: "/sports/badminton.jpg.png", accent: "text-fuchsia-400", border: "border-fuchsia-500/30", tint: "bg-fuchsia-500/5", code: "BD", icon: "🏸" },
    lawn_tennis: { label: "Lawn Tennis", image: "/sports/lawn-tennis.jpg.png", accent: "text-emerald-400", border: "border-emerald-500/30", tint: "bg-emerald-500/5", code: "LT", icon: "🎾" },
    table_tennis: { label: "Table Tennis", image: "/sports/table-tennis.jpg.png", accent: "text-amber-400", border: "border-amber-500/30", tint: "bg-amber-500/5", code: "TT", icon: "🏓" },
};

function cardState(party: Party | null): CardState {
    if (!party) return "no_party";
    if (party.status === "disbanded") return "no_party";
    if (party.status === "match_found") return "match_found";
    if (party.status === "in_queue") return "in_queue";
    if (party.status === "ready") return "ready";
    if ((party.pending_invites?.length ?? 0) > 0) return "invite_sent";
    return "forming";
}

function ratingFor(member: PartyMember, sport: string, format: string) {
    return member.ratings?.find(r => r.sport === sport && r.match_format === format);
}

function isMlReady(member: PartyMember, sport: string, format: string) {
    const r = ratingFor(member, sport, format);
    return Boolean(r?.is_matchmaking_eligible);
}

function memberLabel(member: PartyMember) {
    return `${member.first_name || ''} ${member.last_name || ''}`.trim() || "Player";
}

function isMixedDoublesDuo(members: PartyMember[]) {
    if (members.length !== 2) return false;
    const hasMale = members.some(m => m.gender === "male");
    const hasFemale = members.some(m => m.gender === "female");
    return hasMale && hasFemale;
}

function partyQueueModeLabel(mode: PartyQueueMode) {
    return mode === "ranked" ? "Ranked Search" : "Normal Search";
}

// --- HUD Helper Components ---

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <svg className={`absolute w-3 h-3 sm:w-4 sm:h-4 text-white/20 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 0H0V24" strokeLinecap="square" />
        </svg>
    );
}

function InfoIcon({ text }: { text: string }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative inline-block ml-1.5" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            <button type="button" className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[10px] text-slate-400 transition hover:border-cyan-400 hover:text-cyan-400">
                ?
            </button>
            {show && (
                <div className="absolute bottom-full left-1/2 z-[100] mb-2 w-48 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0a111a] p-3 text-[10px] leading-relaxed text-slate-300 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
                    {text}
                </div>
            )}
        </div>
    );
}

function StatusBadge({ state }: { state: CardState }) {
    const config = {
        no_party: { label: "NEW PARTY", color: "border-white/10 bg-white/5 text-slate-500" },
        forming: { label: "FORMING", color: "border-cyan-500/20 bg-cyan-500/5 text-cyan-400" },
        invite_sent: { label: "INVITATION SENT", color: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
        ready: { label: "SQUAD READY", color: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" },
        in_queue: { label: "IN QUEUE", color: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400 animate-pulse" },
        match_found: { label: "MATCH SECURED", color: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400" },
    }[state];

    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] sm:text-[10px] font-black tracking-[0.2em] uppercase ${config.color}`}>
            <span className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${state !== "no_party" ? "bg-current animate-pulse" : "bg-white/20"}`} />
            {config.label}
        </div>
    );
}

function RatingDisplay({ ratings, sport }: { ratings?: Rating[], sport: string }) {
    const singles = ratings?.find(r => r.sport === sport && r.match_format === "singles");
    const doubles = ratings?.find(r => r.sport === sport && r.match_format === "doubles");
    const mixed = ratings?.find(r => r.sport === sport && r.match_format === "mixed_doubles");

    const renderRating = (r?: Rating, label = "") => {
        if (!r) return (
            <div className="text-right">
                <p className="text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase">{label}</p>
                <p className="text-[9px] sm:text-[10px] font-black text-slate-500">---</p>
            </div>
        );
        if (r.rating_status === "CALIBRATING") {
            const mlTarget = r.matchmaking_target ?? 10;
            const mlReady = Boolean(r.is_matchmaking_eligible);
            const progressText = mlReady ? "ML READY" : `-${Math.max(0, mlTarget - (r.calibration_matches_played || 0))}`;
            return (
            <div className="text-right">
                <p className="text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase">{label}</p>
                <p className={`text-[9px] font-black tracking-tighter italic ${mlReady ? "text-cyan-400/80" : "text-amber-500/70"}`}>{progressText}</p>
            </div>
        );
        }
        return (
            <div className="text-right">
                <p className="text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase">{label}</p>
                <p className="text-xs sm:text-sm font-black text-white italic">{Math.round(r.rating)}</p>
            </div>
        );
    };

    return (
        <div className="flex gap-2 sm:gap-4">
            {renderRating(singles, "S")}
            {renderRating(doubles, "D")}
            {renderRating(mixed, "M")}
        </div>
    );
}

// --- Player Search Dropdown ---

interface PlayerResult {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    rating: number | null;
}

function PlayerSearchInput({ onSelect, disabled }: { onSelect: (p: PlayerResult) => void; disabled?: boolean }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<PlayerResult[]>([]);
    const [open, setOpen] = useState(false);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const search = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); setOpen(false); return; }
        const token = getAccessToken();
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`, {
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
        const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    return (
        <div ref={wrapRef} className="relative">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 group focus-within:border-cyan-500/50 transition-all shadow-xl">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" /></svg>
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search by name..."
                    disabled={disabled}
                    className="flex-1 bg-transparent text-xs sm:text-sm font-bold placeholder-slate-600 outline-none"
                />
            </div>
            {open && results.length > 0 && (
                <ul className="absolute top-full mt-2 left-0 right-0 bg-[#0a111a] border border-white/10 rounded-xl sm:rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] z-[100] animate-in fade-in slide-in-from-top-2 max-h-[240px] overflow-y-auto">
                    {results.map(p => (
                        <li key={p.id}>
                            <button
                                className="w-full flex items-center gap-3 sm:gap-4 px-4 py-3 sm:px-6 sm:py-4 hover:bg-white/5 text-left transition-all group"
                                onMouseDown={e => { e.preventDefault(); onSelect(p); setQuery(""); setOpen(false); }}
                            >
                                <div className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-full border border-white/10 overflow-hidden bg-white/5">
                                    {p.avatar_url ? (
                                        <img src={p.avatar_url} alt={`${p.first_name} ${p.last_name}`} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center font-black text-cyan-400 bg-cyan-500/10 text-xs sm:text-sm">
                                            {p.first_name?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="block text-xs sm:text-sm font-black text-white group-hover:text-cyan-400 transition-colors truncate">
                                        {`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id.slice(0, 8)}
                                    </span>
                                    {p.rating != null && (
                                        <span className="text-[8px] sm:text-[10px] font-bold text-slate-500 tracking-widest uppercase">ELO: {Math.round(p.rating)}</span>
                                    )}
                                </div>
                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-slate-700 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 5l7 7-7 7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// --- Player Slots ---

function PlayerSlot({ member, isYou, label, sport }: { member: PartyMember | null; isYou?: boolean; label: string; sport: string }) {
    if (!member) {
        return (
            <div className="relative group overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] p-6 sm:p-8 transition-all hover:bg-white/[0.04]">
                <div className="flex flex-col items-center gap-4 sm:gap-6 py-2 sm:py-4">
                    <div className="h-14 w-14 sm:h-20 sm:w-20 rounded-full border-2 sm:border-4 border-dashed border-white/5 bg-black/20 flex items-center justify-center group-hover:border-cyan-500/20 transition-colors">
                        <span className="text-xl sm:text-3xl font-black text-white/5 group-hover:text-white/10">?</span>
                    </div>
                    <div className="text-center">
                        <p className="text-[8px] sm:text-[10px] font-black text-cyan-500/50 uppercase tracking-[0.4em] mb-1 sm:mb-2">{label}</p>
                        <p className="text-xs sm:text-sm font-bold text-slate-600">Waiting for Intel...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border p-5 sm:p-8 shadow-2xl transition-all ${
            isYou ? "border-cyan-500/30 bg-[#0a1420] ring-1 sm:ring-2 ring-cyan-500/10" : "border-white/5 bg-[#0a111a]"
        }`}>
            <HUDCorner className="top-3 left-3 sm:top-4 sm:left-4" />
            <HUDCorner className="bottom-3 right-3 sm:bottom-4 sm:right-4 rotate-180" />
            
            <div className="flex flex-col items-center gap-6 sm:gap-8">
                <div className="relative">
                    <div className={`absolute inset-0 rounded-full blur-2xl opacity-20 ${isYou ? "bg-cyan-500" : "bg-white"}`} />
                    <div className={`relative h-16 w-16 sm:h-24 sm:w-24 rounded-full border sm:border-2 overflow-hidden shadow-2xl ${isYou ? "border-cyan-500/50" : "border-white/10"}`}>
                        {member.avatar_url ? (
                            <img src={member.avatar_url} alt={`${member.first_name} ${member.last_name}`} className="h-full w-full object-cover" />
                        ) : (
                            <div className={`h-full w-full flex items-center justify-center text-xl sm:text-3xl font-black italic ${isYou ? "bg-cyan-500/10 text-cyan-400" : "bg-white/5 text-slate-400"}`}>
                                {member.first_name?.[0]?.toUpperCase()}
                            </div>
                        )}
                    </div>
                    {member.role === "leader" && (
                        <div className="absolute -bottom-1 -right-1 flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-amber-500 text-black border-2 sm:border-4 border-[#0a111a] text-[10px] sm:text-xs shadow-xl" title="Party Leader">
                            👑
                        </div>
                    )}
                </div>

                <div className="w-full space-y-4 sm:space-y-6 text-center">
                    <div className="space-y-1">
                        <p className="text-[8px] sm:text-[10px] font-black text-cyan-500 uppercase tracking-[0.4em]">{label} {isYou && "(YOU)"}</p>
                        <h3 className="text-xl sm:text-2xl font-black italic tracking-tight text-white uppercase truncate">{`${member.first_name || ''} ${member.last_name || ''}`.trim() || "Player"}</h3>
                        <p className="text-[8px] sm:text-[10px] font-bold text-slate-600 uppercase tracking-widest">{member.role === "leader" ? "Commanding Officer" : "Tactical Specialist"}</p>
                    </div>

                    <div className="pt-4 sm:pt-6 border-t border-white/5">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <p className="text-[8px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Service Ratings</p>
                            <InfoIcon text="Current performance metrics. If calibrating, complete more matches to establish ELO." />
                        </div>
                        <RatingDisplay ratings={member.ratings} sport={sport} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Main Page Component ---

export default function PartyQueuePage() {
    const router = useRouter();

    const [myId, setMyId] = useState<string | null>(null);
    const [myProfile, setMyProfile] = useState<PartyMember | null>(null);
    const [party, setParty] = useState<Party | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [queueNotice, setQueueNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [searchKey, setSearchKey] = useState(0);
    const [confirmLeave, setConfirmLeave] = useState(false);

    const [sport, setSport] = useState("pickleball");
    const [matchFormat, setMatchFormat] = useState<PartyMatchFormat>("doubles");
    const [queueMode, setQueueMode] = useState<PartyQueueMode>("normal");
    const [now, setNow] = useState(Date.now());
    const queueTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const queueTimeoutHandled = useRef(false);

    const state: CardState = cardState(party);
    const meta = SPORTS_META[sport] || SPORTS_META.pickleball;

    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const nextSport = params.get("sport");
        const nextFormat = params.get("format");
        const nextMode = params.get("mode");
        if (nextSport && SPORTS_META[nextSport]) {
            setSport(nextSport);
        }
        if (nextFormat === "doubles" || nextFormat === "mixed_doubles") {
            setMatchFormat(nextFormat);
        }
        if (nextMode === "normal" || nextMode === "ranked") {
            setQueueMode(nextMode);
        }
    }, []);

    const fetchParty = useCallback(async () => {
        const token = getAccessToken();
        if (!token) { router.push("/login"); return null; }
        try {
            const res = await fetch("/api/parties/me", { headers: { Authorization: `Bearer ${token}` } });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.push("/login"); return null; }
            const data = await res.json();
            if (data.queue_timed_out) {
                setQueueNotice("Queue paused after 3 minutes. You can continue searching when your duo is ready.");
            }
            
            if (data.party) {
                if (data.party.sport && SPORTS_META[data.party.sport]) {
                    setSport(data.party.sport);
                }
                if (data.party.match_format === "doubles" || data.party.match_format === "mixed_doubles") {
                    setMatchFormat(data.party.match_format as PartyMatchFormat);
                }
                const membersWithProfiles = await Promise.all(data.party.members.map(async (m: PartyMember) => {
                    const profileRes = await fetch(`/api/players/${m.user_id}`, { headers: { Authorization: `Bearer ${token}` } });
                    if (profileRes.ok) {
                        const profileData = await profileRes.json();
                        return { ...m, ...profileData.profile, ratings: profileData.ratings };
                    }
                    return m;
                }));
                const updatedParty = { ...data.party, members: membersWithProfiles };
                setParty(updatedParty);
                return updatedParty;
            } else {
                setParty(null);
                return null;
            }
        } catch {
            return null;
        }
    }, [router]);

    useEffect(() => {
        (async () => {
            const token = getAccessToken();
            if (!token) { router.push("/login"); return; }
            
            const meRes = await fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } });
            if (isUnauthorized(meRes.status)) { clearAuthSession(); router.push("/login"); return; }
            const meData = await meRes.json();
            const meId = meData.profile?.id ?? meData.id;
            setMyId(meId);
            setMyProfile({
                user_id: meId,
                role: "leader",
                avatar_url: meData.profile?.avatar_url,
                first_name: meData.profile?.first_name,
                last_name: meData.profile?.last_name,
                ratings: meData.ratings,
                gender: meData.profile?.gender
            });

            const currentParty = await fetchParty();
            
            if (!currentParty) {
                const params = new URLSearchParams(window.location.search);
                const s = params.get("sport") || "pickleball";
                const f = params.get("format");
                const formatToUse: PartyMatchFormat = (f === "doubles" || f === "mixed_doubles") ? f : "doubles";
                
                try {
                    const createRes = await fetch("/api/parties", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ sport: s, match_format: formatToUse }),
                    });
                    if (createRes.ok) {
                        await fetchParty();
                    }
                } catch (e) {
                    console.error("Auto-create party failed", e);
                }
            }
            
            setLoading(false);
        })();
    }, [router, fetchParty]);

    useEffect(() => {
        if (state === "invite_sent" || state === "ready") {
            const id = setInterval(fetchParty, 4000);
            return () => clearInterval(id);
        }
    }, [state, fetchParty]);

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

    useEffect(() => {
        if (state !== "match_found" || !party?.match_id) return;
        const token = getAccessToken();
        if (!token) return;
        fetch(`/api/matches/${party.match_id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(async (r) => {
                if (r.status === 404) return null;
                if (!r.ok) throw new Error("Failed to load match.");
                return r.json();
            })
            .then(d => {
                if (!d) {
                    void fetchParty();
                    return;
                }
                const s = d?.status ?? d?.match?.status;
                if (s && s !== "invalidated" && s !== "cancelled") {
                    router.push(s === "awaiting_players" ? `/matches/${party.match_id}/lobby` : `/matches/${party.match_id}`);
                } else {
                    void fetchParty();
                }
            })
            .catch(() => { void fetchParty(); });
    }, [state, party, router, fetchParty]);

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
            if (!res.ok) throw new Error(data.detail ?? "Protocol Failure");
            return data;
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Protocol Failure");
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function handleCreate() {
        const data = await apiCall("/parties", "POST", { sport, match_format: matchFormat });
        if (data) fetchParty();
    }

    async function handleInvite(player: PlayerResult) {
        if (!party) return;
        const data = await apiCall(`/parties/${party.id}/invite`, "POST", { invitee_id: player.id });
        if (data) {
            fetchParty();
        } else {
            setSearchKey(k => k + 1);
        }
    }

    async function handleCancelInvite(invId: string) {
        if (!party) return;
        await apiCall(`/parties/invitation/${invId}`, "DELETE");
        fetchParty();
    }

    async function handleLeave() {
        if (!party) return;
        await apiCall(`/parties/${party.id}/disband`, "POST");
        setParty(null);
        setConfirmLeave(false);
    }

    async function handleStartQueue(mode: PartyQueueMode) {
        if (!party) return;
        const blockers = mode === "ranked" ? rankedQueueBlockers : normalQueueBlockers;
        if (blockers.length > 0) {
            setError(blockers[0]);
            return;
        }
        setQueueMode(mode);
        setQueueNotice(null);
        const data = await apiCall(`/parties/${party.id}/queue`, "POST", { match_mode: mode });
        if (data) fetchParty();
    }

    async function handleStopQueue(notice?: string) {
        if (!party) return;
        const data = await apiCall(`/parties/${party.id}/leave-queue`, "POST");
        if (data) {
            if (notice) setQueueNotice(notice);
            fetchParty();
        }
    }

    const host = party?.members?.find(m => m.role === "leader") || myProfile;
    const partner = party?.members?.find(m => m.role === "member");
    const isLeader = party?.leader_id === myId;
    const squadMembers = [host, partner].filter((member): member is PartyMember => Boolean(member));
    
    const normalQueueBlockers = state === "ready"
        ? [
            ...(squadMembers.length !== 2 ? ["Party must have exactly two members before queueing."] : []),
            ...(matchFormat === "mixed_doubles" && !isMixedDoublesDuo(squadMembers)
                ? ["Mixed doubles requires one male and one female player."]
                : []),
        ]
        : [];
        
    const rankedQueueBlockers = state === "ready"
        ? [
            ...normalQueueBlockers,
            ...squadMembers
                .filter(member => !isMlReady(member, sport, matchFormat))
                .map(member => {
                    const rating = ratingFor(member, sport, matchFormat);
                    const target = rating?.matchmaking_target ?? 10;
                    const played = rating?.calibration_matches_played ?? rating?.matches_played ?? 0;
                    const remaining = Math.max(0, target - played);
                    return `${memberLabel(member)} needs ${remaining} more ${matchFormat.replace("_", " ")} calibration match${remaining === 1 ? "" : "es"} for ML ranked queue.`;
                }),
        ]
        : [];
        
    const canStartNormalQueue = normalQueueBlockers.length === 0 && !busy;
    const canStartRankedQueue = rankedQueueBlockers.length === 0 && !busy;
    const queueBlockers = queueMode === "ranked" ? rankedQueueBlockers : normalQueueBlockers;
    
    const elapsed = party?.queue_started_at ? Math.floor((now - new Date(party.queue_started_at).getTime()) / 1000) : 0;
    const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const formatLabel = matchFormat === "mixed_doubles" ? "Mixed Duo" : "2v2 Duo";
    const formatDescription = matchFormat === "mixed_doubles"
        ? "one male and one female partner"
        : "a tactical partner";

    useEffect(() => {
        if (state !== "in_queue") {
            queueTimeoutHandled.current = false;
            return;
        }
        if (!isLeader || busy || queueTimeoutHandled.current || elapsed < PARTY_QUEUE_TIMEOUT_SECONDS) return;
        queueTimeoutHandled.current = true;
        void handleStopQueue("Queue paused after 3 minutes. You can continue searching when your duo is ready.");
    }, [busy, elapsed, isLeader, state]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050b14] text-white">
                <div className="flex min-h-screen items-center justify-center">
                    <div className="px-8 py-4 rounded-2xl border border-white/5 bg-white/[0.02] text-xs font-black uppercase tracking-widest text-slate-500 animate-pulse">
                        Synchronizing Party Link...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30 font-sans">
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute inset-0 animate-scanline pointer-events-none opacity-[0.02] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-20" />
            </div>

            <NavBar hideLogo backHref={`/matches/queue?sport=${sport}&format=${matchFormat}&mode=${queueMode}`} />

            <main className="relative z-10 mx-auto max-w-[1400px] px-4 py-8 pb-32 sm:px-6 lg:px-8 pt-20 sm:pt-24">
                
                <div className="flex flex-col gap-8 sm:gap-12">
                    
                    {/* Header Command */}
                    <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8">
                        <div className="space-y-3 sm:space-y-4">
                            <StatusBadge state={state} />
                            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase italic tracking-tight text-white leading-tight">
                                {formatLabel} <span className="text-cyan-400">Lobby</span>
                            </h1>
                            <p className="text-sm sm:text-lg text-slate-400 font-light max-w-xl">
                                Assemble your team for {meta.label} deployment. Invite {formatDescription} to lock in your squad.
                            </p>
                        </div>
                        
                        {state === "in_queue" && (
                            <div className="rounded-xl sm:rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-6 py-3 sm:px-8 sm:py-4 text-center">
                                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-cyan-500 mb-1">Elapsed Time</p>
                                <p className="text-2xl sm:text-3xl font-black italic text-white">{formatElapsed(elapsed)}</p>
                                <p className="mt-1 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-cyan-200/70">
                                    Auto pause {formatElapsed(Math.max(0, PARTY_QUEUE_TIMEOUT_SECONDS - elapsed))}
                                </p>
                            </div>
                        )}
                    </header>

                    {/* SQUAD SLOTS */}
                    <div className="grid gap-4 sm:gap-8 lg:grid-cols-2">
                        <PlayerSlot label="HOST" member={host || null} isYou={host?.user_id === myId} sport={sport} />
                        <PlayerSlot label="PARTNER" member={partner || null} isYou={partner?.user_id === myId} sport={sport} />
                    </div>

                    {/* COMMAND CONSOLE */}
                    <section className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl p-5 sm:p-10 shadow-2xl">
                        <HUDCorner className="top-3 left-3 sm:top-4 sm:left-4" />
                        <HUDCorner className="top-3 right-3 sm:top-4 sm:right-4 rotate-90" />
                        
                        <div className="flex flex-col lg:flex-row gap-8 sm:gap-12 items-start justify-between">
                            
                            <div className="flex-1 space-y-6 sm:space-y-8 w-full">
                                {error && (
                                    <div className="rounded-xl sm:rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-rose-400 animate-in fade-in slide-in-from-top-2">
                                        {error}
                                    </div>
                                )}

                                {queueNotice && (
                                    <div className="rounded-xl sm:rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-cyan-300 animate-in fade-in slide-in-from-top-2">
                                        {queueNotice}
                                    </div>
                                )}

                                {state === "ready" && queueBlockers.length > 0 && (
                                    <div className="rounded-xl sm:rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5 space-y-2 sm:space-y-3">
                                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">Before {partyQueueModeLabel(queueMode)}</p>
                                        {queueBlockers.map((blocker) => (
                                            <p key={blocker} className="text-[10px] sm:text-xs font-semibold text-amber-100/80 leading-relaxed">{blocker}</p>
                                        ))}
                                    </div>
                                )}

                                {state === "no_party" ? (
                                    <div className="space-y-4 sm:space-y-6">
                                        <h3 className="text-lg sm:text-xl font-black uppercase italic text-white tracking-tight">Initiate Lobby Protocol</h3>
                                        <p className="text-xs sm:text-sm text-slate-400 font-light leading-relaxed">To begin a duo search, first establish a squad lobby. This allows you to invite {formatDescription}.</p>
                                        <button onClick={handleCreate} disabled={busy} className="w-full sm:w-auto group relative overflow-hidden rounded-xl bg-white px-8 py-3.5 sm:px-10 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-black transition hover:scale-105 active:scale-95 disabled:opacity-40">
                                            {busy ? "Protocol Initializing..." : "Create Lobby"}
                                        </button>
                                    </div>
                                ) : state === "forming" && isLeader ? (
                                    <div className="space-y-4 sm:space-y-6">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg sm:text-xl font-black uppercase italic text-white tracking-tight">Invite Tactical Partner</h3>
                                            <InfoIcon text="Search for a player by their name. Once they accept, your duo squad will be locked and ready for deployment." />
                                        </div>
                                        <PlayerSearchInput key={searchKey} onSelect={handleInvite} disabled={busy} />
                                    </div>
                                ) : state === "invite_sent" && isLeader ? (
                                    <div className="space-y-4 sm:space-y-6">
                                        <h3 className="text-lg sm:text-xl font-black uppercase italic text-white tracking-tight">Invitation Pending</h3>
                                        <div className="rounded-xl sm:rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-6 space-y-4">
                                            <p className="text-xs sm:text-sm text-slate-300 font-light leading-tight">Awaiting response from <span className="text-amber-400 font-bold break-all">{`${party?.pending_invites[0]?.invitee_first_name || ''} ${party?.pending_invites[0]?.invitee_last_name || ''}`.trim() || "Player"}</span></p>
                                            <button onClick={() => party && handleCancelInvite(party.pending_invites[0].invitation_id)} disabled={busy} className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400 transition-colors">
                                                Withdraw Invitation
                                            </button>
                                        </div>
                                    </div>
                                ) : state === "ready" && isLeader ? (
                                    <div className="space-y-4 sm:space-y-6">
                                        <h3 className="text-lg sm:text-xl font-black uppercase italic text-white tracking-tight">Squad Deployed</h3>
                                        <p className="text-xs sm:text-sm text-slate-400 font-light leading-relaxed">The squad is synchronized. Use normal mode for calibration matches, or ranked mode once both players are ML-ready.</p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <button onClick={() => handleStartQueue("normal")} disabled={!canStartNormalQueue} className="group relative overflow-hidden rounded-xl bg-white px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-black transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:grayscale disabled:hover:scale-100">
                                                Normal Calibration
                                            </button>
                                            <button onClick={() => handleStartQueue("ranked")} disabled={!canStartRankedQueue} className="group relative overflow-hidden rounded-xl bg-cyan-500 px-6 py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-black transition hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(6,182,212,0.3)] disabled:opacity-40 disabled:grayscale disabled:hover:scale-100">
                                                Ranked ML Match
                                            </button>
                                        </div>
                                    </div>
                                ) : state === "in_queue" && isLeader ? (
                                    <div className="space-y-4 sm:space-y-6">
                                        <h3 className="text-lg sm:text-xl font-black uppercase italic text-white tracking-tight">Duo Search Active</h3>
                                        <p className="text-xs sm:text-sm text-slate-400 font-light leading-relaxed">ISMS is scanning for optimal opponents. The queue will automatically pause after 3 minutes if no match is found.</p>
                                        <button onClick={() => handleStopQueue()} disabled={busy} className="w-full sm:w-auto rounded-xl border border-rose-500/20 bg-rose-500/5 px-8 py-3.5 sm:px-10 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-rose-500 transition hover:bg-rose-500/10">
                                            Abort Search
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 sm:space-y-6">
                                        <h3 className="text-lg sm:text-xl font-black uppercase italic text-white tracking-tight">System Status</h3>
                                        <p className="text-xs sm:text-sm text-slate-400 font-light leading-relaxed">Waiting for leader command. Ensure your profile is calibrated for optimal matching.</p>
                                    </div>
                                )}
                            </div>

                            <aside className="w-full lg:w-80 space-y-4 sm:space-y-6">
                                <div className="rounded-2xl sm:rounded-3xl border border-white/5 bg-white/[0.02] p-5 sm:p-8 space-y-4">
                                    <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Lobby Intel</p>
                                    <div className="space-y-3 sm:space-y-4">
                                        <div className="flex justify-between text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">
                                            <span className="text-slate-600">Discipline</span>
                                            <span className="text-cyan-400">{meta.label}</span>
                                        </div>
                                        <div className="flex justify-between text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">
                                            <span className="text-slate-600">Format</span>
                                            <span className="text-white">{formatLabel}</span>
                                        </div>
                                        <div className="flex justify-between text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">
                                            <span className="text-slate-600">Protocol</span>
                                            <span className="text-white">{partyQueueModeLabel(queueMode)}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {state !== "no_party" && !busy && (
                                    <button 
                                        onClick={() => confirmLeave ? handleLeave() : setConfirmLeave(true)} 
                                        className={`w-full py-3.5 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${
                                            confirmLeave ? "bg-rose-500 text-white" : "border border-white/5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/5"
                                        }`}
                                    >
                                        {confirmLeave ? "Confirm Disband Lobby?" : "Disband Lobby"}
                                    </button>
                                )}
                            </aside>

                        </div>
                    </section>

                </div>
            </main>
        </div>
    );
}
