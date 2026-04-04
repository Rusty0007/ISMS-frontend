"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
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
    description: string;
    set_number: number | null;
    team1_score: number | null;
    team2_score: number | null;
    created_at: string;
}

interface PlayerProfile {
    id: string;
    username: string;
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

type AttrStep = "cause_type" | "winning_shot" | "opponent_error" | "other" | "serve";

type ModalState =
    | { type: "none" }
    | { type: "point_attribution"; team: "team1" | "team2"; step: AttrStep }
    | { type: "lost_serve" }
    | { type: "violation" };

interface QueuedAction {
    qid: string;
    type: "point" | "serve_change" | "violation" | "undo";
    payload: object;
    localTeam?: "team1" | "team2";
    localSet?: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RefereeConsolePage() {
    const router  = useRouter();
    const params  = useParams();
    const matchId = params.id as string;

    const [match,    setMatch]    = useState<MatchData | null>(null);
    const [sets,     setSets]     = useState<SetData[]>([]);
    const [history,  setHistory]  = useState<HistoryEntry[]>([]);
    const [ruleset,  setRuleset]  = useState<Ruleset | null>(null);
    const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>({});
    const [userId,   setUserId]   = useState<string | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState("");

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
    const [serveEvent,   setServeEvent]   = useState<{
        type: "fault" | "sideout";
        faulterName?: string;
        newTeam: string;
        newPlayerName: string;
        isSideout: boolean; // false = partner serves same team, true = opponent team takes serve
    } | null>(null);

    const wsRef        = useRef<WebSocket | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusRef    = useRef("ongoing");
    const syncingRef   = useRef(false);

    const [isOnline,     setIsOnline]     = useState(true);
    const [offlineQueue, setOfflineQueue] = useState<QueuedAction[]>([]);
    const [syncing,      setSyncing]      = useState(false);
    // "online" | "offline" | "syncing" | "synced"
    const [connPhase, setConnPhase] = useState<"online" | "offline" | "syncing" | "synced">("online");
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

    function offlineKey() { return `isms_offline_${matchId}`; }

    function saveQueue(q: QueuedAction[]) {
        try { localStorage.setItem(offlineKey(), JSON.stringify(q)); } catch {}
    }

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

    async function syncQueue(queue: QueuedAction[], token: string) {
        if (!queue.length || syncingRef.current) return;
        syncingRef.current = true;
        setSyncing(true);
        setConnPhase("syncing");
        let remaining = [...queue];
        for (const action of queue) {
            try {
                let res: Response;
                if (action.type === "point") {
                    res = await fetch(`/api/matches/${matchId}/point`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify(action.payload),
                    });
                } else if (action.type === "serve_change") {
                    res = await fetch(`/api/matches/${matchId}/serve-change`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify(action.payload),
                    });
                } else if (action.type === "violation") {
                    res = await fetch(`/api/matches/${matchId}/violation`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify(action.payload),
                    });
                } else {
                    res = await fetch(`/api/matches/${matchId}/undo`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}` },
                    });
                }
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
            setConnPhase("synced");
            setTimeout(() => setConnPhase("online"), 2500);
            fetchAll(token);
        } else {
            setConnPhase("online");
        }
    }

    function getToken() {
        const t = getAccessToken();
        if (!t) router.replace("/login");
        return t;
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

            if (matchRes.ok) {
                const d = await matchRes.json();
                setMatch(d.match);
                setSets(d.sets ?? []);
                if (d.sets?.length) setActiveSet(d.sets[d.sets.length - 1].set_number);

                // Show first-serve picker only if the match hasn't started yet (all scores 0)
                const allZero = (d.sets ?? []).every((s: SetData) =>
                    (s.team1_score ?? s.player1_score ?? 0) === 0 &&
                    (s.team2_score ?? s.player2_score ?? 0) === 0
                );
                if (allZero) setShowFirstServe(true);

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
    }, [matchId]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        // Get current user
        fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setUserId(d.profile?.id ?? null); });

        fetchAll(token).finally(() => setLoading(false));
    }, [fetchAll]);

    // ── WebSocket ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!matchId) return;
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
                        setSets(d.sets as SetData[]);
                        // Auto-advance to next set if one was created
                        if (typeof d.next_set === "number") {
                            setActiveSet(d.next_set as number);
                        }
                        // Show set won modal
                        if (d.set_winner) {
                            const wonSet = d.set_number_won as number;
                            const updatedSets = d.sets as { set_number: number; player1_score: number; player2_score: number }[] | undefined;
                            const finishedSet = updatedSets?.find(s => s.set_number === wonSet);
                            setSetWonInfo({
                                setNumber: wonSet,
                                winner: d.set_winner as "team1" | "team2",
                                p1Score: finishedSet?.player1_score ?? 0,
                                p2Score: finishedSet?.player2_score ?? 0,
                            });
                            setTimeout(() => setSetWonInfo(null), 4000);
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
    }, [matchId]);

    useEffect(() => { if (match?.status) statusRef.current = match.status; }, [match?.status]);

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
            const raw: QueuedAction[] = JSON.parse(localStorage.getItem(`isms_offline_${matchId}`) ?? "[]");
            const stored = migrateQueue(raw);
            if (stored.length) { setOfflineQueue(stored); saveQueue(stored); }
        } catch {}

        function handleOnline() {
            setIsOnline(true);
            const token = getAccessToken();
            if (!token) return;
            try {
                const raw: QueuedAction[] = JSON.parse(localStorage.getItem(`isms_offline_${matchId}`) ?? "[]");
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
            setConnPhase("offline");
        }

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
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
        return p ? `@${p.username}` : "Player";
    }

    function getTeamPlayerIds(team: "team1" | "team2"): string[] {
        if (!match) return [];
        return (team === "team1"
            ? [match.player1_id, match.player3_id]
            : [match.player2_id, match.player4_id]
        ).filter(Boolean) as string[];
    }

    function showServeEvent(evt: typeof serveEvent) {
        setServeEvent(evt);
        setTimeout(() => setServeEvent(null), 5000);
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
        const token = getToken(); if (!token) return;
        if (!violPlayer || !violCode) { setError("Select player and violation type."); return; }
        setError("");
        const qid = crypto.randomUUID();
        const payload = { player_id: violPlayer, violation_code: violCode, set_number: activeSet, award_point_to: violAward || null, client_action_id: qid };
        setModal({ type: "none" });

        // Pickleball: any violation by the current server triggers the two-server rotation
        if (match?.sport === "pickleball") {
            const servingIds      = getTeamPlayerIds(servingTeam);
            const currentServerId = servingIds[servingSlot] ?? servingIds[0];
            if (violPlayer === currentServerId) {
                handleServiceFault(servingTeam, violPlayer);
            }
        }

        setViolPlayer(""); setViolCode(""); setViolAward("");

        if (!isOnline) {
            const action: QueuedAction = { qid, type: "violation", payload };
            const q = [...offlineQueue, action];
            setOfflineQueue(q); saveQueue(q);
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
            setIsOnline(false); setConnPhase("offline");
        }
    }

    async function submitUndo() {
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
                router.push(`/matches/${matchId}`);
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
                setError(d.detail || "Failed to leave match.");
            }
        } catch { setError("Connection error."); }
        finally { setLeaveLoading(false); setShowLeaveConfirm(false); }
    }

    // ── Guards ─────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm animate-pulse">Loading referee console...</div>
        </div>
    );

    if (!match) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm">Match not found.</div>
        </div>
    );

    if (match.referee_id !== userId) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center flex-col gap-4">
            <div className="text-red-400 font-semibold">Access denied — you are not the assigned referee.</div>
            <button onClick={() => router.push(`/matches/${matchId}`)} className="text-sm text-zinc-400 hover:text-white">
                ← Back to match
            </button>
        </div>
    );

    if (match.status === "completed") return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center flex-col gap-4">
            <div className="text-green-400 font-semibold text-lg">Match Completed</div>
            <button onClick={() => router.push(`/matches/${matchId}`)} className="text-sm text-cyan-400 hover:underline">
                View results →
            </button>
        </div>
    );

    // ── Derived state ──────────────────────────────────────────────────────────

    const currentSet = sets.find(s => s.set_number === activeSet) ?? { set_number: activeSet, player1_score: 0, player2_score: 0 };
    const t1Score    = currentSet.team1_score ?? currentSet.player1_score;
    const t2Score    = currentSet.team2_score ?? currentSet.player2_score;

    const t1SetsWon  = sets.filter(s => (s.team1_score ?? s.player1_score) > (s.team2_score ?? s.player2_score)).length;
    const t2SetsWon  = sets.filter(s => (s.team2_score ?? s.player2_score) > (s.team1_score ?? s.player1_score)).length;

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
        return p ? `@${p.username}` : id.slice(0, 8) + "…";
    }

    const recentHistory = history.slice(-8).reverse();

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar backHref={`/matches/${matchId}`} backLabel="← Match" />

            <main className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>

                {/* Leave match confirmation modal */}
                {showLeaveConfirm && (
                    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6">
                        <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4">
                            <h3 className="font-black text-lg text-red-400">Leave Match?</h3>
                            <p className="text-zinc-400 text-sm">
                                Leaving will <span className="text-white font-semibold">invalidate this match</span>.
                                All players will be notified and no ratings will be recorded.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowLeaveConfirm(false)}
                                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm font-semibold hover:bg-white/5 transition-colors"
                                >
                                    Stay
                                </button>
                                <button
                                    onClick={handleLeaveMatch}
                                    disabled={leaveLoading}
                                    className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-black transition-colors disabled:opacity-50"
                                >
                                    {leaveLoading ? "Leaving…" : "Leave & Invalidate"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* First serve picker */}
                {showFirstServe && !firstServeConfirmed && (
                    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-6">
                        <div className="bg-zinc-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full flex flex-col gap-5">
                            <div className="text-center">
                                <div className="text-3xl mb-2">🏓</div>
                                <h2 className="font-black text-xl text-white">Who Serves First?</h2>
                                <p className="text-zinc-400 text-sm mt-1">Call the toss and select the serving team</p>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => {
                                        setServingTeam("team1");
                                        setServingSlot(0);
                                        setServingSide("right");
                                        setIsFirstServiceSequence(true);
                                        setFirstServeConfirmed(true);
                                        setShowFirstServe(false);
                                    }}
                                    className="group w-full bg-cyan-500/10 border-2 border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/20 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                                >
                                    <div className="w-11 h-11 rounded-xl bg-cyan-500/20 flex items-center justify-center text-lg font-black text-cyan-300 shrink-0">
                                        1
                                    </div>
                                    <div className="text-left">
                                        <div className="font-black text-base text-cyan-300">Team 1 Serves</div>
                                        <div className="text-xs text-zinc-500 mt-0.5">
                                            {players.filter(p => p.team === "team1").map(p => pName(p.id)).join(" & ") || "Team 1"}
                                        </div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => {
                                        setServingTeam("team2");
                                        setServingSlot(0);
                                        setServingSide("right");
                                        setIsFirstServiceSequence(true);
                                        setFirstServeConfirmed(true);
                                        setShowFirstServe(false);
                                    }}
                                    className="group w-full bg-violet-500/10 border-2 border-violet-500/30 hover:border-violet-500/60 hover:bg-violet-500/20 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                                >
                                    <div className="w-11 h-11 rounded-xl bg-violet-500/20 flex items-center justify-center text-lg font-black text-violet-300 shrink-0">
                                        2
                                    </div>
                                    <div className="text-left">
                                        <div className="font-black text-base text-violet-300">Team 2 Serves</div>
                                        <div className="text-xs text-zinc-500 mt-0.5">
                                            {players.filter(p => p.team === "team2").map(p => pName(p.id)).join(" & ") || "Team 2"}
                                        </div>
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={() => { setShowFirstServe(false); setFirstServeConfirmed(true); }}
                                className="text-xs text-zinc-600 hover:text-zinc-400 text-center transition-colors"
                            >
                                Skip (decide later)
                            </button>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Referee Console</div>
                        <div className="text-lg font-black capitalize">{match.sport.replace("_", " ")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowLeaveConfirm(true)}
                        className="text-xs border border-red-500/30 text-red-400 px-3 py-1 rounded-full hover:bg-red-500/10 transition-colors font-semibold"
                    >
                        Leave
                    </button>
                    <span className={`text-xs border px-2.5 py-1 rounded-full font-semibold ${
                        !isOnline
                            ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                            : syncing
                                ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                : "bg-green-500/10 text-green-400 border-green-500/30"
                    }`}>
                        {!isOnline ? "Offline" : syncing ? "Syncing…" : "Live"}
                    </span>
                    </div> {/* /flex gap-2 */}
                </div>

                {/* Offline / sync banner */}
                {(!isOnline || offlineQueue.length > 0) && (
                    <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold flex flex-wrap items-center justify-between gap-2 ${
                        !isOnline
                            ? "bg-orange-500/10 border border-orange-500/40 text-orange-300"
                            : "bg-blue-500/10 border border-blue-500/40 text-blue-300"
                    }`}>
                        <span>
                            {!isOnline
                                ? `No connection — ${offlineQueue.length} action${offlineQueue.length !== 1 ? "s" : ""} queued locally`
                                : syncing
                                    ? `Syncing ${offlineQueue.length} action${offlineQueue.length !== 1 ? "s" : ""} to server…`
                                    : `${offlineQueue.length} action${offlineQueue.length !== 1 ? "s" : ""} pending sync`
                            }
                        </span>
                        {isOnline && !syncing && offlineQueue.length > 0 && (
                            <button
                                onClick={() => { const t = getAccessToken(); if (t) syncQueue(offlineQueue, t); }}
                                className="text-xs underline opacity-80 hover:opacity-100"
                            >Sync now</button>
                        )}
                    </div>
                )}

                {/* Scoreboard */}
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
                    {/* Sets won */}
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-center flex-1 min-w-0">
                            <div className="text-xs text-zinc-500 mb-1">Team 1</div>
                            <div className="text-xs text-zinc-600 truncate px-1">
                                {isDoubles ? `${pName(match.player1_id)} & ${pName(match.player3_id)}` : pName(match.player1_id)}
                            </div>
                        </div>
                        <div className="text-xs text-zinc-600 px-3 shrink-0">Sets</div>
                        <div className="text-center flex-1 min-w-0">
                            <div className="text-xs text-zinc-500 mb-1">Team 2</div>
                            <div className="text-xs text-zinc-600 truncate px-1">
                                {isDoubles ? `${pName(match.player2_id)} & ${pName(match.player4_id)}` : pName(match.player2_id)}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-6">
                        <div className="text-5xl sm:text-6xl font-black tabular-nums">{t1SetsWon}</div>
                        <div className="text-2xl text-zinc-600 font-bold">—</div>
                        <div className="text-5xl sm:text-6xl font-black tabular-nums">{t2SetsWon}</div>
                    </div>

                    {/* Current set score */}
                    <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <div className="text-xs text-zinc-500">Set {activeSet}</div>
                            {ruleset && (
                                <div className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
                                    {ptsToWin} to win
                                </div>
                            )}
                        </div>

                        {/* ── Set-complete warning ── */}
                        {isCurrentSetOver && (
                            <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
                                <span className="text-amber-400 text-lg shrink-0">⛔</span>
                                <div>
                                    <p className="text-amber-400 text-xs font-black">Set {activeSet} is complete — no more points can be scored</p>
                                    <p className="text-zinc-500 text-[11px] mt-0.5">
                                        {currentSetWinner === "team1" ? "Team 1" : "Team 2"} wins this set &nbsp;·&nbsp; {t1Score}–{t2Score}
                                        {sets.length > activeSet && ` · Switch to Set ${activeSet + 1} to continue`}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-center gap-8">
                            {/* Team 1 Quick Actions */}
                            <div className="flex flex-col items-center gap-3">
                                <div className={`text-4xl sm:text-5xl font-black tabular-nums ${servingTeam === "team1" ? "text-cyan-400" : "text-zinc-400"}`}>{t1Score}</div>
                                <div className="flex gap-1.5">
                                    {/* Pickleball: only serving team can score — hide Winner for non-serving team */}
                                    {(!isDoubles || match.sport !== "pickleball" || servingTeam === "team1") && (
                                        <button
                                            disabled={isCurrentSetOver}
                                            onClick={() => {
                                                const pIds = getTeamPlayerIds("team1");
                                                const pId = pIds.length === 1 ? pIds[0] : undefined;
                                                if (pId) submitPoint("team1", "winning_shot", { player_id: pId, cause: "Winner" });
                                                else setModal({ type: "point_attribution", team: "team1", step: "winning_shot" });
                                            }}
                                            className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-[10px] font-black text-cyan-400 uppercase tracking-tight transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Winner
                                        </button>
                                    )}
                                    {/* Pickleball: Team 1 error → receiving team wins rally (serve rotation, no point) */}
                                    {isDoubles && match.sport === "pickleball" && servingTeam === "team1" ? null : (
                                        <button
                                            disabled={isCurrentSetOver}
                                            onClick={() => {
                                                if (isDoubles && match.sport === "pickleball") {
                                                    // Team 1 (serving) committed error → serve rotation, no point
                                                    setLostServeFaulter(""); setModal({ type: "lost_serve" });
                                                } else {
                                                    const beneficiary = "team2";
                                                    const fIds = getTeamPlayerIds("team1");
                                                    const fId = fIds.length === 1 ? fIds[0] : undefined;
                                                    if (fId) submitPoint(beneficiary, "opponent_error", { actor_player_id: fId, reason_code: "UNFORCED_ERROR" });
                                                    else setModal({ type: "point_attribution", team: beneficiary, step: "opponent_error" });
                                                }
                                            }}
                                            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-[10px] font-black text-red-400 uppercase tracking-tight transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Error
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="text-xl text-zinc-700 font-bold self-start mt-2">:</div>

                            {/* Team 2 Quick Actions */}
                            <div className="flex flex-col items-center gap-3">
                                <div className={`text-4xl sm:text-5xl font-black tabular-nums ${servingTeam === "team2" ? "text-violet-400" : "text-zinc-400"}`}>{t2Score}</div>
                                <div className="flex gap-1.5">
                                    {(!isDoubles || match.sport !== "pickleball" || servingTeam === "team2") && (
                                        <button
                                            disabled={isCurrentSetOver}
                                            onClick={() => {
                                                const pIds = getTeamPlayerIds("team2");
                                                const pId = pIds.length === 1 ? pIds[0] : undefined;
                                                if (pId) submitPoint("team2", "winning_shot", { player_id: pId, cause: "Winner" });
                                                else setModal({ type: "point_attribution", team: "team2", step: "winning_shot" });
                                            }}
                                            className="px-2.5 py-1 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg text-[10px] font-black text-violet-400 uppercase tracking-tight transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Winner
                                        </button>
                                    )}
                                    {isDoubles && match.sport === "pickleball" && servingTeam === "team2" ? null : (
                                        <button
                                            disabled={isCurrentSetOver}
                                            onClick={() => {
                                                if (isDoubles && match.sport === "pickleball") {
                                                    setLostServeFaulter(""); setModal({ type: "lost_serve" });
                                                } else {
                                                    const beneficiary = "team1";
                                                    const fIds = getTeamPlayerIds("team2");
                                                    const fId = fIds.length === 1 ? fIds[0] : undefined;
                                                    if (fId) submitPoint(beneficiary, "opponent_error", { actor_player_id: fId, reason_code: "UNFORCED_ERROR" });
                                                    else setModal({ type: "point_attribution", team: beneficiary, step: "opponent_error" });
                                                }
                                            }}
                                            className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-[10px] font-black text-red-400 uppercase tracking-tight transition-all active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Error
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Set selector */}
                    {sets.length > 1 && (
                        <div className="flex gap-2 justify-center mt-3">
                            {sets.map(s => (
                                <button
                                    key={s.set_number}
                                    onClick={() => setActiveSet(s.set_number)}
                                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                                        s.set_number === activeSet
                                            ? "border-cyan-500 text-cyan-400"
                                            : "border-white/10 text-zinc-600 hover:border-white/20"
                                    }`}
                                >
                                    S{s.set_number}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Serve indicator (pickleball only) ── */}
                    {match?.sport === "pickleball" && (
                        <div className="mt-4 pt-3 border-t border-white/5">
                            {/* Score call: T1 – T2 – ServerNumber */}
                            <div className="text-center mb-2">
                                <span className="text-[11px] font-black tracking-widest text-zinc-500 uppercase">
                                    {t1Score} – {t2Score} – {servingSlot + 1}
                                </span>
                                {isFirstServiceSequence && (
                                    <span className="ml-2 text-[10px] text-amber-400 font-semibold">(opening)</span>
                                )}
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                {/* Team 1 serve indicator */}
                                <div className={`flex-1 flex flex-col items-center gap-1 py-2 px-3 rounded-xl border transition-all ${
                                    servingTeam === "team1"
                                        ? "bg-cyan-500/10 border-cyan-500/40"
                                        : "bg-transparent border-transparent opacity-30"
                                }`}>
                                    <div className="flex items-center gap-1.5">
                                        {servingTeam === "team1" && (
                                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                                        )}
                                        <span className={`text-xs font-bold ${servingTeam === "team1" ? "text-cyan-300" : "text-zinc-500"}`}>
                                            Team 1
                                        </span>
                                    </div>
                                    <span className={`text-[11px] truncate max-w-full ${servingTeam === "team1" ? "text-cyan-400" : "text-zinc-600"}`}>
                                        {(() => {
                                            const ids = getTeamPlayerIds("team1");
                                            const pid = servingTeam === "team1" ? (ids[servingSlot] ?? ids[0]) : ids[0];
                                            return pid ? getPlayerName(pid) : "—";
                                        })()}
                                    </span>
                                    {servingTeam === "team1" && (
                                        <span className="text-[10px] text-cyan-600 font-semibold">
                                            Server {servingSlot + 1} · {servingSide === "right" ? "Right ▶" : "◀ Left"}
                                        </span>
                                    )}
                                </div>

                                <span className="text-zinc-700 text-lg font-black shrink-0">🏓</span>

                                {/* Team 2 serve indicator */}
                                <div className={`flex-1 flex flex-col items-center gap-1 py-2 px-3 rounded-xl border transition-all ${
                                    servingTeam === "team2"
                                        ? "bg-violet-500/10 border-violet-500/40"
                                        : "bg-transparent border-transparent opacity-30"
                                }`}>
                                    <div className="flex items-center gap-1.5">
                                        {servingTeam === "team2" && (
                                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
                                        )}
                                        <span className={`text-xs font-bold ${servingTeam === "team2" ? "text-violet-300" : "text-zinc-500"}`}>
                                            Team 2
                                        </span>
                                    </div>
                                    <span className={`text-[11px] truncate max-w-full ${servingTeam === "team2" ? "text-violet-400" : "text-zinc-600"}`}>
                                        {(() => {
                                            const ids = getTeamPlayerIds("team2");
                                            const pid = servingTeam === "team2" ? (ids[servingSlot] ?? ids[0]) : ids[0];
                                            return pid ? getPlayerName(pid) : "—";
                                        })()}
                                    </span>
                                    {servingTeam === "team2" && (
                                        <span className="text-[10px] text-violet-600 font-semibold">
                                            Server {servingSlot + 1} · {servingSide === "right" ? "Right ▶" : "◀ Left"}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                {/* Set won — handled by global modal below */}

                {/* Serve event toast (pickleball only) */}
                {serveEvent && match?.sport === "pickleball" && (
                    <div className={`rounded-xl border px-4 py-3 text-sm text-center space-y-1 ${
                        serveEvent.type === "fault"
                            ? serveEvent.isSideout
                                ? "bg-red-500/10 border-red-500/30"
                                : "bg-amber-500/10 border-amber-500/30"
                            : "bg-blue-500/10 border-blue-500/30"
                    }`}>
                        {/* Fault line */}
                        {serveEvent.type === "fault" && (
                            <div className="font-bold text-red-400">
                                ⚠️ Service Fault — {serveEvent.faulterName}
                            </div>
                        )}

                        {/* What happens next */}
                        {serveEvent.type === "fault" && !serveEvent.isSideout ? (
                            // Partner serves — same team, no side-out
                            <div className="font-semibold text-amber-300">
                                🏓 Partner serves → <span className="text-white">{serveEvent.newPlayerName}</span>
                                <span className="text-zinc-400"> ({serveEvent.newTeam})</span>
                            </div>
                        ) : (
                            // Side-out — opponent team gets serve
                            <div className={`font-semibold ${serveEvent.type === "fault" ? "text-zinc-300" : "text-blue-300"}`}>
                                🔄 Side-out → <span className="text-white">{serveEvent.newTeam}</span>
                                {match.match_format === "doubles" && (
                                    <span className="text-zinc-400"> · {serveEvent.newPlayerName}</span>
                                )} serves
                            </div>
                        )}
                    </div>
                )}

                {/* ── Quick Points Chips ── */}
                {ruleset && !isCurrentSetOver && (
                    <div className="flex flex-col gap-2">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                            Quick Points
                            {match.sport === "pickleball" && (
                                <span className="ml-1.5 normal-case text-zinc-600 tracking-normal font-normal">· serving team scores</span>
                            )}
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar px-1">
                            {/* Pickleball: Serve Winner chip — auto-fills current server, no modal needed */}
                            {match.sport === "pickleball" && (() => {
                                const serverIds = getTeamPlayerIds(servingTeam);
                                const currentServerId = serverIds[servingSlot] ?? serverIds[0];
                                return (
                                    <button
                                        onClick={() => submitPoint(servingTeam, "winning_shot", { player_id: currentServerId, cause: "Serve winner" })}
                                        className="whitespace-nowrap px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/60 text-amber-400 rounded-xl text-xs font-black transition-all active:scale-95 shrink-0"
                                    >
                                        🏓 Serve Winner
                                    </button>
                                );
                            })()}
                            {/* Top 3 rally-winning shot types */}
                            {(ruleset.scoring_causes ?? []).slice(0, 3).map(cause => (
                                <button
                                    key={cause}
                                    onClick={() => {
                                        const team = servingTeam;
                                        const pIds = getTeamPlayerIds(team);
                                        const pId  = pIds.length === 1 ? pIds[0] : undefined;
                                        if (pId) {
                                            submitPoint(team, "winning_shot", { player_id: pId, cause });
                                        } else {
                                            // Doubles: jump straight to player selection
                                            setAttrCause(cause);
                                            setModal({ type: "point_attribution", team, step: "winning_shot" });
                                        }
                                    }}
                                    className="whitespace-nowrap px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-400 rounded-xl text-xs font-black transition-all active:scale-95 shrink-0"
                                >
                                    + {cause}
                                </button>
                            ))}
                            {/* Top 3 receiving-team errors — SERVICE_FAULT excluded for pickleball (only serving team can fault on a serve) */}
                            {(ruleset.error_types ?? [])
                                .filter(e => match.sport !== "pickleball" || e.code !== "SERVICE_FAULT")
                                .slice(0, 3)
                                .map(err => (
                                    <button
                                        key={err.code}
                                        onClick={() => {
                                            const beneficiary = servingTeam;
                                            const faulterTeam = beneficiary === "team1" ? "team2" : "team1";
                                            const fIds        = getTeamPlayerIds(faulterTeam);
                                            const fId         = fIds.length === 1 ? fIds[0] : undefined;
                                            if (fId) {
                                                submitPoint(beneficiary, "opponent_error", { actor_player_id: fId, reason_code: err.code });
                                            } else {
                                                setErrorType(err.code);
                                                setModal({ type: "point_attribution", team: beneficiary, step: "opponent_error" });
                                            }
                                        }}
                                        className="whitespace-nowrap px-4 py-2.5 bg-red-500/10 border border-red-500/30 hover:border-red-500/60 text-red-400 rounded-xl text-xs font-black transition-all active:scale-95 shrink-0"
                                    >
                                        ❌ {err.label}
                                    </button>
                                ))}
                        </div>
                    </div>
                )}

                {/* Main action buttons — side-out scoring */}
                <div className="flex flex-col gap-3 mt-1">
                    {/* Serving team scores */}
                    <button
                        disabled={isCurrentSetOver}
                        onClick={() => openPointModal(servingTeam)}
                        className={`w-full font-black py-5 text-lg sm:text-xl rounded-3xl shadow-lg transition-all active:scale-95 touch-manipulation flex flex-col items-center gap-0.5 disabled:opacity-30 disabled:pointer-events-none ${
                            servingTeam === "team1"
                                ? "bg-cyan-500/20 border-2 border-cyan-500/40 hover:bg-cyan-500/30 text-cyan-300"
                                : "bg-violet-500/20 border-2 border-violet-500/40 hover:bg-violet-500/30 text-violet-300"
                        }`}
                    >
                        <span>✓ Point Won</span>
                        <span className={`text-[10px] uppercase tracking-widest font-bold ${servingTeam === "team1" ? "text-cyan-600" : "text-violet-600"}`}>
                            {servingTeam === "team1" ? "Team 1" : "Team 2"} is serving
                        </span>
                    </button>

                    {/* Receiving team wins rally — serve rotation */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => { setLostServeFaulter(""); setModal({ type: "lost_serve" }); }}
                            className="bg-amber-500/15 border-2 border-amber-500/30 hover:bg-amber-500/25 text-amber-300 font-black py-4 text-sm rounded-2xl shadow-md transition-all active:scale-95 touch-manipulation"
                        >
                            {match.sport === "pickleball" ? "↺ Rally Lost" : "↺ Lost Serve"}
                            <div className="text-[10px] font-bold text-amber-600 mt-0.5">
                                {isDoubles && servingSlot === 0 && !isFirstServiceSequence
                                    ? "→ Server 2, no point"
                                    : "→ Side Out, no point"}
                            </div>
                        </button>
                        <button
                            onClick={() => submitUndo()}
                            className="bg-zinc-800/80 border-2 border-white/5 hover:bg-zinc-700 text-zinc-400 font-black py-4 text-sm rounded-2xl shadow-md transition-all active:scale-95 touch-manipulation"
                        >
                            ↩ Undo
                            <div className="text-[10px] font-bold text-zinc-600 mt-0.5">Last action</div>
                        </button>
                    </div>
                </div>

                {/* Quick Violations */}
                {ruleset && ruleset.violation_types.length > 0 && (
                    <div className="mt-2">
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">Quick Violations</div>
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar px-1">
                            {ruleset.violation_types.slice(0, 4).map(v => (
                                <button
                                    key={v.code}
                                    onClick={() => {
                                        setViolCode(v.code);
                                        const tIds = getTeamPlayerIds(servingTeam); // often server commits fault
                                        if (tIds.length === 1) setViolPlayer(tIds[0]);
                                        setModal({ type: "violation" });
                                    }}
                                    className="whitespace-nowrap px-4 py-2 border border-yellow-500/40 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                                >
                                    ⚠️ {v.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Secondary actions */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                    <button
                        onClick={() => setModal({ type: "violation" })}
                        className="bg-yellow-500/5 border border-yellow-500/20 text-yellow-500 hover:bg-yellow-500/10 text-xs font-black py-3 rounded-xl transition-colors touch-manipulation"
                    >
                        ⚠️ Violation
                    </button>
                    <button
                        onClick={() => { setLostServeFaulter(""); setModal({ type: "lost_serve" }); }}
                        className="bg-amber-500/5 border border-amber-500/20 text-amber-500 hover:bg-amber-500/10 text-xs font-black py-3 rounded-xl transition-colors touch-manipulation"
                    >
                        {match.sport === "pickleball" ? "↺ Rally Lost" : "↺ Lost Serve"}
                    </button>
                    {(() => {
                        const lastSet = sets.at(-1);
                        const lastSetBlank = lastSet
                            ? (lastSet.team1_score ?? lastSet.player1_score ?? 0) === 0 &&
                              (lastSet.team2_score ?? lastSet.player2_score ?? 0) === 0
                            : false;
                        const atMaxSets = ruleset ? sets.length >= ruleset.max_sets : false;
                        const canAddSet = !atMaxSets && !lastSetBlank;
                        return (
                            <button
                                disabled={!canAddSet}
                                onClick={() => {
                                    if (!canAddSet) return;
                                    const nextSet = (lastSet?.set_number ?? 0) + 1;
                                    setActiveSet(nextSet);
                                    const token = getAccessToken();
                                    if (token) fetch(`/api/matches/${matchId}/sets/${nextSet}/score`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ player1_score: 0, player2_score: 0 }),
                                    });
                                }}
                                className={`text-xs font-black py-3 rounded-xl transition-colors touch-manipulation border ${
                                    canAddSet
                                        ? "bg-white/5 border-white/10 text-zinc-500 hover:text-white"
                                        : "bg-transparent border-zinc-900 text-zinc-800 cursor-not-allowed"
                                }`}
                            >
                                + Set
                            </button>
                        );
                    })()}
                </div>

                {/* End match */}
                <button
                    onClick={() => offlineQueue.length === 0 ? setShowEnd(true) : setError("Sync all pending actions before ending the match.")}
                    className={`w-full border font-bold py-3 rounded-xl transition-colors ${
                        offlineQueue.length > 0
                            ? "border-zinc-700 text-zinc-600 cursor-not-allowed"
                            : "border-red-500/30 text-red-400 hover:bg-red-500/10"
                    }`}
                >
                    End Match
                    {offlineQueue.length > 0 && (
                        <span className="block text-xs font-normal opacity-60 mt-0.5">
                            Sync {offlineQueue.length} pending action{offlineQueue.length !== 1 ? "s" : ""} first
                        </span>
                    )}
                </button>

                {/* History timeline — pending (unsynced) + server-confirmed */}
                {(offlineQueue.length > 0 || recentHistory.length > 0) && (
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4">
                        <div className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-3">Recent Actions</div>
                        <div className="flex flex-col gap-2">
                            {/* Pending (local, unsynced) actions */}
                            {[...offlineQueue].reverse().map(action => {
                                const p = action.payload as Record<string, unknown>;
                                let desc = "Action pending sync";
                                if (action.type === "point") {
                                    const team = p.team === "team1" ? "Team 1" : "Team 2";
                                    const at = p.attribution_type as string;
                                    if (at === "winning_shot") desc = `Point → ${team} · ${p.cause || "Winning shot"}`;
                                    else if (at === "opponent_error") desc = `Point → ${team} · ${String(p.reason_code ?? "Error").replace(/_/g, " ")}`;
                                    else desc = `Point → ${team}` + (p.cause ? ` (${p.cause})` : "");
                                } else if (action.type === "violation") {
                                    desc = `Violation: ${p.violation_code ?? "recorded"}`;
                                } else if (action.type === "undo") {
                                    desc = "Undo";
                                }
                                return (
                                    <div key={action.qid} className="flex items-start gap-2.5 text-xs">
                                        <span className="mt-0.5 shrink-0 w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                                        <div className="flex-1 flex items-center gap-2">
                                            <span className="text-orange-300">{desc}</span>
                                            <span className="text-xs text-orange-500/70 border border-orange-500/30 rounded px-1 py-0.5 leading-none">unsynced</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {/* Server-confirmed actions */}
                            {recentHistory.map((e, i) => (
                                <div key={e.id} className={`flex items-start gap-2.5 text-xs ${i === 0 && offlineQueue.length === 0 ? "opacity-100" : "opacity-60"}`}>
                                    <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                                        e.event_type === "point"     ? (e.team === "team1" ? "bg-cyan-400" : "bg-violet-400") :
                                        e.event_type === "violation" ? "bg-yellow-400" :
                                        e.event_type === "undo"      ? "bg-zinc-500" : "bg-zinc-600"
                                    }`} />
                                    <div className="flex-1">
                                        <span className="text-zinc-300">{e.description}</span>
                                        {e.team1_score !== null && e.team2_score !== null && (
                                            <span className="ml-2 text-zinc-600">{e.team1_score}:{e.team2_score}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Ruleset info */}
                {ruleset && (
                    <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 flex flex-col gap-3">
                        <div className="text-xs font-bold tracking-widest text-zinc-600 uppercase">Rules</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500">
                            <span>Points to win: <span className="text-zinc-300">{ptsToWin}</span></span>
                            <span>Sets to win: <span className="text-zinc-300">{ruleset.sets_to_win}</span></span>
                            <span>Win by: <span className="text-zinc-300">{ruleset.win_by}</span></span>
                            {effectiveMax && <span>Max: <span className="text-zinc-300">{effectiveMax}</span></span>}
                        </div>
                        {/* Score limit picker — only for point-based sports */}
                        {ruleset.points_per_set && (
                            <div>
                                <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Score limit</div>
                                <div className="flex gap-2">
                                    {([11, 15, 21] as const).map(n => (
                                        <button
                                            key={n}
                                            onClick={() => changeScoreLimit(n)}
                                            className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                                (scoreLimit ?? ruleset.points_per_set) === n
                                                    ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                                                    : "bg-zinc-800/60 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300"
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
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

                        {/* Optional: who faulted */}
                        <div>
                            <div className="text-xs text-zinc-500 mb-2">
                                {match.sport === "pickleball" ? "Serving player who lost the rally?" : "Who faulted?"}
                                <span className="text-zinc-700 ml-1">(optional)</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
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
                                        <div className="grid grid-cols-2 gap-2">
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

                        {/* Step 2b: Opponent error — error type + opponent player both required */}
                        {modal.step === "opponent_error" && (() => {
                            const valid = !!errorType && !!errorPlayer;
                            const missingType   = !errorType;
                            const missingPlayer = !errorPlayer;
                            return (
                                <div className="flex flex-col gap-4">
                                    <div>
                                        <div className="text-xs mb-2">
                                            <span className={missingType ? "text-red-400 font-semibold" : "text-zinc-500"}>
                                                Error type {missingType ? "— required ✱" : ""}
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                                            {(ruleset?.error_types ?? [])
                                                .filter(e => match.sport !== "pickleball" || e.code !== "SERVICE_FAULT")
                                                .map(e => (
                                                <button key={e.code}
                                                    onClick={() => setErrorType(errorType === e.code ? "" : e.code)}
                                                    className={`text-xs text-left px-3 py-2 rounded-lg border transition-colors ${
                                                        errorType === e.code ? "border-red-500 bg-red-500/10 text-red-300" : "border-white/10 text-zinc-400 hover:border-white/20"
                                                    }`}
                                                >{e.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs mb-2">
                                            <span className={missingPlayer ? "text-red-400 font-semibold" : "text-zinc-500"}>
                                                Opponent who committed the error {missingPlayer ? "— required ✱" : ""}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {players.filter(p => p.team !== modal.team).map(p => (
                                                <button key={p.id}
                                                    onClick={() => setErrorPlayer(errorPlayer === p.id ? "" : p.id)}
                                                    className={`text-xs py-2 px-3 rounded-lg border transition-colors ${
                                                        errorPlayer === p.id ? "border-red-500 bg-red-500/10 text-red-300" : "border-white/10 text-zinc-400 hover:border-white/20"
                                                    }`}
                                                >{pName(p.id)}</button>
                                            ))}
                                        </div>
                                    </div>
                                    {!valid && (
                                        <p className="text-xs text-red-400 text-center">
                                            {missingType && missingPlayer ? "Select the error type and opponent player." :
                                             missingType ? "Select the type of error committed." :
                                             "Select which opponent committed the error."}
                                        </p>
                                    )}
                                    <button
                                        disabled={!valid}
                                        onClick={() => submitPoint(modal.team, "opponent_error", { actor_player_id: errorPlayer, reason_code: errorType })}
                                        className="font-bold py-3 rounded-xl transition-all active:scale-95 bg-red-500/20 border border-red-500/40 text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >Confirm — Opponent Error</button>
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

                        <div>
                            <div className="text-xs text-zinc-500 mb-2">Violating player</div>
                            <div className="grid grid-cols-2 gap-2">
                                {players.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setViolPlayer(violPlayer === p.id ? "" : p.id)}
                                        className={`text-xs py-2 px-3 rounded-lg border transition-colors ${
                                            violPlayer === p.id
                                                ? "border-yellow-500 bg-yellow-500/10 text-yellow-300"
                                                : "border-white/10 text-zinc-400 hover:border-white/20"
                                        }`}
                                    >
                                        {pName(p.id)}
                                        <span className="ml-1 text-zinc-600">{p.team === "team1" ? "T1" : "T2"}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <div className="text-xs text-zinc-500 mb-2">Violation type</div>
                            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                                {ruleset.violation_types.map(v => (
                                    <button
                                        key={v.code}
                                        onClick={() => setViolCode(violCode === v.code ? "" : v.code)}
                                        className={`text-xs text-left px-3 py-2 rounded-lg border transition-colors ${
                                            violCode === v.code
                                                ? "border-yellow-500 bg-yellow-500/10 text-yellow-300"
                                                : "border-white/10 text-zinc-400 hover:border-white/20"
                                        }`}
                                    >
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <div className="text-xs text-zinc-500 mb-2">Award point to (optional)</div>
                            <div className="grid grid-cols-3 gap-2">
                                {(["team1", "team2", ""] as const).map(t => (
                                    <button
                                        key={t || "none"}
                                        onClick={() => setViolAward(t)}
                                        className={`text-xs py-2 px-2 rounded-lg border transition-colors ${
                                            violAward === t
                                                ? "border-yellow-500 bg-yellow-500/10 text-yellow-300"
                                                : "border-white/10 text-zinc-400 hover:border-white/20"
                                        }`}
                                    >
                                        {t === "team1" ? "Team 1" : t === "team2" ? "Team 2" : "None"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={submitViolation}
                            disabled={!violPlayer || !violCode}
                            className="w-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-40"
                        >
                            Record Violation
                        </button>
                    </div>
                </div>
            )}

            {/* ── End match modal ── */}
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

                        <div className="grid grid-cols-2 gap-3">
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
                <div className="fixed inset-0 z-40 flex items-end justify-center pb-8 px-4 pointer-events-none">
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
                                        <p className="font-black text-blue-300 text-sm leading-tight">Back Online — Syncing</p>
                                        <p className="text-xs text-zinc-500 mt-0.5">
                                            Saving {offlineQueue.length} offline action{offlineQueue.length !== 1 ? "s" : ""} to server…
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
                                        <p className="font-black text-emerald-300 text-sm leading-tight">All Actions Saved!</p>
                                        <p className="text-xs text-zinc-500 mt-0.5">Scores are up to date. Resuming live match…</p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase tracking-widest">
                                        Live
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Progress bar — only during syncing */}
                        {connPhase === "syncing" && (
                            <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                                <div className="h-full bg-blue-500/60 rounded-full animate-pulse" style={{ width: "60%" }} />
                            </div>
                        )}

                        {/* Dismiss bar — synced */}
                        {connPhase === "synced" && (
                            <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500/60 rounded-full"
                                    style={{ animation: "shrink 2.5s linear forwards" }} />
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
