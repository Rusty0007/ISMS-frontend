"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// ── Icons ──────────────────────────────────────────────────────────────────

function IconUsers({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
}

function IconTarget({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function IconZap({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SPORTS_META: Record<string, { label: string; emoji: string; accent: string; border: string; bg: string; gradient: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", accent: "text-cyan-400",    border: "border-cyan-500/30",    bg: "bg-cyan-500/5",    gradient: "from-cyan-500/20 to-blue-600/20" },
    badminton:    { label: "Badminton",    emoji: "🏸", accent: "text-purple-400",  border: "border-purple-500/30",  bg: "bg-purple-500/5",  gradient: "from-purple-500/20 to-pink-600/20" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", accent: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5", gradient: "from-emerald-500/20 to-teal-600/20" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", accent: "text-orange-400",  border: "border-orange-500/30",  bg: "bg-orange-500/5",  gradient: "from-orange-500/20 to-red-600/20" },
};

// ── Components ─────────────────────────────────────────────────────────────

function Background() {
    return (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/10 blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-600/10 blur-[120px] animate-pulse [animation-delay:2s]" />
            <div className="absolute top-[20%] right-[15%] w-[20%] h-[20%] rounded-full bg-indigo-600/5 blur-[80px]" />
        </div>
    );
}

function StatusBadge({ state }: { state: QueueState }) {
    const config = {
        idle:        { label: "Matchmaking",  color: "text-zinc-400 bg-zinc-800/50 border-zinc-700/50" },
        queued:      { label: "Searching",    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30 animate-pulse" },
        assembling:  { label: "Assembling",   color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
        optimizing:  { label: "Optimizing",   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30 animate-pulse" },
        matched:     { label: "Matched!",     color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
    }[state];

    return (
        <span className={`text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full border shadow-sm ${config.color}`}>
            {config.label}
        </span>
    );
}

function IconChevronRight({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>;
}

const FORMATS = [
    { key: "singles",       label: "1v1 Singles",       desc: "Face one opponent head-to-head.",              icon: "👤" },
    { key: "doubles",       label: "2v2 Doubles",       desc: "Solo queue — 4 players assemble into 2 teams.", icon: "👥" },
    { key: "mixed_doubles", label: "2v2 Mixed Doubles", desc: "Mixed gender teams — 2 players per side.",      icon: "⚥" },
];

const FORMAT_LABELS: Record<string, string> = {
    singles: "singles",
    doubles: "doubles",
    mixed_doubles: "mixed doubles",
};

function ratingKey(sportKey: string, formatKey: string) {
    return `${sportKey}:${formatKey}`;
}

type QueueMode = "quick" | "ranked" | "club";

const MATCH_MODE_META: Record<QueueMode, {
    label: string;
    shortLabel: string;
    desc: string;
    subtext: string;
    accent: string;
    border: string;
    bg: string;
    waitHint: string;
}> = {
    quick: {
        label: "Quick Match",
        shortLabel: "Quick",
        desc: "Fastest queue for casual singles.",
        subtext: "Best default when you just want an opponent soon.",
        accent: "text-cyan-400",
        border: "border-cyan-500/30",
        bg: "bg-cyan-500/5",
        waitHint: "Fastest search",
    },
    ranked: {
        label: "Ranked Ladder",
        shortLabel: "Ranked",
        desc: "Stricter singles pairing for rated players.",
        subtext: "Higher quality pairings, but usually a longer wait.",
        accent: "text-emerald-400",
        border: "border-emerald-500/30",
        bg: "bg-emerald-500/5",
        waitHint: "Fairness over speed",
    },
    club: {
        label: "Club Session",
        shortLabel: "Club",
        desc: "Find a singles opponent inside one chosen club.",
        subtext: "Best for club nights, ladders, and venue play.",
        accent: "text-amber-400",
        border: "border-amber-500/30",
        bg: "bg-amber-500/5",
        waitHint: "Club-only pairing",
    },
};

const SINGLES_AI_STEPS = [
    { icon: "⚙️", msg: "Initializing AI matchmaker..." },
    { icon: "🔍", msg: "Scanning player pool..." },
    { icon: "📊", msg: "Analyzing Glicko-2 ratings..." },
    { icon: "🎯", msg: "Scoring candidate pairings..." },
    { icon: "🗺️", msg: "Checking geographic proximity..." },
    { icon: "📈", msg: "Evaluating win-rate trends..." },
    { icon: "⚡", msg: "Filtering by skill category..." },
    { icon: "🏆", msg: "Assessing match history..." },
    { icon: "🧮", msg: "Computing match quality score..." },
    { icon: "✨", msg: "Optimizing for best match..." },
];

const DOUBLES_WAIT_STEPS = [
    { icon: "🔍", msg: "Scanning for available players..." },
    { icon: "📊", msg: "Building player pool..." },
    { icon: "⏳", msg: "Waiting for more teammates..." },
    { icon: "🤝", msg: "Grouping compatible players..." },
];

const DOUBLES_OPTIMIZE_STEPS = [
    { icon: "⚙️", msg: "All 4 players found!" },
    { icon: "🧮", msg: "Testing all 3 team splits..." },
    { icon: "📊", msg: "Scoring each combination..." },
    { icon: "⚖️", msg: "Selecting most balanced teams..." },
    { icon: "✅", msg: "Optimal teams confirmed!" },
];

type QueueState = "idle" | "queued" | "assembling" | "optimizing" | "matched";

// ── Helpers ───────────────────────────────────────────────────────────────

function useElapsedTime(running: boolean) {
    const [seconds, setSeconds] = useState(0);
    const ref = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        if (running) {
            setSeconds(0);
            ref.current = setInterval(() => setSeconds(s => s + 1), 1000);
        } else {
            if (ref.current) clearInterval(ref.current);
        }
        return () => { if (ref.current) clearInterval(ref.current); };
    }, [running]);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

function useCyclingStep(steps: { icon: string; msg: string }[], running: boolean, interval = 2200) {
    const [idx, setIdx] = useState(0);
    const ref = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        if (running) {
            setIdx(0);
            ref.current = setInterval(() => setIdx(i => (i + 1) % steps.length), interval);
        } else {
            if (ref.current) clearInterval(ref.current);
        }
        return () => { if (ref.current) clearInterval(ref.current); };
    }, [running, steps.length, interval]);
    return steps[idx];
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function QueuePage() {
    const router = useRouter();

    const [userSports,      setUserSports]      = useState<string[]>([]);
    const [userRatings,     setUserRatings]     = useState<Record<string, { rating_status: string; matches_played: number }>>({});
    const [sport,           setSport]           = useState("");
    const [format,          setFormat]          = useState("singles");
    const [queueMode,       setQueueMode]       = useState<QueueMode>("quick");
    const [queueState,      setQueueState]      = useState<QueueState>("idle");
    const [playersJoined,   setPlayersJoined]   = useState(0);
    const [loading,         setLoading]         = useState(false);
    const [fetchingMe,      setFetchingMe]      = useState(true);
    const [error,           setError]           = useState("");
    const [myClubs,         setMyClubs]         = useState<{ id: string; name: string; sport: string | null; role: string }[]>([]);
    const [preferredClubId, setPreferredClubId] = useState<string>("");
    const [preferredIndoor, setPreferredIndoor] = useState<boolean | null>(null);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const navigatingMatchIdRef = useRef<string | null>(null);

    const isSearching  = queueState === "queued";
    const isAssembling = queueState === "assembling";
    const isOptimizing = queueState === "optimizing";

    const elapsed = useElapsedTime(isSearching || isAssembling);
    const aiStep  = useCyclingStep(SINGLES_AI_STEPS, isSearching, 2200);
    const dblStep = useCyclingStep(
        isOptimizing ? DOUBLES_OPTIMIZE_STEPS : DOUBLES_WAIT_STEPS,
        isAssembling || isOptimizing,
        1800
    );

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (redirectRef.current) clearTimeout(redirectRef.current);
        };
    }, []);

    useEffect(() => {
        if (!preferredClubId) return;
        const stillEligible = myClubs.some((club) => club.id === preferredClubId && (!sport || !club.sport || club.sport === sport));
        if (!stillEligible) setPreferredClubId("");
    }, [myClubs, preferredClubId, sport]);

    useEffect(() => {
        if (format !== "singles" && queueMode === "club") {
            setQueueMode("quick");
        }
    }, [format, queueMode]);

    // Block navigation while in queue
    useEffect(() => {
        if (queueState !== "queued" && queueState !== "assembling") return;
        const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        const handlePopState = () => {
            if (window.confirm("You are currently in queue. Leave queue?")) {
                void handleLeaveQueue();
                router.replace("/matches");
                return;
            }
            window.history.pushState(null, "", window.location.href);
        };
        window.history.pushState(null, "", window.location.href);
        window.addEventListener("beforeunload", handleBeforeUnload);
        window.addEventListener("popstate", handlePopState);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            window.removeEventListener("popstate", handlePopState);
        };
    }, [queueState, sport, format]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load user profile
    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then(data => {
                if (!data) return;
                const sports: string[] = (data.sports ?? []).map((s: { sport: string }) => s.sport);
                setUserSports(sports);
                
                const ratings: { sport: string; match_format: string; rating_status: string; matches_played: number }[] = data.ratings ?? [];
                const ratingsByFormat = Object.fromEntries(
                    ratings.map((entry) => [
                        ratingKey(entry.sport, entry.match_format),
                        { rating_status: entry.rating_status, matches_played: entry.matches_played },
                    ])
                );
                setUserRatings(ratingsByFormat);

                if (sports.length === 1) setSport(sports[0]);
            })
            .catch(() => setError("Could not load your profile. Please retry."))
            .finally(() => setFetchingMe(false));

        // Load joined clubs (admin + member)
        fetch("/api/clubs/mine", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                const admin  = (data.admin  ?? []).map((c: { id: string; name: string; sport: string | null }) => ({ ...c, role: "Admin" }));
                const member = (data.member ?? []).map((c: { id: string; name: string; sport: string | null }) => ({ ...c, role: "Member" }));
                setMyClubs([...admin, ...member]);
            })
            .catch(() => {/* non-critical */});

        fetch("/api/matches/queue/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(async data => {
                if (data?.active_match && data.match_id) {
                    const target = await resolveMatchTarget(data.match_id, data.match_status);
                    router.replace(target);
                    return;
                }
                if (!data?.in_queue) return;

                const restoredSport = data.sport ?? "";
                const restoredFormat = data.match_format ?? "singles";
                const restoredMode: QueueMode = data.match_mode === "ranked"
                    ? "ranked"
                    : data.match_mode === "club" && restoredFormat === "singles"
                        ? "club"
                        : "quick";
                const joined = Number(data.players_joined ?? (restoredFormat === "singles" ? 1 : 0));

                setSport(restoredSport);
                setFormat(restoredFormat);
                setQueueMode(restoredMode);
                setPlayersJoined(joined);

                if (restoredFormat === "singles") {
                    setQueueState("queued");
                } else {
                    setQueueState(joined >= 4 ? "optimizing" : "assembling");
                }

                startPolling(restoredSport, restoredFormat, restoredMode, token);
            })
            .catch(() => {/* non-critical */});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    function getToken() {
        const t = getAccessToken();
        if (!t) router.replace("/login");
        return t;
    }

    async function resolveMatchTarget(matchId: string, statusHint?: string) {
        if (statusHint === "awaiting_players") return `/matches/${matchId}/lobby`;
        if (statusHint === "ongoing" || statusHint === "pending_approval") return `/matches/${matchId}`;

        const token = getAccessToken();
        if (!token) return `/matches/${matchId}`;

        try {
            const res = await fetch(`/api/matches/${matchId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return `/matches/${matchId}`;
            const data = await res.json();
            const liveStatus = data?.match?.status ?? data?.status;
            return liveStatus === "awaiting_players" ? `/matches/${matchId}/lobby` : `/matches/${matchId}`;
        } catch {
            return `/matches/${matchId}`;
        }
    }

    // ── Queue Actions ──────────────────────────────────────────────────────

    async function handleJoinQueue() {
        if (!sport) { setError("Please select a sport."); return; }
        const activeMode: QueueMode = format !== "singles" && queueMode === "club" ? "quick" : queueMode;
        const selectedRating = userRatings[ratingKey(sport, format)] ?? null;
        const formatLabel = FORMAT_LABELS[format] ?? format.replace("_", " ");
        if (activeMode === "ranked" && selectedRating?.rating_status !== "RATED") {
            setError(`Ranked queue unlocks after 10 calibrated ${formatLabel} matches for this sport.`);
            return;
        }
        if (format === "singles" && activeMode === "club" && !preferredClubId) {
            setError("Choose one of your clubs before starting a club session queue.");
            return;
        }
        setError("");
        setLoading(true);
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch("/api/matches/queue/join", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    sport,
                    match_format: format,
                    match_mode: activeMode,
                    ...(preferredClubId ? { preferred_club_id: preferredClubId } : {}),
                    ...(preferredIndoor !== null ? { preferred_indoor: preferredIndoor } : {}),
                }),
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            const data = await res.json();
            if (!res.ok) { setError(data.detail || "Failed to join queue."); return; }

            if (data.status === "matched") {
                await handleMatchFound(data.match_id, data.match_status);
                return;
            }
            if (data.status === "assembling") {
                setPlayersJoined(data.players_joined ?? 1);
                setQueueState("assembling");
                startPolling(sport, format, activeMode, token);
                return;
            }
            setQueueState("queued");
            startPolling(sport, format, activeMode, token);
        } catch {
            setError("Could not connect to the server.");
        } finally {
            setLoading(false);
        }
    }

    function startPolling(sportKey: string, formatKey: string, modeKey: QueueMode, token: string) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/matches/queue/status?sport=${sportKey}&match_format=${formatKey}&match_mode=${modeKey}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (isUnauthorized(res.status)) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    clearAuthSession(); router.replace("/login"); return;
                }
                if (!res.ok) return;
                const data = await res.json();

                if (data.status === "matched") {
                    if (pollRef.current) clearInterval(pollRef.current);
                    void handleMatchFound(data.match_id, data.match_status);
                } else if (data.status === "assembling" && data.players_joined !== undefined) {
                    const joined = data.players_joined as number;
                    setPlayersJoined(joined);
                    if (joined >= 4) setQueueState("optimizing");
                    else setQueueState("assembling");
                }
            } catch { /* silent — keep polling */ }
        }, 3000);
    }

    async function handleMatchFound(id: string, statusHint?: string) {
        if (!id) return;
        if (navigatingMatchIdRef.current === id) return;
        navigatingMatchIdRef.current = id;
        if (redirectRef.current) clearTimeout(redirectRef.current);
        if (pollRef.current) clearInterval(pollRef.current);
        setQueueState("matched");
        const target = await resolveMatchTarget(id, statusHint);
        // Delay for 3.5s to show the "Match Found!" animation
        redirectRef.current = setTimeout(() => {
            router.push(target);
        }, 3500);
    }

    async function handleLeaveQueue() {
        const token = getToken();
        if (!token) return;
        const activeMode: QueueMode = format !== "singles" && queueMode === "club" ? "quick" : queueMode;
        if (pollRef.current) clearInterval(pollRef.current);
        if (redirectRef.current) clearTimeout(redirectRef.current);
        navigatingMatchIdRef.current = null;
        try {
            await fetch(
                `/api/matches/queue/leave?sport=${sport}&match_format=${format}&match_mode=${activeMode}`,
                { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
            );
        } catch { /* best effort */ }
        setQueueState("idle");
        setPlayersJoined(0);
    }

    // ── Derived ────────────────────────────────────────────────────────────

    const selectedMeta = SPORTS_META[sport];
    const selectedRating = sport ? userRatings[ratingKey(sport, format)] ?? null : null;
    const activeMode: QueueMode = format !== "singles" && queueMode === "club" ? "quick" : queueMode;
    const formatLabel = FORMAT_LABELS[format] ?? format.replace("_", " ");
    const availableModes: QueueMode[] = format === "singles" ? ["quick", "ranked", "club"] : ["quick", "ranked"];
    const selectedModeMeta = MATCH_MODE_META[activeMode];
    const eligibleClubs = myClubs.filter((club) => !sport || !club.sport || club.sport === sport);
    const rankedUnlocked = selectedRating?.rating_status === "RATED";
    const clubModeBlocked = format === "singles" && activeMode === "club" && !preferredClubId;
    const primaryActionLabel = loading
        ? "Synchronizing..."
        : activeMode === "ranked"
            ? format === "singles"
                ? "Join Ranked Queue"
                : "Join Ranked Team Queue"
            : format !== "singles"
                ? "Enter Team Assembly"
                : activeMode === "club"
                    ? "Search Club Session"
                    : "Initiate Matchmaking";

    if (fetchingMe) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading your profile...</div>
            </div>
        );
    }

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="relative min-h-screen bg-zinc-950 text-white overflow-x-hidden">
            <Background />
            <NavBar backHref="/matches" backLabel="← Arena" />

            <main className="relative z-10 pt-24 pb-12 px-4">
                <div className="max-w-lg mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                    {/* ── IDLE — Selection ── */}
                    {queueState === "idle" && (
                        <div className="space-y-8">
                            
                            {/* Discovery Header */}
                            <div className="text-center space-y-2">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-2">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                                    </span>
                                    <span className="text-[10px] font-black tracking-widest text-cyan-400 uppercase">AI Matchmaking Active</span>
                                </div>
                                <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500">
                                    Arena Entry
                                </h1>
                                <p className="text-zinc-500 text-sm max-w-[280px] mx-auto font-medium">
                                    Our neural engine scans for your optimal opponent based on Glicko-2 metrics.
                                </p>
                            </div>

                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl -mr-16 -mt-16 group-hover:bg-cyan-600/10 transition-colors" />

                                {/* Sport selection */}
                                <section className="space-y-4">
                                    <header className="flex items-center gap-4">
                                        <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Select Discipline</h2>
                                        <div className="h-px bg-zinc-800/50 flex-1" />
                                    </header>
                                    {userSports.length === 0 ? (
                                        <div className="bg-zinc-950/20 rounded-2xl p-6 text-center border border-dashed border-zinc-800/50">
                                            <p className="text-sm text-zinc-500 mb-4">No sports defined in your combat profile.</p>
                                            <Link href="/profile/setup" className="bg-white text-zinc-950 text-[10px] font-black px-6 py-2.5 rounded-xl hover:scale-105 transition-all uppercase tracking-widest inline-block">Complete Setup</Link>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            {userSports.map(key => {
                                                const meta = SPORTS_META[key];
                                                const isActive = sport === key;
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => setSport(key)}
                                                        className={`relative group overflow-hidden border-2 rounded-2xl p-4 text-left transition-all duration-300 ${
                                                            isActive ? `${meta.border} ${meta.bg} shadow-lg shadow-black/20` : "border-zinc-800/50 bg-zinc-950/20 text-zinc-500 hover:border-zinc-700"
                                                        }`}
                                                    >
                                                        {isActive && (
                                                            <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-10`} />
                                                        )}
                                                        <span className={`text-2xl mb-3 block transition-transform duration-500 ${isActive ? "scale-110" : "grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100"}`}>
                                                            {meta.emoji}
                                                        </span>
                                                        <p className={`text-sm font-black ${isActive ? "text-white" : "group-hover:text-zinc-300"}`}>{meta.label}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                {/* Format selection */}
                                <section className="space-y-4">
                                    <header className="flex items-center gap-4">
                                        <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Combat Format</h2>
                                        <div className="h-px bg-zinc-800/50 flex-1" />
                                    </header>
                                    <div className="grid grid-cols-1 gap-3">
                                        {FORMATS.map(f => {
                                            const isActive = format === f.key;
                                            return (
                                                <button
                                                    key={f.key}
                                                    onClick={() => setFormat(f.key)}
                                                    className={`group flex items-center gap-4 border-2 rounded-2xl p-4 text-left transition-all duration-300 ${
                                                        isActive ? "border-cyan-500/30 bg-cyan-500/5 shadow-lg shadow-cyan-500/5" : "border-zinc-800/50 bg-zinc-950/20 text-zinc-500 hover:border-zinc-700"
                                                    }`}
                                                >
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all ${isActive ? "bg-cyan-500/20 text-white" : "bg-zinc-900 text-zinc-600 group-hover:bg-zinc-800"}`}>
                                                        {f.icon}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={`text-sm font-black ${isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>{f.label}</p>
                                                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? "text-cyan-400/60" : "text-zinc-600"}`}>{f.desc}</p>
                                                    </div>
                                                    {isActive && <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <header className="flex items-center gap-4">
                                        <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Match Lane</h2>
                                        <div className="h-px bg-zinc-800/50 flex-1" />
                                    </header>
                                    <div className="grid grid-cols-1 gap-3">
                                        {availableModes.map((mode) => {
                                                const meta = MATCH_MODE_META[mode];
                                                const isActive = queueMode === mode;
                                                const isDisabled = mode === "ranked"
                                                    ? !rankedUnlocked
                                                    : mode === "club"
                                                        ? eligibleClubs.length === 0
                                                        : false;
                                                return (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => setQueueMode(mode)}
                                                        className={`group flex items-start gap-4 border-2 rounded-2xl p-4 text-left transition-all duration-300 ${
                                                            isActive
                                                                ? `${meta.border} ${meta.bg} shadow-lg shadow-black/20`
                                                                : "border-zinc-800/50 bg-zinc-950/20 text-zinc-500 hover:border-zinc-700"
                                                        } ${isDisabled ? "opacity-60" : ""}`}
                                                    >
                                                        <div className={`mt-0.5 w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${
                                                            isActive ? `${meta.bg} ${meta.border} ${meta.accent}` : "bg-zinc-900 border-zinc-800 text-zinc-600"
                                                        }`}>
                                                            {mode === "quick" ? <IconZap className="w-5 h-5" /> : mode === "ranked" ? <IconTarget className="w-5 h-5" /> : <IconUsers className="w-5 h-5" />}
                                                        </div>
                                                        <div className="flex-1 space-y-1">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <p className={`text-sm font-black ${isActive ? "text-white" : "text-zinc-300 group-hover:text-zinc-100"}`}>{meta.label}</p>
                                                                <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${isActive ? meta.accent : "text-zinc-600"}`}>
                                                                    {meta.waitHint}
                                                                </span>
                                                            </div>
                                                            <p className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? `${meta.accent}/70` : "text-zinc-600"}`}>{meta.desc}</p>
                                                            <p className="text-xs text-zinc-500 leading-relaxed">{meta.subtext}</p>
                                                            {mode === "ranked" && (
                                                                <p className={`text-[11px] font-semibold ${rankedUnlocked ? "text-emerald-400" : "text-amber-400"}`}>
                                                                    {rankedUnlocked
                                                                        ? `Rated for ${sport ? (SPORTS_META[sport]?.label ?? "this sport") : "this sport"} ${formatLabel}`
                                                                        : `Unlock after 10 calibrated ${formatLabel} matches. Current: ${selectedRating?.matches_played ?? 0}`}
                                                                </p>
                                                            )}
                                                            {mode === "club" && (
                                                                <p className={`text-[11px] font-semibold ${eligibleClubs.length > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                                                                    {eligibleClubs.length > 0
                                                                        ? "Choose a club below to keep pairing inside that venue."
                                                                        : "Join a club first before using club-only matchmaking."}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </section>

                                {format !== "singles" && (
                                    <section className="space-y-4">
                                        <header className="flex items-center gap-4">
                                            <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Recommended Flow</h2>
                                            <div className="h-px bg-zinc-800/50 flex-1" />
                                        </header>
                                        <div className="rounded-[2rem] border border-violet-500/20 bg-violet-500/5 p-5 space-y-4 shadow-lg shadow-violet-500/5">
                                            <div className="flex items-start gap-4">
                                                <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 flex items-center justify-center">
                                                    <IconUsers className="w-5 h-5" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-black text-white">Best doubles experience: Duo Queue</p>
                                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                                        If you already know your partner, start from Duo Queue. Solo doubles still works here, but it needs four compatible players online at the same time.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <Link
                                                    href="/matches/party"
                                                    className="flex-1 rounded-2xl bg-white text-zinc-950 font-black text-[11px] uppercase tracking-[0.2em] px-5 py-3 text-center transition-transform hover:scale-[1.01]"
                                                >
                                                    Open Duo Queue
                                                </Link>
                                                <span className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-950/30 px-5 py-3 text-[11px] font-bold text-zinc-500 uppercase tracking-[0.15em] text-center">
                                                    Solo assembly stays available below
                                                </span>
                                            </div>
                                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Calibration counts here</p>
                                                <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-100/75">
                                                    Completed quick matches and Duo Queue matches in {selectedMeta?.label ?? "this sport"} {formatLabel} both count toward the 10-match ranked unlock.
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {/* Preferences */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Location</label>
                                        <select 
                                            value={preferredClubId}
                                            onChange={(e) => setPreferredClubId(e.target.value)}
                                            className="w-full bg-zinc-950/40 border-2 border-zinc-800/50 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer transition-colors"
                                        >
                                            <option value="">{activeMode === "club" ? "Select Club Session Hub" : "Any Hub (Global)"}</option>
                                            {eligibleClubs.map(club => (
                                                <option key={club.id} value={club.id}>{club.name} ({club.role})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Atmosphere</label>
                                        <div className="flex bg-zinc-950/40 border-2 border-zinc-800/50 rounded-2xl p-1">
                                            {[
                                                { value: null,  label: "Any" },
                                                { value: true,  label: "Indoor" },
                                                { value: false, label: "Outdoor" },
                                            ].map(opt => (
                                                <button
                                                    key={String(opt.value)}
                                                    onClick={() => setPreferredIndoor(opt.value)}
                                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                                                        preferredIndoor === opt.value ? "bg-zinc-800 text-white shadow-xl" : "text-zinc-600 hover:text-zinc-400"
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {activeMode === "ranked" && !rankedUnlocked && (
                                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3 animate-in zoom-in-95 duration-300">
                                        <div className="mt-0.5 w-8 h-8 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300 flex items-center justify-center shrink-0">
                                            <IconTarget className="w-4 h-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Ranked still locked</p>
                                            <p className="text-xs font-semibold leading-relaxed text-amber-100/75">
                                                Finish 10 calibrated {formatLabel} matches for {selectedMeta?.label ?? "this sport"} before you enter ladder matchmaking.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {clubModeBlocked && (
                                    <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 flex items-start gap-3 animate-in zoom-in-95 duration-300">
                                        <div className="mt-0.5 w-8 h-8 rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-300 flex items-center justify-center shrink-0">
                                            <IconUsers className="w-4 h-4" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-300">Choose a club first</p>
                                            <p className="text-xs font-semibold leading-relaxed text-orange-100/75">
                                                Club Session keeps matchmaking inside one joined club, so pick the venue before you search.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4 animate-in zoom-in-95 duration-300">
                                        <span className="text-lg">⚠️</span>
                                        <p className="text-xs font-bold text-red-400 leading-relaxed">{error}</p>
                                    </div>
                                )}

                                <button
                                    onClick={handleJoinQueue}
                                    disabled={loading || !sport || userSports.length === 0 || (activeMode === "ranked" && !rankedUnlocked) || clubModeBlocked}
                                    className="relative group w-full bg-white text-zinc-950 font-black py-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 shadow-2xl shadow-white/5 overflow-hidden flex items-center justify-center gap-3"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                                    <span className="relative z-10 text-xs tracking-[0.2em] uppercase">{primaryActionLabel}</span>
                                    {!loading && <IconChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                                </button>

                                {(format === "doubles" || format === "mixed_doubles") && (
                                    <div className="pt-2 border-t border-zinc-800/50 text-center">
                                        <Link
                                            href="/matches/party"
                                            className="text-[11px] font-bold text-zinc-500 hover:text-violet-400 tracking-wider uppercase transition-colors"
                                        >
                                            Prefer a fixed partner? Duo Queue instead →
                                        </Link>
                                    </div>
                                )}
                            </div>
                            
                            {/* Stats summary */}
                            <div className="flex items-center justify-between px-8 text-[10px] font-black text-zinc-600 tracking-[0.2em] uppercase">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>{format === "singles" ? `${selectedModeMeta.shortLabel} lane active` : `${selectedModeMeta.shortLabel} team lane active`}</span>
                                </div>
                                <span>{format === "singles" ? selectedModeMeta.waitHint : activeMode === "ranked" ? "Ranked teams only" : "Duo Queue is faster"}</span>
                            </div>
                        </div>
                    )}

                    {/* ── QUEUED — AI Scanning (1v1) ── */}
                    {queueState === "queued" && selectedMeta && (
                        <div className="space-y-8">
                            <div className="text-center space-y-2">
                                <StatusBadge state={queueState} />
                                <h1 className="text-3xl font-black tracking-tight uppercase italic">Searching Arena</h1>
                                <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase">
                                    {selectedMeta.label} · 1v1 Protocol
                                </p>
                            </div>

                            {/* Animated radar */}
                            <div className="flex justify-center relative py-8">
                                <div className="relative w-48 h-48">
                                    <div className="absolute inset-0 rounded-full border-2 border-cyan-500/10 animate-[ping_3s_linear_infinite]" />
                                    <div className="absolute inset-4 rounded-full border-2 border-cyan-500/20 animate-[ping_3s_linear_infinite_0.5s]" />
                                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 border-r-cyan-500/30 animate-[spin_2s_linear_infinite]" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="bg-zinc-900 w-20 h-20 rounded-full flex items-center justify-center border-2 border-cyan-500/30 shadow-2xl relative">
                                            <div className="absolute inset-0 bg-cyan-500/10 blur-xl rounded-full" />
                                            <span className="text-4xl relative">{selectedMeta.emoji}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* AI status card */}
                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-cyan-500/20 rounded-[2rem] p-8 space-y-6 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl -mr-16 -mt-16" />
                                
                                <div className="flex items-center gap-4 min-h-[3rem] relative">
                                    <div className="w-12 h-12 bg-zinc-950/50 rounded-xl flex items-center justify-center text-2xl border border-zinc-800 shadow-inner">
                                        {aiStep.icon}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-[10px] font-black text-cyan-400/60 uppercase tracking-widest mb-1`}>Neural Sequence</p>
                                        <p className="text-sm font-black text-white">{aiStep.msg}</p>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {[0,1,2].map(i => (
                                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"
                                                style={{ animationDelay: `${i * 0.2}s` }} />
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-3 pt-6 border-t border-zinc-800/50">
                                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-4">Metric Affinity Scan</p>
                                    {[
                                        { label: "Rating Match",    pct: 97, color: "bg-cyan-500" },
                                        { label: "Combat History",  pct: 72, color: "bg-violet-500" },
                                        { label: "Proximity",       pct: 58, color: "bg-blue-500" },
                                        { label: "Surface Type",    pct: 89, color: "bg-emerald-500" },
                                    ].map(f => (
                                        <div key={f.label} className="flex items-center gap-4">
                                            <span className="text-[10px] font-bold text-zinc-500 w-24 uppercase tracking-tighter">{f.label}</span>
                                            <div className="flex-1 h-1 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/30">
                                                <div
                                                    className={`h-full ${f.color} rounded-full animate-pulse transition-all duration-1000`}
                                                    style={{ width: `${f.pct}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-black text-zinc-700 w-8 text-right font-mono">{f.pct}%</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between pt-4 text-[11px] font-bold">
                                    <div className="flex items-center gap-2 text-zinc-500">
                                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                        <span>ACTIVE TIME: {elapsed}</span>
                                    </div>
                                    <div className="px-3 py-1 rounded-full bg-zinc-950/50 border border-zinc-800 text-cyan-600 text-[9px] font-black tracking-widest uppercase shadow-inner">
                                        System Polling (3s)
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleLeaveQueue}
                                className="w-full py-4 bg-zinc-950/40 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-zinc-200 font-black rounded-2xl transition-all text-[10px] uppercase tracking-[0.2em] active:scale-[0.98]"
                            >
                                Abort Matchmaking
                            </button>
                        </div>
                    )}

                    {/* ── ASSEMBLING / OPTIMIZING — 2v2 ── */}
                    {(queueState === "assembling" || queueState === "optimizing") && selectedMeta && (
                        <div className="space-y-8">
                            <div className="text-center space-y-2">
                                <StatusBadge state={queueState} />
                                <h1 className="text-3xl font-black tracking-tight uppercase italic">
                                    {isOptimizing ? "Tactical Split" : "Team Assembly"}
                                </h1>
                                <p className="text-zinc-500 text-xs font-bold tracking-widest uppercase">
                                    {selectedMeta.label} · 2v2 Protocol
                                </p>
                            </div>

                            <div className="bg-zinc-900/40 backdrop-blur-xl border border-purple-500/20 rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-3xl -mr-16 -mt-16" />
                                
                                <div className="grid grid-cols-2 gap-3">
                                    {[1, 2, 3, 4].map(n => {
                                        const filled = n <= playersJoined;
                                        const isMe   = n === 1 && playersJoined >= 1;
                                        return (
                                            <div
                                                key={n}
                                                className={`flex items-center gap-3 border rounded-2xl px-4 py-4 transition-all duration-700 shadow-lg ${
                                                    filled
                                                        ? isMe
                                                            ? "border-cyan-500/30 bg-cyan-500/5 shadow-cyan-500/5"
                                                            : "border-purple-500/30 bg-purple-500/5 shadow-purple-500/5"
                                                        : "border-zinc-800/50 bg-zinc-950/20"
                                                }`}
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 border shadow-inner ${
                                                    filled
                                                        ? isMe ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                                        : "bg-zinc-900 text-zinc-700 border-zinc-800"
                                                }`}>
                                                    {filled ? (isMe ? "YOU" : "OK") : n}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className={`text-[10px] font-black uppercase tracking-widest truncate ${
                                                        filled
                                                            ? isMe ? "text-cyan-400" : "text-purple-400"
                                                            : "text-zinc-600"
                                                    }`}>
                                                        {filled ? (isMe ? "Synced" : "Locked") : "Empty"}
                                                    </p>
                                                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">SLOT {n}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="space-y-4 pt-4">
                                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest">
                                        <span className="text-zinc-500">Deployment Status</span>
                                        <span className={isOptimizing ? "text-emerald-400" : "text-purple-400"}>
                                            {playersJoined} <span className="text-zinc-600">/ 4</span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50 p-0.5">
                                        <div
                                            className={`h-full rounded-full transition-all duration-1000 relative ${
                                                isOptimizing ? "bg-emerald-500" : "bg-purple-500"
                                            }`}
                                            style={{ width: `${(playersJoined / 4) * 100}%` }}
                                        >
                                            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-zinc-800/50 pt-6 flex items-center gap-4 min-h-[3rem]">
                                    <div className={`w-12 h-12 bg-zinc-950/50 rounded-xl flex items-center justify-center text-2xl border border-zinc-800 shadow-inner ${isOptimizing ? "text-emerald-400" : "text-purple-400"}`}>
                                        {dblStep.icon}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isOptimizing ? "text-emerald-400/60" : "text-purple-400/60"}`}>
                                            {isOptimizing ? "Heuristic Balancing" : "Pool Acquisition"}
                                        </p>
                                        <p className="text-sm font-black text-white">{dblStep.msg}</p>
                                    </div>
                                    {isOptimizing ? (
                                        <div className="flex gap-1">
                                            {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}
                                        </div>
                                    ) : (
                                        <div className="flex gap-1">
                                            {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500 uppercase tracking-tighter">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                        <span>ELAPSED: {elapsed}</span>
                                    </div>
                                    <span>Monitoring Active</span>
                                </div>
                            </div>

                            <button
                                onClick={handleLeaveQueue}
                                className="w-full py-4 bg-zinc-950/40 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-zinc-200 font-black rounded-2xl transition-all text-[10px] uppercase tracking-[0.2em] active:scale-[0.98]"
                            >
                                Leave Assembly
                            </button>
                        </div>
                    )}

                    {/* ── MATCHED — Success Transition ── */}
                    {queueState === "matched" && selectedMeta && (
                        <div className="bg-zinc-900/40 backdrop-blur-2xl border border-emerald-500/40 rounded-[2.5rem] p-12 flex flex-col items-center gap-8 text-center shadow-[0_0_50px_rgba(16,185,129,0.1)] animate-in zoom-in-95 duration-500 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
                            
                            <div className="space-y-4">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-2">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase italic">Hostility Detected</span>
                                </div>
                                <h1 className="text-4xl font-black tracking-tight text-white uppercase italic">Combat Ready</h1>
                                <p className="text-zinc-500 text-sm max-w-[280px] mx-auto font-medium">
                                    Neutral engine has finalized a high-affinity pairing.
                                </p>
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-20 animate-pulse" />
                                <div className={`relative w-40 h-40 rounded-3xl bg-zinc-950 border-2 border-emerald-500/40 flex flex-col items-center justify-center gap-3 shadow-2xl overflow-hidden`}>
                                    <span className="text-6xl filter drop-shadow-lg leading-none">{selectedMeta.emoji}</span>
                                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{selectedMeta.label}</span>
                                </div>
                            </div>

                            <div className="w-full space-y-4">
                                <div className="h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50 p-0.5">
                                    <div className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 animate-[progress_3.5s_linear_forwards] relative">
                                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_1.5s_infinite]" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">
                                    <span>Syncing Arena State</span>
                                    <span className="text-emerald-500/60">Finalizing...</span>
                                </div>
                            </div>

                            <style jsx>{`
                                @keyframes progress {
                                    from { width: 0%; }
                                    to { width: 100%; }
                                }
                            `}</style>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}
