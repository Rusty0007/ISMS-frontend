"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

// --- Types & Constants ---

type MatchFormat = "singles" | "doubles" | "mixed_doubles";
type QueueMode = "normal" | "ranked";
type QueueState = "idle" | "queued" | "assembling" | "optimizing" | "matched";
type MatchedProfile = { id?: string; first_name?: string | null; last_name?: string | null; avatar_url?: string | null };
type PlayerProfileResponse = Partial<MatchedProfile> & { profile?: MatchedProfile };

const SPORTS_META: Record<string, { label: string; image: string; accent: string; border: string; tint: string; code: string; icon: string }> = {
    pickleball: { label: "Pickleball", image: "/sports/pickleball.jpg.png", accent: "text-cyan-400", border: "border-cyan-500/30", tint: "bg-cyan-500/5", code: "PB", icon: "🎾" },
    badminton: { label: "Badminton", image: "/sports/badminton.jpg.png", accent: "text-fuchsia-400", border: "border-fuchsia-500/30", tint: "bg-fuchsia-500/5", code: "BD", icon: "🏸" },
    lawn_tennis: { label: "Lawn Tennis", image: "/sports/lawn-tennis.jpg.png", accent: "text-emerald-400", border: "border-emerald-500/30", tint: "bg-emerald-500/5", code: "LT", icon: "🎾" },
    table_tennis: { label: "Table Tennis", image: "/sports/table-tennis.jpg.png", accent: "text-amber-400", border: "border-amber-500/30", tint: "bg-amber-500/5", code: "TT", icon: "🏓" },
};

const STEPS = [
    { n: "01", t: "Sport Selection", d: "Select your sport discipline." },
    { n: "02", t: "Match Setup", d: "Configure singles or doubles queue." },
    { n: "03", t: "FIND MATCH", d: "Launch search and secure your match." },
];

const MATCH_TYPES: { key: MatchFormat; badge: string; title: string; note: string; info: string }[] = [
    {
        key: "singles",
        badge: "1v1",
        title: "Singles",
        note: "Direct 1v1 matchmaking.",
        info: "The system will find one opponent from your joined clubs with a similar skill level and nearby availability."
    },
    {
        key: "doubles",
        badge: "2v2",
        title: "Doubles",
        note: "Team-based 2v2 matchmaking.",
        info: "Queue solo to be paired with others, or invite a partner to search for another team of two."
    },
    {
        key: "mixed_doubles",
        badge: "MIX",
        title: "Mixed Doubles",
        note: "Male + female 2v2 matchmaking.",
        info: "Mixed doubles is 2v2 where each team must have one male and one female player."
    },
];

const SINGLES_STEPS = [
    { title: "Checking Availability", note: "Checking availability across your joined clubs." },
    { title: "Reviewing Stats", note: "Comparing skill levels for the best competitive fit." },
    { title: "Proximity Sync", note: "Optimizing for nearby players and venue overlap." },
];

const DOUBLES_STEPS = [
    { title: "Finding Players", note: "Waiting for eligible players to fill the 2v2 pool." },
    { title: "Balancing Teams", note: "Calculating the fairest split based on combined ratings." },
    { title: "Securing Venue", note: "Finalizing court availability for the group." },
];

// --- HUD Helper Components ---

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <svg className={`absolute w-4 h-4 text-white/20 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function StatusBadge({ state }: { state: QueueState }) {
    const meta = {
        idle: "border-white/10 bg-white/5 text-slate-400",
        queued: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
        assembling: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400",
        optimizing: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        matched: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    }[state];
    const label = {
        idle: "READY",
        queued: "SEARCHING",
        assembling: "ASSEMBLING",
        optimizing: "BALANCING",
        matched: "MATCH SECURED"
    }[state];

    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${meta}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${state !== "idle" ? "bg-current animate-pulse" : "bg-white/20"}`} />
            {label}
        </div>
    );
}

function useElapsedTime(running: boolean) {
    const [seconds, setSeconds] = useState(0);
    const ref = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        if (running) {
            setSeconds(0);
            ref.current = setInterval(() => setSeconds((v) => v + 1), 1000);
        } else if (ref.current) clearInterval(ref.current);
        return () => { if (ref.current) clearInterval(ref.current); };
    }, [running]);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function useCyclingStep(items: { title: string; note: string }[], running: boolean, delay = 2200) {
    const [idx, setIdx] = useState(0);
    const ref = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        if (running) {
            setIdx(0);
            ref.current = setInterval(() => setIdx((v) => (v + 1) % items.length), delay);
        } else if (ref.current) clearInterval(ref.current);
        return () => { if (ref.current) clearInterval(ref.current); };
    }, [delay, items.length, running]);
    return items[idx];
}

async function resolveCityName(cityCode: string) {
    // Avoid blocking the queue page on external PSGC DNS/API availability.
    return cityCode ? `PSGC ${cityCode}` : "";
}

function isTeamFormat(value: MatchFormat) {
    return value !== "singles";
}

function formatTitle(value: MatchFormat) {
    if (value === "singles") return "SINGLES (1v1)";
    if (value === "mixed_doubles") return "MIXED DOUBLES (2v2)";
    return "DOUBLES (2v2)";
}

function hasMixedDoublesGender(value: string | null) {
    return value === "male" || value === "female";
}

function queueModeLabel(value: QueueMode) {
    return value === "ranked" ? "Ranked Match" : "Normal Calibration";
}

function queueModeNote(value: QueueMode) {
    return value === "ranked"
        ? "ML-gated match for calibrated players."
        : "Counts toward the 10-match ML calibration.";
}

// --- Main Queue Page ---

export default function QueuePage() {
    const router = useRouter();
    const [userSports, setUserSports] = useState<string[]>([]);
    const [sport, setSport] = useState("");
    const [format, setFormat] = useState<MatchFormat>("singles");
    const [queueMode, setQueueMode] = useState<QueueMode>("normal");
    const [formatTouched, setFormatTouched] = useState(false);
    const [queueState, setQueueState] = useState<QueueState>("idle");
    const [, setPlayersJoined] = useState(0);
    const [loading, setLoading] = useState(false);
    const [fetchingMe, setFetchingMe] = useState(true);
    const [error, setError] = useState("");
    const [requestedSport, setRequestedSport] = useState<string | null>(null);
    const [requestedFormat, setRequestedFormat] = useState<MatchFormat | null>(null);

    const [hasInitializedFromUrl, setHasInitializedFromUrl] = useState(false);

    const [displayName, setDisplayName] = useState("");
    const [heroLocation, setHeroLocation] = useState("Set your location");
    const [profileGender, setProfileGender] = useState<string | null>(null);

    // Transition / Preparing States
    const [matchedProfiles, setMatchedProfiles] = useState<MatchedProfile[]>([]);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const navigatingMatchIdRef = useRef<string | null>(null);

    const elapsed = useElapsedTime(queueState === "queued" || queueState === "assembling" || queueState === "optimizing");
    const singlesStep = useCyclingStep(SINGLES_STEPS, queueState === "queued");
    const doublesStep = useCyclingStep(DOUBLES_STEPS, queueState === "assembling" || queueState === "optimizing", 1800);

    useEffect(() => () => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (redirectRef.current) clearTimeout(redirectRef.current);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const nextSport = params.get("sport");
        const formatParam = params.get("format");
        const modeParam = params.get("mode");
        const nextFormat = formatParam === "doubles" || formatParam === "mixed_doubles" || formatParam === "singles" ? formatParam : null;
        setRequestedSport(nextSport);
        setRequestedFormat(nextFormat);
        if (nextFormat) {
            setFormat(nextFormat);
            setFormatTouched(true);
        }
        if (modeParam === "ranked" || modeParam === "normal") {
            setQueueMode(modeParam);
        }
    }, []);

    useEffect(() => {
        if (queueState !== "idle" || userSports.length === 0 || hasInitializedFromUrl) return;

        const initialSport = requestedSport && userSports.includes(requestedSport) ? requestedSport : null;

        if (initialSport) {
            setSport(initialSport);
        } else if (!sport && userSports.length === 1) {
            setSport(userSports[0]);
        }

        if (requestedFormat) {
            setFormat(requestedFormat);
            setFormatTouched(true);
        }

        setHasInitializedFromUrl(true);
    }, [hasInitializedFromUrl, queueState, requestedFormat, requestedSport, sport, userSports]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        let cancelled = false;

        const loadProfile = async () => {
            try {
                const res = await fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } });
                if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (cancelled) return;
                const sports = (Array.isArray(data.sports) ? data.sports : [])
                    .map((entry: { sport?: string }) => entry?.sport)
                    .filter((value: string | undefined): value is string => typeof value === "string" && value.length > 0);
                setUserSports(sports);
                setDisplayName(`${data.profile?.first_name || ''} ${data.profile?.last_name || ''}`.trim() || "");
                setProfileGender(typeof data.profile?.gender === "string" ? data.profile.gender : null);
                if (data.profile?.city_mun_code) {
                    const city = await resolveCityName(data.profile.city_mun_code);
                    if (!cancelled && city) setHeroLocation(city);
                }
            } catch {
                if (!cancelled) setError("System link failure. Please retry.");
            } finally {
                if (!cancelled) setFetchingMe(false);
            }
        };

        const restoreQueue = async () => {
            try {
                const res = await fetch("/api/matches/queue/me", { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                if (data?.active_match && data.match_id) { router.replace(await resolveMatchTarget(data.match_id, data.match_status)); return; }
                if (!data?.in_queue) return;
                const restoredSport = data.sport ?? "";
                const restoredFormat: MatchFormat =
                    data.match_format === "doubles" || data.match_format === "mixed_doubles"
                        ? data.match_format
                        : "singles";
                const joined = Number(data.players_joined ?? (restoredFormat === "singles" ? 1 : 0));
                setSport(restoredSport);
                setFormat(restoredFormat);
                setQueueMode(data.match_mode === "ranked" ? "ranked" : "normal");
                setFormatTouched(true);
                setPlayersJoined(joined);
                setQueueState(restoredFormat === "singles" ? "queued" : joined >= 4 ? "optimizing" : "assembling");
                startPolling(restoredSport, restoredFormat, data.match_mode === "ranked" ? "ranked" : "normal", token);
            } catch {}
        };

        void loadProfile();
        void restoreQueue();
        return () => { cancelled = true; };
    }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

    async function resolveMatchTarget(matchId: string, statusHint?: string) {
        if (statusHint === "awaiting_players") return `/matches/${matchId}/lobby`;
        if (statusHint === "ongoing" || statusHint === "pending_approval") return `/matches/${matchId}`;
        const token = getAccessToken();
        if (!token) return `/matches/${matchId}`;
        try {
            const res = await fetch(`/api/matches/${matchId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.status === 404) return "/matches/queue";
            if (!res.ok) return `/matches/${matchId}`;
            const data = await res.json();
            const status = data?.match?.status ?? data?.status;
            if (status === "awaiting_players") return `/matches/${matchId}/lobby`;
            if (status === "invalidated" || status === "cancelled") return "/matches/queue";
            return `/matches/${matchId}`;
        } catch {
            return `/matches/${matchId}`;
        }
    }

    function startPolling(sportKey: string, formatKey: MatchFormat, modeKey: QueueMode, token: string) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/matches/queue/status?sport=${sportKey}&match_format=${formatKey}&match_mode=${modeKey}`, { headers: { Authorization: `Bearer ${token}` } });
                if (isUnauthorized(res.status)) { if (pollRef.current) clearInterval(pollRef.current); clearAuthSession(); router.replace("/login"); return; }
                if (!res.ok) return;
                const data = await res.json();
                if (data.status === "matched") { if (pollRef.current) clearInterval(pollRef.current); void handleMatchFound(data.match_id, data.match_status); }
                else if (data.status === "assembling" && data.players_joined !== undefined) {
                    const joined = Number(data.players_joined ?? 0);
                    setPlayersJoined(joined);
                    setQueueState(joined >= 4 ? "optimizing" : "assembling");
                }
            } catch {}
        }, 3000);
    }

    async function handleMatchFound(id: string, statusHint?: string) {
        if (!id || navigatingMatchIdRef.current === id) return;
        navigatingMatchIdRef.current = id;
        if (redirectRef.current) clearTimeout(redirectRef.current);
        if (pollRef.current) clearInterval(pollRef.current);
        
        setQueueState("matched");

        const token = getAccessToken();
        if (token) {
            try {
                const res = await fetch(`/api/matches/${id}`, { headers: { Authorization: `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    const pIds = [data.match.player1_id, data.match.player2_id, data.match.player3_id, data.match.player4_id].filter(Boolean);
                    
                    const profilePromises = pIds.map(pid =>
                        fetch(`/api/players/${pid}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json() as Promise<PlayerProfileResponse>)
                    );
                    const profiles = await Promise.all(profilePromises);
                    setMatchedProfiles(profiles.map((item) => item.profile ?? item));
                }
            } catch (e) {
                console.error("Failed to fetch match details for transition", e);
            }
        }

        const target = await resolveMatchTarget(id, statusHint);
        // Extended delay for the transition effect
        redirectRef.current = setTimeout(() => router.push(target), 4500);
    }

    async function handleJoinQueue() {
        if (!sport) { setError("Discipline not selected."); return; }
        if (format === "mixed_doubles" && !hasMixedDoublesGender(profileGender)) {
            setError("Mixed doubles requires your profile gender to be male or female.");
            return;
        }
        setError("");
        setLoading(true);
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        try {
            const res = await fetch("/api/matches/queue/join", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ sport, match_format: format, match_mode: queueMode }),
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            const data = await res.json();
            if (!res.ok) { setError(data.detail || "Search failed."); return; }
            if (data.status === "matched") { await handleMatchFound(data.match_id, data.match_status); return; }
            if (data.status === "assembling") {
                setPlayersJoined(data.players_joined ?? 1);
                setQueueState("assembling");
                startPolling(sport, format, queueMode, token);
                return;
            }
            setQueueState("queued");
            startPolling(sport, format, queueMode, token);
        } catch {
            setError("Connection failure.");
        } finally {
            setLoading(false);
        }
    }

    async function handleLeaveQueue() {
        const token = getAccessToken();
        if (!token) return;
        if (pollRef.current) clearInterval(pollRef.current);
        if (redirectRef.current) clearTimeout(redirectRef.current);
        navigatingMatchIdRef.current = null;
        try {
            await fetch(`/api/matches/queue/leave?sport=${sport}&match_format=${format}&match_mode=${queueMode}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        } catch {}
        setQueueState("idle");
        setPlayersJoined(0);
    }

    const selectedMeta = sport ? SPORTS_META[sport] : undefined;
    const activeStep = !sport ? 1 : !formatTouched ? 2 : 3;

    if (fetchingMe) {
        return (
            <div className="min-h-screen bg-[#050b14] text-white">
                <div className="flex min-h-screen items-center justify-center px-4">
                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-8 py-6 text-xs font-black uppercase tracking-widest text-slate-500 animate-pulse">
                        Synchronizing Player Data...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30 font-sans">
            {/* Background Effects */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute inset-0 animate-scanline pointer-events-none opacity-[0.02] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-20" />
            </div>

            <NavBar hideLogo backHref="/dashboard" backLabel="Dashboard" />

            <main className="relative z-10 mx-auto flex max-w-[1400px] flex-col gap-6 sm:gap-8 px-4 py-6 sm:py-8 pb-32 sm:px-6 lg:px-8 pt-20 sm:pt-24">

                {/* Sticky Mobile Action Bar */}
                {queueState === "idle" && sport && (
                    <div className="lg:hidden fixed bottom-24 inset-x-0 z-[90] px-4 animate-in slide-in-from-bottom-10 duration-500">
                        <button
                            type="button"
                            onClick={() => void handleJoinQueue()}
                            disabled={loading}
                            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-4 text-xs font-black uppercase tracking-[0.2em] text-white shadow-[0_12px_40px_rgba(6,182,212,0.4)] active:scale-95 transition-all"
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {loading ? (
                                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <span className="text-sm">⚡</span>
                                        {queueMode === "ranked" ? "FIND RANKED MATCH" : "FIND NORMAL MATCH"}
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </>
                                )}
                            </span>
                            <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.2),transparent)] animate-[shimmer_2s_infinite]" />
                        </button>
                    </div>
                )}

                {queueState === "idle" && (
                    <div className="space-y-6 sm:space-y-8">
                        {/* Hero Command Center */}
                        <section className="relative group overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl">
                            <HUDCorner className="top-3 left-3 sm:top-4 sm:left-4" />
                            <HUDCorner className="top-3 right-3 sm:top-4 sm:right-4 rotate-90" />
                            <HUDCorner className="bottom-3 left-3 sm:bottom-4 sm:left-4 -rotate-90" />
                            <HUDCorner className="bottom-3 right-3 sm:bottom-4 sm:right-4 rotate-180" />

                            <div className="absolute inset-0 opacity-20 transition-opacity group-hover:opacity-30">
                                <Image src="/sports/sports-hero.png" alt="ISMS background" fill className="object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-r from-[#050b14] via-[#050b14]/90 to-transparent" />
                            </div>

                            <div className="relative flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12 p-6 sm:p-8 lg:p-12">
                                <div className="max-w-xl space-y-4 sm:space-y-6 text-center lg:text-left">
                                    <div className="space-y-3 sm:space-y-4">
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                            SEARCH READY
                                        </div>
                                        <h1 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight text-white lg:text-5xl uppercase italic leading-tight">
                                            FIND <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-500">MATCH</span>
                                        </h1>
                                        <p className="text-sm sm:text-lg text-slate-400 leading-relaxed font-light">
                                            Launch normal calibration matches to build history, or switch to ranked once the ML model can judge your skill profile.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap justify-center lg:justify-start gap-2 sm:gap-3">
                                        <span className="rounded-full border border-white/5 bg-white/5 px-3 sm:px-4 py-1 sm:py-1.5 text-[9px] sm:text-xs font-bold text-slate-300">OP: {displayName}</span>
                                        <span className="rounded-full border border-white/5 bg-white/5 px-3 sm:px-4 py-1 sm:py-1.5 text-[9px] sm:text-xs font-bold text-slate-300">LOC: {heroLocation}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full lg:w-auto min-w-0 sm:min-w-[320px]">
                                    {[{ label: "Queue Type", value: queueMode === "ranked" ? "Ranked" : "Normal", note: queueModeNote(queueMode) },
                                      { label: "Search Mode", value: queueMode === "ranked" ? "ML" : "Calibration", note: queueMode === "ranked" ? "Guardrailed" : "History builder" }].map((stat) => (
                                        <div key={stat.label} className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-white/5 bg-black/40 p-4 sm:p-5">
                                            <div className="absolute top-0 left-0 h-1 w-full bg-cyan-500 opacity-20" />
                                            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.label}</p>
                                            <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-black italic text-white">{stat.value}</p>
                                            <p className="mt-0.5 sm:mt-1 text-[8px] sm:text-[10px] font-bold uppercase text-slate-600">{stat.note}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1fr_360px]">
                            {/* Primary Interaction Column */}
                            <div className="space-y-8 sm:space-y-12">
                                {/* Sport Discipline Selection */}
                                <section className="space-y-4 sm:space-y-6">
                                    <div className="flex items-end justify-between px-2 gap-2">
                                        <div className="space-y-1">
                                            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Step 01</p>
                                            <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight">Select Discipline <InfoIcon text="Choose the sport you want to compete in. Only sports registered on your account are displayed." /></h2>
                                        </div>
                                        <StatusBadge state="idle" />
                                    </div>

                                    {userSports.length === 0 ? (
                                        <Empty title="No Registered Disciplines" note="Configure your profile to track performance across different sports before queuing." href="/profile" action="Configure Profile" />
                                    ) : (
                                        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                                            {userSports.map((key) => {
                                                const meta = SPORTS_META[key] || { label: key, image: "/sports/community-photo.png", accent: "text-white", border: "border-white/10", tint: "bg-white/5", code: "??", icon: "🏸" };
                                                const active = sport === key;
                                                return (
                                                    <button key={key} type="button" onClick={() => { setSport(key); setError(""); }} className={`group relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border transition-all ${active ? `${meta.border} bg-[#0a111a] ring-2 ring-cyan-500/20` : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                                                        <div className={`absolute inset-0 opacity-[0.05] grayscale transition-all ${active ? "opacity-[0.1] grayscale-0" : "group-hover:opacity-[0.08]"}`}>
                                                            <Image src={meta.image} alt={meta.label} fill className="object-cover" />
                                                        </div>
                                                        <div className="relative flex min-h-[120px] sm:min-h-[160px] flex-col justify-between p-5 sm:p-6 text-left">
                                                            <div className="flex items-start justify-between">
                                                                <div className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-white/5 border border-white/10 ${active ? meta.accent : "text-white/40"}`}>
                                                                    <span className="text-sm sm:text-lg font-black italic">{meta.code}</span>
                                                                </div>
                                                                {active && <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Selected</span>}
                                                            </div>
                                                            <div>
                                                                <h3 className={`text-lg sm:text-xl font-black uppercase italic tracking-tight ${active ? meta.accent : "text-white"}`}>{meta.label}</h3>
                                                                <p className="mt-0.5 sm:mt-1 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500">{active ? "SEARCH READY" : "Standby"}</p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                {/* Match Type Selection */}
                                <section className="space-y-4 sm:space-y-6">
                                    <div className="flex items-end justify-between px-2">
                                        <div className="space-y-1">
                                            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Step 02</p>
                                            <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight">Tactical Setup <InfoIcon text="Configure your match format. Singles for 1v1, doubles for open 2v2, or mixed doubles for male + female teams." /></h2>
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
                                        {MATCH_TYPES.map((type) => {
                                            const active = format === type.key;
                                            return (
                                                <button
                                                    key={type.key}
                                                    type="button"
                                                    onClick={() => {
                                                        setFormat(type.key);
                                                        setFormatTouched(true);
                                                        setError("");
                                                    }}
                                                    className={`group relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border transition-all ${active ? "border-cyan-500/30 bg-[#0a111a] ring-2 ring-cyan-500/20" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}
                                                >
                                                    <div className="relative p-5 sm:p-6 text-left space-y-3 sm:space-y-4">
                                                        <div className="flex items-start justify-between">
                                                            <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg sm:rounded-xl bg-white/5 border border-white/10 text-lg sm:text-xl font-black italic ${active ? "text-cyan-400" : "text-white/40"}`}>
                                                                {type.badge}
                                                            </div>
                                                            <InfoIcon text={type.info} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight text-white">{type.title}</h3>
                                                            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-400 font-light leading-relaxed">{type.note}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            </div>

                            <aside className="space-y-6 lg:sticky lg:top-24 h-fit">
                                {/* Deployment Summary (Random Ranked Match Button) */}
                                <section className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-cyan-500/20 bg-[#0a111a]/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/10">
                                    <div className="absolute top-0 left-0 w-1 h-12 bg-cyan-500 rounded-full translate-y-6" />
                                    <div className="mb-6 sm:mb-8 space-y-1">
                                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500/60">Finalize</p>
                                        <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white">Match Summary</h2>
                                    </div>

                                    <div className="space-y-3 sm:space-y-4">
                                        <div className="rounded-xl sm:rounded-2xl bg-white/5 p-4 sm:p-5 border border-white/5 transition-colors hover:bg-white/[0.08]">
                                            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500">Selected Sport</p>
                                            <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-black italic text-white uppercase leading-none">{selectedMeta?.label || "NOT SELECTED"}</p>
                                        </div>
                                        <div className="rounded-xl sm:rounded-2xl bg-white/5 p-4 sm:p-5 border border-white/5 transition-colors hover:bg-white/[0.08]">
                                            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500">Match Mode</p>
                                            <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-black italic text-white uppercase leading-none">{formatTitle(format)}</p>
                                        </div>
                                        <div className="rounded-xl sm:rounded-2xl bg-white/5 p-4 sm:p-5 border border-white/5 transition-colors hover:bg-white/[0.08]">
                                            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500">Queue Protocol</p>
                                            <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-black italic text-white leading-none">{queueModeLabel(queueMode).toUpperCase()}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 sm:mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/5 bg-black/20 p-2">
                                        {(["normal", "ranked"] as QueueMode[]).map((mode) => {
                                            const active = queueMode === mode;
                                            return (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => { setQueueMode(mode); setError(""); }}
                                                    className={`rounded-xl px-3 py-3 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] transition ${active ? "bg-cyan-500 text-black shadow-[0_0_24px_rgba(6,182,212,0.25)]" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
                                                >
                                                    {mode === "ranked" ? "Ranked" : "Normal"}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {error && (
                                        <div className="mt-4 sm:mt-6 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 sm:p-4 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-rose-400 animate-in fade-in slide-in-from-top-2">
                                            ⚠ {error}
                                        </div>
                                    )}

                                    <div className="mt-6 sm:mt-8 space-y-3">
                                        <button
                                            type="button"
                                            onClick={() => void handleJoinQueue()}
                                            disabled={loading || !sport}
                                            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-700 py-4 sm:py-5 text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] text-white transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:scale-100"
                                        >
                                            <span className="relative z-10 flex items-center justify-center gap-3">
                                                {loading ? (
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                        Initializing...
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span className="text-base">⚡</span>
                                                        {queueMode === "ranked" ? "FIND RANKED MATCH" : "FIND NORMAL MATCH"}
                                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                    </>
                                                )}
                                            </span>
                                            <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.15),transparent)] -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] duration-1000" />
                                        </button>

                                        {isTeamFormat(format) && (
                                            <button
                                                type="button"
                                                onClick={() => router.push(`/matches/party?sport=${sport}&format=${format}&mode=${queueMode}`)}
                                                disabled={!sport}
                                                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-white/10 hover:border-white/20 disabled:opacity-40"
                                            >
                                                {format === "mixed_doubles" ? "Invite Mixed Partner" : "Invite Partner"}
                                            </button>
                                        )}
                                    </div>

                                    <p className="mt-5 sm:mt-6 text-[9px] sm:text-[10px] font-medium text-slate-500 leading-relaxed text-center">
                                        {queueMode === "ranked"
                                            ? "Ranked random matchmaking requires ML calibration: 10 completed matches in this sport and format."
                                            : "Normal matches are for calibration testing and count toward the 10-match ML unlock."}
                                    </p>
                                </section>
                            </aside>

                            {/* Secondary Information Row */}
                            <div className="space-y-8 sm:space-y-12">
                                {/* System Logic Overlay (Informational) */}
                                <section className="space-y-6">
                                    <div className="rounded-[1.5rem] sm:rounded-[2rem] border border-cyan-500/20 bg-[#0a1420] p-6 sm:p-8">
                                        <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
                                            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl bg-cyan-500/10 text-cyan-400">
                                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M12 11v5m0-8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </div>
                                            <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight text-white">Matchmaking Protocols</h3>
                                        </div>
                                        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
                                            {[
                                                { t: "Skill Parity", d: "Matches users with equivalent ratings for competitive balance.", i: "📊" },
                                                { t: "Proximity Sync", d: "Prioritizes nearby players to minimize travel time.", i: "📍" },
                                                { t: "Network Search", d: "Utilizes joined clubs for trusted venue access.", i: "🏢" }
                                            ].map((p) => (
                                                <div key={p.t} className="rounded-xl sm:rounded-2xl bg-white/5 p-4 sm:p-5 border border-white/5">
                                                    <span className="text-lg block mb-1.5 sm:mb-2">{p.i}</span>
                                                    <h4 className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white mb-1.5 sm:mb-2">{p.t}</h4>
                                                    <p className="text-[9px] sm:text-[10px] font-medium leading-relaxed text-slate-500">{p.d}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <aside className="space-y-6">
                                {/* Match Feed (Contextual Info) */}
                                <section className="rounded-2xl sm:rounded-3xl border border-white/5 bg-[#0a111a]/80 p-5 sm:p-6 space-y-4">
                                    <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Match Feed</p>
                                    <div className="space-y-4">
                                        <div className="flex gap-3 sm:gap-4 items-start">
                                            <span className="text-lg sm:text-xl">📡</span>
                                            <p className="text-[9px] sm:text-[10px] font-medium text-slate-400 leading-relaxed">System is optimized for <span className="text-cyan-400 font-bold">Same Skill</span> matching. Skill fit is prioritized to ensure competitive integrity.</p>
                                        </div>
                                        <div className="flex gap-3 sm:gap-4 items-start">
                                            <span className="text-lg sm:text-xl">📍</span>
                                            <p className="text-[9px] sm:text-[10px] font-medium text-slate-400 leading-relaxed">Venue network is active. We are prioritizing players within <span className="text-cyan-400 font-bold">Nearby Range</span> for efficiency.</p>
                                        </div>
                                    </div>
                                </section>
                            </aside>
                        </div>

                        {/* Step Indicators (Moved to bottom) */}
                        <section className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
                            {STEPS.map((step, index) => {
                                const state = index + 1 < activeStep
                                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                                    : index + 1 === activeStep
                                        ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                                        : "border-white/5 bg-white/[0.02] text-slate-500";
                                return (
                                    <div key={step.n} className={`relative overflow-hidden rounded-xl sm:rounded-2xl border p-4 sm:p-5 transition-all ${state}`}>
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            <span className="text-xs sm:text-sm font-black italic opacity-40">{step.n}</span>
                                            <div>
                                                <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-white">{step.t}</h3>
                                                <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-medium opacity-70 leading-tight">{step.d}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    </div>
                )}

                {/* SEARCHING STATE */}
                {(queueState === "queued" || queueState === "assembling" || queueState === "optimizing") && selectedMeta && (
                    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8 animate-in fade-in duration-500">
                        <section className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2.5rem] border border-cyan-500/20 bg-[#0a111a]/90 backdrop-blur-xl p-6 sm:p-8 lg:p-12 shadow-[0_0_100px_rgba(6,182,212,0.1)]">
                            <HUDCorner className="top-4 left-4 sm:top-8 sm:left-8" />
                            <HUDCorner className="top-4 right-4 sm:top-8 sm:right-8 rotate-90" />
                            <HUDCorner className="bottom-4 left-4 sm:bottom-8 sm:left-8 -rotate-90" />
                            <HUDCorner className="bottom-4 right-4 sm:bottom-8 sm:right-8 rotate-180" />

                            <div className="flex flex-col items-center text-center space-y-8 sm:space-y-12">
                                <div className="space-y-3 sm:space-y-4">
                                    <StatusBadge state={queueState} />
                                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase italic tracking-tight text-white leading-tight">
                                        Searching for <span className="text-cyan-400">{selectedMeta.label}</span> fit
                                    </h1>
                                    <p className="text-sm sm:text-lg text-slate-400 font-light max-w-2xl">
                                        {queueMode === "ranked"
                                            ? "ISMS is executing ranked matching protocols. The ML model scans calibrated players for fair skill parity and rating confidence."
                                            : "ISMS is running normal calibration matchmaking. These results build the match history needed before ranked ML matching unlocks."}
                                    </p>
                                </div>

                                <div className="relative flex h-48 w-48 sm:h-64 sm:w-64 items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-scanline" />
                                    <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" />
                                    <div className="absolute inset-2 sm:inset-4 rounded-full border border-cyan-500/10 animate-pulse" />

                                    <div className="relative h-32 w-32 sm:h-40 sm:w-40 overflow-hidden rounded-2xl sm:rounded-3xl border border-cyan-500/30 bg-cyan-500/5 flex flex-col items-center justify-center group">
                                        <Image src={selectedMeta.image} alt={selectedMeta.label} fill className="object-cover opacity-20" />
                                        <span className="relative z-10 text-3xl sm:text-4xl font-black italic text-cyan-400">{selectedMeta.code}</span>
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a111a] via-transparent to-transparent opacity-60" />
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:gap-4 w-full grid-cols-1 sm:grid-cols-3">
                                    {[{ l: "Elapsed Time", v: elapsed },
                                      { l: "Protocol", v: format === "singles" ? "Solo Ops" : format === "mixed_doubles" ? "Mixed Duo" : "Duo Squad" },
                                      { l: "Queue", v: queueMode === "ranked" ? "Ranked" : "Normal" }].map((stat) => (
                                        <div key={stat.l} className="rounded-xl sm:rounded-2xl border border-white/5 bg-white/5 p-4 sm:p-5">
                                            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.l}</p>
                                            <p className="mt-1 sm:mt-2 text-xl sm:text-2xl font-black italic text-white leading-none">{stat.v}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="w-full max-w-md space-y-3 sm:space-y-4">
                                    <div className="flex justify-between items-end">
                                        <div className="text-left min-w-0">
                                            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-cyan-500">Current Action</p>
                                            <h3 className="text-base sm:text-lg font-bold text-white uppercase italic tracking-tight truncate">{(format === "singles" ? singlesStep : doublesStep).title}</h3>
                                        </div>
                                        <span className="text-[10px] sm:text-xs font-black text-cyan-400 animate-pulse shrink-0">EXECUTING...</span>
                                    </div>
                                    <div className="h-1 sm:h-1.5 w-full bg-white/5 overflow-hidden rounded-full">
                                        <div className="h-full bg-cyan-500 transition-all duration-1000 animate-shimmer" style={{ width: "60%" }} />
                                    </div>
                                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-medium">{(format === "singles" ? singlesStep : doublesStep).note}</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => void handleLeaveQueue()}
                                    className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg sm:rounded-xl border border-rose-500/20 bg-rose-500/5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-rose-400 transition hover:bg-rose-500/10 active:scale-95"
                                >
                                    Cancel Search
                                </button>
                            </div>
                        </section>
                    </div>
                )}

                {/* MATCHED STATE */}
                {queueState === "matched" && selectedMeta && (
                    <div className="mx-auto max-w-4xl text-center space-y-12 py-6 sm:py-12 animate-in zoom-in-95 duration-500">
                        <div className="space-y-4">
                            <StatusBadge state="matched" />
                            <h1 className="text-3xl sm:text-5xl font-black uppercase italic tracking-tight text-white">
                                Match <span className="text-emerald-400">Secured</span>
                            </h1>
                            <p className="text-[10px] sm:text-lg text-slate-400 font-light max-w-xl mx-auto uppercase tracking-widest italic">
                                Initializing match room. Skill parity and venue overlap verified.
                            </p>
                        </div>

                        {/* Player Pairing Visualization */}
                        <div className="relative py-8">
                            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                <div className="text-[120px] font-black italic tracking-tighter text-white animate-pulse">VS</div>
                            </div>

                            <div className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
                                {/* Team 1 / Player 1 */}
                                <div className="flex flex-col items-center gap-4 animate-in slide-in-from-left duration-700">
                                    <div className="flex -space-x-4">
                                        {matchedProfiles.length > 0 ? (
                                            matchedProfiles.slice(0, isTeamFormat(format) ? 2 : 1).map((p, i) => (
                                                <div key={p.id || i} className="relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-[2rem] border-2 border-emerald-500 bg-[#0a111a] shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                                    {p.avatar_url ? (
                                                        <Image src={p.avatar_url} alt={`${p.first_name} ${p.last_name}`} fill className="object-cover" />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center bg-white/5 text-2xl font-black text-slate-500">
                                                            {(p.first_name ?? "?")[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="h-24 w-24 rounded-[2rem] border-2 border-emerald-500/20 bg-white/5 animate-pulse" />
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Team Alpha</p>
                                        <div className="space-y-0.5">
                                            {matchedProfiles.length > 0 ? (
                                                matchedProfiles.slice(0, isTeamFormat(format) ? 2 : 1).map((p, i) => (
                                                    <p key={p.id || i} className="text-sm font-black text-white uppercase italic leading-tight">
                                                        {`${p.first_name || ''} ${p.last_name || ''}`.trim() || "Player"}
                                                    </p>
                                                ))
                                            ) : (
                                                <p className="text-sm font-black text-white/20 uppercase animate-pulse">Scanning...</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="hidden md:flex h-12 w-px bg-gradient-to-b from-transparent via-emerald-500/50 to-transparent" />

                                {/* Team 2 / Player 2 */}
                                <div className="flex flex-col items-center gap-4 animate-in slide-in-from-right duration-700">
                                    <div className="flex -space-x-4">
                                        {matchedProfiles.length > 0 ? (
                                            matchedProfiles.slice(isTeamFormat(format) ? 2 : 1, isTeamFormat(format) ? 4 : 2).map((p, i) => (
                                                <div key={p.id || i} className="relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-[2rem] border-2 border-cyan-500 bg-[#0a111a] shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                                                    {p.avatar_url ? (
                                                        <Image src={p.avatar_url} alt={`${p.first_name} ${p.last_name}`} fill className="object-cover" />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center bg-white/5 text-2xl font-black text-slate-500">
                                                            {(p.first_name ?? "?")[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="h-24 w-24 rounded-[2rem] border-2 border-cyan-500/20 bg-white/5 animate-pulse" />
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-1">Team Bravo</p>
                                        <div className="space-y-0.5">
                                            {matchedProfiles.length > 0 ? (
                                                matchedProfiles.slice(isTeamFormat(format) ? 2 : 1, isTeamFormat(format) ? 4 : 2).map((p, i) => (
                                                    <p key={p.id || i} className="text-sm font-black text-white uppercase italic leading-tight">
                                                        {`${p.first_name || ''} ${p.last_name || ''}`.trim() || "Player"}
                                                    </p>
                                                ))
                                            ) : (
                                                <p className="text-sm font-black text-white/20 uppercase animate-pulse">Scanning...</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="max-w-md mx-auto space-y-6">
                            <div className="overflow-hidden rounded-2xl border border-white/5 bg-[#0a111a] shadow-2xl">
                                <div className="h-2 w-full bg-white/5">
                                    <div className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500 animate-[matchProgress_4.5s_linear_forwards]" />
                                </div>
                                <div className="flex items-center justify-between px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <span className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                        Preparing Room
                                    </span>
                                    <span>Lobby Transit</span>
                                </div>
                            </div>

                            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] animate-pulse">
                                Entering Match Lobby
                            </p>
                        </div>

                        <style jsx>{`
                            @keyframes matchProgress {
                                from { width: 0%; }
                                to { width: 100%; }
                            }
                        `}</style>
                    </div>
                )}
            </main>
        </div>
    );
}

// --- Reusable Sub-Components ---

function Empty({ title, note, href, action }: { title: string; note: string; href?: string; action?: string }) {
    return (
        <div className="relative overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.02] p-12 text-center group">
            <div className="relative z-10 space-y-6">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 text-4xl opacity-40 group-hover:opacity-60 transition-opacity">🗂️</div>
                <div className="space-y-2">
                    <h3 className="text-xl font-black uppercase italic tracking-tight text-white/60">{title}</h3>
                    <p className="mx-auto max-w-sm text-sm font-light text-slate-500 leading-relaxed">{note}</p>
                </div>
                {href && action && (
                    <Link href={href} className="inline-block rounded-xl bg-white px-10 py-4 text-xs font-black uppercase tracking-widest text-black transition hover:bg-slate-200">
                        {action}
                    </Link>
                )}
            </div>
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Widget({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#0a111a]/80 backdrop-blur-lg p-6 shadow-xl group">
            <div className="absolute top-0 left-0 w-1 h-12 bg-cyan-500/50 rounded-full translate-y-6 opacity-40" />
            <div className="mb-6">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{title}</p>
            </div>
            {children}
        </section>
    );
}
