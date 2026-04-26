"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

interface LobbyPlayer {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    team_no: number;
    status: "pending" | "entered";
    entered_at: string | null;
}

interface LobbyState {
    match_id: string;
    match_status: string;
    sport: string;
    match_format: string;
    players: LobbyPlayer[];
    entered_count: number;
    total_players: number;
    all_entered: boolean;
    return_route: string;
    lobby_mode: "queue" | "tournament";
    tournament_id?: string | null;
    tournament_phase?: string | null;
    entry_open: boolean;
    can_cancel: boolean;
    deadline_at?: string | null;
    referee_id?: string | null;
    referee_ready_at?: string | null;
}

const SPORT_EMOJI: Record<string, string> = {
    pickleball: "🏓",
    badminton: "🏸",
    lawn_tennis: "🎾",
    table_tennis: "🏓",
};

const FALLBACK_LOBBY_TIMEOUT = 120;

export default function MatchLobbyPage() {
    const params = useParams();
    const matchId = params?.id as string;
    const router = useRouter();

    const [myId, setMyId] = useState<string | null>(null);
    const [lobby, setLobby] = useState<LobbyState | null>(null);
    const [loading, setLoading] = useState(true);
    const [entered, setEntered] = useState(false);
    const [entering, setEntering] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [secs, setSecs] = useState(FALLBACK_LOBBY_TIMEOUT);
    const [timedOut, setTimedOut] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const enteringRef = useRef(false);
    const forbiddenRef = useRef(false);
    const timeoutHandledRef = useRef(false);
    const returnRouteRef = useRef("/matches/queue");

    const routerRef = useRef(router);
    useEffect(() => {
        routerRef.current = router;
    }, [router]);

    useEffect(() => {
        if (lobby?.return_route) returnRouteRef.current = lobby.return_route;
    }, [lobby?.return_route]);

    const fetchLobbyRef = useRef<() => Promise<void>>(async () => {});
    fetchLobbyRef.current = async () => {
        const token = getAccessToken();
        if (!token) return;
        try {
            const res = await fetch(`/api/matches/${matchId}/lobby`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });
            if (isUnauthorized(res.status)) {
                clearAuthSession();
                routerRef.current.push("/login");
                return;
            }
            if (!res.ok) return;
            const data: LobbyState = await res.json();
            if (data.return_route) returnRouteRef.current = data.return_route;
            setLobby(data);
            if (data.match_status === "ongoing" || data.match_status === "completed") {
                routerRef.current.push(`/matches/${matchId}`);
                return;
            }
            if (data.match_status === "cancelled" || data.match_status === "invalidated") {
                routerRef.current.push(data.return_route ?? returnRouteRef.current);
            }
        } catch {
            // Keep stale lobby state on screen until reconnect.
        }
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
            if (!res.ok) {
                // 403 = not a player slot in this lobby (e.g. organizer viewing).
                // Set forbiddenRef so the state-sync effect doesn't reset entered,
                // which would otherwise create an infinite 403 retry loop.
                if (res.status === 403) {
                    forbiddenRef.current = true;
                    setEntered(true);
                }
                return false;
            }

            setEntered(true);
            setConnectionError(null);
            const data = await res.json();
            if (data.status === "match_started") {
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

    const handleReconnect = useCallback(async () => {
        setConnectionError(null);
        setRefreshing(true);
        try {
            await fetchLobbyRef.current();
            const enteredLobby = await attemptEnterLobby();
            // Don't show error if already marked as entered (e.g. referee whose slot is implicit).
            if (!enteredLobby && !entered) {
                setConnectionError("Still syncing your connection. Keep this page open and tap Reconnect again if needed.");
            }
        } catch {
            setConnectionError("Reconnect failed. Please try again.");
        } finally {
            setRefreshing(false);
        }
    }, [attemptEnterLobby, entered]);

    const handleAbandonMatch = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        setConnectionError(null);
        setCancelling(true);
        try {
            const res = await fetch(`/api/matches/${matchId}/lobby/cancel`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setConnectionError("Could not abandon the lobby yet. Please try again.");
                return;
            }
            routerRef.current.push(returnRouteRef.current);
        } catch {
            setConnectionError("Could not abandon the lobby yet. Please try again.");
        } finally {
            setCancelling(false);
        }
    }, [matchId]);

    const handleLeaveLobby = useCallback(async () => {
        const token = getAccessToken();
        if (!token) return;
        setConnectionError(null);
        setLeaving(true);
        try {
            const res = await fetch(`/api/matches/${matchId}/lobby/leave`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setConnectionError("Could not leave the lobby. Please try again.");
                return;
            }
            // Navigate to the tournament page — the match detail page would
            // redirect back to lobby because tournament_phase stays "called".
            const tournamentId = lobby?.tournament_id;
            if (tournamentId) {
                routerRef.current.push(`/tournaments/${tournamentId}`);
            } else {
                routerRef.current.push(returnRouteRef.current);
            }
        } catch {
            setConnectionError("Could not leave the lobby. Please try again.");
        } finally {
            setLeaving(false);
        }
    }, [matchId, lobby?.tournament_id]);

    useEffect(() => {
        (async () => {
            const token = getAccessToken();
            if (!token) {
                routerRef.current.push("/login");
                return;
            }
            const me = await fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } });
            if (isUnauthorized(me.status)) {
                clearAuthSession();
                routerRef.current.push("/login");
                return;
            }
            const meData = await me.json();
            const id = meData.profile?.id ?? meData.id ?? meData.user_id ?? null;
            setMyId(id);
            await fetchLobbyRef.current();
            setLoading(false);
        })();
    }, []);

    useEffect(() => {
        if (!lobby) return;
        timeoutHandledRef.current = false;
        const nextSecs = lobby.deadline_at
            ? Math.max(0, Math.ceil((new Date(lobby.deadline_at).getTime() - Date.now()) / 1000))
            : FALLBACK_LOBBY_TIMEOUT;
        setSecs(nextSecs);
        setTimedOut(nextSecs <= 0);
    }, [lobby?.deadline_at, lobby?.match_id]);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setSecs(previous => {
                if (previous <= 1) {
                    setTimedOut(true);
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return previous - 1;
            });
        }, 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [lobby?.deadline_at, lobby?.match_id]);

    // Sync entered state with server: if the server shows our row as pending again
    // (e.g. match was re-called and all rows were reset) but our local flag is still
    // true, reset it so the auto-enter effect fires and we re-enter properly.
    // Skip this reset if forbiddenRef is set — that means we got a 403 and entered=true
    // was set just to stop the retry loop; resetting it would create an infinite 403 cycle.
    useEffect(() => {
        if (!lobby || !myId || !entered || forbiddenRef.current) return;
        const myEntry = lobby.players.find(p => p.user_id === myId);
        if (myEntry && myEntry.status !== "entered") {
            setEntered(false);
        }
    }, [lobby, myId, entered]);

    useEffect(() => {
        if (loading || !myId || timedOut || !lobby?.entry_open || forbiddenRef.current) return;

        const myEntry = lobby.players.find(player => player.user_id === myId);
        if (myEntry?.status === "entered" || entered) {
            if (!entered) setEntered(true);
            return;
        }

        void attemptEnterLobby();
        const retryId = setInterval(() => {
            void attemptEnterLobby();
        }, 4000);
        return () => clearInterval(retryId);
    }, [loading, myId, timedOut, lobby, entered, attemptEnterLobby]);

    useEffect(() => {
        if (!timedOut || timeoutHandledRef.current || !lobby?.can_cancel) return;
        timeoutHandledRef.current = true;

        const token = getAccessToken();
        if (token) {
            fetch(`/api/matches/${matchId}/lobby/cancel`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
        }

        const timeoutId = setTimeout(() => {
            routerRef.current.push(returnRouteRef.current);
        }, 3000);
        return () => clearTimeout(timeoutId);
    }, [timedOut, lobby?.can_cancel, matchId]);

    useEffect(() => {
        pollRef.current = setInterval(() => void fetchLobbyRef.current(), 4000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    useEffect(() => {
        if (!matchId) return;
        const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
        const wsHost = process.env.NEXT_PUBLIC_WS_HOST?.trim() || `${window.location.hostname}:8000`;
        const ws = new WebSocket(`${wsProtocol}://${wsHost}/matches/ws/${matchId}`);
        wsRef.current = ws;
        ws.onmessage = event => {
            try {
                const data = JSON.parse(event.data) as { type?: string };
                if (
                    data.type === "lobby_update"
                    || data.type === "tournament_match_called"
                    || data.type === "tournament_match_updated"
                    || data.type === "tournament_match_ready"
                ) {
                    // When the match is re-called all lobby rows are reset to pending —
                    // clear the local entered flag so everyone auto-re-enters.
                    // Also clear forbiddenRef so a player whose slot now exists can enter.
                    if (data.type === "tournament_match_called") {
                        forbiddenRef.current = false;
                        setEntered(false);
                    }
                    void fetchLobbyRef.current();
                }
                if (data.type === "match_live" || data.type === "match_started") {
                    routerRef.current.push(`/matches/${matchId}`);
                }
                if (data.type === "match_invalidated") {
                    routerRef.current.push(returnRouteRef.current);
                }
            } catch {
                // Ignore malformed frames.
            }
        };
        ws.onclose = () => {
            wsRef.current = null;
        };
        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            } else if (ws.readyState === WebSocket.CONNECTING) {
                ws.addEventListener("open", () => ws.close());
            }
        };
    }, [matchId]);

    if (loading || !lobby) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            </div>
        );
    }

    const team1 = lobby.players.filter(player => player.team_no === 1);
    const team2 = lobby.players.filter(player => player.team_no === 2);
    const myEntry = lobby.players.find(player => player.user_id === myId);
    const isSingles = lobby.match_format === "singles";
    const shouldSwapSinglesSides = isSingles && myEntry?.team_no === 2;
    const leftSidePlayers = shouldSwapSinglesSides ? team2 : team1;
    const rightSidePlayers = shouldSwapSinglesSides ? team1 : team2;
    const amEntered = myEntry?.status === "entered" || entered;
    const totalPlayers = lobby.total_players || lobby.players.length;
    const enteredCount = lobby.entered_count ?? lobby.players.filter(player => player.status === "entered").length;
    const remainingPlayers = Math.max(0, totalPlayers - enteredCount);
    const sportEmoji = SPORT_EMOJI[lobby.sport] ?? "🎾";
    const timerColor = secs <= 30 ? "text-red-400" : secs <= 60 ? "text-amber-400" : "text-zinc-400";
    const isTournamentLobby = lobby.lobby_mode === "tournament";
    const phaseLabel = lobby.tournament_phase ? lobby.tournament_phase.replace(/_/g, " ") : null;
    const isReferee = isTournamentLobby && !!myId && myId === lobby.referee_id;

    return (
        <>
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md flex flex-col gap-5">
                    <div className="text-center">
                        <div className="text-4xl mb-2">{sportEmoji}</div>
                        <h1 className="text-2xl font-black text-white">
                            {isTournamentLobby ? "Tournament Match Lobby" : "Match Found!"}
                        </h1>
                        <p className="text-zinc-400 text-sm mt-1 capitalize">
                            {lobby.sport.replace("_", " ")} · {lobby.match_format.replace("_", " ")}
                            {phaseLabel ? <> · {phaseLabel}</> : null}
                        </p>
                    </div>

                    {!lobby.all_entered && (
                        !timedOut ? (
                            <div className={`text-center text-sm font-mono font-bold ${timerColor}`}>
                                {enteredCount}/{totalPlayers} players entered
                                {lobby.deadline_at ? ` · ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")} remaining` : ""}
                            </div>
                        ) : (
                            <div className="text-center text-red-400 text-sm font-semibold">
                                {lobby.can_cancel
                                    ? "Lobby timed out - returning to queue..."
                                    : "Check-in window expired - wait for the referee or organizer."}
                            </div>
                        )
                    )}

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
                                <div className="px-4 pt-4 pb-2">
                                    <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">Team 1</p>
                                    <div className="flex flex-col gap-2">
                                        {team1.map(player => (
                                            <PlayerRow key={player.user_id} player={player} isYou={player.user_id === myId} />
                                        ))}
                                        {team1.length === 0 && <p className="text-xs text-zinc-600 italic">No players assigned</p>}
                                    </div>
                                </div>

                                <div className="mx-4 my-3 h-px bg-white/5" />

                                <div className="px-4 pb-4 pt-2">
                                    <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">Team 2</p>
                                    <div className="flex flex-col gap-2">
                                        {team2.map(player => (
                                            <PlayerRow key={player.user_id} player={player} isYou={player.user_id === myId} />
                                        ))}
                                        {team2.length === 0 && <p className="text-xs text-zinc-600 italic">No players assigned</p>}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {isTournamentLobby && lobby.referee_id && (
                        <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
                            lobby.referee_ready_at
                                ? "border-emerald-500/20 bg-emerald-500/5"
                                : "border-amber-500/20 bg-amber-500/5"
                        }`}>
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base ${
                                lobby.referee_ready_at
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-amber-500/15 text-amber-400"
                            }`}>
                                🧑‍⚖️
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Referee</p>
                                <p className={`text-sm font-semibold ${
                                    lobby.referee_ready_at ? "text-emerald-300" : "text-amber-300"
                                }`}>
                                    {lobby.referee_ready_at ? "At the lobby" : "Not yet arrived"}
                                </p>
                            </div>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                                lobby.referee_ready_at ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                            }`} />
                        </div>
                    )}

                    {amEntered && lobby.all_entered ? (
                        /* Compact strip once everyone is in — no need for the full card */
                        connectionError ? (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-3">
                                <p className="text-xs font-medium text-amber-300">{connectionError}</p>
                                <button
                                    onClick={() => { void handleReconnect(); }}
                                    disabled={refreshing || entering}
                                    className="text-xs font-bold text-cyan-300 hover:text-cyan-100 whitespace-nowrap disabled:opacity-50"
                                >
                                    {refreshing || entering ? "..." : "Reconnect"}
                                </button>
                            </div>
                        ) : null
                    ) : (
                        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-4">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">
                                    {isTournamentLobby ? "Tournament Check-In" : "Connection Checkpoint"}
                                </p>
                                <div className="text-right shrink-0">
                                    <span className="text-sm font-black text-white">{enteredCount}/{totalPlayers}</span>
                                    <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">
                                        {remainingPlayers === 0 ? "ready" : `left: ${remainingPlayers}`}
                                    </span>
                                </div>
                            </div>

                            {!amEntered && (
                                <p className="text-xs text-cyan-50/70">
                                    {isTournamentLobby
                                        ? "Check in before the referee opens the live match."
                                        : "Everyone must enter before the match can start."}
                                </p>
                            )}

                            {connectionError && (
                                <p className="text-xs font-medium text-amber-300">{connectionError}</p>
                            )}

                            <div className="flex gap-2">
                                <button
                                    onClick={() => { void handleReconnect(); }}
                                    disabled={refreshing || entering || (timedOut && !lobby.entry_open)}
                                    className="flex-1 py-2.5 text-sm font-semibold text-cyan-100 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/20 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {refreshing || entering ? "Reconnecting..." : "Reconnect"}
                                </button>
                                {lobby.can_cancel && (
                                    <button
                                        onClick={() => setConfirmCancel(true)}
                                        disabled={cancelling || timedOut}
                                        className="flex-1 py-2.5 text-sm font-semibold text-red-300 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 rounded-xl transition-all disabled:opacity-50"
                                    >
                                        Abandon Match
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {lobby.all_entered ? (
                        isTournamentLobby ? (
                            isReferee ? (
                                <div className="flex flex-col gap-2">
                                    <div className="text-center text-emerald-400 text-sm font-semibold py-1">
                                        All players are in — you can start the match now.
                                    </div>
                                    <button
                                        onClick={() => router.push(`/matches/${matchId}/referee`)}
                                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl transition-all text-base"
                                    >
                                        Open Referee Console
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center text-emerald-400 text-sm font-semibold py-3">
                                    All players are in. Waiting for the referee to start the live match...
                                </div>
                            )
                        ) : (
                            <div className="flex items-center justify-center gap-2 py-3 text-emerald-400 text-sm font-semibold">
                                <div className="w-5 h-5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
                                All players in - starting match...
                            </div>
                        )
                    ) : amEntered ? (
                        <div className="text-center text-zinc-400 text-sm py-2">
                            You&apos;re in the lobby. Waiting for {remainingPlayers} more player{remainingPlayers !== 1 ? "s" : ""}...
                        </div>
                    ) : (
                        <button
                            onClick={() => { void attemptEnterLobby(); }}
                            disabled={entering || timedOut || !lobby.entry_open}
                            className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all text-base"
                        >
                            {entering ? "Entering..." : "Enter Lobby"}
                        </button>
                    )}

                    {lobby.can_cancel && !lobby.all_entered && !timedOut && (
                        confirmCancel ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setConfirmCancel(false)}
                                    className="flex-1 py-2.5 text-sm font-semibold text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-xl transition-all"
                                >
                                    Keep waiting
                                </button>
                                <button
                                    onClick={() => { void handleAbandonMatch(); }}
                                    disabled={cancelling}
                                    className="flex-1 py-2.5 text-sm font-semibold text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60 bg-red-500/5 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {cancelling ? "Abandoning..." : "Yes, abandon"}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmCancel(true)}
                                className="w-full py-2.5 text-sm text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-xl transition-all"
                            >
                                Abandon match
                            </button>
                        )
                    )}

                    {isTournamentLobby && !isReferee && myId && (
                        confirmLeave ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setConfirmLeave(false)}
                                    className="flex-1 py-2.5 text-sm font-semibold text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-xl transition-all"
                                >
                                    Stay
                                </button>
                                <button
                                    onClick={() => { void handleLeaveLobby(); }}
                                    disabled={leaving}
                                    className="flex-1 py-2.5 text-sm font-semibold text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/60 bg-amber-500/5 hover:bg-amber-500/10 rounded-xl transition-all disabled:opacity-50"
                                >
                                    {leaving ? "Leaving..." : "Yes, leave"}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmLeave(true)}
                                className="w-full py-2.5 text-sm text-zinc-500 hover:text-amber-400 border border-transparent hover:border-amber-500/20 rounded-xl transition-all"
                            >
                                Leave lobby
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
        <div
            className={`min-w-0 rounded-2xl border p-3 flex flex-col gap-3 ${
                player
                    ? entered
                        ? "border-emerald-500/20 bg-emerald-500/8"
                        : "border-zinc-700/40 bg-zinc-800/40"
                    : "border-zinc-800 bg-zinc-950/50"
            }`}
        >
            <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">{label}</p>

            {player ? (
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                            entered ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-400"
                        }`}
                    >
                        {player.first_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">
                            {`${player.first_name || ''} ${player.last_name || ''}`.trim() || "Unknown"}
                            {isYou && <span className="ml-2 text-[10px] text-violet-400 font-bold uppercase tracking-wider">you</span>}
                        </p>
                        <p
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                                entered ? "text-emerald-400" : "text-zinc-500"
                            }`}
                        >
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
        <div
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                entered ? "bg-emerald-500/8 border border-emerald-500/20" : "bg-zinc-800/40 border border-zinc-700/30"
            }`}
        >
            <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    entered ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-400"
                }`}
            >
                {player.first_name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                    {player.first_name && player.last_name ? `${player.first_name} ${player.last_name}` : player.first_name ?? "Unknown"}
                    {isYou && <span className="ml-2 text-[10px] text-violet-400 font-bold uppercase tracking-wider">you</span>}
                </p>
                <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                        entered ? "text-emerald-400" : "text-zinc-500"
                    }`}
                >
                    {entered ? "Entered" : "Waiting"}
                </p>
            </div>
        </div>
    );
}
