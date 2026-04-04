"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";

const SPORT_LABELS: Record<string, string> = {
    badminton:    "Badminton",
    pickleball:   "Pickleball",
    lawn_tennis:  "Lawn Tennis",
    table_tennis: "Table Tennis",
};
const FORMAT_LABELS: Record<string, string> = {
    single_elimination:  "Single Elimination",
    double_elimination:  "Double Elimination",
    round_robin:         "Round Robin",
    group_stage_knockout: "Group Stage + Knockout",
    swiss:               "Swiss",
    pool_play:           "Pool Play",
};
const STATUS_COLORS: Record<string, string> = {
    upcoming:            "bg-blue-500/20 text-blue-300 border-blue-500/30",
    registration_closed: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    ongoing:             "bg-green-500/20 text-green-300 border-green-500/30",
    completed:           "bg-zinc-600/40 text-zinc-400 border-zinc-600/30",
};

interface Tournament {
    id: string; name: string; description: string | null;
    sport: string; format: string; match_format: string;
    organizer_id: string; status: string; registration_open: boolean;
    max_participants: number; participant_count: number;
    starts_at: string | null; ends_at: string | null;
    knockout_best_of?: 1 | 3;
}
interface Registration {
    registration_id: string; player_id: string; seed: number | null;
    username: string; first_name: string | null; last_name: string | null;
    avatar_url: string | null; registered_at: string; status: string;
    partner_id?: string | null; partner_username?: string | null;
}
type PlayerMini = { id: string; username: string; first_name: string | null; last_name: string | null } | null;
interface BracketMatch {
    match_id: string; bracket_position: number; bracket_side: string | null;
    round_number: number | null;
    status: string; is_doubles: boolean;
    player1: PlayerMini; player2: PlayerMini;
    team1: PlayerMini[] | null; team2: PlayerMini[] | null;
    winner_id: string | null; scheduled_at: string | null; started_at: string | null;
    sets: { set_number: number; player1_score: number; player2_score: number; is_completed?: boolean }[];
    court_id: string | null; court_name: string | null;
    referee_id: string | null; referee_username: string | null; referee_name: string | null;
}
interface BracketRound   { round: number; label: string; matches: BracketMatch[] }
interface BracketSection { section: string; label: string; rounds: BracketRound[] }

type Tab = "participants" | "bracket" | "standings" | "live" | "results";

export default function TournamentDetailPage() {
    const router   = useRouter();
    const params   = useParams();
    const tourId   = params.id as string;

    const [tournament,    setTournament]    = useState<Tournament | null>(null);
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [isOrganizer,          setIsOrganizer]          = useState(false);
    const [isRegistered,         setIsRegistered]         = useState(false);
    const [myInviteId,           setMyInviteId]           = useState<string | null>(null);
    const [myPendingPartnerReg,  setMyPendingPartnerReg]  = useState<string | null>(null);
    const [myPartnerInviteReg,   setMyPartnerInviteReg]   = useState<string | null>(null);
    const [partnerInviteFrom,    setPartnerInviteFrom]    = useState<string | null>(null);
    const [organizer,            setOrganizer]            = useState<{ username: string } | null>(null);
    const [bracketRounds,   setBracketRounds]   = useState<BracketRound[]>([]);
    const [bracketSections, setBracketSections] = useState<BracketSection[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [tab,           setTab]           = useState<Tab>("participants");
    const [actionLoading, setActionLoading] = useState(false);
    const [error,         setError]         = useState("");

    // Doubles partner search
    const [partnerQuery,   setPartnerQuery]   = useState("");
    const [partnerResults, setPartnerResults] = useState<{ id: string; username: string; first_name: string | null; last_name: string | null }[]>([]);
    const [partnerSelected, setPartnerSelected] = useState<{ id: string; username: string; first_name: string | null; last_name: string | null } | null>(null);
    const [partnerDropdown, setPartnerDropdown] = useState(false);
    const partnerSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchBracket = useCallback(async (token: string) => {
        const res = await fetch(`/api/tournaments/${tourId}/bracket`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            const d = await res.json();
            if (d.sections) {
                setBracketSections(d.sections ?? []);
                setBracketRounds([]);
            } else {
                setBracketRounds(d.rounds ?? []);
                setBracketSections([]);
            }
        }
    }, [tourId]);

    const fetchAll = useCallback(async (token: string) => {
        const detailRes = await fetch(`/api/tournaments/${tourId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(detailRes.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (detailRes.ok) {
            const d = await detailRes.json();
            setTournament(d.tournament);
            setRegistrations(d.registrations ?? []);
            setIsOrganizer(d.is_organizer ?? false);
            setIsRegistered(d.is_registered ?? false);
            setMyInviteId(d.my_invite_id ?? null);
            setMyPendingPartnerReg(d.my_pending_partner_reg ?? null);
            setMyPartnerInviteReg(d.my_partner_invite_reg ?? null);
            setPartnerInviteFrom(d.partner_invite_from ?? null);
            setOrganizer(d.organizer ?? null);
        }
        await fetchBracket(token);
    }, [tourId, fetchBracket]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        fetchAll(token).finally(() => setLoading(false));
    }, [fetchAll]);

    const isDoublesTournament = tournament?.match_format === "doubles" || tournament?.match_format === "mixed_doubles";

    function handlePartnerInput(val: string) {
        setPartnerQuery(val);
        setPartnerSelected(null);
        setPartnerDropdown(false);
        if (partnerSearchRef.current) clearTimeout(partnerSearchRef.current);
        if (val.trim().length < 2) { setPartnerResults([]); return; }
        partnerSearchRef.current = setTimeout(async () => {
            const token = getAccessToken(); if (!token) return;
            const res = await fetch(`/api/players/search?q=${encodeURIComponent(val.trim())}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const d = await res.json();
                setPartnerResults(d.players ?? d ?? []);
                setPartnerDropdown(true);
            }
        }, 300);
    }

    async function handleRegister() {
        setError("");
        const token = getAccessToken();
        if (!token) return;
        if (isDoublesTournament && !partnerSelected) {
            setError("Please search and select your partner before registering.");
            return;
        }
        setActionLoading(true);
        const body = isDoublesTournament ? { partner_id: partnerSelected!.id } : {};
        const res = await fetch(`/api/tournaments/${tourId}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            setPartnerQuery(""); setPartnerSelected(null); setPartnerResults([]);
            fetchAll(token);
        } else {
            const d = await res.json();
            setError(d.detail || "Failed to register.");
        }
        setActionLoading(false);
    }

    async function handleWithdraw() {
        setError("");
        const token = getAccessToken();
        if (!token) return;
        setActionLoading(true);
        const res = await fetch(`/api/tournaments/${tourId}/register`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            fetchAll(token);
        } else {
            const d = await res.json();
            setError(d.detail || "Failed to withdraw.");
        }
        setActionLoading(false);
    }

    async function handleAcceptInvite() {
        if (!myInviteId) return;
        setError(""); setActionLoading(true);
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/${tourId}/invitations/${myInviteId}/accept`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { fetchAll(token); }
        else { const d = await res.json(); setError(d.detail || "Failed to accept."); }
        setActionLoading(false);
    }

    async function handleDeclineInvite() {
        if (!myInviteId) return;
        setError(""); setActionLoading(true);
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/${tourId}/invitations/${myInviteId}/decline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { setMyInviteId(null); }
        else { const d = await res.json(); setError(d.detail || "Failed to decline."); }
        setActionLoading(false);
    }

    async function handleAcceptPartnerInvite() {
        if (!myPartnerInviteReg) return;
        setError(""); setActionLoading(true);
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/partner-invite/${myPartnerInviteReg}/accept`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { fetchAll(token); }
        else { const d = await res.json(); setError(d.detail || "Failed to accept partner invite."); }
        setActionLoading(false);
    }

    async function handleDeclinePartnerInvite() {
        if (!myPartnerInviteReg) return;
        setError(""); setActionLoading(true);
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/partner-invite/${myPartnerInviteReg}/decline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { setMyPartnerInviteReg(null); setPartnerInviteFrom(null); fetchAll(token); }
        else { const d = await res.json(); setError(d.detail || "Failed to decline partner invite."); }
        setActionLoading(false);
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        );
    }
    if (!tournament) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-center">
                    <p className="text-zinc-400">Tournament not found.</p>
                    <Link href="/tournaments" className="text-sm text-blue-400 mt-2 block">← Back</Link>
                </div>
            </div>
        );
    }

    const isFull       = tournament.participant_count >= tournament.max_participants;
    const canRegister  = tournament.registration_open && tournament.status === "upcoming" && !isRegistered && !isFull;
    const hasBracket   = bracketRounds.length > 0 || bracketSections.length > 0;
    const hasStandings = ["round_robin", "group_stage_knockout", "swiss", "pool_play"].includes(tournament.format);
    // SE and DE use tree connectors; others use flat view
    const useTreeConnectors = ["single_elimination", "double_elimination"].includes(tournament.format);

    // Collect all matches for standings computation
    const allMatches: BracketMatch[] = bracketSections.length > 0
        ? bracketSections.flatMap(s => s.rounds.flatMap(r => r.matches))
        : bracketRounds.flatMap(r => r.matches);

    const isCompleted = tournament.status === "completed";
    // Show Results tab if completed, or if the bracket already has a match with a winner
    // (covers case where the final match was submitted but tournament wasn't auto-marked completed yet)
    const hasAnyWinner = allMatches.some(m => m.winner_id);
    const hasLiveMatches = hasBracket && allMatches.some(m =>
        m.status === "ongoing" || m.status === "pending" || m.status === "assembling"
    );
    const tabs: Tab[] = [
        "participants", "bracket",
        ...(hasStandings ? ["standings" as Tab] : []),
        ...(hasBracket ? ["live" as Tab] : []),
        ...((isCompleted || hasAnyWinner) && hasBracket ? ["results" as Tab] : []),
    ];

    // Compute per-player tournament W/L record from all completed matches
    const playerRecord: Record<string, { w: number; l: number }> = {};
    for (const m of allMatches) {
        if (m.status !== "completed" || !m.winner_id) continue;
        const p1 = m.player1?.id, p2 = m.player2?.id;
        if (p1) { playerRecord[p1] ??= { w: 0, l: 0 }; if (m.winner_id === p1) playerRecord[p1].w++; else playerRecord[p1].l++; }
        if (p2) { playerRecord[p2] ??= { w: 0, l: 0 }; if (m.winner_id === p2) playerRecord[p2].w++; else playerRecord[p2].l++; }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar />
            <div className="max-w-4xl mx-auto px-4 py-8">

                {/* Back + Manage */}
                <div className="flex items-center justify-between mb-4">
                    <Link href="/tournaments" className="text-zinc-400 hover:text-white text-sm transition-colors">
                        ← Tournaments
                    </Link>
                    {isOrganizer && (
                        <Link
                            href={`/tournaments/${tourId}/manage`}
                            className="text-sm bg-zinc-800 border border-zinc-700 text-white px-4 py-1.5 rounded-xl hover:bg-zinc-700 transition-colors"
                        >
                            Manage
                        </Link>
                    )}
                </div>

                {/* Header card */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[tournament.status] ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
                                    {tournament.status.replace(/_/g, " ")}
                                </span>
                                <span className="text-xs text-zinc-500">{SPORT_LABELS[tournament.sport]}</span>
                                <span className="text-xs text-zinc-600">•</span>
                                <span className="text-xs text-zinc-500">{FORMAT_LABELS[tournament.format] ?? tournament.format}</span>
                                <span className="text-xs text-zinc-600">•</span>
                                <span className="text-xs text-zinc-500">{tournament.match_format}</span>
                                {["single_elimination", "double_elimination", "group_stage_knockout"].includes(tournament.format) && tournament.knockout_best_of && (
                                    <>
                                        <span className="text-xs text-zinc-600">•</span>
                                        <span className="text-xs text-zinc-500">BO{tournament.knockout_best_of}</span>
                                    </>
                                )}
                            </div>
                            <h1 className="text-xl font-bold text-white">{tournament.name}</h1>
                            {tournament.description && (
                                <p className="text-sm text-zinc-400 mt-1">{tournament.description}</p>
                            )}
                            {organizer && (
                                <p className="text-xs text-zinc-500 mt-2">Organized by @{organizer.username}</p>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold">{tournament.participant_count}</div>
                            <div className="text-xs text-zinc-400">of {tournament.max_participants} players</div>
                            <div className="mt-1 w-full bg-zinc-800 rounded-full h-1.5">
                                <div
                                    className="bg-white rounded-full h-1.5 transition-all"
                                    style={{ width: `${Math.min(100, (tournament.participant_count / tournament.max_participants) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dates */}
                    {(tournament.starts_at || tournament.ends_at) && (
                        <div className="mt-4 flex gap-4 text-xs text-zinc-500">
                            {tournament.starts_at && <span>Starts: {new Date(tournament.starts_at).toLocaleString()}</span>}
                            {tournament.ends_at   && <span>Ends: {new Date(tournament.ends_at).toLocaleString()}</span>}
                        </div>
                    )}

                    {/* Action buttons */}
                    {error && (
                        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-sm text-red-400">
                            {error}
                        </div>
                    )}
                    {!isOrganizer && (
                        <div className="mt-4 flex flex-col gap-3">
                            {/* Pending invitation banner */}
                            {myInviteId && !isRegistered && (
                                <div className="flex items-center justify-between gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                                    <div>
                                        <p className="text-sm font-semibold text-yellow-300">You have been invited</p>
                                        <p className="text-xs text-zinc-400 mt-0.5">The organizer invited you to join this tournament.</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={handleAcceptInvite}
                                            disabled={actionLoading}
                                            className="text-sm font-semibold px-4 py-1.5 bg-white text-black rounded-xl hover:bg-zinc-100 disabled:opacity-50 transition-colors"
                                        >
                                            {actionLoading ? "…" : "Accept"}
                                        </button>
                                        <button
                                            onClick={handleDeclineInvite}
                                            disabled={actionLoading}
                                            className="text-sm px-4 py-1.5 border border-zinc-600 text-zinc-400 rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Pending partner — waiting for partner to accept */}
                            {myPendingPartnerReg && (
                                <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                                    <div className="text-xl mt-0.5">⏳</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-blue-300">Waiting for partner</p>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            Your partner invite is pending. Your registration will be confirmed once they accept.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleWithdraw}
                                        disabled={actionLoading}
                                        className="text-xs text-zinc-500 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            {/* Partner invite received — the partner needs to accept/decline */}
                            {myPartnerInviteReg && !isRegistered && (
                                <div className="flex items-center justify-between gap-3 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3">
                                    <div>
                                        <p className="text-sm font-semibold text-purple-300">
                                            🤝 Doubles partner invite
                                        </p>
                                        <p className="text-xs text-zinc-400 mt-0.5">
                                            {partnerInviteFrom
                                                ? <><span className="text-white font-medium">@{partnerInviteFrom}</span> wants you as their doubles partner.</>
                                                : "Someone invited you as their doubles partner."}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={handleAcceptPartnerInvite}
                                            disabled={actionLoading}
                                            className="text-sm font-semibold px-4 py-1.5 bg-purple-500 hover:bg-purple-400 text-white rounded-xl disabled:opacity-50 transition-colors"
                                        >
                                            {actionLoading ? "…" : "Accept"}
                                        </button>
                                        <button
                                            onClick={handleDeclinePartnerInvite}
                                            disabled={actionLoading}
                                            className="text-sm px-4 py-1.5 border border-zinc-600 text-zinc-400 rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Self-register */}
                            {canRegister && !myInviteId && !myPendingPartnerReg && !myPartnerInviteReg && (
                                <div className="flex flex-col gap-3">
                                    {/* Doubles: partner picker */}
                                    {isDoublesTournament && (
                                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4 space-y-2">
                                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                                                🤝 Select Your Partner
                                            </p>
                                            {partnerSelected ? (
                                                <div className="flex items-center gap-3 bg-zinc-900 border border-emerald-500/30 rounded-xl px-3 py-2">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-400">
                                                        {(partnerSelected.first_name?.[0] || partnerSelected.username[0]).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-white">
                                                            {partnerSelected.first_name
                                                                ? `${partnerSelected.first_name} ${partnerSelected.last_name ?? ""}`.trim()
                                                                : partnerSelected.username}
                                                        </div>
                                                        <div className="text-xs text-zinc-500">@{partnerSelected.username}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => { setPartnerSelected(null); setPartnerQuery(""); }}
                                                        className="text-zinc-500 hover:text-red-400 text-xs transition-colors"
                                                    >✕</button>
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        placeholder="Search partner by username…"
                                                        value={partnerQuery}
                                                        onChange={e => handlePartnerInput(e.target.value)}
                                                        onBlur={() => setTimeout(() => setPartnerDropdown(false), 150)}
                                                        onFocus={() => { if (partnerResults.length > 0) setPartnerDropdown(true); }}
                                                        autoComplete="off"
                                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/60 transition-all"
                                                    />
                                                    {partnerDropdown && partnerResults.length > 0 && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-zinc-700/50">
                                                            {partnerResults.map(p => (
                                                                <button
                                                                    key={p.id}
                                                                    onMouseDown={() => { setPartnerSelected(p); setPartnerQuery(""); setPartnerDropdown(false); }}
                                                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 transition-colors text-left"
                                                                >
                                                                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                                                        {(p.first_name?.[0] || p.username[0]).toUpperCase()}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm text-white font-medium">
                                                                            {p.first_name ? `${p.first_name} ${p.last_name ?? ""}`.trim() : p.username}
                                                                        </div>
                                                                        <div className="text-xs text-zinc-500">@{p.username}</div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {partnerDropdown && partnerResults.length === 0 && partnerQuery.length >= 2 && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl z-50 px-3 py-2.5 text-xs text-zinc-500">
                                                            No players found for &quot;{partnerQuery}&quot;
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleRegister}
                                        disabled={actionLoading || (isDoublesTournament && !partnerSelected)}
                                        className="self-start bg-white text-black text-sm font-semibold px-6 py-2 rounded-xl hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {actionLoading ? "Registering…" : isDoublesTournament ? "Register as Team" : "Register"}
                                    </button>
                                </div>
                            )}

                            {/* Withdraw */}
                            {isRegistered && tournament.status === "upcoming" && (
                                <button
                                    onClick={handleWithdraw}
                                    disabled={actionLoading}
                                    className="self-start border border-red-500/30 text-red-400 text-sm px-6 py-2 rounded-xl hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                                >
                                    {actionLoading ? "Withdrawing…" : "Withdraw"}
                                </button>
                            )}

                            {isRegistered && tournament.status !== "upcoming" && (
                                <span className="text-sm text-emerald-400 font-medium">✓ You are registered</span>
                            )}
                            {!isRegistered && !myInviteId && !canRegister && !myPendingPartnerReg && !myPartnerInviteReg && tournament.status === "upcoming" && (
                                <span className="text-sm text-zinc-500">
                                    {isFull ? "Tournament is full" : "Registration is closed"}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-zinc-800 mb-6 gap-1">
                    {tabs.map(t => {
                        const liveCount = allMatches.filter(m => m.status === "ongoing").length;
                        const TAB_LABELS: Record<Tab, string> = {
                            participants: "👥 Participants",
                            bracket:      hasBracket ? "🏓 Bracket & Scoring" : "🏓 Bracket (pending)",
                            standings:    "📊 Standings",
                            live:         liveCount > 0 ? `🔴 Live Matches (${liveCount})` : "🔴 Live Matches",
                            results:      "🏆 Final Result",
                        };
                        return (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                                    tab === t
                                        ? "text-white border-b-2 border-white"
                                        : "text-zinc-500 hover:text-zinc-300"
                                }`}
                            >
                                {TAB_LABELS[t]}
                            </button>
                        );
                    })}
                </div>

                {/* Participants tab */}
                {tab === "participants" && (() => {
                    const confirmed = registrations.filter(r => r.status === "confirmed");
                    const invited   = registrations.filter(r => r.status === "invited");
                    if (confirmed.length === 0 && invited.length === 0) {
                        return (
                            <div className="text-center py-16 text-zinc-500">
                                <div className="text-4xl mb-3">👥</div>
                                <p className="font-medium">No participants yet.</p>
                                {tournament.registration_open && (
                                    <p className="text-sm mt-1 text-zinc-600">Be the first to register!</p>
                                )}
                            </div>
                        );
                    }
                    return (
                        <div className="space-y-6">
                            {/* Summary strip */}
                            <div className="flex items-center gap-6 px-1">
                                <div>
                                    <div className="text-2xl font-black text-white">{confirmed.length}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">Confirmed</div>
                                </div>
                                <div className="w-px h-8 bg-zinc-800" />
                                <div>
                                    <div className="text-2xl font-black text-white">{tournament.max_participants}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">Capacity</div>
                                </div>
                                {invited.length > 0 && (
                                    <>
                                        <div className="w-px h-8 bg-zinc-800" />
                                        <div>
                                            <div className="text-2xl font-black text-yellow-400">{invited.length}</div>
                                            <div className="text-xs text-zinc-500 mt-0.5">Invited</div>
                                        </div>
                                    </>
                                )}
                                <div className="flex-1" />
                                {/* mini capacity bar */}
                                <div className="flex items-center gap-2">
                                    <div className="w-24 bg-zinc-800 rounded-full h-1.5">
                                        <div
                                            className="bg-white rounded-full h-1.5 transition-all"
                                            style={{ width: `${Math.min(100, (confirmed.length / tournament.max_participants) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-zinc-500">{Math.round((confirmed.length / tournament.max_participants) * 100)}%</span>
                                </div>
                            </div>

                            {/* Player grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {confirmed.map((reg, i) => {
                                    const rec = playerRecord[reg.player_id];
                                    const initials = (reg.first_name?.[0] || reg.username?.[0] || "?").toUpperCase();
                                    const fullName = reg.first_name && reg.last_name
                                        ? `${reg.first_name} ${reg.last_name}`
                                        : reg.username;
                                    return (
                                        <div key={reg.registration_id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 hover:border-zinc-700 transition-colors">
                                            {/* Rank */}
                                            <div className="w-5 text-center text-xs font-mono text-zinc-600 shrink-0">
                                                {reg.seed ?? i + 1}
                                            </div>
                                            {/* Avatar */}
                                            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                                {initials}
                                            </div>
                                            {/* Name */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-white truncate">{fullName}</div>
                                                <div className="text-xs text-zinc-500">@{reg.username}</div>
                                            </div>
                                            {/* Right side: seed + W/L */}
                                            <div className="flex flex-col items-end gap-1 shrink-0">
                                                {reg.seed && (
                                                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">S{reg.seed}</span>
                                                )}
                                                {rec && (
                                                    <span className="text-[10px] font-mono">
                                                        <span className="text-emerald-400">{rec.w}W</span>
                                                        <span className="text-zinc-600"> · </span>
                                                        <span className="text-red-400">{rec.l}L</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Invited (pending) */}
                            {invited.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-black tracking-[0.4em] text-zinc-500 uppercase flex items-center gap-3 mb-3">
                                        <span className="w-8 h-px bg-zinc-800" /> Awaiting Response
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {invited.map(reg => (
                                            <div key={reg.registration_id} className="flex items-center gap-3 bg-zinc-900/60 border border-yellow-500/10 rounded-2xl px-4 py-3">
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-500 shrink-0">
                                                    {(reg.first_name?.[0] || reg.username?.[0] || "?").toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-zinc-400 truncate">
                                                        {reg.first_name && reg.last_name ? `${reg.first_name} ${reg.last_name}` : reg.username}
                                                    </div>
                                                    <div className="text-xs text-zinc-600">@{reg.username}</div>
                                                </div>
                                                <span className="text-[10px] font-medium text-yellow-500/70 bg-yellow-500/10 px-2 py-0.5 rounded-full shrink-0">Invited</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Bracket tab */}
                {tab === "bracket" && (
                    <div>
                        {!hasBracket ? (
                            <div className="text-center py-10 text-zinc-500">
                                <div className="text-3xl mb-2">📋</div>
                                <p>Bracket not generated yet.</p>
                                {isOrganizer && (
                                    <Link href={`/tournaments/${tourId}/manage`} className="text-sm text-blue-400 mt-2 block">
                                        Go to Manage to generate the bracket →
                                    </Link>
                                )}
                            </div>
                        ) : bracketSections.length > 0 ? (
                            <SectionedBracketView sections={bracketSections} playerRecord={playerRecord} />
                        ) : (
                            <BracketView rounds={bracketRounds} connectors={useTreeConnectors} playerRecord={playerRecord} />
                        )}
                    </div>
                )}

                {/* Standings tab (RR + Group Stage) */}
                {tab === "standings" && (
                    <StandingsView
                        matches={allMatches}
                        registrations={registrations}
                        format={tournament.format}
                    />
                )}

                {/* Live Matches tab */}
                {tab === "live" && (
                    <LiveMatchesView matches={allMatches} isOrganizer={false} tourId={tourId} />
                )}

                {/* Results tab — champion podium + full ranking */}
                {tab === "results" && (
                    <ResultsView
                        bracketRounds={bracketRounds}
                        bracketSections={bracketSections}
                        registrations={registrations}
                        playerRecord={playerRecord}
                    />
                )}
            </div>
        </div>
    );
}

// ── Bracket views ─────────────────────────────────────────────────────────────

// Sections that use elimination tree connectors
const CONNECTOR_SECTIONS = new Set(["W", "L", "K", "GF"]);

type PlayerRecord = Record<string, { w: number; l: number }>;

function SectionedBracketView({ sections, playerRecord = {} }: { sections: BracketSection[]; playerRecord?: PlayerRecord }) {
    const SECTION_COLORS: Record<string, string> = {
        W:  "text-blue-400",
        L:  "text-orange-400",
        GF: "text-yellow-400",
        K:  "text-purple-400",
    };
    return (
        <div className="space-y-8">
            {sections.map(section => (
                <div key={section.section}>
                    <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${
                        SECTION_COLORS[section.section] ?? "text-zinc-400"
                    }`}>
                        {section.label}
                    </h3>
                    <BracketView
                        rounds={section.rounds}
                        connectors={CONNECTOR_SECTIONS.has(section.section)}
                        playerRecord={playerRecord}
                    />
                </div>
            ))}
        </div>
    );
}

// ── Bracket tree view with SVG connector lines ────────────────────────────────

const CARD_H  = 72;   // px — compact card height (no link row)
const SLOT_GAP = 8;   // px — gap between slots in round 1
const COL_W   = 208;  // px — w-52
const COL_GAP = 28;   // px — horizontal space between columns (connector area)
const UNIT    = CARD_H + SLOT_GAP;

function slotH(ri: number) { return UNIT * Math.pow(2, ri); }

function BracketView({ rounds, connectors = false, playerRecord = {} }: { rounds: BracketRound[]; connectors?: boolean; playerRecord?: PlayerRecord }) {
    if (!connectors || rounds.length === 0) {
        return (
            <div className="overflow-x-auto pb-4">
                <div className="flex gap-4 min-w-max">
                    {rounds.map(round => (
                        <div key={round.round} className="w-52">
                            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 text-center">
                                {round.label}
                            </div>
                            <div className="flex flex-col gap-3">
                                {round.matches.map(match => (
                                    <MatchCard key={match.match_id} match={match} playerRecord={playerRecord} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const numRounds = rounds.length;
    const numR1     = rounds[0]?.matches.length ?? 0;
    const totalH    = numR1 * slotH(0);
    const totalW    = numRounds * COL_W + (numRounds - 1) * COL_GAP;

    const paths: { d: string; key: string }[] = [];
    for (let col = 0; col < numRounds - 1; col++) {
        const fromColRightX = col * (COL_W + COL_GAP) + COL_W;
        const toColLeftX    = (col + 1) * (COL_W + COL_GAP);
        const midX          = fromColRightX + COL_GAP / 2;
        const slH           = slotH(col);
        const nextSlH       = slotH(col + 1);

        rounds[col].matches.forEach((_, matchIdx) => {
            const fromY = matchIdx * slH + slH / 2;
            const toIdx = Math.floor(matchIdx / 2);
            if (toIdx >= (rounds[col + 1]?.matches.length ?? 0)) return;
            const toY = toIdx * nextSlH + nextSlH / 2;
            paths.push({
                key: `${col}-${matchIdx}`,
                d:   `M ${fromColRightX} ${fromY} H ${midX} V ${toY} H ${toColLeftX}`,
            });
        });
    }

    return (
        <div className="overflow-x-auto pb-4">
            <div style={{ display: "flex", gap: COL_GAP, marginBottom: 12, width: totalW }}>
                {rounds.map(round => (
                    <div key={round.round} style={{ width: COL_W, flexShrink: 0, textAlign: "center" }}>
                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            {round.label}
                        </span>
                    </div>
                ))}
            </div>

            <div style={{ position: "relative", width: totalW, height: totalH }}>
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }} aria-hidden="true">
                    {paths.map(p => (
                        <path key={p.key} d={p.d} fill="none" stroke="#3f3f46" strokeWidth="1.5" />
                    ))}
                </svg>

                <div style={{ display: "flex", gap: COL_GAP, position: "relative", zIndex: 1 }}>
                    {rounds.map((round, colIdx) => (
                        <div key={round.round} style={{ width: COL_W, flexShrink: 0 }}>
                            {round.matches.map(match => (
                                <div key={match.match_id} style={{ height: slotH(colIdx), display: "flex", alignItems: "center" }}>
                                    <div style={{ width: COL_W, height: CARD_H, overflow: "hidden", flexShrink: 0 }}>
                                        <MatchCard match={match} compact playerRecord={playerRecord} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function teamLabel(team: PlayerMini[] | null | undefined, fallback: PlayerMini): React.ReactNode {
    // For doubles, show "Player A / Partner"; for singles just show the player name
    if (team && team.length > 0 && team.some(p => p !== null)) {
        const names = team.filter(Boolean).map(p => p!.first_name || p!.username);
        return <span className="truncate">{names.join(" / ")}</span>;
    }
    if (!fallback) return <span className="text-zinc-600 italic text-xs">TBD</span>;
    return <span className="truncate">{fallback.first_name || fallback.username}</span>;
}

function MatchCard({ match, compact = false, playerRecord = {}, roundLabel }: {
    match: BracketMatch; compact?: boolean; playerRecord?: PlayerRecord; roundLabel?: string;
}) {
    const completed = match.status === "completed";
    const ongoing   = match.status === "ongoing";

    function isWinner(p: PlayerMini) {
        return completed && p && match.winner_id === p.id;
    }

    let p1Sets = 0, p2Sets = 0;
    for (const s of match.sets) {
        if (s.player1_score > s.player2_score) p1Sets++;
        else if (s.player2_score > s.player1_score) p2Sets++;
    }

    const side1Win = isWinner(match.player1);
    const side2Win = isWinner(match.player2);

    const setScoreStr = match.sets.length > 0
        ? match.sets.map(s => `${s.player1_score}-${s.player2_score}`).join(" · ")
        : null;

    function wlBadge(pid: string | undefined) {
        if (!pid || !playerRecord[pid]) return null;
        const { w, l } = playerRecord[pid];
        return <span className="ml-1.5 text-[9px] font-mono text-zinc-500 shrink-0">{w}W {l}L</span>;
    }

    const matchNum = match.bracket_position ?? null;

    const card = (
        <div className={`bg-zinc-900 border rounded-xl overflow-hidden h-full flex flex-col ${
            ongoing   ? "border-emerald-500/40" :
            completed ? "border-zinc-700"       : "border-zinc-800"
        }`}>
            {/* Header: round label + match number + status chip */}
            {!compact && (roundLabel || ongoing || match.court_name) && (
                <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-zinc-800/60">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        {roundLabel ?? "Match"}{matchNum != null ? ` · #${matchNum}` : ""}
                    </span>
                    {ongoing && (
                        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                        </span>
                    )}
                </div>
            )}

            {/* Side 1 */}
            <div className={`flex items-center justify-between px-3 py-2 border-b border-zinc-800 ${side1Win ? "bg-white/5" : ""}`}>
                <div className={`text-sm min-w-0 flex items-center ${side1Win ? "text-white font-semibold" : "text-zinc-300"}`}>
                    {teamLabel(match.team1, match.player1)}
                    {side1Win && <span className="ml-1 text-yellow-400 text-xs">👑</span>}
                    {!compact && wlBadge(match.player1?.id)}
                </div>
                {match.sets.length > 0 && (
                    <div className="text-xs font-mono text-zinc-400 ml-1 shrink-0 font-bold">{p1Sets}</div>
                )}
            </div>
            {/* Side 2 */}
            <div className={`flex items-center justify-between px-3 py-2 ${side2Win ? "bg-white/5" : ""}`}>
                <div className={`text-sm min-w-0 flex items-center ${side2Win ? "text-white font-semibold" : "text-zinc-300"}`}>
                    {teamLabel(match.team2, match.player2)}
                    {side2Win && <span className="ml-1 text-yellow-400 text-xs">👑</span>}
                    {!compact && wlBadge(match.player2?.id)}
                </div>
                {match.sets.length > 0 && (
                    <div className="text-xs font-mono text-zinc-400 ml-1 shrink-0 font-bold">{p2Sets}</div>
                )}
            </div>

            {/* Info chips: court · referee · schedule */}
            {!compact && (match.court_name || match.referee_username || match.scheduled_at) && (
                <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-t border-zinc-800/60">
                    {match.court_name && (
                        <span className="flex items-center gap-1 text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            🏟️ {match.court_name}
                        </span>
                    )}
                    {!match.court_name && (
                        <span className="flex items-center gap-1 text-[10px] bg-zinc-800/60 text-zinc-600 px-2 py-0.5 rounded-full">
                            🏟️ Court TBA
                        </span>
                    )}
                    {match.referee_username && (
                        <span className="flex items-center gap-1 text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            🟡 {match.referee_name || match.referee_username}
                        </span>
                    )}
                    {match.scheduled_at && (
                        <span className="flex items-center gap-1 text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            🕐 {new Date(match.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    )}
                </div>
            )}

            {/* Set scores footer */}
            {!compact && match.status !== "pending" && (
                <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center justify-between mt-auto">
                    {setScoreStr
                        ? <span className="text-[10px] font-mono text-zinc-500">{setScoreStr}</span>
                        : <span />
                    }
                    <span className="text-[10px] text-zinc-500">View →</span>
                </div>
            )}
        </div>
    );

    if (compact && match.status !== "pending") {
        return (
            <Link href={`/matches/${match.match_id}`} className="block h-full hover:opacity-90 transition-opacity">
                {card}
            </Link>
        );
    }
    if (!compact && match.status !== "pending") {
        return (
            <Link href={`/matches/${match.match_id}`} className="block hover:opacity-90 transition-opacity">
                {card}
            </Link>
        );
    }
    return card;
}

// ── Standings view ────────────────────────────────────────────────────────────

interface StandingRow {
    id: string; username: string; name: string; group: string;
    played: number; wins: number; losses: number; points: number;
    pointDiff: number;
}

function StandingsView({ matches, registrations, format }: {
    matches: BracketMatch[];
    registrations: Registration[];
    format: string;
}) {
    const isPoolPlay = format === "pool_play";

    // Build player map
    const playerMap: Record<string, Registration> = {};
    for (const r of registrations) playerMap[r.player_id] = r;

    // Tally results — only group matches (exclude knockout)
    const rows: Record<string, StandingRow> = {};
    function getOrCreate(id: string, group: string): StandingRow {
        if (!rows[id]) {
            const reg = playerMap[id];
            rows[id] = {
                id, group,
                username: reg?.username ?? id.slice(0, 8),
                name:     reg?.first_name && reg?.last_name ? `${reg.first_name} ${reg.last_name}` : (reg?.username ?? "?"),
                played: 0, wins: 0, losses: 0, points: 0, pointDiff: 0,
            };
        }
        return rows[id];
    }

    for (const m of matches) {
        if (m.status !== "completed" || !m.winner_id) continue;
        const side = m.bracket_side ?? "";
        if ((format === "group_stage_knockout" || format === "pool_play") && !side.startsWith("G")) continue;
        if (!m.player1 || !m.player2) continue;

        const p1Row = getOrCreate(m.player1.id, side);
        const p2Row = getOrCreate(m.player2.id, side);
        p1Row.played++;
        p2Row.played++;

        // Compute point differential from set scores
        const p1Sets = m.sets?.reduce((s, set) => s + (set.player1_score ?? 0), 0) ?? 0;
        const p2Sets = m.sets?.reduce((s, set) => s + (set.player2_score ?? 0), 0) ?? 0;

        if (m.winner_id === m.player1.id) {
            p1Row.wins++; p1Row.points += 2;
            p2Row.losses++;
        } else {
            p2Row.wins++; p2Row.points += 2;
            p1Row.losses++;
        }
        p1Row.pointDiff += p1Sets - p2Sets;
        p2Row.pointDiff += p2Sets - p1Sets;
    }

    // Map bracket_side → display group label
    // pool_play: GA → "Group A", GB → "Group B"
    // group_stage_knockout: G0 → "Group 0", G1 → "Group 1"
    function groupLabel(side: string): string {
        if (format === "round_robin") return "Overall";
        const letter = side.slice(1); // "A", "B", "0", "1", …
        return `Group ${letter}`;
    }

    const byGroup: Record<string, StandingRow[]> = {};
    for (const row of Object.values(rows)) {
        const g = groupLabel(row.group);
        byGroup[g] = byGroup[g] ?? [];
        byGroup[g].push(row);
    }
    for (const g of Object.keys(byGroup)) {
        byGroup[g].sort((a, b) => b.points - a.points || b.wins - a.wins || b.pointDiff - a.pointDiff || a.losses - b.losses);
    }

    const groups = Object.keys(byGroup).sort();

    if (groups.length === 0) {
        return (
            <div className="text-center py-10 text-zinc-500">
                <p>No completed matches yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {groups.map(label => (
                <div key={label}>
                    {groups.length > 1 && (
                        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-2">{label}</h3>
                    )}
                    <div className="overflow-hidden border border-zinc-800 rounded-xl">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400">#</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400">Player</th>
                                    <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">P</th>
                                    <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">W</th>
                                    <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">L</th>
                                    <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">Pts</th>
                                    {isPoolPlay && <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">+/−</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {byGroup[label].map((row, i) => (
                                    <tr key={row.id} className={`border-b border-zinc-800 last:border-0 ${i === 0 ? "bg-yellow-500/5" : "bg-zinc-900"}`}>
                                        <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-white">{row.name}</div>
                                            <div className="text-xs text-zinc-500">@{row.username}</div>
                                        </td>
                                        <td className="px-3 py-3 text-center text-zinc-300 font-mono">{row.played}</td>
                                        <td className="px-3 py-3 text-center text-emerald-400 font-mono font-semibold">{row.wins}</td>
                                        <td className="px-3 py-3 text-center text-red-400 font-mono">{row.losses}</td>
                                        <td className="px-3 py-3 text-center text-white font-mono font-bold">{row.points}</td>
                                        {isPoolPlay && (
                                            <td className={`px-3 py-3 text-center font-mono text-xs ${row.pointDiff > 0 ? "text-emerald-400" : row.pointDiff < 0 ? "text-red-400" : "text-zinc-500"}`}>
                                                {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Results view — champion podium + full ranking ──────────────────────────────

interface PlacedPlayer {
    id: string;
    name: string;
    username: string;
    placement: number;   // 1 = champion, 2 = runner-up, 3 = 3rd, …
}

/**
 * Derive placements from knockout rounds (ordered earliest → latest, i.e. QF…Final).
 * - Final (last round): winner → 1st, loser → 2nd
 * - Semi-final (2nd-to-last): losers → 3rd–4th
 * - Quarter-final (3rd-to-last): losers → 5th–8th
 * - …
 */
function computePlacements(koRounds: BracketRound[], registrations: Registration[]): PlacedPlayer[] {
    const playerMap: Record<string, Registration> = {};
    for (const r of registrations) playerMap[r.player_id] = r;

    function playerInfo(p: PlayerMini): PlacedPlayer | null {
        if (!p) return null;
        const reg = playerMap[p.id];
        return {
            id: p.id,
            name: reg?.first_name && reg?.last_name ? `${reg.first_name} ${reg.last_name}` : (reg?.username ?? p.username ?? p.id.slice(0, 8)),
            username: reg?.username ?? p.username ?? "",
            placement: 0,
        };
    }

    const placed: PlacedPlayer[] = [];
    const numRounds = koRounds.length;

    // Work backwards from final
    for (let rev = 0; rev < numRounds; rev++) {
        const round = koRounds[numRounds - 1 - rev];
        const completedMatches = round.matches.filter(m => m.status === "completed" && m.winner_id);
        if (completedMatches.length === 0) continue;

        if (rev === 0) {
            // Final: winner = 1st, loser = 2nd
            for (const m of completedMatches) {
                const winner = m.player1?.id === m.winner_id ? m.player1 : m.player2;
                const loser  = m.player1?.id === m.winner_id ? m.player2 : m.player1;
                const w = playerInfo(winner); if (w) { w.placement = 1; placed.push(w); }
                const l = playerInfo(loser);  if (l) { l.placement = 2; placed.push(l); }
            }
        } else {
            // Earlier rounds: losers share the next placement band
            // rev=1 → 3rd/4th, rev=2 → 5th/8th, rev=3 → 9th/16th, …
            const startPlacement = Math.pow(2, rev) + 1; // 3, 5, 9, …
            let pos = startPlacement;
            for (const m of completedMatches) {
                const loser = m.player1?.id === m.winner_id ? m.player2 : m.player1;
                const l = playerInfo(loser);
                if (l) { l.placement = pos; placed.push(l); pos++; }
            }
        }
    }

    // Deduplicate (a player might appear in multiple rounds; keep highest placement = lowest number)
    const best: Record<string, PlacedPlayer> = {};
    for (const p of placed) {
        if (!best[p.id] || p.placement < best[p.id].placement) best[p.id] = p;
    }

    return Object.values(best).sort((a, b) => a.placement - b.placement);
}

const PLACEMENT_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const PLACEMENT_LABELS: Record<number, string> = { 1: "Champion", 2: "Runner-up", 3: "3rd Place" };

function ResultsView({ bracketRounds, bracketSections, registrations, playerRecord }: {
    bracketRounds: BracketRound[];
    bracketSections: BracketSection[];
    registrations: Registration[];
    playerRecord: PlayerRecord;
}) {
    // Extract knockout rounds from sections (section "K") or fall back to bracketRounds
    let koRounds: BracketRound[] = [];
    if (bracketSections.length > 0) {
        const kSection = bracketSections.find(s => s.section === "K") ?? bracketSections.find(s => s.section === "W");
        koRounds = kSection?.rounds ?? [];
    } else {
        koRounds = bracketRounds;
    }

    const placements = computePlacements(koRounds, registrations);

    if (placements.length === 0) {
        return (
            <div className="text-center py-10 text-zinc-500">
                <div className="text-3xl mb-2">🏆</div>
                <p>Results not available yet.</p>
                <p className="text-xs mt-1">Complete all knockout matches to see the final ranking.</p>
            </div>
        );
    }

    const top3 = placements.filter(p => p.placement <= 3);

    const podiumOrder = [
        top3.find(p => p.placement === 2),
        top3.find(p => p.placement === 1),
        top3.find(p => p.placement === 3),
    ].filter(Boolean) as PlacedPlayer[];

    return (
        <div className="space-y-8">
            {/* Podium */}
            <div>
                <h3 className="text-xs font-black tracking-[0.4em] text-zinc-500 uppercase flex items-center gap-3 mb-6">
                    <span className="w-8 h-px bg-zinc-800" /> Final Standings
                </h3>
                <div className="flex items-end justify-center gap-3">
                    {podiumOrder.map(p => {
                        const isChamp = p.placement === 1;
                        const heights = { 1: "h-28", 2: "h-20", 3: "h-16" };
                        const bgColors = {
                            1: "bg-gradient-to-b from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
                            2: "bg-gradient-to-b from-zinc-400/20 to-zinc-400/5 border-zinc-400/30",
                            3: "bg-gradient-to-b from-amber-700/20 to-amber-700/5 border-amber-700/30",
                        };
                        return (
                            <div key={p.id} className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
                                <div className="text-3xl">{PLACEMENT_MEDALS[p.placement] ?? ""}</div>
                                <div className="text-center">
                                    <div className={`text-sm font-bold ${isChamp ? "text-yellow-300" : "text-white"}`}>
                                        {p.name}
                                    </div>
                                    <div className="text-[10px] text-zinc-500">@{p.username}</div>
                                    {playerRecord[p.id] && (
                                        <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                                            {playerRecord[p.id].w}W · {playerRecord[p.id].l}L
                                        </div>
                                    )}
                                </div>
                                <div className={`w-full border rounded-t-xl flex items-center justify-center ${heights[p.placement as 1|2|3] ?? "h-12"} ${bgColors[p.placement as 1|2|3] ?? "bg-zinc-800/40 border-zinc-700"}`}>
                                    <span className="text-lg font-black text-zinc-400">{p.placement}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Full ranking table */}
            {placements.length > 0 && (
                <div>
                    <h3 className="text-xs font-black tracking-[0.4em] text-zinc-500 uppercase flex items-center gap-3 mb-4">
                        <span className="w-8 h-px bg-zinc-800" /> Full Rankings
                    </h3>
                    <div className="overflow-hidden border border-zinc-800 rounded-xl">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400">Rank</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400">Player</th>
                                    <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">W</th>
                                    <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">L</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400">Finish</th>
                                </tr>
                            </thead>
                            <tbody>
                                {placements.map((p) => {
                                    const rec = playerRecord[p.id];
                                    const isTop3 = p.placement <= 3;
                                    return (
                                        <tr key={p.id} className={`border-b border-zinc-800 last:border-0 ${isTop3 ? "bg-yellow-500/[0.03]" : "bg-zinc-900"}`}>
                                            <td className="px-4 py-3 font-mono text-sm">
                                                {PLACEMENT_MEDALS[p.placement]
                                                    ? <span>{PLACEMENT_MEDALS[p.placement]}</span>
                                                    : <span className="text-zinc-500">{p.placement}</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className={`font-medium ${isTop3 ? "text-white" : "text-zinc-300"}`}>{p.name}</div>
                                                <div className="text-xs text-zinc-500">@{p.username}</div>
                                            </td>
                                            <td className="px-3 py-3 text-center text-emerald-400 font-mono font-semibold">{rec?.w ?? 0}</td>
                                            <td className="px-3 py-3 text-center text-red-400 font-mono">{rec?.l ?? 0}</td>
                                            <td className="px-4 py-3 text-xs text-zinc-400">
                                                {PLACEMENT_LABELS[p.placement] ?? `Eliminated R${placements.length - p.placement + 2}`}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Live Matches view ──────────────────────────────────────────────────────────

const STATUS_ORDER = ["ongoing", "pending", "assembling", "completed", "cancelled"];
const STATUS_META: Record<string, { label: string; dot: string; border: string; bg: string }> = {
    ongoing:    { label: "🔴 Live Now",         dot: "bg-emerald-500 animate-pulse", border: "border-emerald-500/30", bg: "bg-emerald-500/5"  },
    pending:    { label: "⏳ Preparing",         dot: "bg-yellow-500",                border: "border-yellow-500/20",  bg: "bg-yellow-500/5"   },
    assembling: { label: "⏳ Warming Up",        dot: "bg-orange-400",                border: "border-orange-500/20",  bg: "bg-orange-500/5"   },
    completed:  { label: "✅ Recently Completed", dot: "bg-zinc-500",                 border: "border-zinc-700",       bg: "bg-zinc-900/40"    },
    cancelled:  { label: "❌ Cancelled",          dot: "bg-red-500",                  border: "border-red-500/20",     bg: "bg-red-500/5"      },
};

function LiveMatchCard({ match, roundLabel, isOrganizer }: {
    match: BracketMatch; roundLabel?: string; isOrganizer: boolean;
}) {
    const ongoing   = match.status === "ongoing";
    const completed = match.status === "completed";
    const meta      = STATUS_META[match.status] ?? STATUS_META.pending;

    let p1Sets = 0, p2Sets = 0;
    for (const s of match.sets) {
        if (s.player1_score > s.player2_score) p1Sets++;
        else if (s.player2_score > s.player1_score) p2Sets++;
    }
    const latestSet = match.sets.length > 0 ? match.sets[match.sets.length - 1] : null;
    const setScoreStr = match.sets.length > 0
        ? match.sets.map(s => `${s.player1_score}–${s.player2_score}`).join("  ·  ")
        : null;

    return (
        <Link href={`/matches/${match.match_id}`} className="block group">
            <div className={`border rounded-2xl overflow-hidden transition-all hover:scale-[1.01] active:scale-[0.99] ${meta.border} ${meta.bg}`}>
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                            {roundLabel ?? "Match"}
                            {match.bracket_position != null ? ` · Match ${match.bracket_position}` : ""}
                        </span>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        ongoing   ? "text-emerald-400 bg-emerald-500/15" :
                        completed ? "text-zinc-400 bg-zinc-800"          :
                        "text-yellow-400 bg-yellow-500/15"
                    }`}>
                        {ongoing ? "Live" : completed ? "Done" : "Soon"}
                    </span>
                </div>

                {/* Scoreboard */}
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                        {/* Side A */}
                        <div className="flex-1 min-w-0">
                            <p className={`font-black text-base truncate leading-tight ${
                                completed && match.winner_id === match.player1?.id ? "text-white" : "text-zinc-300"
                            }`}>
                                {teamLabel(match.team1, match.player1)}
                                {completed && match.winner_id === match.player1?.id && <span className="ml-1 text-yellow-400">👑</span>}
                            </p>
                        </div>

                        {/* Live score */}
                        {(ongoing || completed) && match.sets.length > 0 ? (
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-2xl font-black tabular-nums ${p1Sets > p2Sets ? "text-white" : "text-zinc-500"}`}>{p1Sets}</span>
                                <span className="text-zinc-600 font-bold">–</span>
                                <span className={`text-2xl font-black tabular-nums ${p2Sets > p1Sets ? "text-white" : "text-zinc-500"}`}>{p2Sets}</span>
                            </div>
                        ) : (
                            <div className="text-zinc-600 font-black text-sm">vs</div>
                        )}

                        {/* Side B */}
                        <div className="flex-1 min-w-0 text-right">
                            <p className={`font-black text-base truncate leading-tight ${
                                completed && match.winner_id === match.player2?.id ? "text-white" : "text-zinc-300"
                            }`}>
                                {completed && match.winner_id === match.player2?.id && <span className="mr-1 text-yellow-400">👑</span>}
                                {teamLabel(match.team2, match.player2)}
                            </p>
                        </div>
                    </div>

                    {/* Current set score */}
                    {ongoing && latestSet && (
                        <div className="mt-2 text-center">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                                Set {latestSet.set_number}
                            </span>
                            <span className="text-lg font-black text-emerald-400 ml-2">
                                {latestSet.player1_score} – {latestSet.player2_score}
                            </span>
                        </div>
                    )}
                    {completed && setScoreStr && (
                        <p className="mt-1.5 text-center text-[10px] font-mono text-zinc-500">{setScoreStr}</p>
                    )}
                </div>

                {/* Info chips */}
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        match.court_name ? "bg-zinc-800 text-zinc-400" : "bg-zinc-800/40 text-zinc-600"
                    }`}>
                        🏟️ {match.court_name ?? "Court TBA"}
                    </span>
                    {match.referee_username && (
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">
                            🟡 {match.referee_name || match.referee_username}
                        </span>
                    )}
                    {match.scheduled_at && (
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">
                            🕐 {new Date(match.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    )}
                    {isOrganizer && !match.referee_username && (
                        <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                            ⚠️ No referee
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
}

function LiveMatchesView({ matches, isOrganizer, tourId }: {
    matches: BracketMatch[]; isOrganizer: boolean; tourId: string;
}) {
    const [filter, setFilter] = useState<string>("all");
    const [, forceRefresh]    = useState(0);

    // Poll every 10 s to keep scores fresh
    useEffect(() => {
        const id = setInterval(() => forceRefresh(n => n + 1), 10_000);
        return () => clearInterval(id);
    }, []);

    const relevant = matches.filter(m => m.status !== "pending" || true); // show all
    const groups: Record<string, BracketMatch[]> = {};
    for (const m of relevant) {
        (groups[m.status] ??= []).push(m);
    }

    const filtered = filter === "all"
        ? relevant
        : relevant.filter(m => m.status === filter);

    const liveCount     = (groups["ongoing"]   ?? []).length;
    const preparingCount= ((groups["pending"] ?? []).length + (groups["assembling"] ?? []).length);
    const doneCount     = (groups["completed"] ?? []).length;

    const filters = [
        { key: "all",       label: "All",       count: relevant.length },
        { key: "ongoing",   label: "🔴 Live",   count: liveCount },
        { key: "pending",   label: "⏳ Preparing", count: preparingCount },
        { key: "completed", label: "✅ Done",    count: doneCount },
    ].filter(f => f.count > 0 || f.key === "all");

    if (relevant.length === 0) {
        return (
            <div className="text-center py-16 text-zinc-500">
                <div className="text-4xl mb-3">🏟️</div>
                <p className="font-semibold">No matches have started yet.</p>
                <p className="text-sm mt-1 text-zinc-600">Check back once the bracket is underway.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Summary counters */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: "Live Now",  value: liveCount,      color: "text-emerald-400" },
                    { label: "Preparing", value: preparingCount, color: "text-yellow-400"  },
                    { label: "Completed", value: doneCount,      color: "text-zinc-400"    },
                ].map(s => (
                    <div key={s.label} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-center">
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 flex-wrap">
                {filters.map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                            filter === f.key
                                ? "bg-white text-zinc-950"
                                : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700"
                        }`}
                    >
                        {f.label} <span className="opacity-60">({f.count})</span>
                    </button>
                ))}
            </div>

            {/* Match cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered
                    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
                    .map(m => (
                        <LiveMatchCard key={m.match_id} match={m} isOrganizer={isOrganizer} />
                    ))
                }
            </div>
        </div>
    );
}
