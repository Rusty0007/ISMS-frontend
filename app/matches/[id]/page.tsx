"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20"  },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20"  },
};

interface MatchData {
    id: string;
    sport: string;
    match_type: string;
    match_format: string;
    status: string;
    player1_id: string;
    player2_id: string | null;
    player3_id: string | null;
    player4_id: string | null;
    winner_id: string | null;
    referee_id: string | null;
    tournament_id: string | null;
    tournament_phase: string | null;
    created_at: string;
    started_at: string | null;
    acceptances?: { user_id: string; decision: string }[];
}

interface SetData {
    id: string;
    set_number: number;
    player1_score: number;
    player2_score: number;
}

interface PlayerProfile {
    id: string;
    first_name: string;
    last_name: string;
}

interface RefereeInvite {
    invite_id:        string;
    invited_by:       string;
    invited_by_name:  string;
    invited_user:     string;
    invited_username: string;
    status:           "pending" | "declined" | "cancelled" | "expired";
    expires_at:       string | null;
}

interface MatchPresenceSnapshot {
    connected_player_ids: string[];
    disconnected_player_ids: string[];
    connected_player_count: number;
    disconnected_player_count: number;
    total_players: number;
    referee_id: string | null;
    referee_connected: boolean;
    disconnect_threshold: number;
    ttl_seconds: number;
    auto_invalidate_enabled: boolean;
}

const MATCH_PRESENCE_PING_MS = 20000;
type MatchConnectionState = "live" | "reconnecting" | "offline";

// ── Icons ──────────────────────────────────────────────────────────────────

function IconClock({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function IconLeave({ className = "w-4 h-4" }) {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
}

export default function MatchDetailPage() {
    const router   = useRouter();
    const params   = useParams();
    const matchId  = params.id as string;

    const [match,          setMatch]          = useState<MatchData | null>(null);
    const [sets,           setSets]           = useState<SetData[]>([]);
    const [acceptances,    setAcceptances]    = useState<{ user_id: string; decision: string }[]>([]);
    const [userId,         setUserId]         = useState<string | null>(null);
    const [playerProfiles, setPlayerProfiles] = useState<Record<string, PlayerProfile>>({});
    const [loading,        setLoading]        = useState(true);
    const [actionLoading,  setActionLoading]  = useState(false);
    const [matchMissing,   setMatchMissing]   = useState(false);
    const [error,          setError]          = useState("");
    const [showComplete,      setShowComplete]      = useState(false);
    const [showInviteReferee, setShowInviteReferee] = useState(false);
    const [refereeSearch,     setRefereeSearch]     = useState("");
    const [refereeResults,    setRefereeResults]    = useState<PlayerProfile[]>([]);
    const [pendingInvites,    setPendingInvites]    = useState<RefereeInvite[]>([]);
    const [matchLog,          setMatchLog]          = useState<{ id: string; message: string; ts: string }[]>([]);
    const [presence,          setPresence]          = useState<MatchPresenceSnapshot | null>(null);
    const [isBrowserOnline,   setIsBrowserOnline]   = useState(true);
    const [connectionState,   setConnectionState]   = useState<MatchConnectionState>("live");
    const [,                  setLastServerSyncAt]  = useState<string | null>(null);
    const [setWonInfo, setSetWonInfo] = useState<{
        setNumber: number;
        winner: "team1" | "team2";
        p1Score: number;
        p2Score: number;
    } | null>(null);
    const wsRef           = useRef<WebSocket | null>(null);
    const reconnectRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const matchStatusRef  = useRef<string>("pending"); // track terminal state for reconnect guard

    const getToken = useCallback(() => {
        const t = getAccessToken();
        if (!t) router.replace("/login");
        return t;
    }, [router]);

    // Fetch current user ID once on mount
    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        fetch("/api/players/me", {
            headers: { Authorization: `Bearer ${token}` },
        })
        .then(r => {
            if (isUnauthorized(r.status)) {
                clearAuthSession();
                router.replace("/login");
                return null;
            }
            if (!r.ok) return null;
            return r.json();
        })
        .then(data => {
            if (!data) return;
            setUserId(data.profile?.id ?? null);
        })
        .catch((err) => {
            console.error("[match/page] Failed to fetch current user:", err);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchMatch = useCallback(async (token: string) => {
        try {
            const matchRes = await fetch(`/api/matches/${matchId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(matchRes.status)) {
                clearAuthSession();
                router.replace("/login");
                return;
            }
            if (matchRes.status === 404) {
                setMatchMissing(true);
                setMatch(null);
                setPresence(null);
                setPlayerProfiles({});
                setError("This match is no longer available.");
                setConnectionState("offline");
                return;
            }
            if (!matchRes.ok) return;
            setMatchMissing(false);

            const matchData = await matchRes.json();
            const m: MatchData = matchData.match;
            if (!m) return;

            // Redirect to lobby if match is still in pre-start readiness state
            if (
                m.status === "awaiting_players"
                || (
                    Boolean(m.tournament_id)
                    && !["ongoing", "completed", "cancelled", "invalidated"].includes(m.status)
                    && ["called", "ready"].includes(m.tournament_phase ?? "")
                )
            ) {
                router.replace(`/matches/${matchId}/lobby`);
                return;
            }

            setMatch(m);
            setSets(matchData.sets ?? []);
            setAcceptances(matchData.acceptances ?? []);
            setLastServerSyncAt(new Date().toISOString());
            if (typeof navigator === "undefined" || navigator.onLine) {
                setConnectionState("live");
            }

            // Fetch public profiles for every filled player slot + referee (if assigned)
            const ids = [m.player1_id, m.player2_id, m.player3_id, m.player4_id, m.referee_id]
                .filter(Boolean) as string[];

            const entries = await Promise.all(
                ids.map(async (id) => {
                    try {
                        const r    = await fetch(`/api/players/${id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (isUnauthorized(r.status)) {
                            clearAuthSession();
                            router.replace("/login");
                            return [id, null] as const;
                        }
                        if (!r.ok) return [id, null] as const;
                        const data = await r.json();
                        return [id, data.profile as PlayerProfile] as const;
                    } catch (err) {
                        console.warn(`[match/page] Failed to fetch profile for ${id}:`, err);
                        return [id, null] as const;
                    }
                })
            );

            const profiles: Record<string, PlayerProfile> = {};
            for (const [id, profile] of entries) {
                if (profile) profiles[id] = profile;
            }
            setPlayerProfiles(profiles);
        } catch (err) {
            console.error("[match/page] fetchMatch error:", err);
        }
    }, [matchId, router]);

    // Keep terminal-state ref in sync so the WS reconnect guard can read it
    useEffect(() => {
        if (match?.status) matchStatusRef.current = match.status;
    }, [match?.status]);

    useEffect(() => {
        const initialOnline = typeof navigator === "undefined" ? true : navigator.onLine;
        setIsBrowserOnline(initialOnline);
        setConnectionState(initialOnline ? "reconnecting" : "offline");

        const handleOnline = () => {
            setIsBrowserOnline(true);
            if (matchStatusRef.current === "ongoing") {
                setConnectionState("reconnecting");
            }
            const token = getAccessToken();
            if (token && !matchMissing) {
                void fetchMatch(token);
            }
        };

        const handleOffline = () => {
            setIsBrowserOnline(false);
            setConnectionState("offline");
            setPresence(null);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [fetchMatch, matchMissing]);

    // Initial load — fills the page before WebSocket sends its "init"
    useEffect(() => {
        const token = getToken();
        if (!token) return;
        fetchMatch(token).finally(() => setLoading(false));
    }, [fetchMatch, getToken]);

    useEffect(() => {
        if (!matchMissing) return;
        const timer = setTimeout(() => router.replace("/matches"), 1500);
        return () => clearTimeout(timer);
    }, [matchMissing, router]);

    // Load pending referee invites for this match
    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        fetch(`/api/matches/${matchId}/referee-invites`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : null)
            .then((d: { invites?: RefereeInvite[] } | null) => {
                if (d?.invites) setPendingInvites(d.invites);
            })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId, fetchMatch]);

    // Seed match log on mount if already ongoing with no referee
    useEffect(() => {
        if (match?.status === "ongoing" && !match.referee_id) {
            setMatchLog([{ id: "seed-no-referee", message: "⏳ Waiting for a referee to start the game.", ts: match.started_at ?? new Date().toISOString() }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [match?.id]);

    // WebSocket — real-time match updates via Redis pub/sub
    useEffect(() => {
        if (!matchId || matchMissing) return;
        let alive = true;

        function connect() {
            // Direct WS connection to backend (Next.js proxy doesn't forward WS upgrades)
            const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
            const wsHost = process.env.NEXT_PUBLIC_WS_HOST?.trim() || `${window.location.hostname}:8000`;
            const ws = new WebSocket(`${wsProtocol}://${wsHost}/matches/ws/${matchId}`);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!alive) return;
                setConnectionState("live");
                setLastServerSyncAt(new Date().toISOString());
            };

            ws.onmessage = (event) => {
                if (!alive) return;
                try {
                    const d = JSON.parse(event.data) as Record<string, unknown>;
                    setConnectionState("live");
                    setLastServerSyncAt(new Date().toISOString());
                    switch (d.type) {
                        case "referee_assigned":
                            setMatch(prev => prev ? { ...prev, referee_id: d.referee_id as string } : prev);
                            // Mark the accepted invite + any cancelled ones
                            setPendingInvites(prev => prev.map(inv => {
                                if (inv.invite_id === (d.invite_id as string)) return { ...inv, status: "pending" as const }; // accepted — will be removed by refetch
                                if ((d.cancelled_invites as string[] | undefined)?.includes(inv.invite_id)) return { ...inv, status: "cancelled" as const };
                                return inv;
                            }).filter(inv => inv.status !== "cancelled"));
                            break;
                        case "referee_invite_sent":
                            setPendingInvites(prev => {
                                const exists = prev.some(i => i.invite_id === (d.invite_id as string));
                                if (exists) return prev;
                                return [...prev, {
                                    invite_id:        d.invite_id as string,
                                    invited_by:       d.invited_by as string,
                                    invited_by_name:  d.invited_by_name as string,
                                    invited_user:     d.invited_user as string,
                                    invited_username: d.invited_username as string,
                                    status:           "pending" as const,
                                    expires_at:       d.expires_at as string | null,
                                }];
                            });
                            break;
                        case "referee_invite_declined":
                            setPendingInvites(prev => prev.map(inv =>
                                inv.invite_id === (d.invite_id as string) ? { ...inv, status: "declined" as const } : inv
                            ));
                            break;
                        case "match_announcement":
                            setMatchLog(prev => [...prev, {
                                id:      `ann-${Date.now()}`,
                                message: d.message as string,
                                ts:      new Date().toISOString(),
                            }]);
                            break;
                        case "tournament_match_called":
                        case "tournament_match_ready":
                        case "tournament_match_updated": {
                            const token = getAccessToken();
                            if (token) void fetchMatch(token);
                            break;
                        }
                        case "match_started":
                            setMatch(prev => prev
                                ? {
                                    ...prev,
                                    status: "ongoing",
                                    tournament_phase: typeof d.tournament_phase === "string" ? d.tournament_phase as string : prev.tournament_phase,
                                }
                                : prev
                            );
                            break;
                        case "tournament_result_verified":
                        case "tournament_result_disputed": {
                            const token = getAccessToken();
                            if (token) void fetchMatch(token);
                            break;
                        }
                        case "point_scored":
                            if (Array.isArray(d.sets)) setSets(d.sets as SetData[]);
                            if (d.set_winner) {
                                const wonSet = d.set_number_won as number;
                                const updatedSets = d.sets as SetData[];
                                const finishedSet = updatedSets?.find(s => s.set_number === wonSet);
                                setSetWonInfo({
                                    setNumber: wonSet,
                                    winner: d.set_winner as "team1" | "team2",
                                    p1Score: finishedSet?.player1_score ?? 0,
                                    p2Score: finishedSet?.player2_score ?? 0,
                                });
                                setTimeout(() => setSetWonInfo(null), 4000);
                            }
                            break;
                        case "sets_update":
                            if (Array.isArray(d.sets)) setSets(d.sets as SetData[]);
                            break;
                        case "match_completed":
                            setMatch(prev => prev
                                ? { ...prev, status: "completed", winner_id: d.winner_id as string }
                                : prev
                            );
                            break;
                        case "match_invalidated":
                            setMatch(prev => prev ? { ...prev, status: "invalidated" } : prev);
                            break;
                    }
                } catch (err) {
                    console.warn("[match/page] WS invalid JSON:", event.data, err);
                }
            };

            ws.onclose = () => {
                if (!alive) return;
                // Don't reconnect once the match is in a terminal state
                const s = matchStatusRef.current;
                if (s === "completed" || s === "cancelled" || s === "invalidated") return;
                setConnectionState(navigator.onLine ? "reconnecting" : "offline");
                reconnectRef.current = setTimeout(connect, 3000);
            };

            ws.onerror = (e) => { console.warn("[match/page] WS error:", e); ws.close(); };
        }

        connect();

        return () => {
            alive = false;
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            const ws = wsRef.current;
            if (ws) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                } else if (ws.readyState === WebSocket.CONNECTING) {
                    ws.addEventListener("open", () => ws.close());
                }
            }
        };
    }, [matchId, matchMissing]);

    useEffect(() => {
        if (!matchId || match?.status !== "ongoing") {
            setPresence(null);
            return;
        }
        if (!isBrowserOnline) {
            setPresence(null);
            setConnectionState("offline");
            return;
        }

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

                const data = await res.json() as {
                    match_status?: string;
                    presence_supported?: boolean;
                    presence?: MatchPresenceSnapshot | null;
                };

                if (!alive) return;
                if (data.match_status === "invalidated") {
                    setMatch(prev => prev ? { ...prev, status: "invalidated" } : prev);
                }
                setConnectionState("live");
                setLastServerSyncAt(new Date().toISOString());
                setPresence(data.presence_supported ? (data.presence ?? null) : null);
            } catch (err) {
                console.warn("[match/page] presence ping failed:", err);
                if (!alive) return;
                setConnectionState(navigator.onLine ? "reconnecting" : "offline");
                setPresence(null);
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
    }, [isBrowserOnline, match?.status, matchId, router]);

    // Search for players to invite as referee (debounced)
    useEffect(() => {
        if (refereeSearch.length < 2) { setRefereeResults([]); return; }
        const token = getAccessToken();
        if (!token) return;
        const timeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/players/search?q=${encodeURIComponent(refereeSearch)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setRefereeResults(data.players ?? []);
                } else {
                    console.warn("[match/page] Referee search returned", res.status);
                }
            } catch (err) {
                console.error("[match/page] Referee search error:", err);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [refereeSearch]);

    async function handleStartMatch() {
        const token = getToken();
        if (!token) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/matches/${matchId}/start`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await res.json();
            if (!res.ok) { setError(d.detail || "Failed to start match."); return; }
            await fetchMatch(token);
        } catch (err) { console.error("[match/page] handleStartMatch error:", err); setError("Connection error."); }
        finally { setActionLoading(false); }
    }

    async function handleAcceptMatch() {
        const token = getToken();
        if (!token) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/matches/${matchId}/accept`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await res.json();
            if (!res.ok) { setError(d.detail || "Failed to accept match."); return; }
            await fetchMatch(token);
        } catch (err) { console.error("[match/page] handleAcceptMatch error:", err); setError("Connection error."); }
        finally { setActionLoading(false); }
    }

    async function handleInviteReferee(playerId: string) {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch("/api/referee/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ match_id: matchId, invited_user: playerId }),
            });
            if (!res.ok) { const d = await res.json(); setError(d.detail || "Failed to send invite."); return; }
            setShowInviteReferee(false);
            setRefereeSearch("");
            setRefereeResults([]);
            // WS broadcast will add the invite card; optimistically show it too
            const d = await res.json() as { invite_id?: string; expires_at?: string };
            if (d.invite_id) {
                setPendingInvites(prev => [...prev.filter(i => i.invite_id !== d.invite_id), {
                    invite_id:        d.invite_id!,
                    invited_by:       userId ?? "",
                    invited_by_name:  "You",
                    invited_user:     playerId,
                    invited_username: (() => { const p = refereeResults.find(r => r.id === playerId); return p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || playerId.slice(0, 8) : playerId.slice(0, 8); })(),
                    status:           "pending",
                    expires_at:       d.expires_at ?? null,
                }]);
            }
        } catch (err) { console.error("[match/page] handleInviteReferee error:", err); setError("Connection error."); }
    }

    async function handleUpdateScore(setNumber: number, field: string, value: number) {
        const token = getToken();
        if (!token) return;
        // Optimistic update for instant local feedback
        setSets(prev => prev.map(s => s.set_number === setNumber ? { ...s, [field]: value } : s));
        // Fire-and-forget — WebSocket broadcasts "sets_update" to all other players
        fetch(`/api/matches/${matchId}/sets/${setNumber}/score`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ [field]: value }),
        }).catch((err) => { console.error("[match/page] handleUpdateScore failed:", err); });
    }

    async function handleAddSet() {
        const token = getToken();
        if (!token) return;
        const nextSet = (sets.at(-1)?.set_number ?? 0) + 1;
        // Optimistic: show new set immediately
        setSets(prev => [
            ...prev,
            { id: `temp-${nextSet}`, set_number: nextSet, player1_score: 0, player2_score: 0 },
        ]);
        // WebSocket will confirm with "sets_update" containing the real row
        fetch(`/api/matches/${matchId}/sets/${nextSet}/score`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ player1_score: 0, player2_score: 0 }),
        }).catch((err) => {
            console.error("[match/page] handleAddSet failed, reverting optimistic set:", err);
            setSets(prev => prev.filter(s => s.id !== `temp-${nextSet}`));
        });
    }

    async function handleComplete(winnerId: string) {
        const token = getToken();
        if (!token) return;
        setActionLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/matches/${matchId}/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ winner_id: winnerId }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.detail || "Failed to complete match."); return; }
            await fetchMatch(token);
            setShowComplete(false);
        } catch (err) { console.error("[match/page] handleComplete error:", err); setError("Connection error."); }
        finally { setActionLoading(false); }
    }

    async function handleLeaveQueue() {
        const token = getToken();
        if (!token || !match) return;
        setActionLoading(true);
        try {
            // Ongoing matches (assembled but no scores) — invalidate so queue/status
            // won't redirect back to this abandoned match on the next queue join.
            if (match.status === "ongoing") {
                const invalidateRes = await fetch(`/api/matches/${match.id}/invalidate`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!invalidateRes.ok) {
                    const d = await invalidateRes.json().catch(() => null);
                    setError(d?.detail || "Could not invalidate this match. Finish/cancel it before requeueing.");
                    return;
                }
                router.push("/matches/queue");
                return;
            }
            const res = await fetch(`/api/matches/queue/leave?sport=${match.sport}&match_format=${match.match_format}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                router.push("/matches/queue");
            } else {
                const d = await res.json();
                setError(d.detail || "Failed to leave queue.");
            }
        } catch (err) { console.error("[match/page] handleLeaveQueue error:", err); setError("Connection error."); }
        finally { setActionLoading(false); }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading match...</div>
            </div>
        );
    }

    if (!match) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm">
                    {matchMissing ? "Match not found. Returning to matches..." : "Match not found."}
                </div>
            </div>
        );
    }

    const isDoubles   = match.match_format === "doubles";
    const isParticipant = [
        match.player1_id, match.player2_id, match.player3_id, match.player4_id,
    ].includes(userId);
    const isOngoing     = match.status === "ongoing";
    const isCompleted   = match.status === "completed";
    const isCancelled   = match.status === "cancelled";
    const isInvalidated = match.status === "invalidated";
    const hasReferee  = !!match.referee_id;
    const isReferee   = match.referee_id === userId;
    // Referee is required — only the assigned referee may record points
    const canScore    = isOngoing && isReferee;

    // winner check — team-aware for doubles
    let isWinner = false;
    if (isCompleted && match.winner_id && userId) {
        if (isDoubles) {
            const team1 = [match.player1_id, match.player3_id];
            const team2 = [match.player2_id, match.player4_id];
            if (match.winner_id === match.player1_id && team1.includes(userId)) isWinner = true;
            if (match.winner_id === match.player2_id && team2.includes(userId)) isWinner = true;
        } else {
            isWinner = match.winner_id === userId;
        }
    }

    const p1SetsWon = sets.filter(s => s.player1_score > s.player2_score).length;
    const p2SetsWon = sets.filter(s => s.player2_score > s.player1_score).length;

    const isPending = match.status === "pending";
    const userAcceptance = acceptances.find(a => a.user_id === userId);
    const hasAccepted = userAcceptance?.decision === "accepted";
    const isCreator = match.player1_id === userId;
    const allAccepted = acceptances.filter(a => a.decision === "accepted").length === (isDoubles ? 4 : (match.player2_id ? 2 : 1));
    const canStart = isPending && isCreator && allAccepted;

    function isConnectedUser(id: string | null): boolean {
        if (!id || !presence) return false;
        return presence.connected_player_ids.includes(id);
    }

    function name(id: string | null): string {
        if (!id) return "—";
        const p = playerProfiles[id];
        return p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || id.slice(0, 8) : `${id.slice(0, 8)}…`;
    }

    // ── Assembling View ──
    const shouldSwapSinglesSides = match.match_format === "singles" && userId === match.player2_id;

    if (match.status === "assembling") {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
                <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-lg mx-auto w-full gap-8">
                    <AssemblingView 
                        match={match} 
                        playerProfiles={playerProfiles} 
                        onLeave={handleLeaveQueue}
                        isActionLoading={actionLoading}
                    />
                </main>
            </div>
        );
    }

    const leftPrimaryId = shouldSwapSinglesSides ? match.player2_id : match.player1_id;
    const leftSecondaryId = isDoubles ? match.player3_id : null;
    const rightPrimaryId = shouldSwapSinglesSides ? match.player1_id : match.player2_id;
    const rightSecondaryId = isDoubles ? match.player4_id : null;
    const leftSetsWon = shouldSwapSinglesSides ? p2SetsWon : p1SetsWon;
    const rightSetsWon = shouldSwapSinglesSides ? p1SetsWon : p2SetsWon;
    const leftIsWinner = isCompleted && (
        isDoubles
            ? match.winner_id === match.player1_id || match.winner_id === match.player3_id
            : match.winner_id === leftPrimaryId
    );
    const rightIsWinner = isCompleted && (
        isDoubles
            ? match.winner_id === match.player2_id || match.winner_id === match.player4_id
            : match.winner_id === rightPrimaryId
    );
    const currentSet = sets.at(-1) ?? null;
    const currentSetNumber = currentSet?.set_number ?? 1;
    const currentLeftScore = currentSet
        ? (shouldSwapSinglesSides ? currentSet.player2_score : currentSet.player1_score)
        : 0;
    const currentRightScore = currentSet
        ? (shouldSwapSinglesSides ? currentSet.player1_score : currentSet.player2_score)
        : 0;
    const matchModeLabel = match.tournament_id
        ? "Tournament Match"
        : match.match_type === "ranked"
            ? "Ranked Match"
            : match.match_type === "queue"
                ? "Normal Match"
                : match.match_type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    const viewerMode = isReferee ? "referee" : isParticipant ? "player" : "watcher";
    const canAcceptMatch = isPending && isParticipant && !hasAccepted;
    const canInviteRefereeNow = (isOngoing || isPending || match.status === "pending_approval") && !hasReferee && isParticipant;

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30 font-sans">
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
                <div className="absolute inset-0 animate-scanline pointer-events-none opacity-[0.02] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-12" />
            </div>

            <main className="relative z-10 max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-10 flex flex-col gap-5 sm:gap-6 pt-20 sm:pt-24">

                {/* Match header card (Scoreboard) */}
                <MatchScoreboard 
                    match={match}
                    playerProfiles={playerProfiles}
                    isCompleted={isCompleted}
                    isWinner={isWinner}
                    isDoubles={isDoubles}
                    connectionState={connectionState}
                    leftPrimaryId={leftPrimaryId}
                    leftSecondaryId={leftSecondaryId}
                    rightPrimaryId={rightPrimaryId}
                    rightSecondaryId={rightSecondaryId}
                    leftSetsWon={leftSetsWon}
                    rightSetsWon={rightSetsWon}
                    currentSetNumber={currentSetNumber}
                    currentLeftScore={currentLeftScore}
                    currentRightScore={currentRightScore}
                    leftIsWinner={leftIsWinner}
                    rightIsWinner={rightIsWinner}
                    onQuit={() => router.push("/dashboard")}
                />

                <MatchActionCenter
                    viewerMode={viewerMode}
                    matchModeLabel={matchModeLabel}
                    isOngoing={isOngoing}
                    isCompleted={isCompleted}
                    isPending={isPending}
                    hasReferee={hasReferee}
                    canAcceptMatch={canAcceptMatch}
                    hasAccepted={hasAccepted}
                    canStart={canStart}
                    canOpenRefereeConsole={isOngoing && isReferee}
                    canInviteReferee={canInviteRefereeNow}
                    tournamentId={match.tournament_id}
                    currentSetNumber={currentSetNumber}
                    currentLeftScore={currentLeftScore}
                    currentRightScore={currentRightScore}
                    actionLoading={actionLoading}
                    onAccept={handleAcceptMatch}
                    onStart={handleStartMatch}
                    onInviteReferee={() => setShowInviteReferee(true)}
                    onOpenRefereeConsole={() => router.push(`/matches/${matchId}/referee`)}
                    onOpenTournament={() => {
                        if (match.tournament_id) router.push(`/tournaments/${match.tournament_id}`);
                    }}
                    onBackToMatches={() => router.push("/matches")}
                />

                <div className="grid grid-cols-1 gap-5">
                    {isOngoing && connectionState !== "live" && (
                        <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between backdrop-blur-md ${
                            connectionState === "offline"
                                ? "border-rose-500/30 bg-rose-500/10"
                                : "border-amber-500/30 bg-amber-500/10"
                        }`}>
                            <div className="min-w-0">
                                <p className={`text-xs font-black uppercase tracking-widest ${
                                    connectionState === "offline" ? "text-rose-400" : "text-amber-400"
                                }`}>
                                    {connectionState === "offline" ? "SIGNAL LOST" : "RECONNECTING"}
                                </p>
                                <p className="text-[10px] text-zinc-500 font-medium mt-1 leading-relaxed">
                                    {connectionState === "offline"
                                        ? "Live telemetry paused. Re-establish network link to resume sync."
                                        : "Attempting to synchronize with match server..."}
                                </p>
                            </div>
                            <span className="shrink-0 text-[10px] font-black italic text-white opacity-20">PROTOCOL {connectionState === "offline" ? "00-0" : "01-A"}</span>
                        </div>
                    )}

                    {/* Invalidated banner */}
                    {isInvalidated && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-[2rem] p-6 flex items-center gap-6 shadow-xl">
                            <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-xl shrink-0">🚫</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-rose-400 text-xs uppercase tracking-[0.2em]">Match Invalidated</p>
                                <p className="text-[10px] text-rose-400/60 mt-1 uppercase italic leading-tight">
                                    Voided before completion. Intelligence records unaffected.
                                </p>
                            </div>
                            <button
                                onClick={() => router.push("/dashboard")}
                                className="px-5 py-2.5 bg-rose-500 text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-400 transition-colors"
                            >
                                QUIT
                            </button>
                        </div>
                    )}

                    {isOngoing && presence?.auto_invalidate_enabled && (
                        <MatchPresenceCard
                            match={match}
                            presence={presence}
                            playerProfiles={playerProfiles}
                            isConnectedUser={isConnectedUser}
                        />
                    )}

                    {/* Acceptance Section */}
                    {isPending && isParticipant && (
                        <div className="bg-[#0a111a]/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
                                <div className="space-y-1">
                                    <h3 className="font-black text-white text-[10px] uppercase tracking-[0.3em]">Engagement Protocol</h3>
                                    <p className="text-[10px] text-cyan-500 font-black uppercase italic tracking-widest">
                                        {allAccepted ? "STATION READY" : "AWAITING CLEARANCE"}
                                    </p>
                                </div>
                                <div className="flex -space-x-3">
                                    {[match.player1_id, match.player2_id, match.player3_id, match.player4_id].filter(Boolean).map(pid => {
                                        const acc = acceptances.find(a => a.user_id === pid);
                                        const accepted = acc?.decision === "accepted";
                                        return (
                                            <div key={pid} className={`w-10 h-10 rounded-xl border-2 transition-all ${accepted ? "border-cyan-500 bg-cyan-500/20 scale-105 z-10" : "border-zinc-800 bg-zinc-900"} flex items-center justify-center relative overflow-hidden`}>
                                                <span className="text-xs font-black text-white italic">{name(pid)[1]?.toUpperCase()}</span>
                                                {accepted && (
                                                    <div className="absolute inset-0 bg-cyan-500/10 animate-pulse" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {!hasAccepted && (
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={handleAcceptMatch}
                                        disabled={actionLoading}
                                        className="flex-1 bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] py-4 rounded-xl transition-all hover:bg-cyan-50 active:scale-95 disabled:opacity-50 shadow-xl"
                                    >
                                        Accept Engagement
                                    </button>
                                    <button
                                        onClick={() => { /* handle reject? */ }}
                                        className="px-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] py-4 rounded-xl transition-all active:scale-95"
                                    >
                                        Abort
                                    </button>
                                </div>
                            )}

                            {hasAccepted && !allAccepted && (
                                <div className="text-center py-4 bg-white/5 rounded-xl border border-white/5 border-dashed">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] animate-pulse italic">Synchronizing Fleet Decisions...</p>
                                </div>
                            )}

                            {canStart && (
                                <div className="flex flex-col gap-4">
                                    <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest italic">All Operators Active & Synced</p>
                                    </div>
                                    <button
                                        onClick={handleStartMatch}
                                        disabled={actionLoading}
                                        className="w-full bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] py-4 rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-2xl italic"
                                    >
                                        INITIALIZE ENGAGEMENT →
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Referee Assignment Section */}
                    {((isOngoing || match.status === "pending" || match.status === "pending_approval") && !hasReferee && isParticipant) && (
                        <div className="relative overflow-hidden bg-[#0a111a]/80 backdrop-blur-xl border border-amber-500/20 rounded-[2rem] p-6 sm:p-8 shadow-2xl">
                            <div className="absolute top-0 right-0 p-6 text-2xl opacity-5 pointer-events-none">⚖️</div>
                            <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
                                <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-inner border border-amber-500/10">
                                    📡
                                </div>
                                <div className="flex-1 text-center sm:text-left space-y-1">
                                    <h3 className="text-xs font-black text-amber-400 uppercase tracking-[0.2em]">Referee Required</h3>
                                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-sm uppercase italic">
                                        {match.match_format === "singles" 
                                            ? "Engagement requires overseer validation. Request tactical support to log points."
                                            : "Deployment locked. Assign a referee to initialize official telemetry."}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowInviteReferee(true)}
                                    className="w-full sm:w-auto px-8 py-3.5 bg-amber-500 text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all active:scale-95 shadow-xl italic"
                                >
                                    INVITE OVERSEER
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Match announcement log */}
                    {matchLog.length > 0 && (
                        <div className="bg-[#0a111a]/40 backdrop-blur-sm border border-white/5 rounded-2xl p-5 flex flex-col gap-3">
                            <p className="text-[9px] font-black tracking-[0.4em] text-slate-600 uppercase">Mission Log Feed</p>
                            <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                {matchLog.map(entry => (
                                    <div key={entry.id} className="flex items-start gap-3 group">
                                        <span className="text-cyan-500/40 text-[9px] font-black italic mt-0.5 shrink-0 group-hover:text-cyan-500 transition-colors">
                                            {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                        <span className="text-[11px] text-slate-400 font-medium uppercase tracking-tight">{entry.message}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sets Display Card */}
                    {sets.length > 0 && (
                        <div className="bg-[#0a111a]/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 sm:p-8 shadow-2xl">
                            <div className="flex items-center justify-between border-b border-white/5 pb-5 mb-6">
                                <div className="space-y-1">
                                    <h2 className="text-[10px] font-black tracking-[0.3em] text-slate-500 uppercase">Engagement Record</h2>
                                    <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest italic opacity-60">Real-time Telemetry</p>
                                </div>
                                <div className="flex gap-4 text-[9px] font-black text-slate-600 uppercase tracking-widest">
                                    <span className="w-12 text-center">ALPHA</span>
                                    <span className="w-12 text-center">BRAVO</span>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {sets.map(set => (
                                    <div key={set.set_number} className="flex items-center justify-between gap-4 p-2 rounded-2xl hover:bg-white/[0.02] transition-colors group/set">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Cycle {set.set_number}</span>
                                            <div className="h-0.5 w-4 bg-white/10 mt-1 group-hover/set:w-8 transition-all" />
                                        </div>
                                        
                                        <div className="flex items-center gap-4 sm:gap-6">
                                            {canScore ? (
                                                <div className="flex items-center gap-4">
                                                    <ScoreInput
                                                        value={shouldSwapSinglesSides ? set.player2_score : set.player1_score}
                                                        onChange={v => handleUpdateScore(set.set_number, shouldSwapSinglesSides ? "player2_score" : "player1_score", v)}
                                                    />
                                                    <span className="text-slate-800 font-black italic">VS</span>
                                                    <ScoreInput
                                                        value={shouldSwapSinglesSides ? set.player1_score : set.player2_score}
                                                        onChange={v => handleUpdateScore(set.set_number, shouldSwapSinglesSides ? "player1_score" : "player2_score", v)}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-8">
                                                    <span className={`text-3xl sm:text-4xl font-black tabular-nums italic ${
                                                        (shouldSwapSinglesSides ? set.player2_score : set.player1_score) > (shouldSwapSinglesSides ? set.player1_score : set.player2_score) 
                                                            ? "text-white" : "text-slate-700"
                                                    }`}>
                                                        {shouldSwapSinglesSides ? set.player2_score : set.player1_score}
                                                    </span>
                                                    <span className="text-slate-800 font-black italic">/</span>
                                                    <span className={`text-3xl sm:text-4xl font-black tabular-nums italic ${
                                                        (shouldSwapSinglesSides ? set.player1_score : set.player2_score) > (shouldSwapSinglesSides ? set.player2_score : set.player1_score) 
                                                            ? "text-white" : "text-slate-700"
                                                    }`}>
                                                        {shouldSwapSinglesSides ? set.player1_score : set.player2_score}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {canScore && (
                                <button
                                    onClick={handleAddSet}
                                    className="mt-8 w-full py-3.5 border border-white/5 hover:border-cyan-500/30 bg-white/[0.02] hover:bg-cyan-500/5 text-[10px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-[0.2em] rounded-xl transition-all italic"
                                >
                                    + INITIALIZE NEW CYCLE
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                {/* Referee console button — only for the assigned referee */}
                {isOngoing && isReferee && (
                    <Link
                        href={`/matches/${matchId}/referee`}
                        className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold py-3 rounded-xl transition-colors text-sm"
                    >
                        Open Referee Console →
                    </Link>
                )}

                {/* Referee invite panel (Pending list) */}
                {(isOngoing || isPending || match.status === "pending_approval") && !hasReferee && pendingInvites.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-4">Active Invitations</p>
                        <RefereeInvitePanel invites={pendingInvites} isParticipant={isParticipant} />
                    </div>
                )}

                {/* Invite Referee modal */}
                {showInviteReferee && (
                    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h2 className="font-bold text-sm">Invite a Referee</h2>
                                <button onClick={() => { setShowInviteReferee(false); setRefereeSearch(""); setRefereeResults([]); }}
                                    className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
                            </div>
                            <input
                                type="text"
                                placeholder="Search by name…"
                                value={refereeSearch}
                                onChange={e => setRefereeSearch(e.target.value)}
                                className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            />
                            {refereeResults.length > 0 && (
                                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                                    {refereeResults.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleInviteReferee(p.id)}
                                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-left transition-colors"
                                        >
                                            <span className="text-sm font-semibold text-white">{p.first_name} {p.last_name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {refereeSearch.length >= 2 && refereeResults.length === 0 && (
                                <p className="text-xs text-zinc-600 text-center">No players found.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Cancelled */}
                {isCancelled && (
                    <div className="bg-zinc-900 border border-red-500/20 rounded-2xl p-6 flex flex-col gap-3">
                        <p className="font-bold text-red-400 text-center">Match Cancelled</p>
                        <Link
                            href="/matches/queue"
                            className="mt-1 text-center text-sm text-cyan-400 hover:underline"
                        >
                            Rejoin queue →
                        </Link>
                    </div>
                )}

                {/* Complete match */}
                {canScore && !showComplete && (
                    <button
                        onClick={() => setShowComplete(true)}
                        className="w-full border border-white/10 hover:border-white/20 text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        Complete Match
                    </button>
                )}

                {/* Winner selection */}
                {showComplete && (
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                        <h3 className="font-bold text-sm">
                            {isDoubles ? "Which team won?" : "Who won?"}
                        </h3>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleComplete(match.player1_id)}
                                disabled={actionLoading}
                                className="flex-1 border border-white/10 hover:border-cyan-500/50 text-sm font-semibold py-3 rounded-xl transition-all hover:bg-cyan-500/5 disabled:opacity-50"
                            >
                                {isDoubles ? "Team 1 Wins" : `${name(match.player1_id)} Wins`}
                            </button>
                            {match.player2_id && (
                                <button
                                    onClick={() => handleComplete(match.player2_id!)}
                                    disabled={actionLoading}
                                    className="flex-1 border border-white/10 hover:border-cyan-500/50 text-sm font-semibold py-3 rounded-xl transition-all hover:bg-cyan-500/5 disabled:opacity-50"
                                >
                                    {isDoubles ? "Team 2 Wins" : `${name(match.player2_id)} Wins`}
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setShowComplete(false)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </main>

            {/* ── Set Won Modal ── */}
            {setWonInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto animate-[fadeInScale_0.3s_ease-out] bg-zinc-950/95 border border-white/10 rounded-3xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl max-w-xs w-full mx-4"
                        style={{ animation: "fadeInScale 0.3s ease-out" }}>
                        {/* Trophy burst */}
                        <div className="text-5xl animate-bounce select-none">🏆</div>

                        {/* Set label */}
                        <div className="text-[11px] font-black tracking-[0.3em] uppercase text-zinc-500">
                            Set {setWonInfo.setNumber} Complete
                        </div>

                        {/* Winner */}
                        <div className="text-center">
                            <p className="text-2xl font-black text-white leading-tight">
                                {setWonInfo.winner === "team1"
                                    ? (isDoubles ? "Team 1" : name(match.player1_id))
                                    : (isDoubles ? "Team 2" : name(match.player2_id))}
                            </p>
                            <p className="text-sm text-zinc-400 mt-0.5">wins the set</p>
                        </div>

                        {/* Score pill */}
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-6 py-3">
                            <span className={`text-3xl font-black tabular-nums ${
                                shouldSwapSinglesSides
                                    ? setWonInfo.winner === "team2"
                                        ? "text-white"
                                        : "text-zinc-500"
                                    : setWonInfo.winner === "team1"
                                        ? "text-white"
                                        : "text-zinc-500"
                            }`}>
                                {shouldSwapSinglesSides ? setWonInfo.p2Score : setWonInfo.p1Score}
                            </span>
                            <span className="text-zinc-600 font-bold text-lg">–</span>
                            <span className={`text-3xl font-black tabular-nums ${
                                shouldSwapSinglesSides
                                    ? setWonInfo.winner === "team1"
                                        ? "text-white"
                                        : "text-zinc-500"
                                    : setWonInfo.winner === "team2"
                                        ? "text-white"
                                        : "text-zinc-500"
                            }`}>
                                {shouldSwapSinglesSides ? setWonInfo.p1Score : setWonInfo.p2Score}
                            </span>
                        </div>

                        {/* Auto-dismiss bar */}
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
                @keyframes shrink {
                    from { width: 100%; }
                    to   { width: 0%; }
                }
            `}</style>
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Referee Invite Panel ──────────────────────────────────────────────────────

function InviteCountdown({ expiresAt }: { expiresAt: string | null }) {
    const [remaining, setRemaining] = useState("");

    useEffect(() => {
        if (!expiresAt) return;
        function tick() {
            const diff = Math.max(0, Math.floor((new Date(expiresAt!).getTime() - Date.now()) / 1000));
            if (diff === 0) { setRemaining("Expired"); return; }
            const m = Math.floor(diff / 60).toString().padStart(2, "0");
            const s = (diff % 60).toString().padStart(2, "0");
            setRemaining(`${m}:${s}`);
        }
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    if (!expiresAt) return null;
    return <span className="text-[11px] text-zinc-600 tabular-nums">{remaining}</span>;
}

function RefereeInvitePanel({
    invites,
    isParticipant,
}: {
    invites:       RefereeInvite[];
    isParticipant: boolean;
}) {
    const hasPending = invites.some(i => i.status === "pending");

    return (
        <div className="bg-zinc-900 border border-white/5 rounded-3xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    {invites.length === 0
                        ? "No Invitations Sent"
                        : "Invitation Status"}
                </p>
                {hasPending && (
                    <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Awaiting Accept</span>
                    </span>
                )}
            </div>

            {invites.length > 0 && (
                <div className="flex flex-col gap-2">
                    {invites.map(inv => (
                        <div
                            key={inv.invite_id}
                            className={`flex flex-col gap-2 px-3 py-2.5 rounded-xl border text-sm sm:flex-row sm:items-center sm:gap-3 ${
                                inv.status === "pending"
                                    ? "border-amber-500/20 bg-amber-500/5"
                                    : inv.status === "declined"
                                        ? "border-red-500/15 bg-red-500/5"
                                        : "border-white/5 bg-zinc-800/50 opacity-50"
                            }`}
                        >
                            {/* Status dot */}
                            <span className={`w-2 h-2 rounded-full shrink-0 ${
                                inv.status === "pending"   ? "bg-amber-400 animate-pulse" :
                                inv.status === "declined"  ? "bg-red-400" :
                                "bg-zinc-600"
                            }`} />

                            {/* Who invited whom */}
                            <div className="flex-1 min-w-0">
                                <span className="text-zinc-300 font-semibold">@{inv.invited_username}</span>
                                <span className="text-zinc-500 text-xs ml-0 mt-0.5 block sm:ml-2 sm:mt-0 sm:inline">
                                    invited by {inv.invited_by_name}
                                </span>
                            </div>

                            {/* Status label + countdown */}
                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                                {inv.status === "pending" && (
                                    <InviteCountdown expiresAt={inv.expires_at} />
                                )}
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                    inv.status === "pending"
                                        ? "border-amber-500/30 text-amber-400"
                                        : inv.status === "declined"
                                            ? "border-red-500/30 text-red-400"
                                            : "border-white/10 text-zinc-500"
                                }`}>
                                    {inv.status === "pending" ? "Waiting..." :
                                     inv.status === "declined" ? "Declined" : "Cancelled"}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!hasPending && isParticipant && invites.length > 0 && (
                <p className="text-xs text-zinc-600 text-center">All invites were declined — invite someone else.</p>
            )}
        </div>
    );
}

function MatchPresenceCard({
    match,
    presence,
    playerProfiles,
    isConnectedUser,
}: {
    match: MatchData;
    presence: MatchPresenceSnapshot;
    playerProfiles: Record<string, PlayerProfile>;
    isConnectedUser: (id: string | null) => boolean;
}) {
    const formatName = (id: string | null) => {
        if (!id) return "Unknown";
        const profile = playerProfiles[id];
        return profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || id.slice(0, 8) : id.slice(0, 8);
    };

    const isDoubles = match.match_format === "doubles";

    return (
        <div className="bg-[#0a111a]/80 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 flex flex-col gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-2xl">📡</div>
            
            <div className="flex items-center justify-between border-b border-white/5 pb-5">
                <div>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Presence Sync</h3>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-black text-white">{presence.connected_player_ids.length}</span>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">/ {presence.total_players} Operators Online</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]" />
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest italic">Encrypted Feed</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PresenceGroup 
                    label="Alpha Team" 
                    players={[
                        { id: match.player1_id, connected: isConnectedUser(match.player1_id), name: formatName(match.player1_id) },
                        ...(isDoubles ? [{ id: match.player3_id, connected: isConnectedUser(match.player3_id), name: formatName(match.player3_id) }] : [])
                    ]}
                />
                <PresenceGroup 
                    label="Bravo Team" 
                    players={[
                        { id: match.player2_id, connected: isConnectedUser(match.player2_id), name: formatName(match.player2_id) },
                        ...(isDoubles ? [{ id: match.player4_id, connected: isConnectedUser(match.player4_id), name: formatName(match.player4_id) }] : [])
                    ]}
                />
            </div>

            {presence.referee_id && (
                <div className="pt-4 border-t border-white/5">
                    <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${presence.referee_connected ? "bg-cyan-500/5 border-cyan-500/10" : "bg-rose-500/5 border-rose-500/10"}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${presence.referee_connected ? "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)]"}`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${presence.referee_connected ? "text-cyan-400" : "text-rose-400"}`}>Overseer: {formatName(presence.referee_id)}</span>
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${presence.referee_connected ? "text-cyan-500" : "text-rose-500"}`}>
                            {presence.referee_connected ? "Stationed" : "Signal Lost"}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function PresenceGroup({ label, players }: { label: string; players: { id: string | null; connected: boolean; name: string }[] }) {
    return (
        <div className="space-y-3">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] ml-1">{label}</span>
            <div className="space-y-2">
                {players.map((p, i) => (
                    <div key={p.id || i} className={`group flex items-center gap-4 p-3 rounded-xl border transition-all ${p.connected ? "bg-white/5 border-white/5" : "bg-rose-500/5 border-rose-500/10 opacity-60"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full transition-shadow duration-500 ${p.connected ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]"}`} />
                        <span className={`text-xs font-black uppercase italic tracking-tight truncate ${p.connected ? "text-white" : "text-rose-400"}`}>{p.name}</span>
                        {p.connected && <span className="ml-auto text-[7px] font-black text-emerald-500/40 uppercase tracking-widest group-hover:text-emerald-500 transition-colors">Connected</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}


function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        pending:          "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
        pending_approval: "bg-amber-500/10  text-amber-400  border border-amber-500/30",
        assembling:       "bg-blue-500/10   text-blue-400   border border-blue-500/30",
        ongoing:          "bg-green-500/10  text-green-400  border border-green-500/30",
        completed:        "bg-zinc-500/10   text-zinc-400   border border-zinc-500/30",
        cancelled:        "bg-red-500/10    text-red-400    border border-red-500/30",
        invalidated:      "bg-red-500/10    text-red-400    border border-red-500/30",
    };
    const labels: Record<string, string> = {
        pending: "Pending", pending_approval: "Awaiting Approval", assembling: "Assembling",
        ongoing: "Live", completed: "Completed", cancelled: "Cancelled", invalidated: "Invalidated",
    };
    return (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[status] ?? map.pending}`}>
            {labels[status] ?? status}
        </span>
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PlayerSlot({
    displayName, label, setsWon, isWinner, isCompleted,
}: {
    displayName: string; label: string; setsWon: number; isWinner: boolean; isCompleted: boolean;
}) {
    return (
        <div className="flex-1 text-center">
            <div className={`text-xs font-bold mb-1 ${isWinner ? "text-yellow-400" : "text-zinc-500"}`}>
                {isCompleted && isWinner ? "🏆 Winner" : label}
            </div>
            <div className="text-sm font-semibold text-white">{displayName}</div>
            {!isCompleted && (
                <div className="text-lg font-black mt-1">{setsWon}</div>
            )}
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TeamSlot({
    label, player1Name, player2Name, setsWon, isWinner, isCompleted,
}: {
    label: string;
    player1Name: string | null;
    player2Name: string | null;
    setsWon: number;
    isWinner: boolean;
    isCompleted: boolean;
}) {
    return (
        <div className="flex-1 text-center">
            <div className={`text-xs font-bold mb-2 ${isWinner ? "text-yellow-400" : "text-zinc-500"}`}>
                {isCompleted && isWinner ? "🏆 Winners" : label}
            </div>
            <div className="flex flex-col gap-1.5 items-center">
                {player1Name
                    ? <div className="text-sm font-semibold text-white">{player1Name}</div>
                    : <div className="text-xs text-zinc-700 italic">waiting…</div>
                }
                {player2Name
                    ? <div className="text-sm font-semibold text-white">{player2Name}</div>
                    : <div className="text-xs text-zinc-700 italic">waiting…</div>
                }
            </div>
            {!isCompleted && (
                <div className="text-lg font-black mt-2">{setsWon}</div>
            )}
        </div>
    );
}

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
            <button
                onClick={() => onChange(Math.max(0, value - 1))}
                className="w-10 h-10 rounded-lg bg-zinc-800 border border-white/5 hover:border-rose-500/30 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-all text-xl font-black leading-none active:scale-90"
            >
                −
            </button>
            <div className="w-14 text-center">
                <span className="text-2xl font-black tabular-nums italic text-white">{value}</span>
            </div>
            <button
                onClick={() => onChange(value + 1)}
                className="w-10 h-10 rounded-lg bg-zinc-800 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 transition-all text-xl font-black leading-none active:scale-90"
            >
                +
            </button>
        </div>
    );
}

function MatchScoreboard({ 
    match, playerProfiles, isCompleted, isWinner, isDoubles,
    connectionState, leftPrimaryId, leftSecondaryId, rightPrimaryId, rightSecondaryId, leftSetsWon, rightSetsWon, currentSetNumber, currentLeftScore, currentRightScore, leftIsWinner, rightIsWinner, onQuit
}: { 
    match: MatchData; playerProfiles: Record<string, PlayerProfile>;
    isCompleted: boolean; isWinner: boolean;
    isDoubles: boolean;
    connectionState: MatchConnectionState;
    leftPrimaryId: string | null;
    leftSecondaryId: string | null;
    rightPrimaryId: string | null;
    rightSecondaryId: string | null;
    leftSetsWon: number;
    rightSetsWon: number;
    currentSetNumber: number;
    currentLeftScore: number;
    currentRightScore: number;
    leftIsWinner: boolean;
    rightIsWinner: boolean;
    onQuit: () => void;
}) {
    const meta = SPORTS_META[match.sport] || SPORTS_META.pickleball;
    const humanize = (value: string | null | undefined) => {
        if (!value) return "Unknown";
        return value
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    };
    const getName = (id: string | null) => {
        if (!id) return "—";
        const p = playerProfiles[id];
        return p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || id.slice(0, 8) : "…";
    };

    const matchTitle = match.tournament_id
        ? "Tournament Match"
        : match.match_type === "ranked"
            ? "Ranked Match"
            : match.match_type === "queue"
                ? "Normal Match"
            : humanize(match.match_type);
    const formatLabel = humanize(match.match_format);
    const connectionMeta = connectionState === "live"
        ? {
            value: "Telemetry Live",
            secondary: "Real-time channel secured",
            chipClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
            tone: "success" as const,
        }
        : connectionState === "reconnecting"
            ? {
                value: "Resyncing",
                secondary: "Re-establishing live feed",
                chipClass: "border-amber-500/20 bg-amber-500/10 text-amber-300",
                tone: "warning" as const,
            }
            : {
                value: "Offline",
                secondary: "Waiting for network recovery",
                chipClass: "border-rose-500/20 bg-rose-500/10 text-rose-300",
                tone: "danger" as const,
            };
    const refereeLabel = match.referee_id ? getName(match.referee_id) : "Pending assignment";
    const alphaPlayers = [
        { slot: isDoubles ? "Lead Player" : "Competitor", name: getName(leftPrimaryId) },
        ...(isDoubles ? [{ slot: "Support Player", name: getName(leftSecondaryId) }] : []),
    ];
    const bravoPlayers = [
        { slot: isDoubles ? "Lead Player" : "Competitor", name: getName(rightPrimaryId) },
        ...(isDoubles ? [{ slot: "Support Player", name: getName(rightSecondaryId) }] : []),
    ];
    const liveDetailLabel = isCompleted ? "Result Snapshot" : match.status === "ongoing" ? "Live Detail" : "Match Detail";

    return (
        <div className="relative overflow-hidden bg-[#0a111a]/95 backdrop-blur-xl border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl">
            {/* Tactical Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
            
            {/* Dynamic Background Effects */}
            <div className={`absolute -top-24 -left-24 w-80 h-80 ${meta.bg} blur-[100px] rounded-full opacity-30`} />
            <div className={`absolute -bottom-24 -right-24 w-80 h-80 ${meta.bg} blur-[100px] rounded-full opacity-30`} />

            <div className="relative z-10 p-5 sm:p-8 lg:p-9 flex flex-col gap-5 sm:gap-6">
                {/* Header Section */}
                <div className="flex flex-col gap-4 border-b border-white/5 pb-5 sm:pb-6 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-3 sm:gap-5">
                        <div className="relative group shrink-0">
                            <div className={`absolute inset-0 ${meta.bg} blur-xl rounded-xl sm:rounded-2xl opacity-50 group-hover:opacity-80 transition-opacity`} />
                            <div className={`relative w-12 h-12 sm:w-16 sm:h-16 shrink-0 ${meta.bg} rounded-xl sm:rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-2xl border border-white/10`}>
                                {meta.emoji}
                            </div>
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className={`text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] ${meta.color}`}>{meta.label}</span>
                                <span className="w-1 h-1 rounded-full bg-zinc-800" />
                                <span className="text-[8px] sm:text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] sm:tracking-[0.3em]">{formatLabel}</span>
                            </div>
                            <h2 className="font-black text-lg sm:text-2xl text-white italic tracking-tighter uppercase leading-none">
                                {matchTitle}
                            </h2>
                            <p className="mt-2 text-[10px] sm:text-xs text-slate-400/80 font-semibold uppercase tracking-[0.18em] sm:tracking-[0.24em]">
                                {isDoubles ? "2 vs 2 lineup board" : "Head-to-head lineup board"}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <StatusBadge status={match.status} />
                        {(match.status === "ongoing" || connectionState !== "live") && (
                            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] ${connectionMeta.chipClass}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {connectionMeta.value}
                            </span>
                        )}
                    </div>
                </div>

                {/* Versus Display */}
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_minmax(0,1fr)] md:items-stretch">
                    <MatchTeamPanel
                        label="Team Alpha"
                        sideCode="A01"
                        players={alphaPlayers}
                        isWinner={leftIsWinner}
                    />

                    <div className="flex flex-col justify-center rounded-[1.6rem] border border-white/10 bg-white/[0.04] px-4 py-5 sm:px-5 sm:py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <span className="text-center text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">
                            {isCompleted ? "Final Set Count" : "Live Set Count"}
                        </span>
                        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                            <div className="flex flex-col items-center">
                                <span className={`text-5xl sm:text-7xl font-black tabular-nums tracking-tighter italic ${leftIsWinner ? "text-cyan-400 drop-shadow-[0_0_18px_rgba(6,182,212,0.35)]" : leftSetsWon > rightSetsWon ? "text-white" : "text-zinc-700"}`}>
                                    {leftSetsWon}
                                </span>
                                <span className="mt-2 text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">Alpha</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="h-8 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent sm:h-10" />
                                <div className="rounded-xl border border-white/10 bg-[#050b14]/80 px-3 py-1.5">
                                    <span className="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-500/70">VS</span>
                                </div>
                                <div className="h-8 w-px bg-gradient-to-t from-transparent via-white/20 to-transparent sm:h-10" />
                            </div>
                            <div className="flex flex-col items-center">
                                <span className={`text-5xl sm:text-7xl font-black tabular-nums tracking-tighter italic ${rightIsWinner ? "text-cyan-400 drop-shadow-[0_0_18px_rgba(6,182,212,0.35)]" : rightSetsWon > leftSetsWon ? "text-white" : "text-zinc-700"}`}>
                                    {rightSetsWon}
                                </span>
                                <span className="mt-2 text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">Bravo</span>
                            </div>
                        </div>
                        <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-[#050b14]/75 px-4 py-3 text-center">
                            <p className="text-[8px] font-black uppercase tracking-[0.28em] text-slate-500">
                                {isCompleted ? "Final Game Score" : "Current Game Score"}
                            </p>
                            <div className="mt-2 flex items-end justify-center gap-3">
                                <span className="text-2xl font-black italic tabular-nums text-white sm:text-3xl">{currentLeftScore}</span>
                                <span className="pb-0.5 text-sm font-black italic text-slate-600">:</span>
                                <span className="text-2xl font-black italic tabular-nums text-white sm:text-3xl">{currentRightScore}</span>
                            </div>
                            <p className="mt-2 text-[8px] font-black uppercase tracking-[0.24em] text-cyan-500/70">
                                Set {currentSetNumber}
                            </p>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            {!isCompleted && match.status === "ongoing" && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
                                    Telemetry Active
                                </span>
                            )}
                            {isCompleted && (
                                <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${isWinner ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-slate-300"}`}>
                                    {isWinner ? "Victory Logged" : "Match Archived"}
                                </span>
                            )}
                        </div>
                    </div>

                    <MatchTeamPanel
                        label="Team Bravo"
                        sideCode="B02"
                        players={bravoPlayers}
                        isWinner={rightIsWinner}
                    />
                </div>

                <div className="grid gap-3 border-t border-white/5 pt-5 sm:pt-6 sm:grid-cols-2 xl:grid-cols-4">
                    <MatchInfoChip
                        label="Mode"
                        value={matchTitle}
                        secondary={
                            match.tournament_id
                                ? "Bracket-linked official fixture"
                                : match.match_type === "ranked"
                                    ? "Competitive ladder fixture"
                                    : match.match_type === "queue"
                                        ? "Standard matchmaking fixture"
                                        : "Custom scheduled fixture"
                        }
                        tone="info"
                    />
                    <MatchInfoChip
                        label="Format"
                        value={formatLabel}
                        secondary={isDoubles ? "Two players per side" : "One player per side"}
                        tone="neutral"
                    />
                    <MatchInfoChip
                        label="Referee"
                        value={match.referee_id ? "Assigned" : "Pending"}
                        secondary={refereeLabel}
                        tone={match.referee_id ? "info" : "warning"}
                    />
                    <MatchInfoChip
                        label={liveDetailLabel}
                        value={match.status === "ongoing" ? connectionMeta.value : humanize(match.status)}
                        secondary={match.status === "ongoing" ? connectionMeta.secondary : isCompleted ? "Result posted to player records" : "Waiting for next match action"}
                        tone={match.status === "ongoing" ? connectionMeta.tone : isCompleted ? "success" : "neutral"}
                    />
                </div>

                {isCompleted && (
                    <div className="pt-2">
                        <div className={`relative overflow-hidden rounded-2xl p-6 text-center border transition-all duration-500 ${
                            isWinner 
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.1)]" 
                                : "bg-white/5 border-white/5 text-zinc-500"
                        }`}>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full animate-shimmer" />
                            <div className="relative z-10 flex flex-col items-center gap-4">
                                <div className="flex items-center justify-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl border ${isWinner ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
                                        {isWinner ? "🏆" : "🏁"}
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-sm font-black uppercase italic tracking-[0.2em]">
                                            {isWinner ? "Match Success" : "Match Logged"}
                                        </h3>
                                        <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-0.5">
                                            {isWinner 
                                                ? "Efficiency maximized. Rating updated." 
                                                : "Match archived in facility records."}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onQuit}
                                    className="w-full sm:w-auto px-10 py-3.5 bg-white text-black text-[10px] font-black uppercase tracking-[0.3em] italic rounded-xl transition-all hover:scale-105 active:scale-95 shadow-xl"
                                >
                                    Return to Base
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function MatchTeamPanel({
    label,
    sideCode,
    players,
    isWinner,
}: {
    label: string;
    sideCode: string;
    players: { slot: string; name: string }[];
    isWinner: boolean;
}) {
    return (
        <div className={`relative overflow-hidden rounded-[1.6rem] border p-4 sm:p-5 min-w-0 ${
            isWinner
                ? "border-cyan-500/30 bg-cyan-500/[0.08] shadow-[0_0_24px_rgba(6,182,212,0.12)]"
                : "border-white/10 bg-white/[0.03]"
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-[0.3em] ${isWinner ? "text-cyan-300" : "text-slate-500"}`}>{label}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">
                        {players.length} active {players.length === 1 ? "player" : "players"}
                    </p>
                </div>
                <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
                    isWinner
                        ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                        : "border-white/10 bg-[#050b14]/70 text-slate-400"
                }`}>
                    {isWinner ? "Winner" : sideCode}
                </div>
            </div>

            <div className="mt-4 grid gap-2.5">
                {players.map((player, index) => (
                    <div
                        key={`${player.slot}-${index}`}
                        className={`flex items-center gap-3 rounded-[1.2rem] border px-3 py-3 min-w-0 ${
                            isWinner ? "border-cyan-500/15 bg-[#07131d]/90" : "border-white/8 bg-[#050b14]/80"
                        }`}
                    >
                        <PlayerAvatar name={player.name} isWinner={isWinner} size="sm" />
                        <div className="min-w-0">
                            <p className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-500">{player.slot}</p>
                            <p className={`mt-1 truncate text-sm font-black italic tracking-tight ${isWinner ? "text-cyan-50" : "text-white"}`}>
                                {player.name}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MatchInfoChip({
    label,
    value,
    secondary,
    tone = "neutral",
}: {
    label: string;
    value: string;
    secondary?: string;
    tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
    const toneClasses = {
        neutral: "border-white/8 bg-white/[0.03] text-white",
        info: "border-cyan-500/15 bg-cyan-500/[0.06] text-cyan-50",
        success: "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-50",
        warning: "border-amber-500/15 bg-amber-500/[0.06] text-amber-50",
        danger: "border-rose-500/15 bg-rose-500/[0.06] text-rose-50",
    }[tone];
    const dotClasses = {
        neutral: "bg-slate-500",
        info: "bg-cyan-400",
        success: "bg-emerald-400",
        warning: "bg-amber-400",
        danger: "bg-rose-400",
    }[tone];

    return (
        <div className={`rounded-[1.3rem] border px-4 py-3.5 min-w-0 ${toneClasses}`}>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.28em] text-slate-500">{label}</p>
                    <p className="mt-1 truncate text-sm font-black italic tracking-tight">{value}</p>
                    {secondary && (
                        <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400/80">
                            {secondary}
                        </p>
                    )}
                </div>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotClasses}`} />
            </div>
        </div>
    );
}

function MatchActionCenter({
    viewerMode,
    matchModeLabel,
    isOngoing,
    isCompleted,
    isPending,
    hasReferee,
    canAcceptMatch,
    hasAccepted,
    canStart,
    canOpenRefereeConsole,
    canInviteReferee,
    tournamentId,
    currentSetNumber,
    currentLeftScore,
    currentRightScore,
    actionLoading,
    onAccept,
    onStart,
    onInviteReferee,
    onOpenRefereeConsole,
    onOpenTournament,
    onBackToMatches,
}: {
    viewerMode: "player" | "referee" | "watcher";
    matchModeLabel: string;
    isOngoing: boolean;
    isCompleted: boolean;
    isPending: boolean;
    hasReferee: boolean;
    canAcceptMatch: boolean;
    hasAccepted: boolean;
    canStart: boolean;
    canOpenRefereeConsole: boolean;
    canInviteReferee: boolean;
    tournamentId: string | null;
    currentSetNumber: number;
    currentLeftScore: number;
    currentRightScore: number;
    actionLoading: boolean;
    onAccept: () => void;
    onStart: () => void;
    onInviteReferee: () => void;
    onOpenRefereeConsole: () => void;
    onOpenTournament: () => void;
    onBackToMatches: () => void;
}) {
    const viewerLabel = viewerMode === "referee"
        ? "Referee Access"
        : viewerMode === "player"
            ? "Player Access"
            : "Watcher View";
    const summary = viewerMode === "referee"
        ? "You can monitor the live score and control official match operations."
        : viewerMode === "player"
            ? isPending
                ? "Confirm readiness, wait for the lineup, and track the live score from here."
                : "Track the live score, watch match progress, and access player actions quickly."
            : "This screen is in spectator mode. You can follow the score but official controls stay locked.";
    const liveScoreLabel = isCompleted
        ? `Final score: ${currentLeftScore}-${currentRightScore} in set ${currentSetNumber}`
        : `Live score: ${currentLeftScore}-${currentRightScore} in set ${currentSetNumber}`;

    return (
        <div className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0a111a]/80 p-5 shadow-2xl backdrop-blur-xl">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
            <div className="relative z-10 flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{viewerLabel}</p>
                        <h3 className="mt-1 text-base font-black uppercase italic tracking-tight text-white sm:text-lg">{matchModeLabel} Action Center</h3>
                        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-400">{summary}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
                            {liveScoreLabel}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
                            hasReferee ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"
                        }`}>
                            {hasReferee ? "Referee Assigned" : "Referee Needed"}
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    {canAcceptMatch && (
                        <button
                            onClick={onAccept}
                            disabled={actionLoading}
                            className="rounded-xl bg-white px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-cyan-50 active:scale-[0.98] disabled:opacity-50"
                        >
                            {actionLoading ? "Processing..." : "Accept Match"}
                        </button>
                    )}
                    {canStart && (
                        <button
                            onClick={onStart}
                            disabled={actionLoading}
                            className="rounded-xl bg-cyan-500 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-cyan-400 active:scale-[0.98] disabled:opacity-50"
                        >
                            {actionLoading ? "Starting..." : "Start Match"}
                        </button>
                    )}
                    {canOpenRefereeConsole && (
                        <button
                            onClick={onOpenRefereeConsole}
                            className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200 transition-all hover:bg-cyan-500/15 active:scale-[0.98]"
                        >
                            Open Referee Console
                        </button>
                    )}
                    {canInviteReferee && (
                        <button
                            onClick={onInviteReferee}
                            className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 transition-all hover:bg-amber-500/15 active:scale-[0.98]"
                        >
                            Invite Referee
                        </button>
                    )}
                    {tournamentId && (
                        <button
                            onClick={onOpenTournament}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-white/[0.08] active:scale-[0.98]"
                        >
                            View Tournament
                        </button>
                    )}
                    <button
                        onClick={onBackToMatches}
                        className="rounded-xl border border-white/10 bg-[#050b14] px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 transition-all hover:bg-white/[0.06] active:scale-[0.98]"
                    >
                        Back to Matches
                    </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                        <p className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-500">Match State</p>
                        <p className="mt-1 text-sm font-black italic text-white">
                            {isCompleted ? "Completed" : isOngoing ? "Live" : isPending ? "Awaiting Players" : "In Progress"}
                        </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                        <p className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-500">Viewer Mode</p>
                        <p className="mt-1 text-sm font-black italic text-white">{viewerLabel}</p>
                    </div>
                    <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                        <p className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-500">Readiness</p>
                        <p className="mt-1 text-sm font-black italic text-white">
                            {canStart ? "Ready To Start" : hasAccepted ? "Accepted / Watching" : hasReferee ? "Official Tracking Active" : "Awaiting Official"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlayerAvatar({ name, isWinner, size = "md" }: { name: string; isWinner: boolean; size?: "sm" | "md" | "lg" | "responsive" }) {
    const words = name.split(/\s+/).filter(Boolean);
    const initial = (
        words.length >= 2
            ? `${words[0][0] ?? ""}${words[1][0] ?? ""}`
            : (words[0] ?? "?").slice(0, 2)
    ).toUpperCase();
    const sizeClasses = {
        sm: "w-10 h-10 text-xs rounded-xl",
        md: "w-14 h-14 text-lg rounded-2xl",
        lg: "w-20 h-20 sm:w-24 sm:h-24 text-3xl sm:text-4xl rounded-[2rem] sm:rounded-[2.5rem]",
        responsive: "w-14 h-14 sm:w-20 sm:h-20 text-xl sm:text-3xl rounded-2xl sm:rounded-[2rem]"
    };

    return (
        <div className={`${sizeClasses[size]} relative border-2 ${isWinner ? "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)]" : "border-white/10"} bg-[#0a111a] flex items-center justify-center group transition-all duration-500 overflow-hidden`}>
            {/* Inner Glow */}
            <div className={`absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none`} />
            
            {/* Hex Pattern Overlay */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "10px 10px" }} />
            
            <span className={`font-black italic relative z-10 transition-transform duration-500 group-hover:scale-110 ${isWinner ? "text-cyan-400" : "text-white"}`}>{initial}</span>
            
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
}


function AssemblingView({ 
    match, playerProfiles, onLeave, isActionLoading 
}: { 
    match: MatchData; 
    playerProfiles: Record<string, PlayerProfile>; 
    onLeave: () => void;
    isActionLoading: boolean;
}) {
    const meta = SPORTS_META[match.sport];
    const isDoubles = match.match_format === "doubles";
    const slots = isDoubles ? 4 : 2;
    const playerIds = [match.player1_id, match.player2_id, match.player3_id, match.player4_id].filter(Boolean) as string[];
    const joinedCount = playerIds.length;

    return (
        <div className="w-full flex flex-col items-center gap-8 sm:gap-12">
            <div className="text-center space-y-3">
                <div className={`mx-auto w-16 h-16 ${meta.bg} rounded-[1.5rem] flex items-center justify-center text-3xl shadow-2xl border border-white/5 sm:w-20 sm:h-20 sm:rounded-[2rem] sm:text-4xl`}>
                    {meta.emoji}
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight mb-1 sm:text-3xl">Assembling...</h1>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2 sm:text-sm sm:tracking-widest">
                        <IconClock className="w-4 h-4" />
                        Waiting for {slots - joinedCount} more player{slots - joinedCount === 1 ? "" : "s"}
                    </p>
                </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-3 sm:gap-4">
                {[...Array(slots)].map((_, i) => {
                    const pid = [match.player1_id, match.player2_id, match.player3_id, match.player4_id][i];
                    const profile = pid ? playerProfiles[pid] : null;
                    return (
                        <AssemblingSlot
                            key={i}
                            displayName={profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : undefined}
                            isOccupied={!!pid}
                            index={i}
                        />
                    );
                })}
            </div>

            <div className="w-full bg-zinc-900/50 border border-white/5 rounded-3xl p-4 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-black text-white uppercase tracking-wider">Live Queue</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.18em] leading-relaxed sm:tracking-widest">Searching for matched {match.sport} players</p>
                    </div>
                </div>
                <button
                    onClick={onLeave}
                    disabled={isActionLoading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-black px-4 py-2.5 rounded-xl transition-all border border-red-500/10 disabled:opacity-40"
                >
                    <IconLeave className="w-3.5 h-3.5" />
                    Leave
                </button>
            </div>
        </div>
    );
}

function AssemblingSlot({ displayName, isOccupied, index }: { displayName?: string; isOccupied: boolean; index: number }) {
    return (
        <div className={`aspect-square rounded-[1.5rem] sm:rounded-[2rem] border-2 flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all duration-500 ${
            isOccupied
                ? "bg-zinc-800 border-white/10 shadow-xl shadow-black/20"
                : "bg-zinc-900/30 border-white/5 border-dashed"
        }`}>
            {isOccupied ? (
                <>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-black text-white">
                        {displayName ? displayName[0].toUpperCase() : "?"}
                    </div>
                    <span className="text-[11px] sm:text-xs font-black text-white tracking-tight truncate w-full text-center px-2">
                        {displayName || "..."}
                    </span>
                </>
            ) : (
                <>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-white/5 border-dashed rounded-2xl flex items-center justify-center">
                        <span className="text-zinc-800 text-lg sm:text-xl font-black">{index + 1}</span>
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-bold text-zinc-700 uppercase tracking-[0.18em] sm:tracking-widest animate-pulse">Waiting...</span>
                </>
            )}
        </div>
    );
}
