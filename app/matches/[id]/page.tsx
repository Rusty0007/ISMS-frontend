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
    created_at: string;
    started_at: string | null;
}

interface SetData {
    id: string;
    set_number: number;
    player1_score: number;
    player2_score: number;
}

interface PlayerProfile {
    id: string;
    username: string;
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
    const [userId,         setUserId]         = useState<string | null>(null);
    const [playerProfiles, setPlayerProfiles] = useState<Record<string, PlayerProfile>>({});
    const [loading,        setLoading]        = useState(true);
    const [actionLoading,  setActionLoading]  = useState(false);
    const [error,          setError]          = useState("");
    const [showComplete,      setShowComplete]      = useState(false);
    const [showInviteReferee, setShowInviteReferee] = useState(false);
    const [refereeSearch,     setRefereeSearch]     = useState("");
    const [refereeResults,    setRefereeResults]    = useState<PlayerProfile[]>([]);
    const [pendingInvites,    setPendingInvites]    = useState<RefereeInvite[]>([]);
    const [matchLog,          setMatchLog]          = useState<{ id: string; message: string; ts: string }[]>([]);
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
            if (!matchRes.ok) return;

            const matchData = await matchRes.json();
            const m: MatchData = matchData.match;
            if (!m) return;

            // Redirect to lobby if match is still in pre-start readiness state
            if (m.status === "awaiting_players") {
                router.replace(`/matches/${matchId}/lobby`);
                return;
            }

            setMatch(m);
            setSets(matchData.sets ?? []);

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

    // Initial load — fills the page before WebSocket sends its "init"
    useEffect(() => {
        const token = getToken();
        if (!token) return;
        fetchMatch(token).finally(() => setLoading(false));
    }, [fetchMatch, getToken]);

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
    }, [matchId]);

    // Seed match log on mount if already ongoing with no referee
    useEffect(() => {
        if (match?.status === "ongoing" && !match.referee_id) {
            setMatchLog([{ id: "seed-no-referee", message: "⏳ Waiting for a referee to start the game.", ts: match.started_at ?? new Date().toISOString() }]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [match?.id]);

    // WebSocket — real-time match updates via Redis pub/sub
    useEffect(() => {
        if (!matchId) return;
        let alive = true;

        function connect() {
            // Direct WS connection to backend (Next.js proxy doesn't forward WS upgrades)
            const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
            const wsHost = process.env.NEXT_PUBLIC_WS_HOST?.trim() || `${window.location.hostname}:8000`;
            const ws = new WebSocket(`${wsProtocol}://${wsHost}/matches/ws/${matchId}`);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                if (!alive) return;
                try {
                    const d = JSON.parse(event.data) as Record<string, unknown>;
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
    }, [matchId]);

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
                    invited_username: refereeResults.find(p => p.id === playerId)?.username ?? playerId.slice(0, 8),
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
                <div className="text-zinc-500 text-sm">Match not found.</div>
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

    function name(id: string | null): string {
        if (!id) return "—";
        const p = playerProfiles[id];
        return p ? `@${p.username}` : `${id.slice(0, 8)}…`;
    }

    // ── Assembling View ──
    const shouldSwapSinglesSides = match.match_format === "singles" && userId === match.player2_id;
    const leftSideName = shouldSwapSinglesSides ? name(match.player2_id) : name(match.player1_id);
    const rightSideName = shouldSwapSinglesSides ? name(match.player1_id) : name(match.player2_id);

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

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            <main className="relative z-10 max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10 flex flex-col gap-4 sm:gap-6">

                {/* Match header card (Scoreboard) */}
                <MatchScoreboard 
                    match={match}
                    playerProfiles={playerProfiles}
                    isCompleted={isCompleted}
                    isWinner={isWinner}
                    isDoubles={isDoubles}
                    leftPrimaryId={leftPrimaryId}
                    leftSecondaryId={leftSecondaryId}
                    rightPrimaryId={rightPrimaryId}
                    rightSecondaryId={rightSecondaryId}
                    leftSetsWon={leftSetsWon}
                    rightSetsWon={rightSetsWon}
                    leftIsWinner={leftIsWinner}
                    rightIsWinner={rightIsWinner}
                    onQuit={() => router.push("/dashboard")}
                />

                {/* Invalidated banner */}
                {isInvalidated && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <span className="text-2xl">🚫</span>
                        <div>
                            <p className="font-black text-red-400 text-sm">Match Invalidated</p>
                            <p className="text-xs text-red-400/70 mt-1">
                                The referee left the match. This match has been voided and no ratings will be affected.
                            </p>
                        </div>
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="inline-flex items-center justify-center rounded-xl border border-red-400/20 bg-red-500/10 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-red-100 transition-colors hover:bg-red-500/20 sm:self-center"
                        >
                            Quit
                        </button>
                    </div>
                )}

                {/* Waiting for referee banner */}
                {isOngoing && !hasReferee && isParticipant && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <p className="font-black text-amber-400 text-sm">Referee Required</p>
                            <p className="text-xs text-amber-400/70 mt-1">
                                Scoring is locked until a referee accepts the invitation. Invite a referee below to start recording points.
                            </p>
                        </div>
                    </div>
                )}

                {/* Match announcement log */}
                {matchLog.length > 0 && (
                    <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                        <p className="text-xs font-bold tracking-[0.3em] text-zinc-600 uppercase mb-1">Match Log</p>
                        {matchLog.map(entry => (
                            <div key={entry.id} className="flex items-start gap-3 text-sm">
                                <span className="text-zinc-600 text-xs mt-0.5 shrink-0">
                                    {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className="text-zinc-300">{entry.message}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Sets */}
                {sets.length > 0 && (
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 sm:p-6">
                        <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <h2 className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">Sets</h2>
                            <div className="grid grid-cols-2 gap-3 text-xs text-zinc-600 min-w-0 w-full sm:w-auto sm:flex sm:gap-6">
                                <span className="truncate text-left">{isDoubles ? "Team 1" : leftSideName}</span>
                                <span className="truncate text-right">{isDoubles ? "Team 2" : rightSideName}</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-4">
                            {sets.map(set => (
                                <div key={set.set_number} className="flex items-center justify-between gap-2 sm:gap-4">
                                    <span className="text-xs text-zinc-600 w-11 shrink-0 sm:w-12">Set {set.set_number}</span>
                                    {canScore ? (
                                        <>
                                            <ScoreInput
                                                value={shouldSwapSinglesSides ? set.player2_score : set.player1_score}
                                                onChange={v => handleUpdateScore(set.set_number, shouldSwapSinglesSides ? "player2_score" : "player1_score", v)}
                                            />
                                            <span className="text-zinc-600 font-bold">—</span>
                                            <ScoreInput
                                                value={shouldSwapSinglesSides ? set.player1_score : set.player2_score}
                                                onChange={v => handleUpdateScore(set.set_number, shouldSwapSinglesSides ? "player1_score" : "player2_score", v)}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-2xl font-black w-12 text-center">{shouldSwapSinglesSides ? set.player2_score : set.player1_score}</span>
                                            <span className="text-zinc-600 font-bold">—</span>
                                            <span className="text-2xl font-black w-12 text-center">{shouldSwapSinglesSides ? set.player1_score : set.player2_score}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        {canScore && (
                            <button
                                onClick={handleAddSet}
                                className="mt-5 text-xs text-zinc-500 hover:text-zinc-300 border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                + Add Set
                            </button>
                        )}
                    </div>
                )}

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

                {/* Referee invite panel */}
                {isOngoing && !hasReferee && (
                    <RefereeInvitePanel
                        invites={pendingInvites}
                        isParticipant={isParticipant}
                        onOpenInvite={() => setShowInviteReferee(true)}
                    />
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
                                placeholder="Search by username…"
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
                                            <span className="text-sm font-semibold text-white">@{p.username}</span>
                                            <span className="text-xs text-zinc-500 ml-auto">{p.first_name} {p.last_name}</span>
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
    onOpenInvite,
}: {
    invites:       RefereeInvite[];
    isParticipant: boolean;
    onOpenInvite:  () => void;
}) {
    const hasPending = invites.some(i => i.status === "pending");

    return (
        <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-zinc-400 sm:pr-4">
                    {invites.length === 0
                        ? "No referee assigned — scores are self-reported."
                        : "Waiting for a referee to accept..."}
                </p>
                {isParticipant && (
                    <button
                        onClick={onOpenInvite}
                        className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 hover:border-cyan-500/40 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                        + Invite
                    </button>
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

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        pending:          "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
        pending_approval: "bg-amber-500/10  text-amber-400  border border-amber-500/30",
        assembling:       "bg-blue-500/10   text-blue-400   border border-blue-500/30",
        ongoing:          "bg-green-500/10  text-green-400  border border-green-500/30",
        completed:        "bg-zinc-500/10   text-zinc-400   border border-zinc-500/30",
        cancelled:        "bg-red-500/10    text-red-400    border border-red-500/30",
    };
    const labels: Record<string, string> = {
        pending: "Pending", pending_approval: "Awaiting Approval", assembling: "Assembling",
        ongoing: "Live", completed: "Completed", cancelled: "Cancelled",
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
        <div className="flex items-center gap-1.5">
            <button
                onClick={() => onChange(Math.max(0, value - 1))}
                className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 text-zinc-400 hover:text-white transition-colors text-lg leading-none"
            >
                −
            </button>
            <span className="w-10 text-center text-xl font-black">{value}</span>
            <button
                onClick={() => onChange(value + 1)}
                className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 text-zinc-400 hover:text-white transition-colors text-lg leading-none"
            >
                +
            </button>
        </div>
    );
}

function MatchScoreboard({ 
    match, playerProfiles, isCompleted, isWinner, isDoubles,
    leftPrimaryId, leftSecondaryId, rightPrimaryId, rightSecondaryId, leftSetsWon, rightSetsWon, leftIsWinner, rightIsWinner, onQuit
}: { 
    match: MatchData; playerProfiles: Record<string, PlayerProfile>;
    isCompleted: boolean; isWinner: boolean;
    isDoubles: boolean;
    leftPrimaryId: string | null;
    leftSecondaryId: string | null;
    rightPrimaryId: string | null;
    rightSecondaryId: string | null;
    leftSetsWon: number;
    rightSetsWon: number;
    leftIsWinner: boolean;
    rightIsWinner: boolean;
    onQuit: () => void;
}) {
    const meta = SPORTS_META[match.sport];
    const name = (id: string | null) => {
        if (!id) return "—";
        const p = playerProfiles[id];
        return p ? `@${p.username}` : "…";
    };

    return (
        <div className={`relative overflow-hidden bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl`}>
            {/* Thematic background glow */}
            <div className={`absolute -top-24 -left-24 w-64 h-64 ${meta.bg} blur-[100px] rounded-full opacity-40`} />
            <div className={`absolute -bottom-24 -right-24 w-64 h-64 ${meta.bg} blur-[100px] rounded-full opacity-40`} />

            <div className="relative z-10 p-4 sm:p-8 flex flex-col gap-5 sm:gap-8">
                {/* Header info */}
                <div className="flex flex-col gap-4 border-b border-white/5 pb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-6">
                    <div className="flex items-center gap-3 min-w-0 sm:gap-4">
                        <div className={`w-11 h-11 shrink-0 ${meta.bg} rounded-2xl flex items-center justify-center text-2xl sm:w-12 sm:h-12`}>
                            {meta.emoji}
                        </div>
                        <div className="min-w-0">
                            <h2 className={`font-black text-lg tracking-tight ${meta.color} sm:text-xl`}>{meta.label}</h2>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] sm:tracking-widest">
                                {match.match_type.replace("_", " ")} • {match.match_format.replace("_", " ")}
                            </p>
                        </div>
                    </div>
                    <div className="self-start sm:self-auto">
                        <StatusBadge status={match.status} />
                    </div>
                </div>

                {/* Main Score Display */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                    {/* Team/Player 1 */}
                    <div className="min-w-0 flex flex-col items-center gap-3 text-center sm:gap-4">
                        <div className="flex -space-x-2">
                            <PlayerAvatar name={name(leftPrimaryId)} isWinner={leftIsWinner} />
                            {isDoubles && <PlayerAvatar name={name(leftSecondaryId)} isWinner={leftIsWinner} />}
                        </div>
                        <div className="min-w-0 flex flex-col gap-1">
                            <span className="text-xs font-black text-white sm:text-sm">{isDoubles ? "Team 1" : name(leftPrimaryId)}</span>
                            {isDoubles && <span className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed break-words">{name(leftPrimaryId)} & {name(leftSecondaryId)}</span>}
                        </div>
                    </div>

                    {/* SCORE BOARD */}
                    <div className="flex flex-col items-center gap-2 px-1 sm:px-6">
                        <div className="flex items-center gap-2 sm:gap-4">
                            <span className={`text-4xl font-black tabular-nums sm:text-6xl ${leftIsWinner ? "text-white" : "text-zinc-400"}`}>
                                {leftSetsWon}
                            </span>
                            <span className="text-xl font-black text-zinc-700 sm:text-2xl">:</span>
                            <span className={`text-4xl font-black tabular-nums sm:text-6xl ${rightIsWinner ? "text-white" : "text-zinc-400"}`}>
                                {rightSetsWon}
                            </span>
                        </div>
                        {isCompleted ? (
                            <span className="text-[9px] text-center font-black text-zinc-500 uppercase tracking-[0.2em] sm:text-[10px] sm:tracking-[0.3em]">Final Score</span>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] sm:text-[10px] sm:tracking-[0.3em]">Live Sets</span>
                            </div>
                        )}
                    </div>

                    {/* Team/Player 2 */}
                    <div className="min-w-0 flex flex-col items-center gap-3 text-center sm:gap-4">
                        <div className="flex -space-x-2">
                            <PlayerAvatar name={name(rightPrimaryId)} isWinner={rightIsWinner} />
                            {isDoubles && <PlayerAvatar name={name(rightSecondaryId)} isWinner={rightIsWinner} />}
                        </div>
                        <div className="min-w-0 flex flex-col gap-1">
                            <span className="text-xs font-black text-white sm:text-sm">{isDoubles ? "Team 2" : name(rightPrimaryId)}</span>
                            {isDoubles && <span className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed break-words">{name(rightPrimaryId)} & {name(rightSecondaryId)}</span>}
                        </div>
                    </div>
                </div>

                {/* Match Result Banner */}
                {isCompleted && (
                    <div className={`mt-4 rounded-2xl p-4 text-center border ${
                        isWinner 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                            : "bg-zinc-800 border-white/5 text-zinc-500"
                    }`}>
                        <p className="text-xs font-black uppercase tracking-widest leading-none">
                            {isWinner ? "🏆 Victory Achieved" : "Match Concluded"}
                        </p>
                        <p className="text-[10px] font-bold mt-1 opacity-60">
                            {isWinner ? "You earned rating points for this win!" : "Better luck in your next match!"}
                        </p>
                        <button
                            onClick={onQuit}
                            className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-white/10"
                        >
                            Quit
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function PlayerAvatar({ name, isWinner }: { name: string; isWinner: boolean }) {
    const initial = name[1]?.toUpperCase() || "?";
    return (
        <div className={`w-10 h-10 rounded-2xl border-2 sm:w-14 sm:h-14 ${isWinner ? "border-yellow-500 shadow-lg shadow-yellow-500/20" : "border-white/10"} bg-zinc-800 flex items-center justify-center relative overflow-hidden group`}>
            <div className={`absolute inset-0 bg-gradient-to-br from-white/5 to-transparent`} />
            <span className="text-base font-black text-white relative z-10 sm:text-xl">{initial}</span>
            {isWinner && (
                <div className="absolute top-0 right-0 p-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                </div>
            )}
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
                            username={profile?.username} 
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

function AssemblingSlot({ username, isOccupied, index }: { username?: string; isOccupied: boolean; index: number }) {
    return (
        <div className={`aspect-square rounded-[1.5rem] sm:rounded-[2rem] border-2 flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all duration-500 ${
            isOccupied 
                ? "bg-zinc-800 border-white/10 shadow-xl shadow-black/20" 
                : "bg-zinc-900/30 border-white/5 border-dashed"
        }`}>
            {isOccupied ? (
                <>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-black text-white">
                        {username ? username[0].toUpperCase() : "?"}
                    </div>
                    <span className="text-[11px] sm:text-xs font-black text-white tracking-tight truncate w-full text-center px-2">
                        @{username || "..."}
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
