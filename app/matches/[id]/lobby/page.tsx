"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

interface LobbyPlayer {
    user_id:    string;
    username:   string | null;
    team_no:    number;
    status:     "pending" | "entered";
    entered_at: string | null;
}

interface LobbyState {
    match_id:     string;
    match_status: string;
    sport:        string;
    match_format: string;
    players:      LobbyPlayer[];
    all_entered:  boolean;
}

const SPORT_EMOJI: Record<string, string> = {
    pickleball:   "🏓",
    badminton:    "🏸",
    lawn_tennis:  "🎾",
    table_tennis: "🏓",
};

const LOBBY_TIMEOUT = 120; // seconds

export default function MatchLobbyPage() {
    const params   = useParams();
    const matchId  = params?.id as string;
    const router   = useRouter();

    const [myId,     setMyId]     = useState<string | null>(null);
    const [lobby,    setLobby]    = useState<LobbyState | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [entered,  setEntered]  = useState(false);
    const [entering,   setEntering]   = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [secs,     setSecs]     = useState(LOBBY_TIMEOUT);
    const [timedOut, setTimedOut] = useState(false);

    const wsRef    = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
    const aliveRef = useRef(true);
    const enteringRef = useRef(false);

    // Stable ref so effects don't re-run when router identity changes
    const routerRef = useRef(router);
    useEffect(() => { routerRef.current = router; }, [router]);

    // fetchLobby stored in a ref so its identity never changes — avoids effect re-runs
    const fetchLobbyRef = useRef<() => Promise<void>>(async () => {});
    // Update the closure on every render so it always captures the latest matchId
    fetchLobbyRef.current = async () => {
        const token = getAccessToken();
        if (!token) return;
        try {
            const res = await fetch(`/api/matches/${matchId}/lobby`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); routerRef.current.push("/login"); return; }
            if (!res.ok) return;
            const data: LobbyState = await res.json();
            setLobby(data);
            if (data.match_status === "ongoing") {
                routerRef.current.push(`/matches/${matchId}`);
                return;
            }
            if (data.match_status === "cancelled" || data.match_status === "invalidated") {
                routerRef.current.push("/matches/queue");
                return;
            }
        } catch {}
    };
    const attemptEnterLobby = useCallback(async (): Promise<boolean> => {
        const token = getAccessToken();
        if (!token || enteringRef.current) return false;

        enteringRef.current = true;
        setEntering(true);
        try {
            const res = await fetch(`/api/matches/${matchId}/lobby/enter`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return false;

            setEntered(true);
            const d = await res.json();
            if (d.status === "match_started") {
                routerRef.current.push(`/matches/${matchId}`);
                return true;
            }
            await fetchLobbyRef.current();
            return true;
        } catch {
            return false;
        } finally {
            enteringRef.current = false;
            setEntering(false);
        }
    }, [matchId]);

    // Boot — fetch current user then lobby (runs once)
    useEffect(() => {
        (async () => {
            const token = getAccessToken();
            if (!token) { routerRef.current.push("/login"); return; }
            const me = await fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } });
            if (isUnauthorized(me.status)) { clearAuthSession(); routerRef.current.push("/login"); return; }
            const meData = await me.json();
            const id = meData.profile?.id ?? meData.id ?? meData.user_id ?? null;
            setMyId(id);
            await fetchLobbyRef.current();
            setLoading(false);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-enter with retries while waiting in lobby (handles transient failures).
    useEffect(() => {
        if (loading || !myId || timedOut) return;
        if (lobby?.match_status !== "awaiting_players") return;

        const myEntry = lobby.players.find(p => p.user_id === myId);
        if (myEntry?.status === "entered" || entered) {
            if (!entered) setEntered(true);
            return;
        }

        void attemptEnterLobby();
        const retryId = setInterval(() => { void attemptEnterLobby(); }, 4000);
        return () => clearInterval(retryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, myId, timedOut, lobby, entered, attemptEnterLobby]);

    // Countdown timer (runs once)
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setSecs(s => {
                if (s <= 1) {
                    setTimedOut(true);
                    if (timerRef.current) clearInterval(timerRef.current);
                    setTimeout(() => routerRef.current.push("/matches/queue"), 3000);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Poll every 2s as fallback (stable — runs once)
    useEffect(() => {
        pollRef.current = setInterval(() => void fetchLobbyRef.current(), 2000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // WebSocket — runs once per matchId, never tears down due to fetchLobby/router changes
    useEffect(() => {
        if (!matchId) return;
        aliveRef.current = true;
        // Direct WS connection to backend — Next.js proxy doesn't forward WS upgrades
        const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
        const wsHost = process.env.NEXT_PUBLIC_WS_HOST?.trim() || `${window.location.hostname}:8000`;
        const ws = new WebSocket(`${wsProtocol}://${wsHost}/matches/ws/${matchId}`);
        wsRef.current = ws;
        ws.onmessage = (e) => {
            try {
                const d = JSON.parse(e.data);
                if (d.type === "lobby_update")     void fetchLobbyRef.current();
                if (d.type === "match_live")        routerRef.current.push(`/matches/${matchId}`);
                if (d.type === "match_invalidated") routerRef.current.push("/matches/queue");
            } catch {}
        };
        ws.onclose = () => { wsRef.current = null; };
        return () => {
            aliveRef.current = false;
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            } else if (ws.readyState === WebSocket.CONNECTING) {
                // Don't force-close mid-handshake (causes "closed before established" spam
                // in React StrictMode dev). Schedule close once the connection opens.
                ws.addEventListener("open", () => ws.close());
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId]);

    if (loading || !lobby) {
        return (
            <>
                <NavBar />
                <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                </div>
            </>
        );
    }

    const team1        = lobby.players.filter(p => p.team_no === 1);
    const team2        = lobby.players.filter(p => p.team_no === 2);
    const myEntry      = lobby.players.find(p => p.user_id === myId);
    const isSingles    = lobby.match_format === "singles";
    const shouldSwapSinglesSides = isSingles && myEntry?.team_no === 2;
    const leftSidePlayers = shouldSwapSinglesSides ? team2 : team1;
    const rightSidePlayers = shouldSwapSinglesSides ? team1 : team2;
    const amEntered    = myEntry?.status === "entered" || entered;
    const enteredCount = lobby.players.filter(p => p.status === "entered").length;
    const sportEmoji   = SPORT_EMOJI[lobby.sport] ?? "🎾";
    const timerColor   = secs <= 30 ? "text-red-400" : secs <= 60 ? "text-amber-400" : "text-zinc-400";

    return (
        <>
            <NavBar />
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md flex flex-col gap-5">

                    {/* Header */}
                    <div className="text-center">
                        <div className="text-4xl mb-2">{sportEmoji}</div>
                        <h1 className="text-2xl font-black text-white">Match Found!</h1>
                        <p className="text-zinc-400 text-sm mt-1 capitalize">
                            {lobby.sport.replace("_", " ")} · {lobby.match_format.replace("_", " ")}
                        </p>
                    </div>

                    {/* Timer */}
                    {!timedOut ? (
                        <div className={`text-center text-sm font-mono font-bold ${timerColor}`}>
                            {enteredCount}/{lobby.players.length} players entered &nbsp;·&nbsp; {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")} remaining
                        </div>
                    ) : (
                        <div className="text-center text-red-400 text-sm font-semibold">
                            Lobby timed out — returning to queue...
                        </div>
                    )}

                    {/* Teams */}
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden">
                        {isSingles ? (
                            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-3 p-4">
                                <SinglesLobbySide
                                    label="Left Side"
                                    player={leftSidePlayers[0] ?? null}
                                    isYou={leftSidePlayers[0]?.user_id === myId}
                                />
                                <div className="flex items-center justify-center text-[10px] font-black tracking-[0.3em] text-zinc-600 uppercase">
                                    vs
                                </div>
                                <SinglesLobbySide
                                    label="Right Side"
                                    player={rightSidePlayers[0] ?? null}
                                    isYou={rightSidePlayers[0]?.user_id === myId}
                                />
                            </div>
                        ) : (
                            <>
                                {/* Team 1 */}
                                <div className="px-4 pt-4 pb-2">
                                    <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">Team 1</p>
                                    <div className="flex flex-col gap-2">
                                        {team1.map(p => (
                                            <PlayerRow key={p.user_id} player={p} isYou={p.user_id === myId} />
                                        ))}
                                        {team1.length === 0 && <p className="text-xs text-zinc-600 italic">No players assigned</p>}
                                    </div>
                                </div>

                                <div className="mx-4 my-3 h-px bg-white/5" />

                                {/* Team 2 */}
                                <div className="px-4 pb-4 pt-2">
                                    <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">Team 2</p>
                                    <div className="flex flex-col gap-2">
                                        {team2.map(p => (
                                            <PlayerRow key={p.user_id} player={p} isYou={p.user_id === myId} />
                                        ))}
                                        {team2.length === 0 && <p className="text-xs text-zinc-600 italic">No players assigned</p>}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Status / CTA */}
                    {lobby.all_entered ? (
                        <div className="flex items-center justify-center gap-2 py-3 text-emerald-400 text-sm font-semibold">
                            <div className="w-5 h-5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
                            All players in — starting match...
                        </div>
                    ) : amEntered ? (
                        <div className="text-center text-zinc-400 text-sm py-2">
                            You&apos;re in the lobby. Waiting for {lobby.players.length - enteredCount} more player{lobby.players.length - enteredCount !== 1 ? "s" : ""}...
                        </div>
                    ) : (
                        <button
                            onClick={() => { void attemptEnterLobby(); }}
                            disabled={entering || timedOut}
                            className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all text-base"
                        >
                            {entering ? "Entering..." : "Enter Lobby"}
                        </button>
                    )}

                    {/* Cancel lobby — available to all players while match not yet live */}
                    {!lobby.all_entered && !timedOut && (
                        confirmCancel ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setConfirmCancel(false)}
                                    className="flex-1 py-2.5 text-sm font-semibold text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-xl transition-all"
                                >
                                    Keep waiting
                                </button>
                                <button
                                    onClick={async () => {
                                        const token = getAccessToken();
                                        if (!token) return;
                                        setCancelling(true);
                                        try {
                                            await fetch(`/api/matches/${matchId}/lobby/cancel`, {
                                                method: "POST",
                                                headers: { Authorization: `Bearer ${token}` },
                                            });
                                            router.push("/matches/party");
                                        } catch {}
                                        finally { setCancelling(false); }
                                    }}
                                    disabled={cancelling}
                                    className="flex-1 py-2.5 text-sm font-semibold text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 bg-red-500/5 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {cancelling ? "Cancelling..." : "Yes, cancel"}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmCancel(true)}
                                className="w-full py-2.5 text-sm text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-xl transition-all"
                            >
                                Cancel lobby
                            </button>
                        )
                    )}
                </div>
            </div>
        </>
    );
}

function SinglesLobbySide({
    label,
    player,
    isYou,
}: {
    label: string;
    player: LobbyPlayer | null;
    isYou: boolean;
}) {
    const entered = player?.status === "entered";

    return (
        <div className={`min-w-0 rounded-2xl border p-3 flex flex-col gap-3 ${
            player
                ? entered
                    ? "border-emerald-500/20 bg-emerald-500/8"
                    : "border-zinc-700/40 bg-zinc-800/40"
                : "border-zinc-800 bg-zinc-950/50"
        }`}>
            <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">{label}</p>

            {player ? (
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        entered ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-400"
                    }`}>
                        {player.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">
                            @{player.username ?? "Unknown"}
                            {isYou && <span className="ml-2 text-[10px] text-violet-400 font-bold uppercase tracking-wider">you</span>}
                        </p>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${
                            entered ? "text-emerald-400" : "text-zinc-500"
                        }`}>
                            {entered ? "Entered" : "Waiting"}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-3 py-5 text-center text-xs text-zinc-600 italic">
                    Awaiting player
                </div>
            )}
        </div>
    );
}

function PlayerRow({ player, isYou }: { player: LobbyPlayer; isYou: boolean }) {
    const entered = player.status === "entered";
    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
            entered ? "bg-emerald-500/8 border border-emerald-500/20" : "bg-zinc-800/40 border border-zinc-700/30"
        }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                entered ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-400"
            }`}>
                {player.username?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                    @{player.username ?? "Unknown"}
                    {isYou && <span className="ml-2 text-[10px] text-violet-400 font-bold uppercase tracking-wider">you</span>}
                </p>
            </div>
            {entered ? (
                <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <div className="w-4 h-4 border-2 border-zinc-600/50 border-t-zinc-400 rounded-full animate-spin shrink-0" />
            )}
        </div>
    );
}
