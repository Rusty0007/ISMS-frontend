"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import { useTokenRefresh } from "@/lib/useTokenRefresh";
import {
    dispatchOfflineQueuedAction,
    getOfflineQueueKey,
    readRefereeSnapshot,
    type OfflineQueuedAction as QueuedAction,
    writePendingOfflineMatchNotice,
    writeRefereeSnapshot,
} from "@/lib/offline-match";
import NavBar from "@/components/NavBar";

// ── Scoring causes per sport ────────────────────────────────────────────────── 

const SCORING_CAUSES: Record<string, string[]> = {
    badminton: [
        "Smash winner", "Drop shot winner", "Net shot winner", "Clear winner",
        "Drive winner", "Service fault", "Unforced error", "Let replay",
    ],
    // Pickleball: only rally-winning shots — faults/violations are handled via
    // "Rally Lost" (serve rotation) and the Violation button, not as scoring causes.
    pickleball: [
        "Dink winner", "Drive winner", "Drop shot winner", "Lob winner", "Smash winner",
    ],
    table_tennis: [
        "Smash winner", "Topspin winner", "Chop winner", "Serve winner",
        "Edge ball", "Net ball", "Forced error", "Unforced error",
    ],
    lawn_tennis: [
        "Ace", "Service winner", "Volley winner", "Groundstroke winner",
        "Passing shot", "Drop shot winner", "Forced error", "Unforced error",
    ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchData {
    id: string;
    sport: string;
    match_format: string;
    status: string;
    tournament_id?: string | null;
    tournament_phase?: string | null;
    called_at?: string | null;
    checkin_deadline_at?: string | null;
    started_at?: string | null;
    player1_id: string;
    player2_id: string | null;
    player3_id: string | null;
    player4_id: string | null;
    referee_id: string | null;
}

interface SetData {
    set_number: number;
    player1_score: number;
    player2_score: number;
    team1_score?: number;
    team2_score?: number;
}

interface HistoryEntry {
    id: string;
    event_type: string;
    team: string | null;
    player_id?: string | null;
    description: string;
    set_number: number | null;
    team1_score: number | null;
    team2_score: number | null;
    meta?: Record<string, unknown> | null;
    created_at: string;
}

interface PlayerProfile {
    id: string;
    first_name: string;
    last_name: string;
}

interface Ruleset {
    label: string;
    sets_to_win: number;
    points_per_set?: number;
    games_per_set?: number;
    win_by: number;
    max_points?: number | null;
    max_sets: number;
    score_limit?: number;   // per-match override returned by /ruleset
    violation_types: { code: string; label: string }[];
    error_types?: { code: string; label: string }[];
    scoring_causes?: string[];
}

interface RefereeSnapshot {
    match: MatchData;
    sets: SetData[];
    history: HistoryEntry[];
    ruleset: Ruleset | null;
    profiles: Record<string, PlayerProfile>;
    activeSet: number;
    scoreLimit: number | null;
    savedAt: string;
}

type AttrStep = "cause_type" | "winning_shot" | "opponent_error" | "other" | "serve";

type ModalState =
    | { type: "none" }
    | { type: "point_attribution"; team: "team1" | "team2"; step: AttrStep }
    | { type: "lost_serve" }
    | { type: "violation" };

const RECONNECT_NOTICE_MS = 5000;
const MATCH_PRESENCE_PING_MS = 20000;

type FirstServeSelection = {
    team: "team1" | "team2";
    slot: 0 | 1;
    side: "right" | "left";
    isFirstServiceSequence: boolean;
    confirmed: boolean;
};

type ServeEvent = {
    type: "fault" | "sideout";
    faulterName?: string;
    newTeam: string;
    newPlayerName: string;
    isSideout: boolean;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RefereeConsolePage() {
    const router  = useRouter();
    const params  = useParams();
    const matchId = params.id as string;
    const firstServeStorageKey = `isms.referee.first-serve.${matchId}`;

    // Refresh JWT before it expires so an ongoing match never gets a 401
    useTokenRefresh();

    const [match,    setMatch]    = useState<MatchData | null>(null);
    const [sets,     setSets]     = useState<SetData[]>([]);
    const [history,  setHistory]  = useState<HistoryEntry[]>([]);
    const [ruleset,  setRuleset]  = useState<Ruleset | null>(null);
    const [matchMissing, setMatchMissing] = useState(false);
    const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>({});
    const [userId,   setUserId]   = useState<string | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [,         setError]    = useState("");

    // Current set being played
    const [activeSet, setActiveSet] = useState(1);

    // Per-match score limit override (11 / 15 / 21)
    const [scoreLimit, setScoreLimit] = useState<number | null>(null);

    // Modal state
    const [modal, setModal] = useState<ModalState>({ type: "none" });

    // Attribution modal state
    const [attrPlayer,      setAttrPlayer]      = useState<string>("");
    const [attrCause,       setAttrCause]       = useState<string>("");
    const [errorType,       setErrorType]       = useState<string>("");
    const [errorPlayer,     setErrorPlayer]     = useState<string>("");
    const [otherNote,       setOtherNote]       = useState<string>("");

    // Violation modal state
    const [violPlayer, setViolPlayer]    = useState<string>("");
    const [violCode,   setViolCode]      = useState<string>("");
    const [violAward,  setViolAward]     = useState<"team1" | "team2" | "">("");

    // End match modal
    const [showEnd,   setShowEnd]   = useState(false);
    const [endWinner, setEndWinner] = useState<"team1" | "team2" | "">("");
    const [ending,    setEnding]    = useState(false);

    // Set won modal
    const [setWonInfo, setSetWonInfo] = useState<{
        setNumber: number;
        winner: "team1" | "team2";
        p1Score: number;
        p2Score: number;
    } | null>(null);

    // First serve selection — shown before any point is recorded
    const [showFirstServe, setShowFirstServe] = useState(false);
    const [firstServeConfirmed, setFirstServeConfirmed] = useState(false);

    // Serve tracking (all sports use servingTeam; pickleball also uses servingSlot)
    // servingSlot: 0 = first server on team, 1 = second server (partner)
    // Side-out only happens when BOTH players on a team have faulted
    const [servingTeam,  setServingTeam]  = useState<"team1" | "team2">("team1");
    const [servingSlot,  setServingSlot]  = useState<0 | 1>(0);
    const [,            setServeEvent] = useState<ServeEvent | null>(null);

    const wsRef        = useRef<WebSocket | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusRef    = useRef("ongoing");
    const syncingRef   = useRef(false);
    const connPhaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const offlineSetHandledRef = useRef<Set<number>>(new Set());
    const offlineCompletionHandledRef = useRef(false);
    const setWonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isOnline,     setIsOnline]     = useState(true);
    const [offlineQueue, setOfflineQueue] = useState<QueuedAction[]>([]);
    const [syncing,      setSyncing]      = useState(false);
    // "online" | "offline" | "syncing" | "synced"
    const [connPhase, setConnPhase] = useState<"online" | "offline" | "syncing" | "synced">("online");
    // Set to true when consecutive sync attempts keep failing — shows a persistent retry banner
    const [,            setSyncFailed] = useState(false);
    const syncRetryCount = useRef(0);
    const [leaveLoading, setLeaveLoading] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    // Side-out scoring state (all doubles sports)
    const [isFirstServiceSequence, setIsFirstServiceSequence] = useState(true);
    const [lostServeFaulter, setLostServeFaulter] = useState<string>("");

    // Pickleball: serving side (right = even court, left = odd court)
    // Rule: server starts every new turn from right; switches side on each point won.
    const [servingSide, setServingSide] = useState<"right" | "left">("right");

    // Point modal open helper
    function openPointModal(team: "team1" | "team2") {
        const teamIds = getTeamPlayerIds(team);
        // If singles, auto-select the only player
        if (teamIds.length === 1) {
            setAttrPlayer(teamIds[0]);
        }
        setAttrCause(""); setErrorType(""); setErrorPlayer(""); setOtherNote("");
        setModal({ type: "point_attribution", team, step: "cause_type" });
    }

    // ── Offline queue helpers ──────────────────────────────────────────────────

    const queueStorageKey = getOfflineQueueKey(matchId);

    const saveQueue = useCallback((q: QueuedAction[]) => {
        try { localStorage.setItem(queueStorageKey, JSON.stringify(q)); } catch {}
    }, [queueStorageKey]);

    function clearConnPhaseTimer() {
        if (connPhaseTimerRef.current) {
            clearTimeout(connPhaseTimerRef.current);
            connPhaseTimerRef.current = null;
        }
    }

    function scheduleConnPhaseReset(delayMs: number = RECONNECT_NOTICE_MS) {
        clearConnPhaseTimer();
        connPhaseTimerRef.current = setTimeout(() => {
            setConnPhase("online");
            connPhaseTimerRef.current = null;
        }, delayMs);
    }

    const finalizeMatchOffline = useCallback((winnerTeam: "team1" | "team2") => {
        if (!match || offlineCompletionHandledRef.current) return;
        const winnerId = winnerTeam === "team1" ? match.player1_id : match.player2_id;
        if (!winnerId) return;

        offlineCompletionHandledRef.current = true;
        setModal({ type: "none" });
        setShowEnd(false);
        setEndWinner(winnerTeam);

        const qid = crypto.randomUUID();
        const completionAction: QueuedAction = {
            qid,
            type: "complete",
            payload: { winner_id: winnerId, client_action_id: qid },
        };

        setOfflineQueue(prev => {
            const next = prev.some(action => action.type === "complete")
                ? prev
                : [...prev, completionAction];
            saveQueue(next);
            return next;
        });

        writePendingOfflineMatchNotice(sessionStorage, {
            matchId,
            sport: match.sport,
            winnerTeam,
            savedAt: new Date().toISOString(),
            message: "Your last match has been saved locally. We are waiting for the internet to come back so we can save it online.",
        });

        setMatch(prev => prev ? { ...prev, status: "completed" } : prev);
        router.replace("/dashboard");
    }, [match, matchId, router, saveQueue]);

    function applyPointLocally(team: "team1" | "team2", setNum: number) {
        setSets(prev => prev.map(s => {
            if (s.set_number !== setNum) return s;
            const t1 = s.team1_score ?? s.player1_score;
            const t2 = s.team2_score ?? s.player2_score;
            return team === "team1"
                ? { ...s, team1_score: t1 + 1, team2_score: t2, player1_score: t1 + 1, player2_score: t2 }
                : { ...s, team1_score: t1, team2_score: t2 + 1, player1_score: t1, player2_score: t2 + 1 };
        }));
        if (navigator.vibrate) navigator.vibrate(40);
    }

    function reversePointLocally(team: "team1" | "team2", setNum: number) {
        setSets(prev => prev.map(s => {
            if (s.set_number !== setNum) return s;
            const t1 = s.team1_score ?? s.player1_score;
            const t2 = s.team2_score ?? s.player2_score;
            return team === "team1"
                ? { ...s, team1_score: Math.max(0, t1 - 1), team2_score: t2, player1_score: Math.max(0, t1 - 1), player2_score: t2 }
                : { ...s, team1_score: t1, team2_score: Math.max(0, t2 - 1), player1_score: t1, player2_score: Math.max(0, t2 - 1) };
        }));
        if (navigator.vibrate) navigator.vibrate([20, 30]);
    }

    const getSetScores = useCallback((set: SetData) => {
        return {
            team1: set.team1_score ?? set.player1_score ?? 0,
            team2: set.team2_score ?? set.player2_score ?? 0,
        };
    }, []);

    const getSetWinner = useCallback((set: SetData): "team1" | "team2" | null => {
        const { team1, team2 } = getSetScores(set);
        const target = scoreLimit ?? ruleset?.points_per_set ?? ruleset?.games_per_set ?? 21;
        const winBy = ruleset?.win_by ?? 2;
        const maxPoints = ruleset?.max_points ?? null;
        const effectiveMax = maxPoints && maxPoints > target ? maxPoints : null;

        if (team1 >= target && team1 - team2 >= winBy) return "team1";
        if (team2 >= target && team2 - team1 >= winBy) return "team2";
        if (effectiveMax && (team1 >= effectiveMax || team2 >= effectiveMax)) return team1 > team2 ? "team1" : "team2";
        return null;
    }, [getSetScores, ruleset, scoreLimit]);

    const getSetsWon = useCallback((allSets: SetData[]) => {
        return allSets.reduce(
            (acc, set) => {
                const winner = getSetWinner(set);
                if (winner === "team1") acc.team1 += 1;
                if (winner === "team2") acc.team2 += 1;
                return acc;
            },
            { team1: 0, team2: 0 }
        );
    }, [getSetWinner]);

    async function syncQueue(queue: QueuedAction[], token: string) {
        if (!queue.length || syncingRef.current) return;
        clearConnPhaseTimer();
        syncingRef.current = true;
        setSyncing(true);
        setConnPhase("syncing");
        let remaining = [...queue];
        for (const action of queue) {
            try {
                const res = await dispatchOfflineQueuedAction(matchId, action, token);
                if (res.ok) {
                    remaining = remaining.filter(a => a.qid !== action.qid);
                    setOfflineQueue(remaining);
                    saveQueue(remaining);
                } else if (res.status >= 400 && res.status < 500) {
                    // 4xx = server rejected it permanently — discard and continue
                    remaining = remaining.filter(a => a.qid !== action.qid);
                    setOfflineQueue(remaining);
                    saveQueue(remaining);
                    if (res.status !== 409) { // 409 = idempotent duplicate, not an error
                        const d = await res.json().catch(() => ({}));
                        const msg = Array.isArray(d.detail)
                            ? d.detail.map((e: { loc: string[]; msg: string }) => `${e.loc.slice(-1)[0]}: ${e.msg}`).join("; ")
                            : (d.detail || `Action failed (${res.status})`);
                        setError(`Skipped action: ${msg}`);
                    }
                } else {
                    // 5xx or network error — stop, retry next time
                    break;
                }
            } catch {
                break; // still offline
            }
        }
        syncingRef.current = false;
        setSyncing(false);
        if (remaining.length === 0) {
            syncRetryCount.current = 0;
            setSyncFailed(false);
            setConnPhase("synced");
            scheduleConnPhaseReset();
            fetchAll(token);
        } else {
            syncRetryCount.current += 1;
            // After 3 failed attempts show a persistent "Sync failed" banner
            if (syncRetryCount.current >= 3) setSyncFailed(true);
            clearConnPhaseTimer();
            setConnPhase("online");
        }
    }

    function getToken() {
        const t = getAccessToken();
        if (!t) router.replace("/login");
        return t;
    }

    function persistOpeningServeSelection(team: "team1" | "team2") {
        const nextSelection: FirstServeSelection = {
            team,
            slot: 0,
            side: "right",
            isFirstServiceSequence: true,
            confirmed: true,
        };

        setServingTeam(team);
        setServingSlot(0);
        setServingSide("right");
        setIsFirstServiceSequence(true);
        setFirstServeConfirmed(true);
        setShowFirstServe(false);

        try {
            sessionStorage.setItem(firstServeStorageKey, JSON.stringify(nextSelection));
        } catch {}
    }

    // ── Data fetching ──────────────────────────────────────────────────────────

    const fetchAll = useCallback(async (token: string) => {
        try {
            const [matchRes, histRes, ruleRes] = await Promise.all([
                fetch(`/api/matches/${matchId}`,         { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/${matchId}/history`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/${matchId}/ruleset`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (isUnauthorized(matchRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (matchRes.status === 404) {
                setMatchMissing(true);
                setMatch(null);
                setSets([]);
                setHistory([]);
                setRuleset(null);
                setProfiles({});
                return;
            }

            if (matchRes.ok) {
                setMatchMissing(false);
                const d = await matchRes.json();
                setMatch(d.match);
                setSets(d.sets ?? []);
                if (d.sets?.length) setActiveSet(d.sets[d.sets.length - 1].set_number);

                // Fetch player profiles
                const ids = [d.match.player1_id, d.match.player2_id, d.match.player3_id, d.match.player4_id]
                    .filter(Boolean) as string[];
                const entries = await Promise.all(ids.map(async id => {
                    const r = await fetch(`/api/players/${id}`, { headers: { Authorization: `Bearer ${token}` } });
                    if (!r.ok) return [id, null] as const;
                    const data = await r.json();
                    return [id, data.profile as PlayerProfile] as const;
                }));
                const p: Record<string, PlayerProfile> = {};
                for (const [id, prof] of entries) if (prof) p[id] = prof;
                setProfiles(p);
            }

            if (histRes.ok) {
                const d = await histRes.json();
                setHistory(d.history ?? []);
            }

            if (ruleRes.ok) {
                const d = await ruleRes.json();
                setRuleset(d.ruleset);
                // Initialise score limit from stored override, else sport default
                if (d.ruleset.score_limit) {
                    setScoreLimit(d.ruleset.score_limit);
                } else if (d.ruleset.points_per_set) {
                    setScoreLimit(d.ruleset.points_per_set);
                }
            }
        } catch (err) {
            console.error("[referee] fetchAll error:", err);
        }
    }, [matchId, router]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        // Get current user
        fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setUserId(d.profile?.id ?? null); });

        fetchAll(token).finally(() => setLoading(false));
    }, [fetchAll, router]);

    useEffect(() => {
        if (!matchMissing) return;
        const timer = setTimeout(() => router.replace("/referee"), 1500);
        return () => clearTimeout(timer);
    }, [matchMissing, router]);

    useEffect(() => {
        if (!match) return;

        const allZeroScores = sets.length === 0 || sets.every((set) =>
            (set.team1_score ?? set.player1_score ?? 0) === 0 &&
            (set.team2_score ?? set.player2_score ?? 0) === 0
        );
        const canConfigureOpeningServe =
            match.sport === "pickleball"
            && ["pending", "pending_approval", "awaiting_players", "assembling", "ongoing"].includes(match.status)
            && allZeroScores;

        if (!canConfigureOpeningServe) {
            setShowFirstServe(false);
            setFirstServeConfirmed(false);
            try { sessionStorage.removeItem(firstServeStorageKey); } catch {}
            return;
        }

        let savedSelection: FirstServeSelection | null = null;
        try {
            const raw = sessionStorage.getItem(firstServeStorageKey);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<FirstServeSelection>;
                if ((parsed.team === "team1" || parsed.team === "team2") && parsed.confirmed) {
                    savedSelection = {
                        team: parsed.team,
                        slot: parsed.slot === 1 ? 1 : 0,
                        side: parsed.side === "left" ? "left" : "right",
                        isFirstServiceSequence: parsed.isFirstServiceSequence !== false,
                        confirmed: true,
                    };
                }
            }
        } catch {}

        if (savedSelection) {
            setServingTeam(savedSelection.team);
            setServingSlot(savedSelection.slot);
            setServingSide(savedSelection.side);
            setIsFirstServiceSequence(savedSelection.isFirstServiceSequence);
        }

        const hasSavedOpeningServe = Boolean(savedSelection?.confirmed);
        setFirstServeConfirmed(hasSavedOpeningServe);
        setShowFirstServe(match.status === "ongoing" && !hasSavedOpeningServe);
    }, [firstServeStorageKey, match, sets]);

    // ── WebSocket ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!matchId || matchMissing) return;
        let alive = true;

        function connect() {
            const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
            const wsHost = process.env.NEXT_PUBLIC_WS_HOST?.trim() || `${window.location.hostname}:8000`;
            const ws = new WebSocket(`${wsProtocol}://${wsHost}/matches/ws/${matchId}`);
            wsRef.current = ws;
            ws.onmessage = (event) => {
                if (!alive) return;
                try {
                    const d = JSON.parse(event.data) as Record<string, unknown>;
                    if (d.type === "sets_update" && Array.isArray(d.sets)) {
                        const nextSetNumber = typeof d.next_set === "number" ? d.next_set as number : null;
                        const updatedSets = (d.sets as SetData[]).map(set => (
                            d.set_winner && nextSetNumber !== null && set.set_number === nextSetNumber
                                ? { ...set, player1_score: 0, player2_score: 0, team1_score: 0, team2_score: 0 }
                                : set
                        ));
                        setSets(updatedSets);
                        // Auto-advance to next set if one was created
                        if (nextSetNumber !== null) {
                            setActiveSet(nextSetNumber);
                        }
                        // Show set won modal + reset serve to loser
                        if (d.set_winner) {
                            const wonSet = d.set_number_won as number;
                            const finishedSet = updatedSets.find(s => s.set_number === wonSet);
                            setSetWonInfo({
                                setNumber: wonSet,
                                winner: d.set_winner as "team1" | "team2",
                                p1Score: finishedSet?.player1_score ?? 0,
                                p2Score: finishedSet?.player2_score ?? 0,
                            });
                            setTimeout(() => setSetWonInfo(null), 4000);
                            // Auto-assign serve to loser for the next set
                            if (nextSetNumber !== null) {
                                resetServeForNewSet(d.set_winner as "team1" | "team2");
                            }
                        }
                        // Auto-fill winner if match is decided
                        if (d.match_winner_team) {
                            setEndWinner(d.match_winner_team as "team1" | "team2");
                            setShowEnd(true);
                        }
                        const token = getAccessToken();
                        if (token) fetch(`/api/matches/${matchId}/history`, { headers: { Authorization: `Bearer ${token}` } })
                            .then(r => r.ok ? r.json() : null)
                            .then(data => { if (data) setHistory(data.history ?? []); });
                    }
                    if (
                        d.type === "tournament_match_called"
                        || d.type === "tournament_match_updated"
                        || d.type === "tournament_match_ready"
                        || d.type === "tournament_result_verified"
                        || d.type === "tournament_result_disputed"
                    ) {
                        const token = getAccessToken();
                        if (token) void fetchAll(token);
                    }
                    if (d.type === "match_started") {
                        setMatch(prev => prev ? {
                            ...prev,
                            status: "ongoing",
                            tournament_phase: typeof d.tournament_phase === "string" ? d.tournament_phase as string : prev.tournament_phase,
                        } : prev);
                    }
                    if (d.type === "match_completed") {
                        setMatch(prev => prev ? { ...prev, status: "completed" } : prev);
                    }
                    if (d.type === "match_invalidated") {
                        setMatch(prev => prev ? { ...prev, status: "invalidated" } : prev);
                    }
                } catch {}
            };
            ws.onclose = () => {
                if (!alive) return;
                if (statusRef.current === "completed" || statusRef.current === "cancelled" || statusRef.current === "invalidated") return;
                reconnectRef.current = setTimeout(connect, 3000);
            };
            ws.onerror = () => ws.close();
        }
        connect();
        return () => {
            alive = false;
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            wsRef.current?.close();
        };
    }, [matchId, fetchAll, matchMissing]);

    useEffect(() => {
        offlineSetHandledRef.current.clear();
        offlineCompletionHandledRef.current = false;

        if (setWonTimerRef.current) {
            clearTimeout(setWonTimerRef.current);
            setWonTimerRef.current = null;
        }

        return () => {
            if (setWonTimerRef.current) {
                clearTimeout(setWonTimerRef.current);
                setWonTimerRef.current = null;
            }
        };
    }, [matchId]);

    useEffect(() => {
        if (isOnline || !match || !ruleset || match.status !== "ongoing" || sets.length === 0) return;

        const current = sets.find(s => s.set_number === activeSet) ?? sets[sets.length - 1];
        if (!current) return;

        const setWinner = getSetWinner(current);
        if (!setWinner) return;

        if (!offlineSetHandledRef.current.has(current.set_number)) {
            offlineSetHandledRef.current.add(current.set_number);
            const scores = getSetScores(current);
            setSetWonInfo({
                setNumber: current.set_number,
                winner: setWinner,
                p1Score: scores.team1,
                p2Score: scores.team2,
            });
            if (setWonTimerRef.current) clearTimeout(setWonTimerRef.current);
            setWonTimerRef.current = setTimeout(() => {
                setSetWonInfo(null);
                setWonTimerRef.current = null;
            }, 4000);
        }

        const wins = getSetsWon(sets);
        const matchWinner =
            wins.team1 >= ruleset.sets_to_win ? "team1"
            : wins.team2 >= ruleset.sets_to_win ? "team2"
            : null;

        if (matchWinner) {
            finalizeMatchOffline(matchWinner);
            return;
        }

        const nextSetNumber = current.set_number + 1;
        const atMaxSets = sets.length >= ruleset.max_sets;
        const nextSetExists = sets.some(set => set.set_number === nextSetNumber);
        if (!atMaxSets && !nextSetExists) {
            setSets(prev => [
                ...prev,
                { set_number: nextSetNumber, player1_score: 0, player2_score: 0, team1_score: 0, team2_score: 0 },
            ]);
            setActiveSet(nextSetNumber);
            // Reset serve to loser's right-side player for the new set
            resetServeForNewSet(setWinner);
        }
    }, [activeSet, finalizeMatchOffline, getSetScores, getSetWinner, getSetsWon, isOnline, match, ruleset, sets]);

    useEffect(() => { if (match?.status) statusRef.current = match.status; }, [match?.status]);

    useEffect(() => {
        if (!matchId || match?.status !== "ongoing" || !isOnline) return;

        let alive = true;

        const pingPresence = async () => {
            const token = getAccessToken();
            if (!token) return;
            try {
                const res = await fetch(`/api/matches/${matchId}/presence/ping`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (isUnauthorized(res.status)) {
                    clearAuthSession();
                    router.replace("/login");
                    return;
                }
                if (!res.ok) return;
                const data = await res.json() as { match_status?: string };
                if (!alive) return;
                if (data.match_status === "invalidated") {
                    setMatch(prev => prev ? { ...prev, status: "invalidated" } : prev);
                }
            } catch (err) {
                console.warn("[referee] presence ping failed:", err);
            }
        };

        pingPresence();
        const intervalId = setInterval(pingPresence, MATCH_PRESENCE_PING_MS);
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                pingPresence();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            alive = false;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [isOnline, match?.status, matchId, router]);

    // ── Online / offline resilience ────────────────────────────────────────────

    // Migrate legacy queue entries: serve-change payloads stored as type:"point"
    function migrateQueue(raw: QueuedAction[]): QueuedAction[] {
        return raw.map(a => {
            if (a.type === "point" && (a.payload as Record<string, unknown>).event_type) {
                return { ...a, type: "serve_change" as const };
            }
            return a;
        });
    }

    useEffect(() => {
        setIsOnline(navigator.onLine);
        try {
            const raw: QueuedAction[] = JSON.parse(localStorage.getItem(queueStorageKey) ?? "[]");
            const stored = migrateQueue(raw);
            if (stored.length) { setOfflineQueue(stored); saveQueue(stored); }
        } catch {}

        function handleOnline() {
            setIsOnline(true);
            clearConnPhaseTimer();
            const token = getAccessToken();
            if (!token) return;
            try {
                const raw: QueuedAction[] = JSON.parse(localStorage.getItem(queueStorageKey) ?? "[]");
                const stored = migrateQueue(raw);
                if (stored.length) {
                    syncQueue(stored, token);
                } else {
                    setConnPhase("online");
                }
            } catch {
                setConnPhase("online");
            }
        }
        function handleOffline() {
            setIsOnline(false);
            clearConnPhaseTimer();
            setConnPhase("offline");
        }

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
            clearConnPhaseTimer();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId]);

    // ── Keyboard Shortcuts ──────────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (modal.type !== "none" || showEnd) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key.toLowerCase()) {
                case "1":
                    e.preventDefault();
                    openPointModal("team1");
                    break;
                case "2":
                    e.preventDefault();
                    openPointModal("team2");
                    break;
                case "u":
                    e.preventDefault();
                    submitUndo();
                    break;
                case "v":
                    e.preventDefault();
                    setModal({ type: "violation" });
                    break;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });

    // ── Serve tracking helpers (pickleball) ───────────────────────────────────

    function getPlayerName(id: string | null | undefined): string {
        if (!id) return "—";
        const p = profiles[id];
        return p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || "Player" : "Player";
    }

    function getTeamPlayerIds(team: "team1" | "team2"): string[] {
        if (!match) return [];
        return (team === "team1"
            ? [match.player1_id, match.player3_id]
            : [match.player2_id, match.player4_id]
        ).filter(Boolean) as string[];
    }

    function showServeEvent(evt: ServeEvent) {
        setServeEvent(evt);
        setTimeout(() => setServeEvent(null), 5000);
    }

    /**
     * Reset serve state when a new set begins.
     * Loser of the finished set serves first, starting with their right-side
     * player (slot 0). isFirstServiceSequence is reset to true so the new set
     * uses the start-of-game single-server exception (doubles sports).
     */
    function resetServeForNewSet(setWinner: "team1" | "team2") {
        const loser = setWinner === "team1" ? "team2" : "team1";
        setServingTeam(loser);
        setServingSlot(0);
        setServingSide("right");
        setIsFirstServiceSequence(true);
    }

    /**
     * Called when the current server commits ANY violation.
     * Doubles rule: first violation → partner serves (same team, slot 1).
     *               second violation → side-out to opponent team.
     * Singles: always immediate side-out.
     */
    function handleServiceFault(faultingTeam: "team1" | "team2", faultingPlayerId: string) {
        const teamIds  = getTeamPlayerIds(faultingTeam);
        const isDoubles = teamIds.length > 1;
        const faulterName = getPlayerName(faultingPlayerId);

        if (isDoubles && servingSlot === 0 && !isFirstServiceSequence) {
            // Partner (slot 1) gets to serve — same team, no side-out yet
            // New server starts from right side
            const partnerName = getPlayerName(teamIds[1]);
            setServingSlot(1);
            setServingSide("right");
            showServeEvent({
                type: "fault",
                faulterName,
                newTeam: faultingTeam === "team1" ? "Team 1" : "Team 2",
                newPlayerName: partnerName,
                isSideout: false,
            });
        } else {
            // Side-out: singles, opening sequence, or both partners have faulted
            const opponent   = faultingTeam === "team1" ? "team2" : "team1";
            const oppIds     = getTeamPlayerIds(opponent);
            setServingTeam(opponent);
            setServingSlot(0);
            setServingSide("right");
            if (isFirstServiceSequence) setIsFirstServiceSequence(false);
            showServeEvent({
                type: "fault",
                faulterName,
                newTeam: opponent === "team1" ? "Team 1" : "Team 2",
                newPlayerName: getPlayerName(oppIds[0]),
                isSideout: true,
            });
        }
    }

    // ── Actions ────────────────────────────────────────────────────────────────

    async function submitPoint(
        team: "team1" | "team2",
        attribution_type: "winning_shot" | "opponent_error" | "other",
        opts: { player_id?: string; cause?: string; actor_player_id?: string; reason_code?: string; overrideQid?: string } = {}
    ) {
        if (match?.status !== "ongoing") {
            setError("Start the match before recording points.");
            return;
        }
        const token = getToken(); if (!token) return;
        setError("");
        setModal({ type: "none" });
        setAttrPlayer(""); setAttrCause(""); setErrorType(""); setErrorPlayer(""); setOtherNote("");

        if (match?.sport === "pickleball" && isDoubles) {
            if (team === servingTeam) {
                // Serving team scored — same server continues but switches side
                setServingSide(prev => prev === "right" ? "left" : "right");
            } else {
                // Receiving team won the rally — use the same rotation as a serve fault:
                // opening sequence or second server → side out; first server → pass to partner
                handleLostServe();
            }
        }

        const qid = opts.overrideQid || crypto.randomUUID();
        const payload = {
            team, set_number: activeSet,
            attribution_type,
            player_id:        opts.player_id       || null,
            cause:            opts.cause           || null,
            actor_player_id:  opts.actor_player_id || null,
            reason_code:      opts.reason_code     || null,
            client_action_id: qid,
        };

        if (!isOnline) {
            const action: QueuedAction = { qid, type: "point", payload, localTeam: team, localSet: activeSet };
            const q = [...offlineQueue, action];
            setOfflineQueue(q); saveQueue(q);
            applyPointLocally(team, activeSet);
            return;
        }

        try {
            const res = await fetch(`/api/matches/${matchId}/point`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const d = await res.json();
                const msg = Array.isArray(d.detail)
                    ? d.detail.map((e: { loc: string[]; msg: string }) => `${e.loc.slice(-1)[0]}: ${e.msg}`).join("; ")
                    : (d.detail || "Failed.");
                setError(msg);
            }
        } catch {
            // Network dropped — queue with same qid for idempotent replay
            const action: QueuedAction = { qid, type: "point", payload, localTeam: team, localSet: activeSet };
            const q = [...offlineQueue, action];
            setOfflineQueue(q); saveQueue(q);
            applyPointLocally(team, activeSet);
            setIsOnline(false);
        }
    }

    async function changeScoreLimit(limit: number) {
        setScoreLimit(limit);   // optimistic
        const token = getToken(); if (!token) return;
        await fetch(`/api/matches/${matchId}/score-limit`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ score_limit: limit }),
        }).catch(() => {});
    }

    async function submitServeChange(
        eventType: "loss_of_serve" | "side_out",
        faultTeam: "team1" | "team2",
        faultPlayerId?: string,
        newServingTeam?: "team1" | "team2",
        newServerSlot?: number,
    ) {
        const token = getToken(); if (!token) return;
        const qid = crypto.randomUUID();
        const resolvedNewTeam  = newServingTeam ?? (faultTeam === "team1" ? "team2" : "team1");
        const resolvedNewSlot  = newServerSlot ?? 0;
        const payload = {
            set_number:       activeSet,
            event_type:       eventType,
            fault_team:       faultTeam,
            fault_player_id:  faultPlayerId || null,
            new_serving_team: resolvedNewTeam,
            new_server_slot:  resolvedNewSlot,
            client_action_id: qid,
        };
        if (!isOnline) {
            const action: QueuedAction = { qid, type: "serve_change", payload };
            const q = [...offlineQueue, action];
            setOfflineQueue(q); saveQueue(q);
            return;
        }
        try {
            const res = await fetch(`/api/matches/${matchId}/serve-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) { const d = await res.json(); setError(d.detail || "Failed."); }
        } catch {
            const action: QueuedAction = { qid, type: "serve_change", payload };
            const q = [...offlineQueue, action];
            setOfflineQueue(q); saveQueue(q);
            setIsOnline(false); setConnPhase("offline");
        }
    }

    function openLostServeModal() {
        const teamIds = getTeamPlayerIds(servingTeam);
        // Singles: only one server — auto-set so the modal skips the picker
        if (teamIds.length === 1) {
            setLostServeFaulter(teamIds[0]);
        } else {
            setLostServeFaulter("");
        }
        setModal({ type: "lost_serve" });
    }

    function handleLostServe() {
        const teamIds   = getTeamPlayerIds(servingTeam);
        const isDoubles = teamIds.length > 1;
        const faulter   = lostServeFaulter || undefined;

        // Start-of-game exception: first serving team only gets 1 server
        const goToSideOut = !isDoubles || servingSlot === 1 || isFirstServiceSequence;

        setModal({ type: "none" });
        setLostServeFaulter("");

        if (!goToSideOut) {
            // Loss of serve → partner (server 2) serves, same team
            // Per spec: every new server turn starts from right side
            const partnerName = getPlayerName(teamIds[1]);
            setServingSlot(1);
            setServingSide("right");
            submitServeChange("loss_of_serve", servingTeam, faulter, servingTeam, 1);
            showServeEvent({
                type: "fault",
                faulterName: faulter ? getPlayerName(faulter) : undefined,
                newTeam: servingTeam === "team1" ? "Team 1" : "Team 2",
                newPlayerName: partnerName,
                isSideout: false,
            });
        } else {
            // Side out → opponent team starts from right side
            const opponent = servingTeam === "team1" ? "team2" : "team1";
            const oppIds   = getTeamPlayerIds(opponent);
            setServingTeam(opponent);
            setServingSlot(0);
            setServingSide("right");
            if (isFirstServiceSequence) setIsFirstServiceSequence(false);
            submitServeChange("side_out", servingTeam, faulter, opponent, 0);
            showServeEvent({
                type: "sideout",
                newTeam: opponent === "team1" ? "Team 1" : "Team 2",
                newPlayerName: getPlayerName(oppIds[0]),
                isSideout: true,
            });
        }
    }

    async function submitViolation() {
        if (match?.status !== "ongoing") {
            setError("Start the match before recording violations.");
            return;
        }
        const token = getToken(); if (!token) return;
        if (!violPlayer || !violCode) { setError("Select player and violation type."); return; }
        setError("");
        const qid = crypto.randomUUID();
        const resolvedAward = violAward || inferredViolationAward(violPlayer);
        const payload = { player_id: violPlayer, violation_code: violCode, set_number: activeSet, award_point_to: resolvedAward || null, client_action_id: qid };
        setModal({ type: "none" });

        // Pickleball: serving-team violations are rally losses, not points.
        if (match?.sport === "pickleball") {
            const violatorTeam = playerTeam(violPlayer);
            if (violatorTeam === servingTeam) {
                handleServiceFault(servingTeam, violPlayer);
            }
        }

        setViolPlayer(""); setViolCode(""); setViolAward("");

        if (!isOnline) {
            const action: QueuedAction = { qid, type: "violation", payload };
            const q = [...offlineQueue, action];
            setOfflineQueue(q); saveQueue(q);
            if (resolvedAward) applyPointLocally(resolvedAward, activeSet);
            return;
        }

        try {
            const res = await fetch(`/api/matches/${matchId}/violation`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) { const d = await res.json(); setError(d.detail || "Failed."); }
        } catch {
            const action: QueuedAction = { qid, type: "violation", payload };
            const q = [...offlineQueue, action];
            setOfflineQueue(q); saveQueue(q);
            if (resolvedAward) applyPointLocally(resolvedAward, activeSet);
            setIsOnline(false); setConnPhase("offline");
        }
    }

    async function submitUndo() {
        if (match?.status !== "ongoing") {
            setError("Start the match before undoing actions.");
            return;
        }
        const token = getToken(); if (!token) return;
        setError("");

        if (!isOnline) {
            // Only reverse locally queued (unsynced) points — never queue a blind server undo
            const lastPointIdx = [...offlineQueue].map((a, i) => ({ a, i })).reverse().find(({ a }) => a.type === "point");
            if (lastPointIdx) {
                const newQ = offlineQueue.filter((_, i) => i !== lastPointIdx.i);
                setOfflineQueue(newQ); saveQueue(newQ);
                if (lastPointIdx.a.localTeam && lastPointIdx.a.localSet)
                    reversePointLocally(lastPointIdx.a.localTeam, lastPointIdx.a.localSet);
            } else {
                setError("Nothing to undo locally — reconnect to undo server-recorded actions.");
            }
            return;
        }

        try {
            const res = await fetch(`/api/matches/${matchId}/undo`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) { const d = await res.json(); setError(d.detail || "Nothing to undo."); }
        } catch {
            setIsOnline(false); setConnPhase("offline");
            setError("Went offline — reconnect to undo.");
        }
    }

    async function submitEnd() {
        if (!endWinner) return;
        if (match?.status !== "ongoing") {
            setError("Start the match before ending it.");
            return;
        }
        const token = getToken(); if (!token) return;
        setEnding(true);
        const winnerId = endWinner === "team1" ? match!.player1_id : match!.player2_id!;
        try {
            const res = await fetch(`/api/matches/${matchId}/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ winner_id: winnerId }),
            });
            if (res.ok) {
                setShowEnd(false);
                setEndWinner("");
                setMatch(prev => prev ? { ...prev, status: "completed" } : prev);
            } else {
                const d = await res.json();
                setError(d.detail || "Failed to end match.");
            }
        } catch { setError("Connection error."); }
        finally { setEnding(false); }
    }

    async function handleLeaveMatch() {
        const token = getToken(); if (!token) return;
        setLeaveLoading(true);
        try {
            const res = await fetch(`/api/referee/${matchId}/leave`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                router.push(`/matches/${matchId}`);
            } else {
                const d = await res.json();
                setError(d.detail || "Failed to invalidate match.");
            }
        } catch { setError("Connection error."); }
        finally { setLeaveLoading(false); setShowLeaveConfirm(false); }
    }

    function viewMatchResults() {
        router.push(`/matches/${matchId}`);
    }

    function exitConsole() {
        router.push("/referee");
    }

    // ── Guards ─────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="min-h-[100svh] bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm animate-pulse">Loading referee console...</div>
        </div>
    );

    if (!match) return (
        <div className="min-h-[100svh] bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm">
                {matchMissing ? "Match not found. Returning to referee hub..." : "Match not found."}
            </div>
        </div>
    );

    if (match.referee_id !== userId) return (
        <div className="min-h-[100svh] bg-zinc-950 text-white flex items-center justify-center flex-col gap-4 px-4 text-center">
            <div className="text-red-400 font-semibold">Access denied — you are not the assigned referee.</div>
            <button onClick={viewMatchResults} className="text-sm text-zinc-400 hover:text-white">
                ← Back to match
            </button>
        </div>
    );

    if (match.status === "completed") return (
        <div className="min-h-[100svh] bg-zinc-950 text-white flex items-center justify-center px-4">
            <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-zinc-900/80 p-6 flex flex-col gap-4 text-center shadow-2xl">
                <div className="flex flex-col gap-1">
                    <div className="text-green-400 font-semibold text-lg">Match Completed</div>
                    <p className="text-sm text-zinc-400">
                        The result is already saved. You can review the final score or leave the referee console.
                    </p>
                </div>
                <button
                    onClick={viewMatchResults}
                    className="w-full rounded-2xl bg-cyan-500/15 border border-cyan-500/35 px-4 py-3 text-sm font-black text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                >
                    View Results
                </button>
                <button
                    onClick={exitConsole}
                    className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-white/5 transition-colors"
                >
                    Exit Console
                </button>
            </div>
        </div>
    );

    // ── Derived state ──────────────────────────────────────────────────────────

    const currentSet = sets.find(s => s.set_number === activeSet) ?? { set_number: activeSet, player1_score: 0, player2_score: 0 };
    const t1Score    = currentSet.team1_score ?? currentSet.player1_score;
    const t2Score    = currentSet.team2_score ?? currentSet.player2_score;

    const completedSets = getSetsWon(sets);
    const t1SetsWon  = completedSets.team1;
    const t2SetsWon  = completedSets.team2;

    // Score limit / set-over derived state
    const ptsToWin     = scoreLimit ?? ruleset?.points_per_set ?? ruleset?.games_per_set ?? 21;
    const winBy        = ruleset?.win_by ?? 2;
    const effectiveMax = (() => {
        const m = ruleset?.max_points ?? null;
        return m && m > ptsToWin ? m : null;
    })();
    const currentSetWinner: "team1" | "team2" | null = (() => {
        const t1 = t1Score ?? 0, t2 = t2Score ?? 0;
        if (t1 >= ptsToWin && t1 - t2 >= winBy) return "team1";
        if (t2 >= ptsToWin && t2 - t1 >= winBy) return "team2";
        if (effectiveMax && (t1 >= effectiveMax || t2 >= effectiveMax)) return t1 > t2 ? "team1" : "team2";
        return null;
    })();
    const isCurrentSetOver = currentSetWinner !== null;

    const players = [
        { id: match.player1_id, team: "team1" as const },
        { id: match.player2_id, team: "team2" as const },
        { id: match.player3_id, team: "team1" as const },
        { id: match.player4_id, team: "team2" as const },
    ].filter(p => p.id) as { id: string; team: "team1" | "team2" }[];

    const isDoubles = match.match_format === "doubles";

    function pName(id: string | null) {
        if (!id) return "—";
        const p = profiles[id];
        return p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || id.slice(0, 8) : id.slice(0, 8) + "…";
    }

    function humanizeHistoryLabel(value: unknown): string | null {
        if (typeof value !== "string") return null;
        const cleaned = value.replace(/_/g, " ").trim();
        if (!cleaned) return null;
        return cleaned.replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    }

    function formatHistoryDescription(entry: HistoryEntry): string {
        const meta = entry.meta ?? {};
        const team = entry.team === "team1" ? "Team 1" : entry.team === "team2" ? "Team 2" : "Match";
        const scorerName = entry.player_id ? getPlayerName(entry.player_id) : null;
        const actorPlayerId = typeof meta["actor_player_id"] === "string" ? meta["actor_player_id"] : null;
        const actorName = actorPlayerId ? getPlayerName(actorPlayerId) : null;
        const causeLabel = humanizeHistoryLabel(meta["cause"]);
        const reasonLabel = humanizeHistoryLabel(meta["reason_code"]);
        const faultPlayerId = typeof meta["fault_player_id"] === "string"
            ? meta["fault_player_id"]
            : entry.player_id ?? null;
        const faultPlayerName = faultPlayerId ? getPlayerName(faultPlayerId) : null;
        const serveEvent = typeof meta["event_type"] === "string" ? meta["event_type"] : null;
        const newServingTeam = meta["new_serving_team"] === "team1"
            ? "Team 1"
            : meta["new_serving_team"] === "team2"
                ? "Team 2"
                : null;

        if (entry.event_type === "point") {
            if (meta["attribution_type"] === "winning_shot" && causeLabel) {
                return `Point -> ${team} - ${causeLabel}${scorerName ? ` by ${scorerName}` : ""}`;
            }
            if (meta["attribution_type"] === "opponent_error" && reasonLabel) {
                return `Point -> ${team} - ${reasonLabel}${actorName ? ` - error by ${actorName}` : ""} (opponent error)`;
            }
            if (causeLabel) {
                return `Point -> ${team} - ${causeLabel}${scorerName ? ` by ${scorerName}` : ""}`;
            }
        }

        if (entry.event_type === "serve_change") {
            if (serveEvent === "loss_of_serve") {
                return `Loss of serve - ${team}${faultPlayerName ? ` - ${faultPlayerName}` : ""} - Server 2 serves next`;
            }
            if (serveEvent === "side_out") {
                return `Side out - ${team}${faultPlayerName ? ` - ${faultPlayerName}` : ""}${newServingTeam ? ` - ${newServingTeam} now serving` : ""}`;
            }
        }

        return entry.description;
    }

    function otherTeam(team: "team1" | "team2"): "team1" | "team2" {
        return team === "team1" ? "team2" : "team1";
    }

    function teamLabel(team: "team1" | "team2") {
        return team === "team1" ? "Team 1" : "Team 2";
    }

    function playerTeam(playerId: string): "team1" | "team2" | null {
        return players.find(p => p.id === playerId)?.team ?? null;
    }

    function availableErrorTypes() {
        return (ruleset?.error_types ?? []).filter(e => match?.sport !== "pickleball" || e.code !== "SERVICE_FAULT");
    }

    function selectedErrorLabel() {
        return availableErrorTypes().find(e => e.code === errorType)?.label ?? errorType;
    }

    function selectedViolationLabel() {
        return ruleset?.violation_types.find(v => v.code === violCode)?.label ?? violCode;
    }

    function inferredViolationAward(playerId: string): "team1" | "team2" | "" {
        const team = playerTeam(playerId);
        if (!team) return "";
        if (match?.sport === "pickleball" && team === servingTeam) return "";
        return otherTeam(team);
    }

    const recentHistory = history.slice(-8).reverse();
    const matchIsLive = match.status === "ongoing";
    const allScoresZero = sets.length === 0 || sets.every((set) =>
        (set.team1_score ?? set.player1_score ?? 0) === 0 &&
        (set.team2_score ?? set.player2_score ?? 0) === 0
    );
    const canConfigureOpeningServe =
        match.sport === "pickleball"
        && ["pending", "pending_approval", "awaiting_players", "assembling", "ongoing"].includes(match.status)
        && allScoresZero;
    const showPreMatchOpeningServeCard = canConfigureOpeningServe && !matchIsLive;
    const showLiveOpeningServeCard = showFirstServe && canConfigureOpeningServe && matchIsLive && !firstServeConfirmed;
    const openingServerName = (() => {
        const serverIds = getTeamPlayerIds(servingTeam);
        return getPlayerName(serverIds[servingSlot] ?? serverIds[0]);
    })();
    const canStartTournamentMatch = Boolean(match.tournament_id)
        && !["ongoing", "completed", "cancelled", "invalidated"].includes(match.status);
    const lockedMessage = canStartTournamentMatch
        ? "Tournament match is ready to start"
        : match.status === "pending_approval"
            ? "Scoring is locked while court approval is pending"
            : match.status === "awaiting_players"
                ? "Scoring is locked until everyone enters the lobby"
                : "Scoring is locked until the match goes live";
    const phaseLabel = match.tournament_phase ? match.tournament_phase.replace(/_/g, " ") : null;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-[100svh] overflow-x-hidden bg-[#050b14] text-white selection:bg-cyan-500/30 font-sans">
            {/* Background Tactical Elements */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.05)_0%,transparent_50%)]" />
                <div 
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
                        backgroundSize: "40px 40px",
                    }}
                />
                <div className="absolute inset-0 animate-scanline pointer-events-none opacity-[0.01] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-20" />
            </div>

            <NavBar backHref={`/matches/${matchId}`} backLabel="← Exit Console" />

            <main
                className="relative z-10 w-full max-w-lg mx-auto px-4 py-6 flex flex-col gap-4 sm:gap-6 pt-20 sm:pt-24"
                style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
            >
                {/* Status HUD */}
                <div className="flex items-center justify-between gap-4 px-2">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black tracking-[0.4em] text-slate-500 uppercase">Overseer Console</p>
                        <h1 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                            {match.sport.replace("_", " ")}
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                        </h1>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <button
                            onClick={() => { setError(""); setShowLeaveConfirm(true); }}
                            className="text-[9px] font-black border border-rose-500/30 text-rose-500 px-3 py-1.5 rounded-xl hover:bg-rose-500/10 transition-all uppercase tracking-widest italic"
                        >
                            Invalidate
                        </button>
                        <div className={`text-[9px] font-black border px-3 py-1 rounded-xl uppercase tracking-widest ${
                            !isOnline ? "bg-amber-500/10 text-amber-500 border-amber-500/30" : 
                            syncing ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse" : 
                            "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        }`}>
                            {!isOnline ? "Signal Lost" : syncing ? "Syncing..." : "Live Sync"}
                        </div>
                    </div>
                </div>

                {!matchIsLive && (
                    <section className="rounded-[2rem] border border-amber-500/20 bg-amber-500/10 px-5 py-4 shadow-xl">
                        <p className="text-sm font-black text-amber-300">{lockedMessage}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                            Status: <span className="text-zinc-200">{match.status}</span>
                            {phaseLabel ? <> · Phase: <span className="text-zinc-200 capitalize">{phaseLabel}</span></> : null}
                            {match.checkin_deadline_at ? <> · Check-in: <span className="text-zinc-200">{new Date(match.checkin_deadline_at).toLocaleString()}</span></> : null}
                        </p>

                        {showPreMatchOpeningServeCard && (
                            <div className="mt-4 rounded-[1.5rem] border border-cyan-500/20 bg-cyan-500/5 p-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">Opening Serve</p>
                                        <p className="mt-1 text-xs text-zinc-400">
                                            Call the toss now so the referee console is ready when the match unlocks.
                                            {match.status === "pending_approval" ? " Scoring will open after the club approves the court." : ""}
                                        </p>
                                    </div>
                                    {firstServeConfirmed && (
                                        <span className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                                            Saved
                                        </span>
                                    )}
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <button
                                        onClick={() => persistOpeningServeSelection("team1")}
                                        className={`rounded-[1.25rem] border px-4 py-3 text-left transition-colors ${
                                            firstServeConfirmed && servingTeam === "team1"
                                                ? "border-cyan-500/50 bg-cyan-500/15"
                                                : "border-cyan-500/20 bg-zinc-900/60 hover:border-cyan-500/35 hover:bg-cyan-500/10"
                                        }`}
                                    >
                                        <div className="text-sm font-black text-cyan-300">Team 1 serves first</div>
                                        <div className="mt-1 text-xs text-zinc-500">
                                            {players.filter(player => player.team === "team1").map(player => pName(player.id)).join(" & ") || "Team 1"}
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => persistOpeningServeSelection("team2")}
                                        className={`rounded-[1.25rem] border px-4 py-3 text-left transition-colors ${
                                            firstServeConfirmed && servingTeam === "team2"
                                                ? "border-violet-500/50 bg-violet-500/15"
                                                : "border-violet-500/20 bg-zinc-900/60 hover:border-violet-500/35 hover:bg-violet-500/10"
                                        }`}
                                    >
                                        <div className="text-sm font-black text-violet-300">Team 2 serves first</div>
                                        <div className="mt-1 text-xs text-zinc-500">
                                            {players.filter(player => player.team === "team2").map(player => pName(player.id)).join(" & ") || "Team 2"}
                                        </div>
                                    </button>
                                </div>

                                {firstServeConfirmed && (
                                    <p className="mt-3 text-xs text-zinc-400">
                                        Opening server: <span className="font-semibold text-zinc-200">{openingServerName}</span>
                                        <span className="text-zinc-500"> · starts on the right side</span>
                                    </p>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {showLiveOpeningServeCard && (
                    <section className="rounded-[2rem] border border-cyan-500/20 bg-cyan-500/5 p-4 shadow-xl">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">Opening Serve</p>
                                <p className="mt-1 text-xs text-zinc-400">
                                    Confirm who serves first before recording the opening rally.
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <button
                                onClick={() => persistOpeningServeSelection("team1")}
                                className="rounded-[1.25rem] border border-cyan-500/20 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:border-cyan-500/35 hover:bg-cyan-500/10"
                            >
                                <div className="text-sm font-black text-cyan-300">Team 1 serves first</div>
                                <div className="mt-1 text-xs text-zinc-500">
                                    {players.filter(player => player.team === "team1").map(player => pName(player.id)).join(" & ") || "Team 1"}
                                </div>
                            </button>

                            <button
                                onClick={() => persistOpeningServeSelection("team2")}
                                className="rounded-[1.25rem] border border-violet-500/20 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:border-violet-500/35 hover:bg-violet-500/10"
                            >
                                <div className="text-sm font-black text-violet-300">Team 2 serves first</div>
                                <div className="mt-1 text-xs text-zinc-500">
                                    {players.filter(player => player.team === "team2").map(player => pName(player.id)).join(" & ") || "Team 2"}
                                </div>
                            </button>
                        </div>
                    </section>
                )}

                {/* Scoreboard Card */}
                <section className="relative overflow-hidden bg-[#0a111a]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
                    <div className="absolute top-0 left-0 w-1 h-16 bg-cyan-500/40 rounded-full translate-y-8 opacity-40" />
                    
                    {/* Teams Display */}
                    <div className="flex justify-between items-start mb-6 border-b border-white/5 pb-6">
                        <div className="space-y-1 flex-1">
                            <p className="text-[9px] font-black tracking-[0.2em] text-slate-500 uppercase">Squad Alpha</p>
                            <p className="text-[11px] font-bold text-white truncate max-w-[120px] uppercase italic">
                                {isDoubles ? "Team 1" : pName(match.player1_id)}
                            </p>
                            <div className="text-3xl sm:text-4xl font-black italic text-white">{t1SetsWon}</div>
                        </div>
                        <div className="px-4 py-2 bg-white/5 rounded-2xl flex flex-col items-center justify-center shrink-0">
                            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Sets</span>
                            <span className="text-xs font-black text-slate-400 italic">VS</span>
                        </div>
                        <div className="space-y-1 flex-1 text-right">
                            <p className="text-[9px] font-black tracking-[0.2em] text-slate-500 uppercase text-right">Squad Bravo</p>
                            <p className="text-[11px] font-bold text-white truncate max-w-[120px] uppercase italic text-right">
                                {isDoubles ? "Team 2" : pName(match.player2_id)}
                            </p>
                            <div className="text-3xl sm:text-4xl font-black italic text-white text-right">{t2SetsWon}</div>
                        </div>
                    </div>

                    {/* Active Set Focus */}
                    <div className="space-y-6">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                            <div className="px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-black text-cyan-400 uppercase tracking-[0.3em] italic">
                                Set {activeSet} Target: {ptsToWin}
                            </div>
                        </div>

                        {isCurrentSetOver && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-3 flex items-center gap-4 animate-in slide-in-from-top-2">
                                <span className="text-xl">⛔</span>
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Cycle Complete</p>
                                    <p className="text-[10px] text-zinc-500 font-medium uppercase italic">
                                        {currentSetWinner === "team1" ? "Alpha" : "Bravo"} Defeated Opponent · {t1Score}:{t2Score}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-center gap-4 sm:gap-10">
                            <div className="flex-1 flex flex-col items-center gap-3">
                                <div className={`text-6xl sm:text-7xl font-black tabular-nums italic transition-all ${servingTeam === "team1" ? "text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,0.3)]" : "text-slate-800"}`}>
                                    {t1Score}
                                </div>
                                {servingTeam === "team1" && matchIsLive && (
                                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-cyan-600">
                                        <span className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
                                        Serving
                                    </div>
                                )}
                            </div>

                            <div className="text-2xl font-black text-slate-800 italic shrink-0">/</div>

                            <div className="flex-1 flex flex-col items-center gap-3">
                                <div className={`text-6xl sm:text-7xl font-black tabular-nums italic transition-all ${servingTeam === "team2" ? "text-violet-400 drop-shadow-[0_0_15px_rgba(167,139,250,0.3)]" : "text-slate-800"}`}>
                                    {t2Score}
                                </div>
                                {servingTeam === "team2" && matchIsLive && (
                                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-violet-600">
                                        <span className="w-1 h-1 rounded-full bg-violet-500 animate-pulse" />
                                        Serving
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tactical Serve HUD (Pickleball Special) */}
                    {match.sport === "pickleball" && (
                        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col gap-4">
                            <div className="flex items-center justify-between px-2">
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Telemetry</p>
                                    <p className="text-[10px] font-black text-cyan-500 uppercase italic">
                                        {t1Score} : {t2Score} : {servingSlot + 1}
                                    </p>
                                </div>
                                {isFirstServiceSequence && (
                                    <div className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[8px] font-black text-amber-500 uppercase tracking-widest animate-pulse">
                                        Opening Ops
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: "team1", label: "Alpha", color: "cyan" },
                                    { id: "team2", label: "Bravo", color: "violet" }
                                ].map(team => {
                                    const isActive = servingTeam === team.id;
                                    const ids = getTeamPlayerIds(team.id as "team1" | "team2");
                                    const pid = isActive ? (ids[servingSlot] ?? ids[0]) : ids[0];
                                    return (
                                        <div key={team.id} className={`relative flex flex-col gap-2 p-3 rounded-2xl border transition-all ${
                                            isActive ? `bg-${team.color}-500/10 border-${team.color}-500/40 shadow-[0_0_20px_rgba(var(--${team.color}-500-rgb),0.1)]` : "bg-white/[0.02] border-white/5 opacity-40"
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? `text-${team.color}-400` : "text-slate-500"}`}>
                                                    {team.label}
                                                </span>
                                                {isActive && <span className={`w-1.5 h-1.5 rounded-full bg-${team.color}-400 animate-pulse`} />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-bold text-white truncate italic">{pid ? getPlayerName(pid) : "Offline"}</p>
                                                {isActive && (
                                                    <p className={`text-[8px] font-black uppercase tracking-widest mt-1 text-${team.color}-600`}>
                                                        S{servingSlot + 1} · {servingSide === "right" ? "Even (R)" : "Odd (L)"}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </section>

                {/* Engagement Controls */}
                <section className="flex flex-col gap-3">
                    {/* Rally Lost / Rollback Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            disabled={!matchIsLive}
                            onClick={() => openLostServeModal()}
                            className="group relative overflow-hidden bg-amber-500 text-black font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-30 flex flex-col items-center justify-center gap-0.5 italic"
                        >
                            <span className="text-xs uppercase tracking-[0.2em] relative z-10">
                                {match.sport === "pickleball" ? "Rally Lost" : "Side Out"}
                            </span>
                            <span className="text-[8px] font-black uppercase tracking-widest opacity-60 relative z-10">
                                {isDoubles && servingSlot === 0 && !isFirstServiceSequence ? "→ Server 2" : "→ Side Out"}
                            </span>
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                        </button>

                        <button
                            disabled={!matchIsLive}
                            onClick={() => submitUndo()}
                            className="bg-zinc-900 border border-white/10 hover:bg-white hover:text-black text-white font-black py-4 rounded-2xl shadow-xl transition-all active:scale-95 disabled:opacity-30 flex flex-col items-center justify-center gap-0.5 italic"
                        >
                            <span className="text-xs uppercase tracking-[0.2em]">Rollback</span>
                            <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Undo Last Op</span>
                        </button>
                    </div>

                    {/* Violation Console Button */}
                    {ruleset && ruleset.violation_types.length > 0 && (
                        <button
                            disabled={!matchIsLive}
                            onClick={() => {
                                setViolCode("");
                                setViolPlayer("");
                                setViolAward("");
                                setModal({ type: "violation" });
                            }}
                            className="w-full py-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 text-yellow-400 font-black text-xs uppercase tracking-[0.25em] italic transition-all hover:bg-yellow-500/15 active:scale-[0.98] disabled:opacity-30"
                        >
                            Violation Console
                        </button>
                    )}
                </section>

                {/* Tactical Triggers (Quick Chips) */}
                {ruleset && !isCurrentSetOver && matchIsLive && (
                    <div className="space-y-6">
                        {/* Quick Points Section */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <p className="text-[9px] font-black tracking-[0.3em] text-slate-500 uppercase">Quick Score Triggers</p>
                                <span className="text-[8px] font-black text-slate-700 uppercase italic">Serving Team Scores</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5 px-1">
                                {/* Sport-Specific Winning Shots */}
                                {(ruleset.scoring_causes ?? SCORING_CAUSES[match.sport] ?? []).map(cause => (
                                    <button
                                        key={cause}
                                        onClick={() => {
                                            const team = servingTeam;
                                            const pIds = getTeamPlayerIds(team);
                                            const pId = pIds.length === 1 ? pIds[0] : (team === servingTeam ? (pIds[servingSlot] ?? pIds[0]) : pIds[0]);
                                            if (pId) {
                                                submitPoint(team, "winning_shot", { player_id: pId, cause });
                                            } else {
                                                setAttrCause(cause);
                                                setModal({ type: "point_attribution", team, step: "winning_shot" });
                                            }
                                        }}
                                        className="flex flex-col items-center justify-center py-3.5 px-2 bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/50 text-cyan-400 rounded-2xl transition-all active:scale-95 italic"
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">
                                            {cause.replace(" winner", "")}
                                        </span>
                                        <span className="text-[7px] font-black uppercase tracking-[0.2em] text-cyan-500/50 mt-1">Winner</span>
                                    </button>
                                ))}

                                {/* Pickleball Special: Serve Winner */}
                                {match.sport === "pickleball" && (
                                    <button
                                        onClick={() => {
                                            const team = servingTeam;
                                            const pIds = getTeamPlayerIds(team);
                                            const pId = pIds[servingSlot] ?? pIds[0];
                                            submitPoint(team, "winning_shot", { player_id: pId, cause: "Serve winner" });
                                        }}
                                        className="flex flex-col items-center justify-center py-3.5 px-2 bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/50 text-emerald-400 rounded-2xl transition-all active:scale-95 italic"
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest text-center leading-tight">Serve Ops</span>
                                        <span className="text-[7px] font-black uppercase tracking-[0.2em] text-emerald-500/50 mt-1">Ace / Return Fail</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Quick Violations Section */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <p className="text-[9px] font-black tracking-[0.3em] text-slate-500 uppercase">Quick Penalties</p>
                                <span className="text-[8px] font-black text-slate-700 uppercase italic">Choose Responsible Player</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5 px-1">
                                {ruleset.violation_types.map(v => (
                                    <button
                                        key={v.code}
                                        onClick={() => {
                                            setViolCode(v.code);
                                            setViolPlayer("");
                                            setViolAward("");
                                            setModal({ type: "violation" });
                                        }}
                                        className="flex flex-col items-center justify-center py-3.5 px-2 bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/50 text-rose-400 rounded-2xl transition-all active:scale-95 italic"
                                    >
                                        <span className="text-[9px] font-black uppercase tracking-widest text-center leading-tight">
                                            {v.label.replace(" (NVZ)", "").replace(" Fault", "")}
                                        </span>
                                        <span className="text-[7px] font-black uppercase tracking-[0.2em] text-rose-500/50 mt-1">Fault / Infraction</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Intelligence Overlay (Recent History) */}
                {(offlineQueue.length > 0 || recentHistory.length > 0) && (
                    <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-5 space-y-4 shadow-xl">
                        <div className="flex items-center justify-between px-1">
                            <p className="text-[9px] font-black tracking-[0.4em] text-slate-500 uppercase">Mission History</p>
                            {offlineQueue.length > 0 && <span className="text-[8px] font-black text-amber-500 uppercase animate-pulse">Sync Pending</span>}
                        </div>
                        <div className="space-y-2.5 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                            {/* Unsynced Actions */}
                            {[...offlineQueue].reverse().map(action => (
                                <div key={action.qid} className="flex items-start gap-3 group animate-in fade-in slide-in-from-left-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-amber-200 font-bold uppercase italic tracking-tight truncate">
                                            {action.type === "point" ? `Manual Point → ${action.localTeam === "team1" ? "Alpha" : "Bravo"}` : "Tactical Command"}
                                        </p>
                                        <p className="text-[8px] text-amber-500/60 font-black uppercase tracking-widest">Awaiting Remote Confirmation</p>
                                    </div>
                                </div>
                            ))}
                            {/* Confirmed History */}
                            {recentHistory.map((e, i) => (
                                <div key={e.id} className={`flex items-start gap-3 group transition-opacity ${i === 0 && offlineQueue.length === 0 ? "opacity-100" : "opacity-40"}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 shadow-sm ${
                                        e.event_type === "point" ? (e.team === "team1" ? "bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]" : "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.3)]") : "bg-slate-600"
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-slate-200 font-bold uppercase italic tracking-tight truncate">{formatHistoryDescription(e)}</p>
                                        {e.team1_score !== null && (
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Score Now · {e.team1_score}:{e.team2_score}</p>
                                        )}
                                    </div>
                                    <span className="text-[8px] text-slate-600 font-black italic mt-1.5">
                                        {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Operational Parameters (Rules & Settings) */}
                <section className="bg-zinc-900/40 border border-white/5 rounded-[2rem] p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black tracking-[0.4em] text-slate-600 uppercase">Tactical Parameters</p>
                        <div className="h-px flex-1 bg-white/5 mx-4" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { l: "Pts to Win", v: ptsToWin },
                            { l: "Sets to Win", v: ruleset?.sets_to_win ?? 2 },
                            { l: "Win by Margin", v: ruleset?.win_by ?? 2 },
                            { l: "Max Threshold", v: effectiveMax ?? "None" }
                        ].map(stat => (
                            <div key={stat.l} className="space-y-0.5">
                                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{stat.l}</p>
                                <p className="text-sm font-black text-slate-300 italic">{stat.v}</p>
                            </div>
                        ))}
                    </div>

                    {ruleset?.points_per_set && (
                        <div className="space-y-3 pt-2">
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Score Limit Override</p>
                            <div className="flex gap-2">
                                {([11, 15, 21] as const).map(n => (
                                    <button
                                        key={n}
                                        onClick={() => changeScoreLimit(n)}
                                        className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition-all italic ${
                                            (scoreLimit ?? ruleset.points_per_set) === n
                                                ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                                                : "bg-white/5 border-white/5 text-slate-600 hover:text-white"
                                        }`}
                                    >
                                        {n} PTS
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        disabled={!matchIsLive || offlineQueue.length > 0}
                        onClick={() => setShowEnd(true)}
                        className={`w-full py-4 rounded-2xl border font-black text-xs uppercase tracking-[0.2em] transition-all italic ${
                            !matchIsLive || offlineQueue.length > 0
                                ? "border-white/5 text-slate-700 cursor-not-allowed"
                                : "border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-black shadow-xl"
                        }`}
                    >
                        {offlineQueue.length > 0 ? "Sync Pending Data" : "Initialize Mission Completion"}
                    </button>
                </section>
            </main>

            {/* ── Lost serve / Side out modal ── */}
            {modal.type === "lost_serve" && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center px-4 pb-6" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-bold text-sm text-amber-400">
                                    {match.sport === "pickleball" ? "Rally Lost — No Point" : "Lost Serve"}
                                </h2>
                                {match.sport === "pickleball" && (
                                    <p className="text-[11px] text-zinc-500 mt-0.5">Receiving team won · serving team rotates</p>
                                )}
                            </div>
                            <button onClick={() => { setModal({ type: "none" }); setLostServeFaulter(""); }}
                                className="text-zinc-500 hover:text-white text-lg">✕</button>
                        </div>

                        {/* Outcome preview */}
                        <div className={`rounded-xl p-4 border ${
                            isDoubles && servingSlot === 0 && !isFirstServiceSequence
                                ? "bg-amber-500/10 border-amber-500/30"
                                : "bg-red-500/10 border-red-500/30"
                        }`}>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
                                {match.sport === "pickleball" ? "Serve Rotation" : "Result"}
                            </div>
                            {isDoubles && servingSlot === 0 && !isFirstServiceSequence ? (
                                <>
                                    <div className="text-sm font-black text-amber-300">Server 2 serves next</div>
                                    <div className="text-xs text-zinc-400 mt-1">
                                        {getPlayerName(getTeamPlayerIds(servingTeam)[1])} serves from the right side · same team · no point
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-sm font-black text-red-400">Side Out</div>
                                    <div className="text-xs text-zinc-400 mt-1">
                                        {servingTeam === "team1" ? "Team 2" : "Team 1"} serves from the right side · no point awarded
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Who faulted — only shown for doubles (singles auto-resolved) */}
                        {players.filter(p => p.team === servingTeam).length > 1 && (
                            <div>
                                <div className="text-xs text-zinc-500 mb-2">
                                    {match.sport === "pickleball" ? "Serving player who lost the rally?" : "Who faulted?"}
                                    <span className="text-zinc-700 ml-1">(optional)</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 max-[280px]:grid-cols-1">
                                    {players.filter(p => p.team === servingTeam).map(p => (
                                        <button key={p.id}
                                            onClick={() => setLostServeFaulter(lostServeFaulter === p.id ? "" : p.id)}
                                            className={`text-xs py-2 px-3 rounded-lg border transition-colors ${
                                                lostServeFaulter === p.id
                                                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                                                    : "border-white/10 text-zinc-400 hover:border-white/20"
                                            }`}
                                        >{pName(p.id)}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleLostServe}
                            className="font-black py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 transition-all active:scale-95"
                        >
                            {isDoubles && servingSlot === 0 && !isFirstServiceSequence
                                ? "→ Advance to Server 2"
                                : "→ Confirm Side Out"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Point attribution modal ── */}
            {modal.type === "point_attribution" && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center px-4 pb-6" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-bold text-sm">
                                    Point → {modal.team === "team1" ? "Team 1" : "Team 2"}
                                </h2>
                                {modal.step !== "cause_type" && (
                                    <button onClick={() => setModal({ ...modal, step: "cause_type" })}
                                        className="text-xs text-zinc-500 hover:text-zinc-300 mt-0.5">← Back</button>
                                )}
                            </div>
                            <button onClick={() => { setModal({ type: "none" }); setAttrPlayer(""); setAttrCause(""); setErrorType(""); setErrorPlayer(""); setOtherNote(""); }}
                                className="text-zinc-500 hover:text-white text-lg">✕</button>
                        </div>

                        {/* Step 1: Cause type */}
                        {modal.step === "cause_type" && (
                            <div className="flex flex-col gap-2">
                                <div className="text-xs text-zinc-500 mb-1">How was this point scored? <span className="text-red-400">*</span></div>
                                <button
                                    onClick={() => setModal({ ...modal, step: "winning_shot" })}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-cyan-500/40 hover:bg-cyan-500/5 text-left transition-colors"
                                >
                                    <span className="text-xl">🎯</span>
                                    <div>
                                        <div className="text-sm font-semibold text-white">Winning Shot</div>
                                        <div className="text-xs text-zinc-500">Scorer + shot type required</div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setModal({ ...modal, step: "serve" })}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 text-left transition-colors"
                                >
                                    <span className="text-xl">🏓</span>
                                    <div>
                                        <div className="text-sm font-semibold text-white">Score by Serve</div>
                                        <div className="text-xs text-zinc-500">
                                            {match.sport === "pickleball"
                                                ? "Receiver couldn't return the serve"
                                                : "Ace, serve winner, or service fault"}
                                        </div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setModal({ ...modal, step: "opponent_error" })}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-red-500/40 hover:bg-red-500/5 text-left transition-colors"
                                >
                                    <span className="text-xl">❌</span>
                                    <div>
                                        <div className="text-sm font-semibold text-white">Opponent Error</div>
                                        <div className="text-xs text-zinc-500">Error player + error type required</div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setModal({ ...modal, step: "other" })}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-white/20 text-left transition-colors"
                                >
                                    <span className="text-xl">📝</span>
                                    <div>
                                        <div className="text-sm font-semibold text-zinc-300">Other</div>
                                        <div className="text-xs text-zinc-500">Brief explanation required</div>
                                    </div>
                                </button>
                            </div>
                        )}

                        {/* Step 2d: Score by Serve */}
                        {modal.step === "serve" && (() => {
                            // The current server is always the scorer on a serve winner
                            const serverIds = getTeamPlayerIds(servingTeam);
                            const currentServerId = serverIds[servingSlot] ?? serverIds[0];
                            return (
                            <div className="flex flex-col gap-2">
                                <div className="text-xs text-zinc-500 mb-1">Select serve outcome</div>
                                {currentServerId && (
                                    <div className="text-[11px] text-zinc-500 px-1 mb-1">
                                        Server: <span className="text-white font-semibold">{getPlayerName(currentServerId)}</span>
                                        {match.sport === "pickleball" && (
                                            <span className="ml-1 text-zinc-600">· Server {servingSlot + 1} · {servingSide === "right" ? "Right" : "Left"} side</span>
                                        )}
                                    </div>
                                )}
                                <button
                                    onClick={() => submitPoint(modal.team, "winning_shot", { player_id: currentServerId, cause: "Serve winner" })}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 text-left transition-colors"
                                >
                                    <span className="text-xl">🏅</span>
                                    <div>
                                        <div className="text-sm font-semibold text-white">Serve Winner</div>
                                        <div className="text-xs text-zinc-500">
                                            {match.sport === "pickleball"
                                                ? "Receiver couldn't return the serve"
                                                : "Serve touched but couldn't be returned"}
                                        </div>
                                    </div>
                                </button>
                                {/* Service Fault: in pickleball this triggers serve rotation (no point) — handled via Rally Lost */}
                                {match.sport !== "pickleball" && (
                                    <button
                                        onClick={() => submitPoint(modal.team, "opponent_error", { cause: "Service fault" })}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-red-500/40 hover:bg-red-500/5 text-left transition-colors"
                                    >
                                        <span className="text-xl">❌</span>
                                        <div>
                                            <div className="text-sm font-semibold text-white">Service Fault</div>
                                            <div className="text-xs text-zinc-500">Opponent&apos;s serve was illegal or out</div>
                                        </div>
                                    </button>
                                )}
                                {/* Let replay: not called in modern pickleball (post-2021 rule) */}
                                {match.sport !== "pickleball" && (
                                    <button
                                        onClick={() => submitPoint(modal.team, "other", { cause: "Let replay" })}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-white/20 text-left transition-colors"
                                    >
                                        <span className="text-xl">🔄</span>
                                        <div>
                                            <div className="text-sm font-semibold text-zinc-300">Let (Replay)</div>
                                            <div className="text-xs text-zinc-500">Serve clipped the net, awarded replay</div>
                                        </div>
                                    </button>
                                )}
                                {match.sport === "pickleball" && (
                                    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-800/60 border border-white/5">
                                        <span className="text-zinc-500 text-sm mt-0.5">ℹ️</span>
                                        <p className="text-xs text-zinc-500">
                                            Service faults and let replays are not called in pickleball.
                                            If the serving team faulted, use <span className="text-amber-400 font-semibold">Rally Lost</span> instead.
                                        </p>
                                    </div>
                                )}
                            </div>
                            );
                        })()}

                        {/* Step 2a: Winning shot — scorer + shot type both required */}
                        {modal.step === "winning_shot" && (() => {
                            const valid = !!attrPlayer && !!attrCause;
                            const missingPlayer = !attrPlayer;
                            const missingCause  = !attrCause;
                            return (
                                <div className="flex flex-col gap-4">
                                    <div>
                                        <div className="text-xs mb-2">
                                            <span className={missingPlayer ? "text-red-400 font-semibold" : "text-zinc-500"}>
                                                Scoring player {missingPlayer ? "— required ✱" : ""}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 max-[280px]:grid-cols-1">
                                            {players.filter(p => p.team === modal.team).map(p => (
                                                <button key={p.id}
                                                    onClick={() => setAttrPlayer(attrPlayer === p.id ? "" : p.id)}
                                                    className={`text-xs py-2 px-3 rounded-lg border transition-colors ${
                                                        attrPlayer === p.id ? "border-cyan-500 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-zinc-400 hover:border-white/20"
                                                    }`}
                                                >{pName(p.id)}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs mb-2">
                                            <span className={missingCause ? "text-red-400 font-semibold" : "text-zinc-500"}>
                                                Shot type {missingCause ? "— required ✱" : ""}
                                            </span>
                                        </div>
                                        <select value={attrCause} onChange={e => setAttrCause(e.target.value)}
                                            className={`w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors ${
                                                missingCause ? "border border-red-500/50 focus:border-red-400" : "border border-white/10 focus:border-cyan-500/50"
                                            }`}>
                                            <option value="">— Select shot type —</option>
                                            {(ruleset?.scoring_causes ?? SCORING_CAUSES[match.sport] ?? SCORING_CAUSES.badminton).map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {!valid && (
                                        <p className="text-xs text-red-400 text-center">
                                            {missingPlayer && missingCause ? "Select the scoring player and shot type." :
                                             missingPlayer ? "Select which player made the winning shot." :
                                             "Select the shot type."}
                                        </p>
                                    )}
                                    <button
                                        disabled={!valid}
                                        onClick={() => submitPoint(modal.team, "winning_shot", { player_id: attrPlayer, cause: attrCause })}
                                        className={`font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                                            modal.team === "team1" ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300" : "bg-violet-500/20 border border-violet-500/40 text-violet-300"
                                        }`}
                                    >Confirm Point</button>
                                </div>
                            );
                        })()}

                        {/* Step 2b: Opponent error - choose error first, then responsible player */}
                        {modal.step === "opponent_error" && (() => {
                            const valid = !!errorType && !!errorPlayer;
                            const responsiblePlayers = players.filter(p => p.team !== modal.team);
                            return (
                                <div className="flex flex-col gap-4">
                                    {!errorType ? (
                                        <div>
                                            <div className="text-xs mb-2">
                                                <span className="text-red-400 font-semibold">What error happened?</span>
                                            </div>
                                            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                                                {availableErrorTypes().map(e => (
                                                    <button key={e.code}
                                                        onClick={() => { setErrorType(e.code); setErrorPlayer(""); }}
                                                        className="text-xs text-left px-3 py-2 rounded-lg border border-white/10 text-zinc-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 transition-colors"
                                                    >{e.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-red-400">Selected Error</div>
                                                <div className="mt-1 flex items-center justify-between gap-3">
                                                    <p className="text-sm font-bold text-white">{selectedErrorLabel()}</p>
                                                    <button onClick={() => { setErrorType(""); setErrorPlayer(""); }} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-300">
                                                        Change
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs mb-2">
                                                    <span className={!errorPlayer ? "text-red-400 font-semibold" : "text-zinc-500"}>
                                                        Who committed it {!errorPlayer ? "- required" : ""}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 max-[280px]:grid-cols-1">
                                                    {responsiblePlayers.map(p => (
                                                        <button key={p.id}
                                                            onClick={() => setErrorPlayer(errorPlayer === p.id ? "" : p.id)}
                                                            className={`text-xs py-2 px-3 rounded-lg border transition-colors ${
                                                                errorPlayer === p.id ? "border-red-500 bg-red-500/10 text-red-300" : "border-white/10 text-zinc-400 hover:border-white/20"
                                                            }`}
                                                        >{pName(p.id)}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    {!valid && (
                                        <p className="text-xs text-red-400 text-center">
                                            {!errorType ? "Select the error first." : "Select the responsible player."}
                                        </p>
                                    )}
                                    <button
                                        disabled={!valid}
                                        onClick={() => submitPoint(modal.team, "opponent_error", { actor_player_id: errorPlayer, reason_code: errorType })}
                                        className="font-bold py-3 rounded-xl transition-all active:scale-95 bg-red-500/20 border border-red-500/40 text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >Confirm Opponent Error</button>
                                </div>
                            );
                        })()}

                        {/* Step 2c: Other — brief note required */}
                        {modal.step === "other" && (
                            <div className="flex flex-col gap-4">
                                <div>
                                    <div className="text-xs mb-2">
                                        <span className={!otherNote.trim() ? "text-red-400 font-semibold" : "text-zinc-500"}>
                                            Brief explanation {!otherNote.trim() ? "— required ✱" : ""}
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={otherNote}
                                        onChange={e => setOtherNote(e.target.value)}
                                        placeholder="e.g. let replay, net cord winner…"
                                        maxLength={80}
                                        className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    />
                                </div>
                                {!otherNote.trim() && (
                                    <p className="text-xs text-red-400 text-center">Enter a brief explanation for this point.</p>
                                )}
                                <button
                                    disabled={!otherNote.trim()}
                                    onClick={() => submitPoint(modal.team, "other", { cause: otherNote.trim() })}
                                    className="font-bold py-3 rounded-xl transition-all active:scale-95 border border-white/20 text-zinc-300 bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                >Confirm Point</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Violation modal ── */}
            {modal.type === "violation" && ruleset && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center px-4 pb-6" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4 overflow-y-auto max-h-[85vh]">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-sm text-yellow-400">Record Violation</h2>
                            <button onClick={() => { setModal({ type: "none" }); setViolPlayer(""); setViolCode(""); setViolAward(""); }}
                                className="text-zinc-500 hover:text-white text-lg">✕</button>
                        </div>

                        {(() => {
                            const violatorTeam = violPlayer ? playerTeam(violPlayer) : null;
                            const resolvedAward = violPlayer ? inferredViolationAward(violPlayer) : "";
                            const isServingTeamRallyLoss = Boolean(
                                violPlayer && match.sport === "pickleball" && violatorTeam === servingTeam
                            );
                            const outcomeText = !violPlayer
                                ? ""
                                : isServingTeamRallyLoss
                                    ? `Serving team rally loss: no point, ${isDoubles ? "serve rotates" : "serve changes"}.`
                                    : resolvedAward
                                        ? `Point will be awarded to ${teamLabel(resolvedAward)}.`
                                        : "Violation will be recorded without an automatic point.";

                            return (
                                <>
                                    {!violCode ? (
                                        <div>
                                            <div className="text-xs mb-2">
                                                <span className="text-yellow-400 font-semibold">What violation happened?</span>
                                            </div>
                                            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                                                {ruleset.violation_types.map(v => (
                                                    <button
                                                        key={v.code}
                                                        onClick={() => { setViolCode(v.code); setViolPlayer(""); setViolAward(""); }}
                                                        className="text-xs text-left px-3 py-2 rounded-lg border border-white/10 text-zinc-300 hover:border-yellow-500/40 hover:bg-yellow-500/10 hover:text-yellow-200 transition-colors"
                                                    >
                                                        {v.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Selected Violation</div>
                                                <div className="mt-1 flex items-center justify-between gap-3">
                                                    <p className="text-sm font-bold text-white">{selectedViolationLabel()}</p>
                                                    <button
                                                        onClick={() => { setViolCode(""); setViolPlayer(""); setViolAward(""); }}
                                                        className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-yellow-300"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-xs mb-2">
                                                    <span className={!violPlayer ? "text-yellow-400 font-semibold" : "text-zinc-500"}>
                                                        Who is responsible {!violPlayer ? "- required" : ""}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 max-[280px]:grid-cols-1">
                                                    {players.map(p => (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => { setViolPlayer(violPlayer === p.id ? "" : p.id); setViolAward(""); }}
                                                            className={`text-xs py-2 px-3 rounded-lg border transition-colors ${
                                                                violPlayer === p.id
                                                                    ? "border-yellow-500 bg-yellow-500/10 text-yellow-300"
                                                                    : "border-white/10 text-zinc-400 hover:border-white/20"
                                                            }`}
                                                        >
                                                            {pName(p.id)}
                                                            <span className="ml-1 text-zinc-600">{teamLabel(p.team)}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {violPlayer && (
                                                <div className="rounded-xl border border-white/10 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
                                                    {outcomeText}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {(!violCode || !violPlayer) && (
                                        <p className="text-xs text-yellow-300/80 text-center">
                                            {!violCode ? "Select the violation first." : "Select the responsible player."}
                                        </p>
                                    )}

                                    <button
                                        onClick={submitViolation}
                                        disabled={!violPlayer || !violCode}
                                        className="w-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Record Violation
                                    </button>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* ── End match modal ── */}
            {showLeaveConfirm && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center px-4">
                    <div className="w-full max-w-sm rounded-3xl border border-rose-500/25 bg-zinc-950/95 p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-rose-400">Invalidate Match</p>
                                <h2 className="mt-2 text-lg font-black text-white">Leave referee station?</h2>
                            </div>
                            <button
                                onClick={() => !leaveLoading && setShowLeaveConfirm(false)}
                                className="text-zinc-500 hover:text-white transition-colors"
                                aria-label="Close invalidate dialog"
                            >
                                x
                            </button>
                        </div>

                        <p className="mt-3 text-sm text-zinc-400">
                            This will invalidate the match for everyone and release the court if one is assigned.
                        </p>

                        {match.status === "pending_approval" && (
                            <p className="mt-2 text-xs text-amber-300">
                                This match is still waiting for club approval, but you can invalidate it now.
                            </p>
                        )}

                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setShowLeaveConfirm(false)}
                                disabled={leaveLoading}
                                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-300 hover:bg-white/5 transition-colors disabled:opacity-50"
                            >
                                Keep Match
                            </button>
                            <button
                                onClick={handleLeaveMatch}
                                disabled={leaveLoading}
                                className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-black text-rose-300 hover:bg-rose-500/15 transition-colors disabled:opacity-50"
                            >
                                {leaveLoading ? "Invalidating..." : "Invalidate"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showEnd && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center px-4">
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 overflow-y-auto max-h-[90vh]">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-bold">End Match — Select Winner</h2>
                                {endWinner && <p className="text-xs text-green-400 mt-0.5">Winner auto-detected from score</p>}
                            </div>
                            <button onClick={() => { setShowEnd(false); setEndWinner(""); }}
                                className="text-zinc-500 hover:text-white text-lg">✕</button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 max-[280px]:grid-cols-1">
                            <button
                                onClick={() => setEndWinner("team1")}
                                className={`py-4 rounded-xl border font-bold text-sm transition-all ${
                                    endWinner === "team1"
                                        ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                                        : "border-white/10 text-zinc-400 hover:border-white/20"
                                }`}
                            >
                                Team 1 Wins
                                <div className="text-xs text-zinc-500 font-normal mt-1">
                                    {isDoubles ? `${pName(match.player1_id)} & ${pName(match.player3_id)}` : pName(match.player1_id)}
                                </div>
                            </button>
                            <button
                                onClick={() => setEndWinner("team2")}
                                className={`py-4 rounded-xl border font-bold text-sm transition-all ${
                                    endWinner === "team2"
                                        ? "border-violet-500 bg-violet-500/20 text-violet-300"
                                        : "border-white/10 text-zinc-400 hover:border-white/20"
                                }`}
                            >
                                Team 2 Wins
                                <div className="text-xs text-zinc-500 font-normal mt-1">
                                    {isDoubles ? `${pName(match.player2_id)} & ${pName(match.player4_id)}` : pName(match.player2_id)}
                                </div>
                            </button>
                        </div>

                        {offlineQueue.length > 0 && (
                            <p className="text-xs text-orange-400 text-center">
                                Sync {offlineQueue.length} pending action{offlineQueue.length !== 1 ? "s" : ""} before confirming the result.
                            </p>
                        )}
                        <button
                            onClick={submitEnd}
                            disabled={!endWinner || ending || offlineQueue.length > 0}
                            className="w-full bg-red-500/20 border border-red-500/40 text-red-300 font-bold py-3 rounded-xl transition-all disabled:opacity-40"
                        >
                            {ending ? "Ending…" : "Confirm & End Match"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Connection Status Modal ── */}
            {connPhase !== "online" && (
                <div
                    className={`fixed inset-0 z-40 flex px-4 ${
                        connPhase === "syncing"
                            ? "items-center justify-center bg-black/55 backdrop-blur-[2px]"
                            : "items-end justify-center pb-8 pointer-events-none"
                    }`}
                >
                    <div className={`pointer-events-auto w-full max-w-sm rounded-2xl px-5 py-4 shadow-2xl border flex flex-col gap-3 transition-all ${
                        connPhase === "offline"
                            ? "bg-zinc-950 border-orange-500/40"
                            : connPhase === "syncing"
                                ? "bg-zinc-950 border-blue-500/40"
                                : "bg-zinc-950 border-emerald-500/40"
                    }`} style={{ animation: "fadeInUp 0.25s ease-out" }}>

                        {/* Header row */}
                        <div className="flex items-center gap-3">
                            {connPhase === "offline" && (
                                <>
                                    <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0 text-lg">📵</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-orange-300 text-sm leading-tight">No Connection</p>
                                        <p className="text-xs text-zinc-500 mt-0.5">Actions are saved locally and will sync when you&apos;re back online</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 uppercase tracking-widest">
                                        Offline
                                    </span>
                                </>
                            )}
                            {connPhase === "syncing" && (
                                <>
                                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                                        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-blue-300 text-sm leading-tight">Back to Online</p>
                                        <p className="text-xs text-zinc-500 mt-0.5">
                                            Wait for a moment while we save your records online.
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 uppercase tracking-widest">
                                        Syncing
                                    </span>
                                </>
                            )}
                            {connPhase === "synced" && (
                                <>
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 text-lg">✅</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-emerald-300 text-sm leading-tight">Back to Online</p>
                                        <p className="text-xs text-zinc-500 mt-0.5">Offline records saved online successfully. You can continue scoring.</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase tracking-widest">
                                        Saved
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Progress bar — only during syncing */}
                        {connPhase === "syncing" && (
                            <>
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-3 text-[11px] text-blue-100">
                                    <div className="font-semibold text-blue-200">Back to Online</div>
                                    <div className="mt-1 text-zinc-300">Wait for a moment to save records online.</div>
                                    <div className="mt-1 text-zinc-500">
                                        Saving {Math.max(offlineQueue.length, 1)} offline action{Math.max(offlineQueue.length, 1) !== 1 ? "s" : ""}.
                                        This usually finishes within 5 seconds.
                                    </div>
                                </div>
                                <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                                    <div className="h-full bg-blue-500/60 rounded-full animate-pulse" style={{ width: "60%" }} />
                                </div>
                            </>
                        )}

                        {/* Dismiss bar — synced */}
                        {connPhase === "synced" && (
                            <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500/60 rounded-full"
                                    style={{ animation: `shrink ${RECONNECT_NOTICE_MS}ms linear forwards` }} />
                            </div>
                        )}

                        {/* Offline queued actions list */}
                        {connPhase === "offline" && offlineQueue.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {offlineQueue.slice(-5).map((a, i) => (
                                    <span key={a.qid} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
                                        {i === 0 && offlineQueue.length > 5 ? `+${offlineQueue.length - 5} more · ` : ""}
                                        {a.type}
                                    </span>
                                ))}
                                <span className="text-[10px] text-zinc-600 ml-1 self-center">{offlineQueue.length} pending</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Set Won Modal ── */}
            {setWonInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto bg-zinc-950/95 border border-white/10 rounded-3xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl max-w-xs w-full mx-4"
                        style={{ animation: "fadeInScale 0.3s ease-out" }}>
                        <div className="text-5xl animate-bounce select-none">🏆</div>
                        <div className="text-[11px] font-black tracking-[0.3em] uppercase text-zinc-500">
                            Set {setWonInfo.setNumber} Complete
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-black text-white leading-tight">
                                {setWonInfo.winner === "team1" ? "Team 1" : "Team 2"}
                            </p>
                            <p className="text-sm text-zinc-400 mt-0.5">wins the set</p>
                        </div>
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-6 py-3">
                            <span className={`text-3xl font-black tabular-nums ${setWonInfo.winner === "team1" ? "text-white" : "text-zinc-500"}`}>
                                {setWonInfo.p1Score}
                            </span>
                            <span className="text-zinc-600 font-bold text-lg">–</span>
                            <span className={`text-3xl font-black tabular-nums ${setWonInfo.winner === "team2" ? "text-white" : "text-zinc-500"}`}>
                                {setWonInfo.p2Score}
                            </span>
                        </div>
                        <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-white/20 rounded-full"
                                style={{ animation: "shrink 4s linear forwards" }} />
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes fadeInScale {
                    from { opacity: 0; transform: scale(0.85); }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes shrink {
                    from { width: 100%; }
                    to   { width: 0%; }
                }
            `}</style>
        </div>
    );
}
