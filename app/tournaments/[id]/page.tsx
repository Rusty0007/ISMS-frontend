"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import Link from "next/link";
import { getTournamentFormatLabel } from "@/lib/tournamentFormats";

const SPORT_LABELS: Record<string, string> = {
    badminton:    "Badminton",
    pickleball:   "Pickleball",
    lawn_tennis:  "Lawn Tennis",
    table_tennis: "Table Tennis",
};
const STATUS_COLORS: Record<string, string> = {
    upcoming:            "border-blue-500/20 bg-blue-500/10 text-blue-400",
    registration_closed: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    ongoing:             "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    completed:           "border-zinc-500/20 bg-white/5 text-zinc-400",
};

interface Tournament {
    id: string; name: string; description: string | null;
    sport: string; format: string; match_format: string;
    organizer_id: string; status: string; registration_open: boolean;
    max_participants: number; participant_count: number;
    starts_at: string | null; ends_at: string | null;
    club_id?: string | null;
    venue_mode?: "club" | "external" | "tbd";
    venue_name?: string | null;
    venue_address?: string | null;
    knockout_best_of?: 1 | 3;
}
interface TournamentClub {
    id: string;
    name: string;
    address: string | null;
    sport: string | null;
    court_count: number;
    compatible_court_count: number;
}
interface Registration {
    registration_id: string; player_id: string; seed: number | null;
    first_name: string | null; last_name: string | null;
    avatar_url: string | null; registered_at: string; status: string;
    partner_id?: string | null; partner_first_name?: string | null; partner_last_name?: string | null;
}
interface TournamentReferee {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    has_referee_role: boolean;
    is_club_member: boolean;
    club_role: string | null;
    is_checked_in: boolean;
    checkin_status: string | null;
    is_participant: boolean;
    current_match_load: number;
    total_match_assignments: number;
    registered_at: string | null;
    registered_by_name: string | null;
    can_remove: boolean;
}
type PlayerMini = { id: string; first_name: string | null; last_name: string | null } | null;
interface BracketMatch {
    match_id: string; bracket_position: number; bracket_side: string | null;
    round_number: number | null;
    status: string; is_doubles: boolean;
    player1: PlayerMini; player2: PlayerMini;
    team1: PlayerMini[] | null; team2: PlayerMini[] | null;
    winner_id: string | null; scheduled_at: string | null; started_at: string | null;
    sets: { set_number: number; player1_score: number; player2_score: number; is_completed?: boolean }[];
    court_id: string | null; court_name: string | null;
    referee_id: string | null; referee_name: string | null; referee_username?: string | null;
    tournament_phase?: string | null;
    called_at?: string | null;
    checkin_deadline_at?: string | null;
    team1_ready_at?: string | null;
    team2_ready_at?: string | null;
    referee_ready_at?: string | null;
    result_submitted_at?: string | null;
    result_submitted_by_name?: string | null;
    result_confirmed_at?: string | null;
    result_confirmed_by_name?: string | null;
    dispute_reason?: string | null;
    court_image_url?: string | null;
    club_logo_url?: string | null;
    recent_actions?: { id: string; type: string; description: string; created_at: string | null }[];
}
interface BracketRound   { round: number; label: string; matches: BracketMatch[] }
interface BracketSection { section: string; label: string; rounds: BracketRound[] }

type Tab = "participants" | "referees" | "bracket" | "knockout" | "standings" | "live" | "results";

function buildDoublesTeams(registrations: Registration[]): [Registration, Registration | null][] {
    const byPlayerId = new Map(registrations.map((registration) => [registration.player_id, registration]));
    const seen = new Set<string>();
    const teams: [Registration, Registration | null][] = [];

    for (const registration of registrations) {
        if (seen.has(registration.registration_id)) continue;
        seen.add(registration.registration_id);

        const partner = registration.partner_id
            ? byPlayerId.get(registration.partner_id) ?? null
            : null;

        if (partner && !seen.has(partner.registration_id)) {
            seen.add(partner.registration_id);
            teams.push([registration, partner]);
        } else {
            teams.push([registration, null]);
        }
    }

    return teams;
}

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
    const [myPendingPartnerInfo, setMyPendingPartnerInfo] = useState<{
        reg_id: string; team_name: string | null;
        partner_id: string | null;
        partner_first_name: string | null; partner_last_name: string | null;
        invite_status: "pending" | "accepted" | "declined";
    } | null>(null);
    const [myPartnerInviteReg,   setMyPartnerInviteReg]   = useState<string | null>(null);
    const [partnerInviteFrom,    setPartnerInviteFrom]    = useState<string | null>(null);
    const [partnerInviteTeamName, setPartnerInviteTeamName] = useState<string | null>(null);
    const [organizer,            setOrganizer]            = useState<{ first_name: string | null; last_name: string | null } | null>(null);
    const [linkedClub,           setLinkedClub]           = useState<TournamentClub | null>(null);
    const [tournamentReferees,   setTournamentReferees]   = useState<TournamentReferee[]>([]);
    const [bracketRounds,   setBracketRounds]   = useState<BracketRound[]>([]);
    const [bracketSections, setBracketSections] = useState<BracketSection[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [tab,           setTab]           = useState<Tab>("participants");
    const [actionLoading, setActionLoading] = useState(false);
    const [bracketActionLoading, setBracketActionLoading] = useState(false);
    const [,             setError]         = useState("");
    const [unreadCount,   setUnreadCount]   = useState(0);

    // Doubles registration form
    const [teamNameInput,   setTeamNameInput]   = useState("");
    const [partnerQuery,   setPartnerQuery]   = useState("");
    const [partnerResults, setPartnerResults] = useState<{ id: string; first_name: string | null; last_name: string | null }[]>([]);
    const [partnerSelected, setPartnerSelected] = useState<{ id: string; first_name: string | null; last_name: string | null } | null>(null);
    const [partnerDropdown, setPartnerDropdown] = useState(false);
    const [reinviteMode,    setReinviteMode]   = useState(false);
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

    const fetchTournamentReferees = useCallback(async (token: string) => {
        const res = await fetch(`/api/tournaments/${tourId}/referees`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (!res.ok) {
            setTournamentReferees([]);
            return;
        }
        const d = await res.json();
        setTournamentReferees(Array.isArray(d.referees) ? d.referees : []);
    }, [tourId, router]);

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
            setMyPendingPartnerInfo(d.my_pending_partner_info ?? null);
            setMyPartnerInviteReg(d.my_partner_invite_reg ?? null);
            setPartnerInviteFrom(d.partner_invite_from ?? null);
            setPartnerInviteTeamName(d.partner_invite_team_name ?? null);
            setOrganizer(d.organizer ?? null);
            setLinkedClub(d.club ?? null);
            await fetchTournamentReferees(token);
        }
        await fetchBracket(token);
    }, [tourId, fetchBracket, fetchTournamentReferees]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        fetchAll(token).finally(() => setLoading(false));
    }, [fetchAll]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;

        let es: EventSource | null = null;
        let retryDelay = 2000;
        let retryTimer: number | null = null;
        let fallbackPoll: number | null = null;
        let cancelled = false;

        function connectSSE() {
            if (cancelled || !token) return;
            es = new EventSource(`/api/tournaments/${tourId}/stream?token=${encodeURIComponent(token)}`);

            es.onopen = () => {
                retryDelay = 2000;
            };

            es.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as { event?: string };
                    if (message.event && message.event !== "connected") {
                        void fetchAll(token);
                    }
                } catch {
                    // Ignore malformed frames and keep listening.
                }
            };

            es.onerror = () => {
                es?.close();
                if (!cancelled) {
                    retryTimer = window.setTimeout(() => {
                        retryDelay = Math.min(retryDelay * 2, 30000);
                        connectSSE();
                    }, retryDelay);
                }
            };
        }

        connectSSE();
        fallbackPoll = window.setInterval(() => {
            if (token) void fetchAll(token);
        }, 30000);

        function handleVisibility() {
            if (document.visibilityState === "visible" && token) {
                void fetchAll(token);
            }
        }

        window.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelled = true;
            es?.close();
            if (retryTimer) window.clearTimeout(retryTimer);
            if (fallbackPoll) window.clearInterval(fallbackPoll);
            window.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [tourId, fetchAll]);

    useEffect(() => {
        const fetchUnread = async () => {
            const token = getAccessToken();
            if (!token) return;
            try {
                const res = await fetch("/api/notifications?limit=1", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const d = await res.json();
                    setUnreadCount(d.unread_count ?? 0);
                }
            } catch { /* silent */ }
        };
        void fetchUnread();
        const id = window.setInterval(() => void fetchUnread(), 30000);
        return () => window.clearInterval(id);
    }, []);

    const isDoublesTournament = tournament?.match_format === "doubles" || tournament?.match_format === "mixed_doubles";
    const participantUnitLabel = isDoublesTournament ? "teams" : "players";

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
        const body = isDoublesTournament
            ? { partner_id: partnerSelected!.id, team_name: teamNameInput.trim() || null }
            : {};
        const res = await fetch(`/api/tournaments/${tourId}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            setTeamNameInput(""); setPartnerQuery(""); setPartnerSelected(null); setPartnerResults([]);
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

    async function handleReinvite() {
        if (!partnerSelected) { setError("Please select a new partner first."); return; }
        setError(""); setActionLoading(true);
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/${tourId}/reinvite-partner`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                partner_id: partnerSelected.id,
                team_name: teamNameInput.trim() || myPendingPartnerInfo?.team_name || null,
            }),
        });
        if (res.ok) {
            setReinviteMode(false); setPartnerSelected(null); setPartnerQuery(""); setPartnerResults([]);
            fetchAll(token);
        } else {
            const d = await res.json(); setError(d.detail || "Failed to reinvite.");
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

    async function handleGenerateBracket() {
        if (!tournament) return;
        setError("");
        const token = getAccessToken();
        if (!token) return;
        setBracketActionLoading(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/generate-bracket`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                await fetchAll(token);
                setTab("bracket");
            } else {
                const d = await res.json().catch(() => ({}));
                setError(d.detail || "Failed to generate bracket.");
            }
        } catch {
            setError("Network error while generating bracket.");
        } finally {
            setBracketActionLoading(false);
        }
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
    const canGenerateBracketDirect = isOrganizer
        && !hasBracket
        && tournament.status === "upcoming"
        && !tournament.registration_open
        && tournament.format !== "pool_play";
    const needsPoolPlaySetup = isOrganizer
        && !hasBracket
        && tournament.status === "upcoming"
        && !tournament.registration_open
        && tournament.format === "pool_play";
    const hasStandings = ["round_robin", "group_stage_knockout", "swiss", "pool_play"].includes(tournament.format);
    const isGroupStageKnockout = tournament.format === "group_stage_knockout";
    const groupStageSections = isGroupStageKnockout
        ? bracketSections.filter(section => section.section.startsWith("G"))
        : [];
    const knockoutSection = isGroupStageKnockout
        ? (bracketSections.find(section => section.section === "K") ?? null)
        : null;
    const groupStageMatches = groupStageSections.flatMap(section =>
        section.rounds.flatMap(round => round.matches)
    );
    const completedGroupStageMatches = groupStageMatches.filter(match => match.status === "completed").length;
    const allGroupStageMatchesComplete = groupStageMatches.length > 0
        && completedGroupStageMatches === groupStageMatches.length;
    const knockoutHasAssignedPlayers = knockoutSection
        ? knockoutSection.rounds.some(round => round.matches.some(match => matchHasAssignedPlayers(match)))
        : false;
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
    const checkedInRefereeCount = tournamentReferees.filter(referee => referee.is_checked_in).length;
    const tabs: Tab[] = [
        "participants", "referees", "bracket",
        ...(isGroupStageKnockout && hasBracket ? ["knockout" as Tab] : []),
        ...(hasStandings ? ["standings" as Tab] : []),
        ...(hasBracket ? ["live" as Tab] : []),
        ...((isCompleted || hasAnyWinner) && hasBracket ? ["results" as Tab] : []),
    ];

    // Compute per-player tournament W/L record from all completed matches
    const playerRecord: Record<string, { w: number; l: number }> = {};
    for (const m of allMatches) {
        if (m.status !== "completed" || !m.winner_id) continue;
        const p1 = m.player1?.id, p2 = m.player2?.id;
        if (p1) { 
            playerRecord[p1] ??= { w: 0, l: 0 }; 
            if (m.winner_id === p1) playerRecord[p1].w++; else playerRecord[p1].l++; 
        }
        if (p2) { 
            playerRecord[p2] ??= { w: 0, l: 0 }; 
            if (m.winner_id === p2) playerRecord[p2].w++; else playerRecord[p2].l++; 
        }
    }

    return (
        <div className="min-h-screen bg-[#050b14] text-white">
            {/* Tactical Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-12 animate-scanline" />
            </div>

            {/* Top Bar */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-[#0a111a]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 h-16">
                <div className="flex items-center gap-6">
                    <Link href="/tournaments" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-all group">
                        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Exit to Hub
                    </Link>
                    <div className="h-4 w-px bg-white/10" />
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500/70">TRN-ID: {tourId.slice(0, 8)}</span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/5 bg-white/5">
                            <div className={`w-1 h-1 rounded-full ${tournament.status === 'ongoing' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,1)]' : 'bg-slate-500'}`} />
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{tournament.status.replace(/_/g, ' ')}</span>
                        </div>
                    </div>
                </div>
                
                <Link href="/dashboard" className="relative p-2 text-slate-400 hover:text-white transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 w-4 h-4 bg-cyan-500 text-black text-[9px] font-black rounded-full flex items-center justify-center leading-none shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Link>
            </div>

            <main className="relative z-10 max-w-5xl mx-auto px-4 pt-28 pb-32">
                
                {/* Header Card */}
                <div className="relative overflow-hidden bg-[#0a111a]/90 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 sm:p-10 mb-8 shadow-2xl">
                    {/* Background Detail */}
                    <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none text-9xl">🏆</div>
                    <div className="absolute -top-24 -left-24 w-80 h-80 bg-blue-500 blur-[120px] rounded-full opacity-10" />

                    <div className="relative z-10">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
                            <div className="flex-1 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-3xl shadow-xl">
                                        {tournament.sport === 'badminton' ? '🏸' : tournament.sport === 'pickleball' ? '🏓' : '🎾'}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">{SPORT_LABELS[tournament.sport]}</span>
                                            <span className="w-1 h-1 rounded-full bg-white/10" />
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${STATUS_COLORS[tournament.status]}`}>
                                                {tournament.status.replace(/_/g, " ")}
                                            </span>
                                        </div>
                                        <h1 className="text-3xl sm:text-4xl font-black text-white uppercase italic tracking-tighter leading-none">{tournament.name}</h1>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                    <MetaItem label="Format" value={getTournamentFormatLabel(tournament.format)} />
                                    <MetaItem label="Match Type" value={tournament.match_format.replace('_', ' ')} />
                                    {tournament.knockout_best_of && <MetaItem label="Ruleset" value={`BO${tournament.knockout_best_of}`} />}
                                    <MetaItem label="Organized By" value={organizer ? `${organizer.first_name || ''} ${organizer.last_name || ''}`.trim() || 'System' : 'System'} />
                                </div>

                                {tournament.description && (
                                    <p className="text-sm text-slate-400 font-bold leading-relaxed uppercase max-w-2xl">{tournament.description}</p>
                                )}
                            </div>

                            <div className="flex flex-col items-center lg:items-end gap-4 p-8 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-md">
                                <div className="text-center lg:text-right">
                                    <div className="flex items-baseline justify-center lg:justify-end gap-2">
                                        <span className="text-5xl font-black italic tracking-tighter text-white">{tournament.participant_count}</span>
                                        <span className="text-xl font-black text-slate-600 italic">/ {tournament.max_participants}</span>
                                    </div>
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mt-2">{participantUnitLabel} ENLISTED</p>
                                </div>
                                <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <div 
                                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000"
                                        style={{ width: `${Math.min(100, (tournament.participant_count / tournament.max_participants) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Schedule & Venue Briefing */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10 pt-8 border-t border-white/5">
                            <div className="flex items-center gap-4 group">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-lg group-hover:bg-cyan-500 group-hover:text-black transition-all">📅</div>
                                <div>
                                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Deployment Schedule</p>
                                    <p className="text-[10px] font-black text-white uppercase tracking-wider">
                                        {tournament.starts_at ? new Date(tournament.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'} 
                                        <span className="mx-2 text-slate-700">→</span>
                                        {tournament.ends_at ? new Date(tournament.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-lg group-hover:bg-emerald-500 group-hover:text-black transition-all">📍</div>
                                <div>
                                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Tactical Venue</p>
                                    <p className="text-[10px] font-black text-white uppercase tracking-wider truncate max-w-[250px]">
                                        {linkedClub?.name || tournament.venue_name || 'COORDINATES PENDING'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Organizer Controls */}
                {isOrganizer && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <ControlCard 
                            title="Command Center" 
                            desc="Global tournament management and settings."
                            icon="⚙️"
                            href={`/tournaments/${tourId}/manage`}
                        />
                        <ControlCard 
                            title="Generate Bracket" 
                            desc={hasBracket ? "Bracket is active and scoring." : "Initialize tactical bracket layout."}
                            icon="📊"
                            onClick={handleGenerateBracket}
                            disabled={!canGenerateBracketDirect || bracketActionLoading}
                            loading={bracketActionLoading}
                        />
                        <ControlCard 
                            title="Manage Roster" 
                            desc={`${tournamentReferees.length} Referees • ${checkedInRefereeCount} Checked In`}
                            icon="👮"
                            href={`/tournaments/${tourId}/manage`}
                        />
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

                            {/* ── Doubles team registration card (pending partner invite sent) ── */}
                            {myPendingPartnerInfo && !reinviteMode && (
                                <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/60 border-b border-zinc-700">
                                        <span className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">🏸 Team Registration</span>
                                        <button onClick={handleWithdraw} disabled={actionLoading} className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors">
                                            Cancel registration
                                        </button>
                                    </div>
                                    {/* Team name */}
                                    <div className="px-4 pt-3 pb-1">
                                        {myPendingPartnerInfo.team_name ? (
                                            <p className="text-lg font-black text-white">{myPendingPartnerInfo.team_name}</p>
                                        ) : (
                                            <p className="text-sm text-zinc-500 italic">No team name set</p>
                                        )}
                                        <p className="text-[10px] text-zinc-600 mt-0.5 uppercase tracking-widest">Team name</p>
                                    </div>
                                    {/* Partner row */}
                                    <div className="px-4 py-3 space-y-2">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Partner</p>
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                                {(myPendingPartnerInfo.partner_first_name?.[0] || "?").toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">
                                                    {`${myPendingPartnerInfo.partner_first_name || ''} ${myPendingPartnerInfo.partner_last_name || ''}`.trim() || "Unknown"}
                                                </p>
                                            </div>
                                            {/* Invite status badge */}
                                            {myPendingPartnerInfo.invite_status === "accepted" && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">✓ Accepted</span>
                                            )}
                                            {myPendingPartnerInfo.invite_status === "declined" && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">✕ Declined</span>
                                            )}
                                            {myPendingPartnerInfo.invite_status === "pending" && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 shrink-0 animate-pulse">⏳ Pending</span>
                                            )}
                                        </div>
                                        {myPendingPartnerInfo.invite_status === "pending" && (
                                            <p className="text-xs text-zinc-600">Invite sent — waiting for partner to accept. You can invite someone else while you wait.</p>
                                        )}
                                        {myPendingPartnerInfo.invite_status === "declined" && (
                                            <p className="text-xs text-red-400/70">Partner declined the invite. Please invite someone else.</p>
                                        )}
                                    </div>
                                    {/* Actions */}
                                    <div className="px-4 pb-3 flex gap-2">
                                        <button
                                            onClick={() => { setReinviteMode(true); setPartnerSelected(null); setPartnerQuery(""); }}
                                            className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-colors"
                                        >
                                            Invite a different partner
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Reinvite mode — pick a new partner */}
                            {myPendingPartnerInfo && reinviteMode && (
                                <div className="bg-zinc-900 border border-blue-500/30 rounded-2xl overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-2.5 bg-blue-500/10 border-b border-blue-500/20">
                                        <span className="text-[10px] font-black tracking-widest text-blue-300 uppercase">Invite New Partner</span>
                                        <button onClick={() => setReinviteMode(false)} className="text-[10px] text-zinc-500 hover:text-white transition-colors">✕ Cancel</button>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <PartnerSearchInput
                                            partnerSelected={partnerSelected}
                                            partnerQuery={partnerQuery}
                                            partnerResults={partnerResults}
                                            partnerDropdown={partnerDropdown}
                                            onSelect={p => { setPartnerSelected(p); setPartnerQuery(""); setPartnerDropdown(false); }}
                                            onClear={() => { setPartnerSelected(null); setPartnerQuery(""); }}
                                            onInput={handlePartnerInput}
                                            onBlur={() => setTimeout(() => setPartnerDropdown(false), 150)}
                                            onFocus={() => { if (partnerResults.length > 0) setPartnerDropdown(true); }}
                                        />
                                        <button
                                            onClick={handleReinvite}
                                            disabled={actionLoading || !partnerSelected}
                                            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {actionLoading ? "Sending…" : "Send New Invite"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Partner invite received — the partner needs to accept/decline */}
                            {myPartnerInviteReg && (
                                <div className="bg-zinc-900 border border-purple-500/30 rounded-2xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-purple-500/10 border-b border-purple-500/20">
                                        <p className="text-[10px] font-black tracking-widest text-purple-300 uppercase">🤝 Doubles Partner Invite</p>
                                        {partnerInviteTeamName && (
                                            <p className="text-xs text-zinc-400 mt-0.5">Team: <span className="text-white font-semibold">{partnerInviteTeamName}</span></p>
                                        )}
                                    </div>
                                    <div className="px-4 py-3">
                                        <p className="text-sm text-zinc-300">
                                            {partnerInviteFrom
                                                ? <><span className="text-white font-semibold">@{partnerInviteFrom}</span> wants you as their doubles partner.</>
                                                : "Someone invited you as their doubles partner."}
                                        </p>
                                        <p className="text-xs text-zinc-500 mt-1">Accepting will register you both in this tournament.</p>
                                    </div>
                                    <div className="px-4 pb-3 flex gap-2">
                                        <button
                                            onClick={handleAcceptPartnerInvite}
                                            disabled={actionLoading}
                                            className="flex-1 text-sm font-semibold py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl disabled:opacity-50 transition-colors"
                                        >
                                            {actionLoading ? "…" : "Accept"}
                                        </button>
                                        <button
                                            onClick={handleDeclinePartnerInvite}
                                            disabled={actionLoading}
                                            className="text-sm px-4 py-2 border border-zinc-700 text-zinc-400 rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Self-register */}
                            {canRegister && !myInviteId && !myPendingPartnerReg && !myPartnerInviteReg && (
                                <div className="flex flex-col gap-3">
                                    {/* Doubles: full team registration form */}
                                    {isDoublesTournament && (
                                        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
                                            <div className="px-4 py-2.5 bg-zinc-800/60 border-b border-zinc-700">
                                                <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase">🏸 Register as Team</p>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                {/* Team name */}
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-1">Team Name <span className="text-zinc-700 normal-case font-normal">(optional)</span></label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Thunder Smash"
                                                        value={teamNameInput}
                                                        onChange={e => setTeamNameInput(e.target.value)}
                                                        maxLength={40}
                                                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/60 transition-all"
                                                    />
                                                </div>
                                                {/* Partner search */}
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-1">Partner <span className="text-red-500">*</span></label>
                                                    <PartnerSearchInput
                                                        partnerSelected={partnerSelected}
                                                        partnerQuery={partnerQuery}
                                                        partnerResults={partnerResults}
                                                        partnerDropdown={partnerDropdown}
                                                        onSelect={p => { setPartnerSelected(p); setPartnerQuery(""); setPartnerDropdown(false); }}
                                                        onClear={() => { setPartnerSelected(null); setPartnerQuery(""); }}
                                                        onInput={handlePartnerInput}
                                                        onBlur={() => setTimeout(() => setPartnerDropdown(false), 150)}
                                                        onFocus={() => { if (partnerResults.length > 0) setPartnerDropdown(true); }}
                                                    />
                                                    <p className="text-[10px] text-zinc-600 mt-1">Your partner will receive an invite notification and must accept to confirm registration.</p>
                                                </div>
                                                <button
                                                    onClick={handleRegister}
                                                    disabled={actionLoading || !partnerSelected}
                                                    className="w-full bg-white text-black text-sm font-semibold py-2 rounded-xl hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    {actionLoading ? "Sending invite…" : "Register as Team"}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!isDoublesTournament && (
                                        <button
                                            onClick={handleRegister}
                                            disabled={actionLoading}
                                            className="self-start bg-white text-black text-sm font-semibold px-6 py-2 rounded-xl hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {actionLoading ? "Registering…" : "Register"}
                                        </button>
                                    )}
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

            {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-zinc-800 mb-6 gap-1">
                    {tabs.map(t => {
                        const liveCount = allMatches.filter(m => m.status === "ongoing").length;
                        const TAB_LABELS: Record<Tab, string> = {
                            participants: "👥 Participants",
                            referees:     "🟡 Officials & Referees",
                            bracket:      hasBracket ? "🏓 Bracket & Scoring" : "🏓 Bracket (pending)",
                            knockout:     "🏆 Knockout",
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
                    const confirmedTeams = isDoublesTournament ? buildDoublesTeams(confirmed) : [];
                    const invitedTeams = isDoublesTournament ? buildDoublesTeams(invited) : [];
                    const confirmedCount = isDoublesTournament ? confirmedTeams.length : confirmed.length;
                    const invitedCount = isDoublesTournament ? invitedTeams.length : invited.length;
                    if (confirmedCount === 0 && invitedCount === 0) {
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
                                    <div className="text-2xl font-black text-white">{confirmedCount}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">Confirmed</div>
                                </div>
                                <div className="w-px h-8 bg-zinc-800" />
                                <div>
                                    <div className="text-2xl font-black text-white">{tournament.max_participants}</div>
                            <div className="text-xs text-zinc-500 mt-0.5">Capacity ({participantUnitLabel})</div>
                                </div>
                                {invitedCount > 0 && (
                                    <>
                                        <div className="w-px h-8 bg-zinc-800" />
                                        <div>
                                            <div className="text-2xl font-black text-yellow-400">{invitedCount}</div>
                                            <div className="text-xs text-zinc-500 mt-0.5">Invited</div>
                                        </div>
                                    </>
                                )}
                                <div className="flex-1" />
                                {isOrganizer && !hasBracket && (
                                    <div className="flex items-center gap-3">
                                        {canGenerateBracketDirect && (
                                            <button
                                                onClick={handleGenerateBracket}
                                                disabled={bracketActionLoading}
                                                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {bracketActionLoading ? "Generating..." : "Generate Bracket"}
                                            </button>
                                        )}
                                        {needsPoolPlaySetup && (
                                            <Link
                                                href={`/tournaments/${tourId}/manage`}
                                                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                Configure pools in Manage →
                                            </Link>
                                        )}
                                        {!canGenerateBracketDirect && !needsPoolPlaySetup && tournament.registration_open && (
                                            <span className="text-xs text-zinc-500">
                                                Close registration first to unlock bracket generation.
                                            </span>
                                        )}
                                    </div>
                                )}
                                {/* mini capacity bar */}
                                <div className="flex items-center gap-2">
                                    <div className="w-24 bg-zinc-800 rounded-full h-1.5">
                                        <div
                                            className="bg-white rounded-full h-1.5 transition-all"
                                            style={{ width: `${Math.min(100, (confirmedCount / tournament.max_participants) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-zinc-500">{Math.round((confirmedCount / tournament.max_participants) * 100)}%</span>
                                </div>
                            </div>

                            {/* Player grid */}
                            {isDoublesTournament ? (() => {
                                const mkInit = (r: Registration) => (r.first_name?.[0] || "?").toUpperCase();
                                const mkName = (r: Registration) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.player_id.slice(0, 8);
                                return (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {confirmedTeams.map(([p1, p2], i) => {
                                            const rec1 = playerRecord[p1.player_id];
                                            return (
                                                <div key={p1.registration_id} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 hover:border-zinc-700 transition-colors">
                                                    {/* Team seed + label */}
                                                    <div className="flex items-center gap-2 mb-2.5">
                                                        <span className="w-5 text-center text-xs font-mono text-zinc-600 shrink-0">{p1.seed ?? i + 1}</span>
                                                        <span className="text-[9px] font-black tracking-widest text-zinc-700 uppercase">Doubles Team</span>
                                                        {rec1 && (
                                                            <span className="ml-auto text-[10px] font-mono">
                                                                <span className="text-emerald-400">{rec1.w}W</span>
                                                                <span className="text-zinc-600"> · </span>
                                                                <span className="text-red-400">{rec1.l}L</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Player 1 */}
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-white shrink-0">{mkInit(p1)}</div>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-white truncate">{mkName(p1)}</div>
                                                            <div className="text-xs text-zinc-500">{p1.registered_at ? new Date(p1.registered_at).toLocaleDateString() : ""}</div>
                                                        </div>
                                                    </div>
                                                    {/* Divider */}
                                                    <div className="flex items-center gap-2 ml-10 my-1.5">
                                                        <div className="flex-1 h-px bg-zinc-800" />
                                                        <span className="text-[9px] font-bold text-zinc-700">+</span>
                                                        <div className="flex-1 h-px bg-zinc-800" />
                                                    </div>
                                                    {/* Player 2 */}
                                                    {p2 ? (
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-white shrink-0">{mkInit(p2)}</div>
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold text-white truncate">{mkName(p2)}</div>
                                                                <div className="text-xs text-zinc-500">{p2?.registered_at ? new Date(p2.registered_at).toLocaleDateString() : ""}</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-full bg-zinc-800/50 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 shrink-0 text-xs">?</div>
                                                            <span className="text-xs text-zinc-600 italic">Partner pending</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })() : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {confirmed.map((reg, i) => {
                                        const rec = playerRecord[reg.player_id];
                                        const initials = (reg.first_name?.[0] || "?").toUpperCase();
                                        const fullName = `${reg.first_name || ''} ${reg.last_name || ''}`.trim() || reg.player_id.slice(0, 8);
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
                                                    <div className="text-xs text-zinc-500">{reg.registered_at ? new Date(reg.registered_at).toLocaleDateString() : ""}</div>
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
                            )}

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
                                                    {(reg.first_name?.[0] || "?").toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-zinc-400 truncate">
                                                        {`${reg.first_name || ''} ${reg.last_name || ''}`.trim() || reg.player_id.slice(0, 8)}
                                                    </div>
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

                {/* Referees tab */}
                {tab === "referees" && (
                    <RefereesView
                        referees={tournamentReferees}
                        isOrganizer={isOrganizer}
                        tourId={tourId}
                    />
                )}

                {/* Bracket tab */}
                {tab === "bracket" && (
                    <div>
                        {!hasBracket ? (
                            <div className="text-center py-10 text-zinc-500">
                                <div className="text-3xl mb-2">📋</div>
                                <p>Bracket not generated yet.</p>
                                {canGenerateBracketDirect && (
                                    <div className="mt-4 flex flex-col items-center gap-3">
                                        <button
                                            onClick={handleGenerateBracket}
                                            disabled={bracketActionLoading}
                                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {bracketActionLoading ? "Generating..." : "Generate Bracket"}
                                        </button>
                                        <p className="text-xs text-zinc-600">
                                            Create the {getTournamentFormatLabel(tournament.format)} bracket from this page.
                                        </p>
                                    </div>
                                )}
                                {needsPoolPlaySetup && (
                                    <Link href={`/tournaments/${tourId}/manage`} className="text-sm text-blue-400 mt-2 block">
                                        Configure pool setup in Manage →
                                    </Link>
                                )}
                                {isOrganizer && !canGenerateBracketDirect && !needsPoolPlaySetup && tournament.registration_open && (
                                    <p className="text-sm text-zinc-600 mt-2">
                                        Close registration first, then you can generate the bracket here.
                                    </p>
                                )}
                            </div>
                        ) : bracketSections.length > 0 ? (
                            isGroupStageKnockout ? (
                                <GroupStageBracketView sections={groupStageSections} playerRecord={playerRecord} />
                            ) : (
                                <SectionedBracketView sections={bracketSections} playerRecord={playerRecord} />
                            )
                        ) : (
                            <BracketView rounds={bracketRounds} connectors={useTreeConnectors} playerRecord={playerRecord} />
                        )}
                    </div>
                )}

                {/* Knockout tab (Group Stage + Knockout only) */}
                {tab === "knockout" && isGroupStageKnockout && (
                    <KnockoutStageView
                        knockoutSection={knockoutSection}
                        groupMatches={groupStageMatches}
                        completedGroupMatches={completedGroupStageMatches}
                        allGroupMatchesComplete={allGroupStageMatchesComplete}
                        knockoutHasAssignedPlayers={knockoutHasAssignedPlayers}
                        registrations={registrations}
                        playerRecord={playerRecord}
                    />
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
                    <LiveMatchesView matches={allMatches} isOrganizer={isOrganizer} />
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
            </main>
        </div>
    );
}

function RefereesView({ referees, isOrganizer, tourId }: {
    referees: TournamentReferee[];
    isOrganizer: boolean;
    tourId: string;
}) {
    const checkedInCount = referees.filter(referee => referee.is_checked_in).length;
    const activeCount = referees.filter(referee => referee.current_match_load > 0).length;

    if (referees.length === 0) {
        return (
            <div className="text-center py-16 text-zinc-500">
                <div className="text-4xl mb-3">🟡</div>
                <p className="font-medium">No official referees registered yet.</p>
                <p className="text-sm mt-1 text-zinc-600">
                    {isOrganizer
                        ? "You can register referees from the Manage page."
                        : "Check back once the organizer publishes the officiating roster."}
                </p>
                {isOrganizer && (
                    <Link
                        href={`/tournaments/${tourId}/manage`}
                        className="inline-flex items-center mt-4 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/15"
                    >
                        Manage Referees
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                    <div className="text-2xl font-black text-white">{referees.length}</div>
                    <div className="text-xs text-zinc-500 mt-1">Registered officials</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                    <div className="text-2xl font-black text-emerald-400">{checkedInCount}</div>
                    <div className="text-xs text-zinc-500 mt-1">Checked in today</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4">
                    <div className="text-2xl font-black text-blue-400">{activeCount}</div>
                    <div className="text-xs text-zinc-500 mt-1">Currently assigned</div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {referees.map(referee => {
                    const displayName = `${referee.first_name || ''} ${referee.last_name || ''}`.trim() || referee.id.slice(0, 8);
                    return (
                        <div
                            key={referee.id}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 hover:border-zinc-700 transition-colors"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                    {(referee.first_name?.[0] || "?").toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-white truncate">{displayName}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                            Official
                                        </span>
                                        {referee.is_participant && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                Participant
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1">{referee.registered_at ? new Date(referee.registered_at).toLocaleDateString() : ""}</div>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                            referee.is_checked_in
                                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                        }`}>
                                            {referee.is_checked_in
                                                ? (referee.checkin_status === "available_to_ref" ? "Ready to ref" : "Checked in")
                                                : "Not checked in"}
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                                            {referee.current_match_load} active match{referee.current_match_load === 1 ? "" : "es"}
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                                            {referee.total_match_assignments} total assigned
                                        </span>
                                        {referee.is_club_member && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                                                {referee.club_role ? `${referee.club_role} member` : "Club member"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Bracket views ─────────────────────────────────────────────────────────────

// Sections that use elimination tree connectors
const CONNECTOR_SECTIONS = new Set(["W", "L", "K", "GF"]);

type PlayerRecord = Record<string, { w: number; l: number }>;

function matchHasAssignedPlayers(match: BracketMatch): boolean {
    return Boolean(
        match.player1
        || match.player2
        || match.team1?.some(member => member !== null)
        || match.team2?.some(member => member !== null)
    );
}

function GroupStageBracketView({ sections, playerRecord = {} }: { sections: BracketSection[]; playerRecord?: PlayerRecord }) {
    if (sections.length === 0) {
        return (
            <div className="text-center py-10 text-zinc-500">
                <div className="text-3xl mb-2">🏓</div>
                <p>Group-stage matches will appear here once the bracket is generated.</p>
            </div>
        );
    }

    const totalMatches = sections.reduce((sum, section) =>
        sum + section.rounds.reduce((roundSum, round) => roundSum + round.matches.length, 0),
    0);
    const completedMatches = sections.reduce((sum, section) =>
        sum + section.rounds.reduce((roundSum, round) =>
            roundSum + round.matches.filter(match => match.status === "completed").length,
        0),
    0);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4">
                    <div className="text-2xl font-black text-white">{sections.length}</div>
                    <div className="text-xs text-zinc-500 mt-1">Groups in play</div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4">
                    <div className="text-2xl font-black text-white">{completedMatches}</div>
                    <div className="text-xs text-zinc-500 mt-1">Completed group matches</div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4">
                    <div className="text-2xl font-black text-white">{totalMatches}</div>
                    <div className="text-xs text-zinc-500 mt-1">Total matches to score</div>
                </div>
            </div>

            {sections.map((section, index) => {
                const sectionMatches = section.rounds.flatMap(round => round.matches);
                const sectionCompleted = sectionMatches.filter(match => match.status === "completed").length;

                return (
                    <section
                        key={section.section}
                        className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 sm:px-5 sm:py-5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-sm font-black text-zinc-300 shrink-0">
                                {index + 1}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">
                                    {section.label}
                                </h3>
                                <p className="text-xs text-zinc-500 mt-1">
                                    {sectionCompleted} of {sectionMatches.length} matches completed
                                </p>
                            </div>
                            <div className="ml-auto">
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-300">
                                    Vertical match board
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3">
                            {sectionMatches.map(match => (
                                <MatchCard
                                    key={match.match_id}
                                    match={match}
                                    playerRecord={playerRecord}
                                    roundLabel={section.label}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function KnockoutStageView({
    knockoutSection,
    groupMatches,
    completedGroupMatches,
    allGroupMatchesComplete,
    knockoutHasAssignedPlayers,
    registrations,
    playerRecord = {},
}: {
    knockoutSection: BracketSection | null;
    groupMatches: BracketMatch[];
    completedGroupMatches: number;
    allGroupMatchesComplete: boolean;
    knockoutHasAssignedPlayers: boolean;
    registrations: Registration[];
    playerRecord?: PlayerRecord;
}) {
    if (!knockoutSection) {
        return (
            <div className="text-center py-10 text-zinc-500">
                <div className="text-3xl mb-2">🏆</div>
                <p>Knockout rounds will appear here once the tournament reaches that stage.</p>
            </div>
        );
    }

    const standingsGroups = buildStandingGroups(groupMatches, registrations, "group_stage_knockout");

    if (!allGroupMatchesComplete) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-5">
                    <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-300">Waiting For Group Results</div>
                    <p className="mt-2 text-sm text-zinc-300">
                        The knockout bracket will unlock after every group-stage match in Bracket &amp; Scoring is completed.
                    </p>
                    <p className="mt-3 text-xs text-zinc-500">
                        Progress: {completedGroupMatches} of {groupMatches.length} group matches completed.
                    </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-5">
                    <div className="text-sm font-semibold text-white">What happens next</div>
                    <p className="mt-2 text-sm text-zinc-400">
                        Once all group results are in, the qualified players or teams will be identified here before the actual knockout slots are shown.
                    </p>
                </div>
            </div>
        );
    }

    if (!knockoutHasAssignedPlayers) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 px-5 py-5">
                    <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-300">Qualified Players Pending Knockout Placement</div>
                    <p className="mt-2 text-sm text-zinc-300">
                        Group play is complete. The organizer still needs to promote the qualifiers into the knockout bracket, so the actual knockout matchups are not shown yet.
                    </p>
                </div>

                {standingsGroups.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {standingsGroups.map(group => {
                            const tieAtCutoff = hasQualificationTieAtCutoff(group.rows);
                            const qualifiers = tieAtCutoff
                                ? []
                                : group.rows.slice(0, Math.min(2, group.rows.length));

                            return (
                                <div
                                    key={group.side}
                                    className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-5"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-bold text-white uppercase tracking-[0.14em]">{group.label}</h3>
                                            <p className="text-xs text-zinc-500 mt-1">Top 2 advance to knockout</p>
                                        </div>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-300">
                                            {group.rows.length} ranked
                                        </span>
                                    </div>

                                    {tieAtCutoff ? (
                                        <p className="mt-4 text-sm text-amber-300">
                                            Qualification is tied on wins and point differential at the cutoff. Final qualifiers will lock once the organizer promotes the knockout stage.
                                        </p>
                                    ) : (
                                        <div className="mt-4 flex flex-col gap-3">
                                            {qualifiers.map((row, index) => (
                                                <div
                                                    key={row.id}
                                                    className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-white truncate">{row.name}</div>
                                                        </div>
                                                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300 shrink-0">
                                                            Q{index + 1}
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-zinc-400">
                                                        <span className="rounded-full bg-zinc-800 px-2 py-0.5">{row.wins}W</span>
                                                        <span className="rounded-full bg-zinc-800 px-2 py-0.5">{row.losses}L</span>
                                                        <span className="rounded-full bg-zinc-800 px-2 py-0.5">
                                                            {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff} diff
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-5">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-300">Knockout Bracket Live</div>
                <p className="mt-2 text-sm text-zinc-300">
                    The qualified players are locked in and the knockout bracket is now ready to follow.
                </p>
            </div>
            <BracketView rounds={knockoutSection.rounds} connectors playerRecord={playerRecord} />
        </div>
    );
}

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
        const names = team.filter(Boolean).map(p => `${p!.first_name || ''} ${p!.last_name || ''}`.trim() || p!.id.slice(0, 8));
        return <span className="truncate">{names.join(" / ")}</span>;
    }
    if (!fallback) return <span className="text-zinc-600 italic text-xs">TBD</span>;
    return <span className="truncate">{`${fallback.first_name || ''} ${fallback.last_name || ''}`.trim() || fallback.id.slice(0, 8)}</span>;
}

function formatMatchClock(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getTournamentPhaseMeta(match: BracketMatch): { label: string; className: string } {
    const phase = match.tournament_phase
        || (match.dispute_reason ? "disputed" : "")
        || (match.result_confirmed_at ? "verified" : "")
        || (match.result_submitted_at ? "result_pending" : "")
        || (match.status === "ongoing" ? "ongoing" : "")
        || (match.called_at ? "called" : "")
        || (match.scheduled_at ? "scheduled" : "")
        || "awaiting_assignment";

    const meta: Record<string, { label: string; className: string }> = {
        awaiting_assignment: { label: "Needs setup", className: "border border-white/10 bg-zinc-800/60 text-zinc-300" },
        scheduled: { label: "Scheduled", className: "border border-sky-500/20 bg-sky-500/10 text-sky-300" },
        called: { label: "Called", className: "border border-amber-500/20 bg-amber-500/10 text-amber-300" },
        ready: { label: "Ready", className: "border border-cyan-500/20 bg-cyan-500/10 text-cyan-300" },
        ongoing: { label: "In progress", className: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
        result_pending: { label: "Awaiting confirmation", className: "border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300" },
        verified: { label: "Verified", className: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
        disputed: { label: "Under review", className: "border border-red-500/20 bg-red-500/10 text-red-300" },
    };

    return meta[phase] ?? {
        label: phase.replace(/_/g, " "),
        className: "border border-white/10 bg-zinc-800/60 text-zinc-300",
    };
}

function MatchCard({ match, compact = false, playerRecord = {}, roundLabel }: {
    match: BracketMatch; compact?: boolean; playerRecord?: PlayerRecord; roundLabel?: string;
}) {
    const completed = match.status === "completed";
    const ongoing   = match.status === "ongoing";

    function isWinner(p: PlayerMini) {
        return completed && !!p && match.winner_id === p.id;
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

    const phaseMeta = getTournamentPhaseMeta(match);
    const mediaUrl = match.court_image_url || match.club_logo_url || null;
    const latestAction = match.recent_actions?.[0] ?? null;
    const verificationLabel = match.dispute_reason
        ? "Result under review"
        : match.result_confirmed_at
            ? `Verified${match.result_confirmed_by_name ? ` by ${match.result_confirmed_by_name}` : ""}`
            : match.result_submitted_at
                ? `Submitted${match.result_submitted_by_name ? ` by ${match.result_submitted_by_name}` : ""}`
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
            {!compact && (roundLabel || ongoing || match.court_name || match.tournament_phase) && (
                <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-zinc-800/60">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        {roundLabel ?? "Match"}{matchNum != null ? ` · #${matchNum}` : ""}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {ongoing && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Live
                            </span>
                        )}
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${phaseMeta.className}`}>
                            {phaseMeta.label}
                        </span>
                    </div>
                </div>
            )}

            {/* Teams / players */}
            {match.is_doubles && match.team1 && match.team2 ? (() => {
                // Doubles: show each player on their own row with lobby dot
                const isLobbyActive = !!(match.team1_ready_at || match.team2_ready_at || match.referee_ready_at);
                const t1p1 = match.team1[0]; const t1p2 = match.team1[1];
                const t2p1 = match.team2[0]; const t2p2 = match.team2[1];

                function PlayerRow({ player, inLobby, winner, sets }: {
                    player: PlayerMini; inLobby: boolean; winner: boolean; sets?: number;
                }) {
                    if (!player) return (
                        <div className="flex items-center gap-2 px-3 py-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" />
                            <span className="text-xs text-zinc-600 italic">TBD</span>
                        </div>
                    );
                    const initials = (player.first_name?.[0] || "?").toUpperCase();
                    const name = `${player.first_name || ''} ${player.last_name || ''}`.trim() || player.id.slice(0, 8);
                    return (
                        <div className={`flex items-center gap-2 px-3 py-1.5 ${winner ? "bg-white/5" : ""}`}>
                            {isLobbyActive && (
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inLobby ? "bg-emerald-500" : "bg-zinc-700"}`} title={inLobby ? "In lobby" : "Not yet"} />
                            )}
                            <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">
                                {initials}
                            </div>
                            <span className={`text-xs min-w-0 truncate flex-1 ${winner ? "text-white font-semibold" : "text-zinc-300"}`}>
                                {name}
                            </span>
                            {winner && <span className="text-yellow-400 text-[10px] shrink-0">👑</span>}
                            {sets != null && sets > 0 && (
                                <span className="text-xs font-mono text-zinc-400 shrink-0 font-bold ml-auto">{sets}</span>
                            )}
                        </div>
                    );
                }

                return (
                    <>
                        {/* Team 1 */}
                        <div className={`border-b border-zinc-800 ${side1Win ? "bg-white/5" : ""}`}>
                            <div className="px-3 pt-1.5 pb-0.5">
                                <span className="text-[9px] font-black tracking-widest text-zinc-600 uppercase">Team 1</span>
                                {match.sets.length > 0 && side1Win && <span className="ml-2 text-yellow-400 text-[10px]">👑</span>}
                                {match.sets.length > 0 && <span className="float-right text-xs font-mono font-bold text-zinc-400">{p1Sets}</span>}
                            </div>
                            <PlayerRow player={t1p1!} inLobby={!!match.team1_ready_at} winner={side1Win} />
                            <PlayerRow player={t1p2!} inLobby={!!match.team1_ready_at} winner={side1Win} />
                        </div>
                        {/* Team 2 */}
                        <div className={`border-b border-zinc-800 ${side2Win ? "bg-white/5" : ""}`}>
                            <div className="px-3 pt-1.5 pb-0.5">
                                <span className="text-[9px] font-black tracking-widest text-zinc-600 uppercase">Team 2</span>
                                {match.sets.length > 0 && side2Win && <span className="ml-2 text-yellow-400 text-[10px]">👑</span>}
                                {match.sets.length > 0 && <span className="float-right text-xs font-mono font-bold text-zinc-400">{p2Sets}</span>}
                            </div>
                            <PlayerRow player={t2p1!} inLobby={!!match.team2_ready_at} winner={side2Win} />
                            <PlayerRow player={t2p2!} inLobby={!!match.team2_ready_at} winner={side2Win} />
                        </div>
                        {/* Referee row */}
                        {!compact && (
                            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/60">
                                {isLobbyActive && (
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${match.referee_ready_at ? "bg-emerald-500" : "bg-zinc-700"}`} title={match.referee_ready_at ? "Ref in lobby" : "Ref not yet"} />
                                )}
                                <span className="text-[10px] text-zinc-500 shrink-0">Ref</span>
                                {match.referee_name ? (
                                    <span className={`text-xs truncate ${match.referee_ready_at ? "text-zinc-300" : "text-zinc-500"}`}>
                                        {match.referee_name}
                                    </span>
                                ) : (
                                    <span className="text-xs text-zinc-700 italic">No referee</span>
                                )}
                            </div>
                        )}
                    </>
                );
            })() : (
                <>
                    {/* Singles: original two-row layout */}
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
                    <div className={`flex items-center justify-between px-3 py-2 border-b border-zinc-800 ${side2Win ? "bg-white/5" : ""}`}>
                        <div className={`text-sm min-w-0 flex items-center ${side2Win ? "text-white font-semibold" : "text-zinc-300"}`}>
                            {teamLabel(match.team2, match.player2)}
                            {side2Win && <span className="ml-1 text-yellow-400 text-xs">👑</span>}
                            {!compact && wlBadge(match.player2?.id)}
                        </div>
                        {match.sets.length > 0 && (
                            <div className="text-xs font-mono text-zinc-400 ml-1 shrink-0 font-bold">{p2Sets}</div>
                        )}
                    </div>
                </>
            )}

            {/* Info chips: court · schedule · status */}
            {!compact && (match.court_name || match.scheduled_at || match.tournament_phase || verificationLabel || latestAction || (!match.is_doubles && match.referee_name)) && (
                <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-t border-zinc-800/60">
                    {mediaUrl && (
                        <div
                            className="w-7 h-7 rounded-full border border-white/10 bg-zinc-900 bg-cover bg-center"
                            style={{ backgroundImage: `url(${mediaUrl})` }}
                            aria-hidden="true"
                        />
                    )}
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
                    {!match.is_doubles && match.referee_name && (
                        <span className="flex items-center gap-1 text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            🟡 {match.referee_name}
                        </span>
                    )}
                    {match.scheduled_at && (
                        <span className="flex items-center gap-1 text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            🕐 {new Date(match.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    )}
                    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${phaseMeta.className}`}>
                        {phaseMeta.label}
                    </span>
                    {verificationLabel && (
                        <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
                            match.dispute_reason
                                ? "bg-red-500/10 text-red-300 border border-red-500/20"
                                : match.result_confirmed_at
                                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                    : "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20"
                        }`}>
                            {verificationLabel}
                        </span>
                    )}
                </div>
            )}

            {/* Set scores footer */}
            {!compact && match.status !== "pending" && (
                <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center justify-between gap-3 mt-auto">
                    {setScoreStr
                        ? <span className="text-[10px] font-mono text-zinc-500">{setScoreStr}</span>
                        : <span className="text-[10px] text-zinc-700 truncate">{latestAction?.description ?? ""}</span>
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
    id: string; name: string; group: string;
    played: number; wins: number; losses: number; points: number;
    pointDiff: number;
}

interface StandingGroup {
    side: string;
    label: string;
    rows: StandingRow[];
}

function sortStandingRows(a: StandingRow, b: StandingRow): number {
    return b.points - a.points
        || b.wins - a.wins
        || b.pointDiff - a.pointDiff
        || a.losses - b.losses
        || a.name.localeCompare(b.name);
}

function buildStandingGroups(matches: BracketMatch[], registrations: Registration[], format: string): StandingGroup[] {
    const playerMap: Record<string, Registration> = {};
    for (const registration of registrations) {
        playerMap[registration.player_id] = registration;
    }

    const rows: Record<string, StandingRow> = {};

    function getOrCreate(id: string, group: string): StandingRow {
        if (!rows[id]) {
            const registration = playerMap[id];
            rows[id] = {
                id,
                group,
                name: `${registration?.first_name || ''} ${registration?.last_name || ''}`.trim() || id.slice(0, 8),
                played: 0,
                wins: 0,
                losses: 0,
                points: 0,
                pointDiff: 0,
            };
        }
        return rows[id];
    }

    for (const match of matches) {
        if (match.status !== "completed" || !match.winner_id) continue;

        const side = match.bracket_side ?? "";
        const isGroupedFormat = format === "group_stage_knockout" || format === "pool_play";
        if (isGroupedFormat && !side.startsWith("G")) continue;
        if (!match.player1 || !match.player2) continue;

        const p1Row = getOrCreate(match.player1.id, side);
        const p2Row = getOrCreate(match.player2.id, side);
        p1Row.played++;
        p2Row.played++;

        const p1Points = match.sets?.reduce((sum, set) => sum + (set.player1_score ?? 0), 0) ?? 0;
        const p2Points = match.sets?.reduce((sum, set) => sum + (set.player2_score ?? 0), 0) ?? 0;

        if (match.winner_id === match.player1.id) {
            p1Row.wins++;
            p1Row.points += 2;
            p2Row.losses++;
        } else {
            p2Row.wins++;
            p2Row.points += 2;
            p1Row.losses++;
        }

        p1Row.pointDiff += p1Points - p2Points;
        p2Row.pointDiff += p2Points - p1Points;
    }

    function groupLabel(side: string): string {
        if (format === "round_robin") return "Overall";
        return `Group ${side.slice(1)}`;
    }

    const byGroup: Record<string, StandingRow[]> = {};
    for (const row of Object.values(rows)) {
        const label = groupLabel(row.group);
        byGroup[label] = byGroup[label] ?? [];
        byGroup[label].push(row);
    }

    return Object.keys(byGroup)
        .sort()
        .map(label => ({
            side: byGroup[label][0]?.group ?? label,
            label,
            rows: [...byGroup[label]].sort(sortStandingRows),
        }));
}

function hasQualificationTieAtCutoff(rows: StandingRow[]): boolean {
    if (rows.length < 3) return false;
    const second = rows[1];
    const third = rows[2];
    return second.wins === third.wins && second.pointDiff === third.pointDiff;
}

function StandingsView({ matches, registrations, format }: {
    matches: BracketMatch[];
    registrations: Registration[];
    format: string;
}) {
    const showPointDiff = format === "pool_play" || format === "group_stage_knockout";
    const groups = buildStandingGroups(matches, registrations, format);

    if (groups.length === 0) {
        return (
            <div className="text-center py-10 text-zinc-500">
                <p>No completed matches yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {groups.map(group => (
                <div key={group.label}>
                    {groups.length > 1 && (
                        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-2">{group.label}</h3>
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
                                    {showPointDiff && <th className="text-center px-3 py-2.5 text-xs font-medium text-zinc-400">+/−</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {group.rows.map((row, i) => (
                                    <tr key={row.id} className={`border-b border-zinc-800 last:border-0 ${i === 0 ? "bg-yellow-500/5" : "bg-zinc-900"}`}>
                                        <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{i + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-white">{row.name}</div>
                                            <div className="text-xs text-zinc-500">{row.group}</div>
                                        </td>
                                        <td className="px-3 py-3 text-center text-zinc-300 font-mono">{row.played}</td>
                                        <td className="px-3 py-3 text-center text-emerald-400 font-mono font-semibold">{row.wins}</td>
                                        <td className="px-3 py-3 text-center text-red-400 font-mono">{row.losses}</td>
                                        <td className="px-3 py-3 text-center text-white font-mono font-bold">{row.points}</td>
                                        {showPointDiff && (
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
            name: `${reg?.first_name || ''} ${reg?.last_name || ''}`.trim() || p.id.slice(0, 8),
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
                                    <div className="text-[10px] text-zinc-500">{p.name}</div>
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
    const phaseMeta = getTournamentPhaseMeta(match);
    const mediaUrl = match.court_image_url || match.club_logo_url || null;
    const latestAction = match.recent_actions?.[0] ?? null;
    const verificationLabel = match.dispute_reason
        ? "Result under review"
        : match.result_confirmed_at
            ? `Verified${match.result_confirmed_by_name ? ` by ${match.result_confirmed_by_name}` : ""}`
            : match.result_submitted_at
                ? `Submitted${match.result_submitted_by_name ? ` by ${match.result_submitted_by_name}` : ""}`
                : null;
    const readiness = [
        match.team1_ready_at ? "Team 1 ready" : null,
        match.team2_ready_at ? "Team 2 ready" : null,
        match.referee_ready_at ? "Ref ready" : null,
    ].filter(Boolean) as string[];

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
                    <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            ongoing   ? "text-emerald-400 bg-emerald-500/15" :
                            completed ? "text-zinc-400 bg-zinc-800"          :
                            "text-yellow-400 bg-yellow-500/15"
                        }`}>
                            {ongoing ? "Live" : completed ? "Done" : "Soon"}
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${phaseMeta.className}`}>
                            {phaseMeta.label}
                        </span>
                    </div>
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
                    {mediaUrl && (
                        <div
                            className="w-8 h-8 rounded-full border border-white/10 bg-zinc-900 bg-cover bg-center"
                            style={{ backgroundImage: `url(${mediaUrl})` }}
                            aria-hidden="true"
                        />
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        match.court_name ? "bg-zinc-800 text-zinc-400" : "bg-zinc-800/40 text-zinc-600"
                    }`}>
                        🏟️ {match.court_name ?? "Court TBA"}
                    </span>
                    {(match.referee_name || match.referee_id) && (
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">
                            🟡 {match.referee_name || "Assigned referee"}
                        </span>
                    )}
                    {match.scheduled_at && (
                        <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">
                            🕐 {new Date(match.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    )}
                    {match.checkin_deadline_at && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                            Check-in {formatMatchClock(match.checkin_deadline_at)}
                        </span>
                    )}
                    {verificationLabel && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            match.dispute_reason
                                ? "bg-red-500/10 text-red-300 border border-red-500/20"
                                : match.result_confirmed_at
                                    ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                    : "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20"
                        }`}>
                            {verificationLabel}
                        </span>
                    )}
                    {readiness.map(label => (
                        <span
                            key={label}
                            className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full font-semibold"
                        >
                            {label}
                        </span>
                    ))}
                    {latestAction && (
                        <span className="text-[10px] bg-white/5 text-zinc-300 border border-white/10 px-2 py-0.5 rounded-full font-semibold">
                            {latestAction.description}
                        </span>
                    )}
                    {isOrganizer && !match.referee_name && (
                        <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                            ⚠️ No referee
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
}

// ── Partner search input component ────────────────────────────────────────────

function PartnerSearchInput({
    partnerSelected,
    partnerQuery,
    partnerResults,
    partnerDropdown,
    onSelect,
    onClear,
    onInput,
    onBlur,
    onFocus,
}: {
    partnerSelected: { id: string; first_name: string | null; last_name: string | null } | null;
    partnerQuery: string;
    partnerResults: { id: string; first_name: string | null; last_name: string | null }[];
    partnerDropdown: boolean;
    onSelect: (p: { id: string; first_name: string | null; last_name: string | null }) => void;
    onClear: () => void;
    onInput: (val: string) => void;
    onBlur: () => void;
    onFocus: () => void;
}) {
    if (partnerSelected) {
        const displayName = `${partnerSelected.first_name || ''} ${partnerSelected.last_name || ''}`.trim() || partnerSelected.id.slice(0, 8);
        return (
            <div className="flex items-center gap-2.5 bg-zinc-950 border border-emerald-500/40 rounded-xl px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">
                    {(partnerSelected.first_name?.[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                </div>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-zinc-500 hover:text-white transition-colors shrink-0 text-sm font-bold"
                    aria-label="Clear selection"
                >
                    ✕
                </button>
            </div>
        );
    }

    return (
        <div className="relative">
            <input
                type="text"
                placeholder="Search by name…"
                value={partnerQuery}
                onChange={e => onInput(e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500/60 transition-all"
            />
            {partnerDropdown && partnerResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
                    {partnerResults.map(p => {
                        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id.slice(0, 8);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onMouseDown={() => onSelect(p)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                            >
                                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300 shrink-0">
                                    {(p.first_name?.[0] || "?").toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{name}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
            {partnerDropdown && partnerResults.length === 0 && partnerQuery.length >= 2 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-500 shadow-xl">
                    No players found for &ldquo;{partnerQuery}&rdquo;
                </div>
            )}
        </div>
    );
}

function LiveMatchesView({ matches, isOrganizer }: {
    matches: BracketMatch[]; isOrganizer: boolean;
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
    const sortedMatches = [...filtered].sort((a, b) => {
        const aIndex = STATUS_ORDER.indexOf(a.status);
        const bIndex = STATUS_ORDER.indexOf(b.status);
        return (aIndex === -1 ? STATUS_ORDER.length : aIndex) - (bIndex === -1 ? STATUS_ORDER.length : bIndex);
    });

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

            <div className="grid gap-4">
                {sortedMatches.map((match) => (
                    <LiveMatchCard
                        key={match.match_id}
                        match={match}
                        roundLabel={match.round_number != null ? `Round ${match.round_number}` : undefined}
                        isOrganizer={isOrganizer}
                    />
                ))}
            </div>

        </div>
    );
}

function MetaItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">{label}</span>
            <span className="text-[10px] font-black text-white uppercase tracking-wider">{value}</span>
        </div>
    );
}

function ControlCard({ title, desc, icon, href, onClick, disabled, loading }: { 
    title: string; desc: string; icon: string; href?: string; onClick?: () => void; disabled?: boolean; loading?: boolean;
}) {
    const content = (
        <div className={`h-full bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-3xl p-6 transition-all group ${!disabled && (href || onClick) ? "hover:border-cyan-500/30 hover:-translate-y-1 cursor-pointer" : "opacity-50"}`}>
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform">
                    {loading ? "⌛" : icon}
                </div>
                <div>
                    <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] mb-1">{title}</h3>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">{desc}</p>
                </div>
            </div>
        </div>
    );

    if (href) return <Link href={href}>{content}</Link>;
    return <button onClick={onClick} disabled={disabled || loading} className="text-left w-full h-full">{content}</button>;
}
