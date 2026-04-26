"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import Link from "next/link";
import TournamentMatchOpsModal from "@/components/TournamentMatchOpsModal";
import { getTournamentFormatLabel } from "@/lib/tournamentFormats";

interface Tournament {
    id: string; name: string; sport: string; format: string;
    match_format: string; status: string; registration_open: boolean;
    max_participants: number; participant_count: number;
    starts_at: string | null; ends_at: string | null;
    club_id?: string | null;
    venue_mode?: "club" | "external" | "tbd";
    venue_name?: string | null;
    venue_address?: string | null;
    draw_method: string; smart_tiered_config: Record<string, unknown> | null;
    min_rating: number | null; max_rating: number | null;
    requires_approval: boolean; knockout_best_of: 1 | 3; group_stage_best_of: 1 | 3;
}
interface TournamentClub {
    id: string;
    name: string;
    address: string | null;
    sport: string | null;
    court_count: number;
    compatible_court_count: number;
}
interface ClubOption {
    id: string;
    name: string;
    sport: string | null;
    address?: string | null;
    court_count: number;
}
interface PlayerAssessment {
    rating: number; readiness_score: number;
    total_matches: number; activity_score: number;
    win_rate: number; win_streak: number;
    meets_rating_requirement: boolean;
    flags: string[];
}
interface PreviewGroup {
    label: string;
    members: { player_id: string; first_name: string | null; last_name: string | null; rating: number }[];
}
interface FairnessScores {
    strength_balance_score: number;
    competitiveness_score: number;
    club_collision_count: number;
    location_collision_count: number;
    combined_score: number;
}
interface Registration {
    registration_id: string; player_id: string; seed: number | null;
    first_name: string | null; last_name: string | null;
    registered_at: string; status: string; source: string;
    partner_id?: string | null; partner_first_name?: string | null; partner_last_name?: string | null;
    assessment?: PlayerAssessment;
}

interface PlayerSearchResult {
    id: string;
    first_name: string | null;
    last_name: string | null;
}

type PlayerMini = { id: string; first_name: string | null; last_name: string | null } | null;
interface BracketMatch {
    match_id: string; bracket_position: number; bracket_side: string | null;
    round_number: number | null;
    status: string; is_doubles: boolean;
    player1: PlayerMini; player2: PlayerMini;
    team1: PlayerMini[] | null; team2: PlayerMini[] | null;
    winner_id: string | null; scheduled_at: string | null; started_at: string | null;
    best_of?: number | null;
    sets: { set_number: number; player1_score: number; player2_score: number }[];
    court_id: string | null; court_name: string | null;
    referee_id: string | null; referee_name: string | null;
    tournament_phase?: string | null;
    called_at?: string | null;
    checkin_deadline_at?: string | null;
    team1_ready_at?: string | null;
    team2_ready_at?: string | null;
    referee_ready_at?: string | null;
    result_submitted_at?: string | null;
    result_submitted_by?: string | null;
    result_submitted_by_name?: string | null;
    result_confirmed_at?: string | null;
    result_confirmed_by?: string | null;
    result_confirmed_by_name?: string | null;
    dispute_reason?: string | null;
    court_image_url?: string | null;
    club_logo_url?: string | null;
    recent_actions?: { id: string; type: string; description: string; created_at: string | null }[];
}
interface BracketRound   { round: number; label: string; matches: BracketMatch[] }
interface BracketSection { section: string; label: string; rounds: BracketRound[] }
interface OfficiatingReferee {
    id: string;
    first_name: string | null;
    last_name: string | null;
    club_role: string | null;
    is_club_member?: boolean;
    is_checked_in: boolean;
    checkin_status: string | null;
    has_referee_role: boolean;
    is_participant: boolean;
    current_match_load: number;
    registered_for_tournament?: boolean;
    suggested: boolean;
}
interface OfficiatingCourt {
    id: string;
    name: string;
    sport: string | null;
    status: string | null;
}
interface OfficiatingPool {
    club_id: string | null;
    referees: OfficiatingReferee[];
    courts: OfficiatingCourt[];
    summary: {
        total_referees: number;
        registered_count?: number;
        checked_in_count: number;
        available_to_ref_count: number;
        selected_default_count: number;
        total_courts: number;
    };
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
    registered_by_id: string | null;
    registered_by_name: string | null;
    can_remove: boolean;
}

function findMatchByIdFromBracketPayload(
    bracketData: { sections?: BracketSection[]; rounds?: BracketRound[] },
    matchId: string,
): BracketMatch | null {
    const matches = bracketData.sections
        ? bracketData.sections.flatMap(section => section.rounds.flatMap(round => round.matches))
        : (bracketData.rounds ?? []).flatMap(round => round.matches);
    return matches.find(match => match.match_id === matchId) ?? null;
}

const STATUS_STEPS = ["upcoming", "registration_closed", "ongoing", "completed"];
const STATUS_LABELS: Record<string, string> = {
    upcoming:            "Open for Registration",
    registration_closed: "Registration Closed — Ready to Start",
    ongoing:             "Tournament In Progress",
    completed:           "Completed",
};

export default function TournamentManagePage() {
    const router = useRouter();
    const params = useParams();
    const tourId = params.id as string;

    const [unreadCount,   setUnreadCount]   = useState(0);
    const [tournament,    setTournament]    = useState<Tournament | null>(null);
    const [linkedClub,    setLinkedClub]    = useState<TournamentClub | null>(null);
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState("");
    const [success,       setSuccess]       = useState("");

    // Smart Tiered preview state
    const [previewGroups,  setPreviewGroups]  = useState<PreviewGroup[] | null>(null);
    const [previewScores,  setPreviewScores]  = useState<FairnessScores | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Pool play config state
    interface PoolOption {
        num_pools: number; pool_sizes: number[]; size_summary: string;
        pool_matches: number; qualifiers: number; knockout_stage: string; is_recommended: boolean;
    }
    const [poolOptions,      setPoolOptions]      = useState<PoolOption[]>([]);
    const [selectedNumPools, setSelectedNumPools] = useState<number | null>(null);
    const [poolOptsLoading,  setPoolOptsLoading]  = useState(false);

    // Invite state
    const [inviteQuery,      setInviteQuery]      = useState("");
    const [invitePlayerId,   setInvitePlayerId]   = useState("");
    const [inviteBusy,       setInviteBusy]       = useState(false);
    const [inviteMsg,        setInviteMsg]         = useState("");
    const [searchResults,    setSearchResults]    = useState<PlayerSearchResult[]>([]);
    const [searchLoading,    setSearchLoading]    = useState(false);
    const [showDropdown,     setShowDropdown]     = useState(false);
    const inviteSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Tournament referee roster
    const [tournamentReferees, setTournamentReferees] = useState<TournamentReferee[]>([]);
    const [refereeRosterLoading, setRefereeRosterLoading] = useState(false);
    const [refereeRosterBusy, setRefereeRosterBusy] = useState(false);
    const [refereeSearchTerm, setRefereeSearchTerm] = useState("");
    const [refereeSearchResults, setRefereeSearchResults] = useState<PlayerSearchResult[]>([]);
    const [refereeSearchLoading, setRefereeSearchLoading] = useState(false);
    const [showRefereeDropdown, setShowRefereeDropdown] = useState(false);
    const refereeSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Bracket state
    const [bracketRounds,   setBracketRounds]   = useState<BracketRound[]>([]);
    const [bracketSections, setBracketSections] = useState<BracketSection[]>([]);
    const hasBracket = bracketRounds.length > 0 || bracketSections.length > 0;
    const [bracketTab, setBracketTab] = useState<"bracket" | "live">("bracket");
    const [officiatingPool, setOfficiatingPool] = useState<OfficiatingPool | null>(null);
    const [officiatingLoading, setOfficiatingLoading] = useState(false);
    const [selectedReferees, setSelectedReferees] = useState<string[]>([]);
    const [selectedCourts, setSelectedCourts] = useState<string[]>([]);
    const [autoAssignBusy, setAutoAssignBusy] = useState(false);

    const allMatches = [
        ...bracketRounds.flatMap(r => r.matches),
        ...bracketSections.flatMap(s => s.rounds.flatMap(r => r.matches)),
    ];
    const liveCount = allMatches.filter(m => m.status === "ongoing").length;

    // Score modal
    const [scoreModal,   setScoreModal]   = useState<BracketMatch | null>(null);
    const [scoreSets,    setScoreSets]    = useState<{ p1: string; p2: string }[]>([{ p1: "", p2: "" }]);
    const [scoreWinner,  setScoreWinner]  = useState("");
    const [scoreBusy,    setScoreBusy]    = useState(false);
    const [opsMatch,     setOpsMatch]     = useState<BracketMatch | null>(null);

    // Seed editing state
    const [editingSeed,  setEditingSeed]   = useState<string | null>(null); // reg_id
    const [seedValue,    setSeedValue]     = useState("");

    // Confirm dialogs
    const [confirmClose,       setConfirmClose]       = useState(false);
    const [confirmGenerate,    setConfirmGenerate]    = useState(false);
    const [confirmReset,       setConfirmReset]       = useState(false);
    const [confirmStart,       setConfirmStart]       = useState(false);
    const [confirmEnd,         setConfirmEnd]         = useState(false);
    const [confirmNextRound,   setConfirmNextRound]   = useState(false);
    const [confirmPromote,     setConfirmPromote]     = useState(false);
    const [confirmDelete,      setConfirmDelete]      = useState(false);
    const [busy,               setBusy]               = useState(false);
    const [clubOptions,        setClubOptions]        = useState<ClubOption[]>([]);
    const [clubOptionsLoading, setClubOptionsLoading] = useState(false);
    const [venueModeDraft,     setVenueModeDraft]     = useState<"club" | "external" | "tbd">("club");
    const [clubIdDraft,        setClubIdDraft]        = useState("");
    const [venueNameDraft,     setVenueNameDraft]     = useState("");
    const [venueAddressDraft,  setVenueAddressDraft]  = useState("");
    const [venueBusy,          setVenueBusy]          = useState(false);

    const fetchDetail = useCallback(async (token: string) => {
        const res = await fetch(`/api/tournaments/${tourId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (res.ok) {
            const d = await res.json();
            if (!d.is_organizer) { router.replace(`/tournaments/${tourId}`); return; }
            setTournament(d.tournament);
            setLinkedClub(d.club ?? null);
            setRegistrations(d.registrations ?? []);
        }
        // Fetch bracket
        const bRes = await fetch(`/api/tournaments/${tourId}/bracket`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (bRes.ok) {
            const bd = await bRes.json();
            if (bd.sections) {
                setBracketSections(bd.sections ?? []);
                setBracketRounds([]);
            } else {
                setBracketRounds(bd.rounds ?? []);
                setBracketSections([]);
            }
            setOpsMatch(prev => prev ? findMatchByIdFromBracketPayload(bd, prev.match_id) : prev);
        }
    }, [tourId, router]);

    const loadOfficiatingPool = useCallback(async (tokenArg?: string) => {
        const token = tokenArg || getAccessToken();
        if (!token) return;
        setOfficiatingLoading(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/officiating-pool`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!res.ok) {
                setOfficiatingPool(null);
                return;
            }
            const data: OfficiatingPool = await res.json();
            const referees = Array.isArray(data.referees) ? data.referees : [];
            const courts = Array.isArray(data.courts) ? data.courts : [];
            setOfficiatingPool({
                club_id: data.club_id,
                referees,
                courts,
                summary: data.summary,
            });
            setSelectedReferees(prev => {
                const validPrev = prev.filter(id => referees.some(ref => ref.id === id));
                if (validPrev.length > 0) return validPrev;
                const suggested = referees.filter(ref => ref.suggested).map(ref => ref.id);
                if (suggested.length > 0) return suggested;
                return referees
                    .filter(ref => !ref.is_participant && (ref.has_referee_role || ref.checkin_status === "available_to_ref"))
                    .map(ref => ref.id);
            });
            setSelectedCourts(prev => {
                const validPrev = prev.filter(id => courts.some(court => court.id === id));
                if (validPrev.length > 0) return validPrev;
                return courts
                    .filter(court => court.status !== "occupied")
                    .map(court => court.id);
            });
        } finally {
            setOfficiatingLoading(false);
        }
    }, [tourId, router]);

    const loadTournamentReferees = useCallback(async (tokenArg?: string) => {
        const token = tokenArg || getAccessToken();
        if (!token) return;
        setRefereeRosterLoading(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/referees`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!res.ok) {
                setTournamentReferees([]);
                return;
            }
            const data = await res.json();
            setTournamentReferees(Array.isArray(data.referees) ? data.referees : []);
        } finally {
            setRefereeRosterLoading(false);
        }
    }, [tourId, router]);

    const loadClubOptions = useCallback(async (tokenArg?: string) => {
        const token = tokenArg || getAccessToken();
        if (!token || !tournament?.sport) return;
        setClubOptionsLoading(true);
        try {
            const res = await fetch(`/api/clubs?sport=${encodeURIComponent(tournament.sport)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!res.ok) {
                setClubOptions([]);
                return;
            }
            const data = await res.json();
            setClubOptions(Array.isArray(data) ? data : []);
        } finally {
            setClubOptionsLoading(false);
        }
    }, [tournament?.sport, router]);

    const refreshLiveState = useCallback(async (token: string) => {
        await fetchDetail(token);
        await loadTournamentReferees(token);
        if (tournament?.club_id && hasBracket) {
            await loadOfficiatingPool(token);
        }
    }, [fetchDetail, loadTournamentReferees, loadOfficiatingPool, tournament?.club_id, hasBracket]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        fetchDetail(token).finally(() => setLoading(false));
    }, [fetchDetail]);

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

    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        loadTournamentReferees(token).catch(() => {});
    }, [loadTournamentReferees]);

    useEffect(() => {
        if (!tournament?.sport) return;
        const token = getAccessToken();
        if (!token) return;
        loadClubOptions(token).catch(() => {});
    }, [tournament?.sport, loadClubOptions]);

    useEffect(() => {
        if (!tournament) return;
        const mode = (tournament.venue_mode ?? (tournament.club_id ? "club" : "tbd")) as "club" | "external" | "tbd";
        setVenueModeDraft(mode);
        setClubIdDraft(tournament.club_id ?? "");
        setVenueNameDraft(tournament.venue_name ?? linkedClub?.name ?? "");
        setVenueAddressDraft(tournament.venue_address ?? linkedClub?.address ?? "");
    }, [tournament, linkedClub]);

    useEffect(() => {
        if (venueModeDraft !== "club") return;
        if (clubIdDraft) return;
        if (clubOptions.length === 0) return;
        setClubIdDraft(clubOptions[0].id);
    }, [venueModeDraft, clubIdDraft, clubOptions]);

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
                        void refreshLiveState(token);
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
            if (token) void refreshLiveState(token);
        }, 30000);

        function handleVisibility() {
            if (document.visibilityState === "visible" && token) {
                void refreshLiveState(token);
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
    }, [tourId, refreshLiveState]);

    useEffect(() => {
        if (!tournament?.club_id || !hasBracket) {
            setOfficiatingPool(null);
            return;
        }
        const token = getAccessToken();
        if (!token) return;
        loadOfficiatingPool(token).catch(() => {});
    }, [tournament?.club_id, hasBracket, loadOfficiatingPool]);

    // Fetch pool options whenever it's a pool_play tournament in upcoming+reg-closed state
    useEffect(() => {
        if (!tournament || tournament.format !== "pool_play") return;
        if (tournament.registration_open || tournament.status !== "upcoming") return;
        const token = getAccessToken(); if (!token) return;
        setPoolOptsLoading(true);
        fetch(`/api/tournaments/${tourId}/pool-play-options`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).then(d => {
            const opts: PoolOption[] = d.options ?? [];
            setPoolOptions(opts);
            const rec = opts.find(o => o.is_recommended);
            if (rec && !selectedNumPools) setSelectedNumPools(rec.num_pools);
        }).catch(() => {}).finally(() => setPoolOptsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tournament?.id, tournament?.format, tournament?.status, tournament?.registration_open]);

    function flash(msg: string, isError = false) {
        if (isError) { setError(msg); setSuccess(""); }
        else          { setSuccess(msg); setError(""); }
        setTimeout(() => { setError(""); setSuccess(""); }, 4000);
    }

    async function saveVenueSettings() {
        const token = getAccessToken();
        if (!token || !tournament) return;
        if (venueModeDraft === "club" && !clubIdDraft) {
            flash("Choose a club-hosted venue or switch the venue mode.", true);
            return;
        }
        if (venueModeDraft === "external" && !venueNameDraft.trim()) {
            flash("External venues need a venue name.", true);
            return;
        }
        setVenueBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    venue_mode: venueModeDraft,
                    club_id: venueModeDraft === "club" ? clubIdDraft : null,
                    venue_name: venueModeDraft === "external" ? venueNameDraft.trim() : null,
                    venue_address: venueModeDraft === "external" ? (venueAddressDraft.trim() || null) : null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                flash(data.detail || "Failed to update venue settings.", true);
                return;
            }
            flash(data.message || "Venue settings updated.");
            await fetchDetail(token);
            if (venueModeDraft === "club" && hasBracket) {
                await loadOfficiatingPool(token);
            } else if (venueModeDraft !== "club") {
                setOfficiatingPool(null);
                setSelectedCourts([]);
            }
        } catch {
            flash("Network error.", true);
        } finally {
            setVenueBusy(false);
        }
    }

    async function apiPost(path: string, body?: object) {
        const token = getAccessToken(); if (!token) return false;
        setBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/${path}`, {
                method:  "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body:    body ? JSON.stringify(body) : undefined,
            });
            const d = await res.json();
            if (!res.ok) { flash(d.detail || "Action failed.", true); return false; }
            flash(d.message || "Done.");
            await fetchDetail(token);
            return true;
        } catch { flash("Network error.", true); return false; }
        finally   { setBusy(false); }
    }

    async function apiDelete(path: string) {
        const token = getAccessToken(); if (!token) return false;
        setBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/${path}`, {
                method:  "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await res.json();
            if (!res.ok) { flash(d.detail || "Action failed.", true); return false; }
            flash(d.message || "Done.");
            await fetchDetail(token);
            return true;
        } catch { flash("Network error.", true); return false; }
        finally   { setBusy(false); }
    }

    async function saveSeed(reg: Registration) {
        const token = getAccessToken(); if (!token) return;
        const seed = seedValue ? parseInt(seedValue) : null;
        const res = await fetch(
            `/api/tournaments/${tourId}/registrations/${reg.registration_id}/seed`,
            {
                method:  "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body:    JSON.stringify({ seed }),
            }
        );
        if (res.ok) {
            setRegistrations(prev => prev.map(r =>
                r.registration_id === reg.registration_id ? { ...r, seed } : r
            ));
            flash("Seed saved.");
        } else {
            flash("Failed to save seed.", true);
        }
        setEditingSeed(null);
    }

    function handleInviteInput(value: string) {
        setInviteQuery(value);
        setInvitePlayerId("");
        setInviteMsg("");
        if (inviteSearchRef.current) clearTimeout(inviteSearchRef.current);
        if (value.trim().length < 2) { setSearchResults([]); setShowDropdown(false); return; }
        inviteSearchRef.current = setTimeout(async () => {
            const token = getAccessToken(); if (!token) return;
            setSearchLoading(true);
            try {
                const res = await fetch(`/api/players/search?q=${encodeURIComponent(value.trim())}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const d = await res.json();
                    setSearchResults(d.players ?? []);
                    setShowDropdown(true);
                }
            } finally { setSearchLoading(false); }
        }, 250);
    }

    function selectSearchResult(playerId: string, displayName: string) {
        setInvitePlayerId(playerId);
        setInviteQuery(displayName);
        setSearchResults([]);
        setShowDropdown(false);
    }

    function handleRefereeSearchInput(value: string) {
        setRefereeSearchTerm(value);
        if (refereeSearchRef.current) clearTimeout(refereeSearchRef.current);
        if (value.trim().length < 2) {
            setRefereeSearchResults([]);
            setShowRefereeDropdown(false);
            return;
        }
        refereeSearchRef.current = setTimeout(async () => {
            const token = getAccessToken(); if (!token) return;
            setRefereeSearchLoading(true);
            try {
                const res = await fetch(`/api/players/search?q=${encodeURIComponent(value.trim())}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const d = await res.json();
                    setRefereeSearchResults(Array.isArray(d.players) ? d.players : []);
                    setShowRefereeDropdown(true);
                }
            } finally {
                setRefereeSearchLoading(false);
            }
        }, 250);
    }

    async function addTournamentReferee(player: PlayerSearchResult) {
        const token = getAccessToken(); if (!token) return;
        setRefereeRosterBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/referees`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ user_id: player.id }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                flash(d.detail || "Failed to register referee.", true);
                return;
            }
            flash(d.message || "Tournament referee registered.");
            setRefereeSearchTerm("");
            setRefereeSearchResults([]);
            setShowRefereeDropdown(false);
            await loadTournamentReferees(token);
            if (hasBracket) await loadOfficiatingPool(token);
        } catch {
            flash("Network error.", true);
        } finally {
            setRefereeRosterBusy(false);
        }
    }

    async function removeTournamentReferee(referee: TournamentReferee) {
        const token = getAccessToken(); if (!token) return;
        setRefereeRosterBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/referees/${referee.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                flash(d.detail || "Failed to remove referee.", true);
                return;
            }
            flash(d.message || "Tournament referee removed.");
            await loadTournamentReferees(token);
            if (hasBracket) await loadOfficiatingPool(token);
        } catch {
            flash("Network error.", true);
        } finally {
            setRefereeRosterBusy(false);
        }
    }

    async function sendInvite(e: React.FormEvent) {
        e.preventDefault();
        const player_id = invitePlayerId.trim();
        if (!player_id) return;
        const token = getAccessToken(); if (!token) return;
        setInviteBusy(true); setInviteMsg("");
        setShowDropdown(false); setSearchResults([]);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/invite`, {
                method:  "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body:    JSON.stringify({ player_id }),
            });
            const d = await res.json();
            if (!res.ok) { setInviteMsg(d.detail || "Failed to invite."); }
            else         { setInviteMsg(d.message || "Invited!"); setInviteQuery(""); setInvitePlayerId(""); fetchDetail(token); }
        } catch { setInviteMsg("Network error."); }
        finally   { setInviteBusy(false); }
    }

    async function loadPreview() {
        const token = getAccessToken(); if (!token) return;
        setPreviewLoading(true); setPreviewGroups(null); setPreviewScores(null);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/smart-tiered-preview`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await res.json();
            if (!res.ok) { flash(d.detail || "Preview failed.", true); return; }
            setPreviewGroups(d.groups ?? []);
            setPreviewScores(d.scores ?? null);
        } catch { flash("Network error.", true); }
        finally   { setPreviewLoading(false); }
    }

    async function deleteTournament() {
        const token = getAccessToken(); if (!token) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await res.json();
            if (res.ok) { router.replace("/tournaments"); }
            else flash(d.detail || "Failed to delete.", true);
        } catch { flash("Network error.", true); }
        finally { setBusy(false); setConfirmDelete(false); }
    }

    async function approveRequest(reg: Registration) {
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/${tourId}/registrations/${reg.registration_id}/approve`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        if (res.ok) { flash(d.message || "Approved."); await fetchDetail(token); }
        else flash(d.detail || "Failed to approve.", true);
    }

    async function rejectRequest(reg: Registration) {
        const token = getAccessToken(); if (!token) return;
        const res = await fetch(`/api/tournaments/${tourId}/registrations/${reg.registration_id}/reject`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        if (res.ok) { flash(d.message || "Rejected."); await fetchDetail(token); }
        else flash(d.detail || "Failed to reject.", true);
    }

    async function approveTeam(p1: Registration, p2: Registration | null) {
        const token = getAccessToken(); if (!token) return;
        setBusy(true);
        try {
            const approveOne = async (reg: Registration) => {
                const res = await fetch(`/api/tournaments/${tourId}/registrations/${reg.registration_id}/approve`, {
                    method: "POST", headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed to approve."); }
            };
            await approveOne(p1);
            if (p2) await approveOne(p2);
            flash("Team approved and confirmed.");
            await fetchDetail(token);
        } catch (e: unknown) {
            flash(e instanceof Error ? e.message : "Failed to approve team.", true);
        } finally { setBusy(false); }
    }

    async function rejectTeam(p1: Registration, p2: Registration | null) {
        const token = getAccessToken(); if (!token) return;
        setBusy(true);
        try {
            const rejectOne = async (reg: Registration) => {
                const res = await fetch(`/api/tournaments/${tourId}/registrations/${reg.registration_id}/reject`, {
                    method: "POST", headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Failed to reject."); }
            };
            await rejectOne(p1);
            if (p2) await rejectOne(p2);
            flash("Team rejected.");
            await fetchDetail(token);
        } catch (e: unknown) {
            flash(e instanceof Error ? e.message : "Failed to reject team.", true);
        } finally { setBusy(false); }
    }

    async function autoAssignOfficiating() {
        const token = getAccessToken(); if (!token) return;
        if (selectedReferees.length === 0 && selectedCourts.length === 0) {
            flash("Select at least one referee or one court first.", true);
            return;
        }
        setAutoAssignBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/auto-assign-officiating`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    referee_ids: selectedReferees,
                    court_ids: selectedCourts,
                }),
            });
            const d = await res.json();
            if (!res.ok) { flash(d.detail || "Automatic assignment failed.", true); return; }
            flash(d.message || "Assignments updated.");
            await fetchDetail(token);
            await loadOfficiatingPool(token);
        } catch {
            flash("Network error.", true);
        } finally {
            setAutoAssignBusy(false);
        }
    }

    // Sport-specific scoring rules
    const SPORT_RULES: Record<string, { pts: number, sets: number, winBy: number, max: number | null }> = {
        badminton:    { pts: 21, sets: 3, winBy: 2, max: 30 },
        pickleball:   { pts: 11, sets: 3, winBy: 2, max: 15 },
        table_tennis: { pts: 11, sets: 5, winBy: 2, max: null },
        lawn_tennis:  { pts: 6,  sets: 3, winBy: 2, max: null },
    };

    const currentRules = tournament ? (SPORT_RULES[tournament.sport] || { pts: 11, sets: 3, winBy: 2, max: null }) : { pts: 11, sets: 3, winBy: 2, max: null };
    const MAX_SETS  = currentRules.sets;
    const MAX_SCORE = currentRules.max || (currentRules.pts + 10); // fallback for display limit

    function openScoreModal(match: BracketMatch) {
        setScoreModal(match);
        if (match.sets.length > 0) {
            setScoreSets(match.sets.map(s => ({ p1: String(s.player1_score), p2: String(s.player2_score) })));
        } else {
            setScoreSets([{ p1: "", p2: "" }]);
        }
        setScoreWinner(match.winner_id ?? "");
        setScoreBusy(false);
    }

    async function handleBracketQuickAction(match: BracketMatch, action: "call" | "start" | "notify-referee") {
        const token = getAccessToken();
        if (!token) return;
        try {
            const res = await fetch(`/api/tournaments/${tourId}/matches/${match.match_id}/${action}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            // notify-referee is a fire-and-forget nudge — no need to reload the bracket
            if (action !== "notify-referee") await fetchDetail(token);
        } catch { /* silent */ }
    }

    // Derive predicted winner from current set scores
    function derivedWinnerFromSets(sets: { p1: string; p2: string }[], match: BracketMatch | null): string {
        if (!match || !tournament) return "";
        const rules = SPORT_RULES[tournament.sport] || { pts: 11, sets: 3, winBy: 2, max: null };
        const bo = match.best_of ?? rules.sets;
        const needed = Math.ceil(bo / 2);
        
        let p1wins = 0, p2wins = 0;
        for (const s of sets) {
            if (s.p1 === "" || s.p2 === "") continue;
            const p1 = parseInt(s.p1) || 0;
            const p2 = parseInt(s.p2) || 0;
            
            // Validate if someone won this set according to rules
            const p1WonSet = (p1 >= rules.pts && p1 - p2 >= rules.winBy) || (rules.max && p1 === rules.max);
            const p2WonSet = (p2 >= rules.pts && p2 - p1 >= rules.winBy) || (rules.max && p2 === rules.max);
            
            if (p1WonSet) p1wins++;
            else if (p2WonSet) p2wins++;
        }
        if (p1wins >= needed) return match.player1?.id ?? "";
        if (p2wins >= needed) return match.player2?.id ?? "";
        
        return "";
    }

    function handleSetScoreChange(i: number, field: "p1" | "p2", raw: string) {
        const v = raw.replace(/[^0-9]/g, "");
        const updated = scoreSets.map((x, j) => j === i ? { ...x, [field]: v } : x);
        setScoreSets(updated);
        // Auto-predict and apply winner
        const predicted = derivedWinnerFromSets(updated, scoreModal);
        if (predicted) setScoreWinner(predicted);
    }

    async function submitScore() {
        if (!scoreModal || !scoreWinner) return;
        const token = getAccessToken(); if (!token) return;
        const sets = scoreSets.filter(s => s.p1 !== "" || s.p2 !== "").map(s => ({
            p1_score: parseInt(s.p1) || 0,
            p2_score: parseInt(s.p2) || 0,
        }));
        if (!sets.length) { flash("Enter at least one set score.", true); return; }
        setScoreBusy(true);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/matches/${scoreModal.match_id}/submit-score`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ sets, winner_id: scoreWinner }),
            });
            const d = await res.json();
            if (!res.ok) { flash(d.detail || "Failed to submit score.", true); return; }
            flash(d.message || "Score submitted!");
            setScoreModal(null);
            await fetchDetail(token);
        } catch { flash("Network error.", true); }
        finally { setScoreBusy(false); }
    }

    async function removeParticipant(reg: Registration) {
        const token = getAccessToken(); if (!token) return;
        if (!confirm(`Remove ${`${reg.first_name || ''} ${reg.last_name || ''}`.trim() || reg.player_id.slice(0, 8)} from this tournament?`)) return;
        const res = await fetch(
            `/api/tournaments/${tourId}/registrations/${reg.registration_id}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
            setRegistrations(prev => prev.filter(r => r.registration_id !== reg.registration_id));
            setTournament(prev => prev ? { ...prev, participant_count: prev.participant_count - 1 } : prev);
            flash("Participant removed.");
        } else {
            flash("Failed to remove participant.", true);
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
                    <p className="text-zinc-400">Tournament not found or access denied.</p>
                    <Link href="/tournaments" className="text-sm text-blue-400 mt-2 block">← Back</Link>
                </div>
            </div>
        );
    }

    const statusIdx      = STATUS_STEPS.indexOf(tournament.status);
    const isUpcoming     = tournament.status === "upcoming";
    const isRegClosed    = tournament.status === "registration_closed";
    const isOngoing      = tournament.status === "ongoing";
    const isCompleted    = tournament.status === "completed";
    const isSwiss        = tournament.format === "swiss";

    // Sport icon helper
    const sportEmoji: Record<string, string> = {
        tennis: "🎾", badminton: "🏸", squash: "🎯", tabletennis: "🏓",
        pickleball: "🥒", padel: "🎾", volleyball: "🏐", basketball: "🏀",
    };
    const sportIcon = sportEmoji[tournament.sport?.toLowerCase()] ?? "🏆";
    const fillPct = Math.round((tournament.participant_count / Math.max(tournament.max_participants, 1)) * 100);

    // Bracket size advisory (for the confirmed participant count)
    const confirmedCount  = registrations.filter(r => r.status === "confirmed").length;
    const groupCfg        = (tournament.smart_tiered_config?.group_count as number) ?? 4;
    const actionableMatches = allMatches.filter(match =>
        !!match.player1 &&
        !!match.player2 &&
        !["completed", "cancelled", "invalidated", "ongoing"].includes(match.status)
    );
    const matchesMissingReferee = actionableMatches.filter(match => !match.referee_id).length;
    const matchesMissingCourt = actionableMatches.filter(match => !match.court_id).length;
    const unscheduledMatches = actionableMatches.filter(match => !match.scheduled_at).length;
    const verificationQueueCount = allMatches.filter(match => !!match.result_submitted_at && !match.result_confirmed_at).length;
    const disputedCount = allMatches.filter(match => !!match.dispute_reason).length;
    const registeredRefereesCount = tournamentReferees.length;
    const activeTournamentRefereesCount = tournamentReferees.filter(referee => referee.current_match_load > 0).length;
    const checkedInTournamentRefereesCount = tournamentReferees.filter(referee => referee.is_checked_in).length;
    const selectedVenueClub = clubOptions.find(club => club.id === clubIdDraft) ?? linkedClub;
    const selectedVenueCourtCount = linkedClub && selectedVenueClub?.id === linkedClub.id
        ? linkedClub.compatible_court_count
        : (selectedVenueClub?.court_count ?? 0);
    const currentVenueMode = (tournament.venue_mode ?? (tournament.club_id ? "club" : "tbd")) as "club" | "external" | "tbd";
    const canAutoAssignCourts = currentVenueMode === "club" && Boolean(tournament.club_id);
    const poolReferees = officiatingPool?.referees ?? [];
    const selectablePoolReferees = poolReferees.filter(referee => !referee.is_participant);
    const blockedPoolReferees = poolReferees.filter(referee => referee.is_participant).length;
    const poolCourts = officiatingPool?.courts ?? [];
    const suggestedRefereeIds = selectablePoolReferees.filter(referee => referee.suggested).map(referee => referee.id);
    const selectedSelectableReferees = selectedReferees.filter(id => selectablePoolReferees.some(referee => referee.id === id));
    const selectedAvailableCourts = selectedCourts.filter(id => poolCourts.some(court => court.id === id));
    const autoAssignLabel = selectedAvailableCourts.length > 0 && selectedSelectableReferees.length > 0
        ? "Auto-Assign Courts & Referees"
        : selectedAvailableCourts.length > 0
            ? "Auto-Assign Courts"
            : selectedSelectableReferees.length > 0
                ? "Auto-Assign Referees"
                : "Select Courts or Referees";
    const byeInfo = (() => {
        const n = confirmedCount;
        const fmt = tournament.format;
        const pow2 = [2, 4, 8, 16, 32, 64, 128];
        const nextPow2 = pow2.find(p => p >= n) ?? 128;
        if (fmt === "single_elimination" || fmt === "double_elimination") {
            if (!pow2.includes(n)) return { byes: nextPow2 - n, ideal: nextPow2, msg: `${nextPow2 - n} bye(s) will be added to fill ${nextPow2}-slot bracket` };
        }
        if (fmt === "round_robin" || fmt === "swiss") {
            if (n % 2 !== 0) return { byes: 1, ideal: n + 1, msg: "Odd count — one player gets a bye each round" };
        }
        if (fmt === "group_stage_knockout") {
            const gc = [2, 4, 8].includes(groupCfg) ? groupCfg : 4;
            if (n % gc !== 0) {
                const nearest = Math.ceil(n / gc) * gc;
                return { byes: nearest - n, ideal: nearest, msg: `${n} doesn't split evenly into ${gc} groups (need ${nearest})` };
            }
        }
        if (fmt === "pool_play") {
            for (const gs of [4, 5, 3]) {
                if (n % gs === 0 && n / gs >= 2) return null; // valid
            }
            // Find next valid count
            let next = n + 1;
            while (next <= 200) {
                if ([4, 5, 3].some(gs => next % gs === 0 && next / gs >= 2)) break;
                next++;
            }
            return { byes: next - n, ideal: next, msg: `${n} entries can't form equal groups of 3, 4, or 5. Need ${next} entries.` };
        }
        return null;
    })();

    // Currently selected pool configuration
    const selectedPoolOpt = poolOptions.find(o => o.num_pools === selectedNumPools) ?? poolOptions[0] ?? null;

    return (
        <div className="min-h-screen bg-zinc-950 text-white relative overflow-x-hidden">
            {/* Animated background grid */}
            <div
                className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
                style={{
                    backgroundImage: "linear-gradient(to right,#ffffff 1px,transparent 1px),linear-gradient(to bottom,#ffffff 1px,transparent 1px)",
                    backgroundSize: "48px 48px",
                }}
            />

            {/* Minimal top bar */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-sm border-b border-white/5 flex items-center justify-between px-4 h-12">
                <Link href={`/tournaments/${tourId}`} className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    {tournament.name}
                </Link>
                <Link href="/dashboard" className="relative p-2 text-zinc-400 hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 w-4 h-4 bg-blue-500 text-zinc-950 text-[10px] font-black rounded-full flex items-center justify-center leading-none">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Link>
            </div>

            <div className="relative z-10 max-w-3xl mx-auto px-4 pt-16 pb-8 space-y-6">

                {/* ── Hero Header Card ── */}
                <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/5 shadow-2xl">
                    {/* Gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 via-zinc-900 to-purple-900/30" />
                    {/* Decorative orbs */}
                    <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-purple-600/10 blur-2xl pointer-events-none" />

                    <div className="relative p-6 sm:p-8">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-4">
                                <div className="text-4xl select-none">{sportIcon}</div>
                                <div>
                                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                                        {tournament.name}
                                    </h1>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10 capitalize">
                                            {getTournamentFormatLabel(tournament.format)}
                                        </span>
                                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10 capitalize">
                                            {tournament.match_format.replace(/_/g, " ")}
                                        </span>
                                        {["group_stage_knockout", "pool_play", "round_robin", "swiss"].includes(tournament.format) && (
                                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                                                {["group_stage_knockout", "pool_play"].includes(tournament.format) ? "Pool " : ""}BO{tournament.group_stage_best_of ?? 1}
                                            </span>
                                        )}
                                        {["single_elimination", "double_elimination", "group_stage_knockout"].includes(tournament.format) && tournament.knockout_best_of && (
                                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">
                                                KO BO{tournament.knockout_best_of}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* Status badge */}
                            <div className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border ${
                                isOngoing    ? "bg-blue-500/15 border-blue-500/30 text-blue-300" :
                                isCompleted  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" :
                                isRegClosed  ? "bg-orange-500/15 border-orange-500/30 text-orange-300" :
                                "bg-zinc-700/60 border-zinc-600 text-zinc-300"
                            }`}>
                                {tournament.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                            </div>
                        </div>

                        {/* Participant progress bar */}
                        <div className="mt-5">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-xs text-zinc-400">
                                    <span className="font-bold text-white">{tournament.participant_count}</span>
                                    {" / "}{tournament.max_participants} participants
                                </span>
                                <span className="text-xs text-zinc-500">{fillPct}% full</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        fillPct >= 90 ? "bg-gradient-to-r from-orange-500 to-red-500" :
                                        fillPct >= 60 ? "bg-gradient-to-r from-blue-500 to-cyan-400" :
                                        "bg-gradient-to-r from-blue-600 to-blue-400"
                                    }`}
                                    style={{ width: `${Math.min(fillPct, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Status Pipeline (step progress bar) ── */}
                <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl p-5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-5 border-l-2 border-blue-500 pl-3">
                        Status Pipeline
                    </h2>
                    <div className="flex items-center gap-0">
                        {STATUS_STEPS.map((step, i) => {
                            const done    = i < statusIdx;
                            const current = i === statusIdx;
                            return (
                                <div key={step} className="flex items-center flex-1 last:flex-none">
                                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                                        {/* Circle */}
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                                            done    ? "bg-blue-600 border-blue-600 text-white" :
                                            current ? "bg-zinc-900 border-blue-400 text-blue-300 shadow-[0_0_12px_rgba(96,165,250,0.5)]" :
                                            "bg-zinc-900 border-zinc-700 text-zinc-600"
                                        }`}>
                                            {done ? (
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                i + 1
                                            )}
                                        </div>
                                        {/* Label */}
                                        <span className={`text-[10px] text-center leading-tight max-w-[64px] ${
                                            done    ? "text-zinc-400" :
                                            current ? "text-blue-300 font-semibold" :
                                            "text-zinc-600"
                                        }`}>
                                            {step.replace(/_/g, " ")}
                                        </span>
                                    </div>
                                    {/* Connector line */}
                                    {i < STATUS_STEPS.length - 1 && (
                                        <div className={`flex-1 h-0.5 mb-5 mx-1 rounded-full transition-all ${
                                            i < statusIdx ? "bg-blue-600" : "bg-zinc-800"
                                        }`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 pl-1">{STATUS_LABELS[tournament.status]}</p>
                </div>

                {/* Flash messages */}
                {(error || success) && (
                    <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2.5 ${
                        error
                            ? "bg-red-500/10 border border-red-500/30 text-red-400"
                            : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    }`}>
                        <span className="text-base">{error ? "⚠" : "✓"}</span>
                        {error || success}
                    </div>
                )}

                {/* ── Actions Card ── */}
                <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-l-2 border-blue-500 pl-3">
                                Venue & Club
                            </h2>
                            <p className="text-xs text-zinc-500 mt-2">
                                Link a club to unlock its courts for scheduling and auto-assignment, or keep the venue flexible until it is confirmed.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-300">
                                {currentVenueMode === "club" ? "Club-hosted" : currentVenueMode === "external" ? "External venue" : "Venue TBD"}
                            </span>
                            {linkedClub && (
                                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold text-blue-300">
                                    {linkedClub.compatible_court_count} compatible court{linkedClub.compatible_court_count === 1 ? "" : "s"}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {[
                            {
                                value: "club",
                                label: "Club-hosted",
                                desc: "Use a linked club as the venue and unlock that club's compatible courts for assignment.",
                            },
                            {
                                value: "external",
                                label: "External venue",
                                desc: "Track a named venue without using club courts.",
                            },
                            {
                                value: "tbd",
                                label: "Venue TBD",
                                desc: "Keep planning now and link a club later once the venue is decided.",
                            },
                        ].map(option => (
                            <label
                                key={option.value}
                                className={`flex items-start gap-3 rounded-xl border p-3 transition-colors cursor-pointer ${
                                    venueModeDraft === option.value
                                        ? "border-white/20 bg-white/5"
                                        : "border-zinc-800 hover:border-zinc-700"
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="venueModeDraft"
                                    value={option.value}
                                    checked={venueModeDraft === option.value}
                                    onChange={() => setVenueModeDraft(option.value as "club" | "external" | "tbd")}
                                    className="mt-0.5 accent-white"
                                />
                                <div>
                                    <div className="text-sm font-semibold text-white">{option.label}</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">{option.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>

                    {venueModeDraft === "club" && (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Linked Club</label>
                                <select
                                    value={clubIdDraft}
                                    onChange={e => setClubIdDraft(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-zinc-600"
                                >
                                    {clubOptionsLoading && <option value="">Loading clubs...</option>}
                                    {!clubOptionsLoading && clubOptions.length === 0 && <option value="">No clubs available</option>}
                                    {clubOptions.map(club => (
                                        <option key={club.id} value={club.id}>
                                            {club.name} ({club.court_count} court{club.court_count === 1 ? "" : "s"})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {selectedVenueClub ? (
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-sm text-zinc-300">
                                    <div className="font-semibold text-white">{selectedVenueClub.name}</div>
                                    <div className="text-xs text-zinc-500 mt-1">
                                        {selectedVenueCourtCount} compatible court{selectedVenueCourtCount === 1 ? "" : "s"} available for this tournament&apos;s sport.
                                    </div>
                                    {selectedVenueClub.address && (
                                        <div className="text-xs text-zinc-500 mt-1">{selectedVenueClub.address}</div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
                                    Choose a club to unlock court auto-assignment for this tournament.
                                </div>
                            )}
                        </div>
                    )}

                    {venueModeDraft === "external" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Venue Name</label>
                                <input
                                    type="text"
                                    value={venueNameDraft}
                                    onChange={e => setVenueNameDraft(e.target.value)}
                                    placeholder="e.g. City Sports Complex"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Venue Address</label>
                                <input
                                    type="text"
                                    value={venueAddressDraft}
                                    onChange={e => setVenueAddressDraft(e.target.value)}
                                    placeholder="Optional address or landmark"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                                />
                            </div>
                        </div>
                    )}

                    {venueModeDraft === "tbd" && (
                        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-500">
                            Court and officiating auto-assignment will stay limited until you later link this tournament to a club venue.
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                        <div className="text-xs text-zinc-500">
                            {tournament.club_id
                                ? "Changing the club after courts have been assigned will require clearing those court assignments first."
                                : "No club is linked yet, so court auto-assignment will remain locked until one is selected."}
                        </div>
                        <button
                            onClick={() => void saveVenueSettings()}
                            disabled={venueBusy}
                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 disabled:opacity-60"
                        >
                            {venueBusy ? "Saving..." : "Save Venue Settings"}
                        </button>
                    </div>
                </div>

                <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl p-5 space-y-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-l-2 border-emerald-500 pl-3">
                                Officiating & Courts
                            </h2>
                            <p className="text-xs text-zinc-500 mt-2 pl-3">
                                Make club courts and referee auto-assignment visible here, then push assignments across the bracket in one pass.
                            </p>
                        </div>
                        <button
                            onClick={() => { void loadOfficiatingPool(); }}
                            disabled={!hasBracket || !canAutoAssignCourts || officiatingLoading}
                            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {officiatingLoading ? "Refreshing..." : "Refresh Pool"}
                        </button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-4 py-3">
                            <div className="text-2xl font-black text-white">{actionableMatches.length}</div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mt-1">Ready Matches</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-4 py-3">
                            <div className="text-2xl font-black text-amber-300">{matchesMissingCourt}</div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mt-1">Need Court</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-4 py-3">
                            <div className="text-2xl font-black text-blue-300">{matchesMissingReferee}</div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mt-1">Need Referee</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-4 py-3">
                            <div className="text-2xl font-black text-zinc-300">{unscheduledMatches}</div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mt-1">No Schedule</div>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-4 py-3">
                            <div className="text-2xl font-black text-fuchsia-300">{verificationQueueCount + disputedCount}</div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mt-1">Review Queue</div>
                        </div>
                    </div>

                    {!hasBracket ? (
                        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-500">
                            Generate the bracket first, then this page can auto-assign courts and referees to playable matches.
                        </div>
                    ) : !canAutoAssignCourts ? (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-4 text-sm text-amber-300">
                            Link this tournament to a club-hosted venue to unlock auto-assigning courts. Match-level referee and court changes are still available from each match’s `Manage Ops`.
                        </div>
                    ) : officiatingLoading ? (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500 flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                            Loading club courts and officiating pool...
                        </div>
                    ) : !officiatingPool ? (
                        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-500">
                            No officiating pool is available yet for this club-linked tournament.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-300">
                                    {officiatingPool.summary.total_referees} pool referees
                                </span>
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                                    {officiatingPool.summary.available_to_ref_count} ready to ref
                                </span>
                                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold text-blue-300">
                                    {officiatingPool.summary.total_courts} compatible courts
                                </span>
                                {blockedPoolReferees > 0 && (
                                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
                                        {blockedPoolReferees} participant{blockedPoolReferees === 1 ? "" : "s"} excluded
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-4">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <div className="text-sm font-semibold text-white">Referee Pool</div>
                                            <div className="text-xs text-zinc-500 mt-1">
                                                Select the registered or club-ready referees you want included in the auto-assignment run.
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                onClick={() => setSelectedReferees(suggestedRefereeIds)}
                                                disabled={suggestedRefereeIds.length === 0}
                                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                                            >
                                                Use Suggested
                                            </button>
                                            <button
                                                onClick={() => setSelectedReferees(selectablePoolReferees.map(referee => referee.id))}
                                                disabled={selectablePoolReferees.length === 0}
                                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                                            >
                                                Select All
                                            </button>
                                            <button
                                                onClick={() => setSelectedReferees([])}
                                                disabled={selectedSelectableReferees.length === 0}
                                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-white/10 disabled:opacity-40"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>

                                    {selectablePoolReferees.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-500">
                                            No eligible referees are available in the current pool yet.
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {selectablePoolReferees.map(referee => {
                                                const selected = selectedSelectableReferees.includes(referee.id);
                                                const displayName = `${referee.first_name || ''} ${referee.last_name || ''}`.trim() || referee.id.slice(0, 8);
                                                return (
                                                    <button
                                                        key={referee.id}
                                                        onClick={() => setSelectedReferees(prev =>
                                                            prev.includes(referee.id)
                                                                ? prev.filter(id => id !== referee.id)
                                                                : [...prev, referee.id]
                                                        )}
                                                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                                                            selected
                                                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                                                : "border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:border-zinc-600"
                                                        }`}
                                                    >
                                                        <div className="text-xs font-semibold">{displayName}</div>
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] text-zinc-400">{displayName}</span>
                                                            {referee.suggested && (
                                                                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-300">Suggested</span>
                                                            )}
                                                            {referee.checkin_status === "available_to_ref" && (
                                                                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">Ready</span>
                                                            )}
                                                            {referee.current_match_load > 0 && (
                                                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                                                                    {referee.current_match_load} active
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-4">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <div className="text-sm font-semibold text-white">Court Pool</div>
                                            <div className="text-xs text-zinc-500 mt-1">
                                                Choose which club courts the auto-assignment run is allowed to use.
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                onClick={() => setSelectedCourts(
                                                    poolCourts
                                                        .filter(court => court.status !== "occupied")
                                                        .map(court => court.id)
                                                )}
                                                disabled={poolCourts.every(court => court.status === "occupied")}
                                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-40"
                                            >
                                                Select All
                                            </button>
                                            <button
                                                onClick={() => setSelectedCourts([])}
                                                disabled={selectedAvailableCourts.length === 0}
                                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-white/10 disabled:opacity-40"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    </div>

                                    {poolCourts.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-500">
                                            No compatible club courts are available for this tournament sport.
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {poolCourts.map(court => {
                                                const selected = selectedAvailableCourts.includes(court.id);
                                                const isOccupied = court.status === "occupied";
                                                return (
                                                    <button
                                                        key={court.id}
                                                        disabled={isOccupied}
                                                        onClick={() => setSelectedCourts(prev =>
                                                            prev.includes(court.id)
                                                                ? prev.filter(id => id !== court.id)
                                                                : [...prev, court.id]
                                                        )}
                                                        className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                                                            isOccupied
                                                                ? "border-zinc-800 bg-zinc-950/60 text-zinc-600 cursor-not-allowed"
                                                            :
                                                            selected
                                                                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                                                                : "border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:border-zinc-600"
                                                        }`}
                                                    >
                                                        <div className="text-xs font-semibold">{court.name}</div>
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] text-zinc-400">
                                                                {court.sport ? court.sport.replace(/_/g, " ") : "multi-sport"}
                                                            </span>
                                                            {court.status && (
                                                                <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                                                                    isOccupied
                                                                        ? "bg-red-500/15 text-red-300"
                                                                        : "bg-amber-500/15 text-amber-300"
                                                                }`}>
                                                                    {court.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-4">
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div className="text-sm text-zinc-300">
                                        <span className="font-semibold text-white">{selectedSelectableReferees.length}</span> referee{selectedSelectableReferees.length === 1 ? "" : "s"} selected
                                        {" • "}
                                        <span className="font-semibold text-white">{selectedAvailableCourts.length}</span> court{selectedAvailableCourts.length === 1 ? "" : "s"} selected
                                    </div>
                                    <button
                                        onClick={() => { void autoAssignOfficiating(); }}
                                        disabled={autoAssignBusy || actionableMatches.length === 0 || (selectedSelectableReferees.length === 0 && selectedAvailableCourts.length === 0)}
                                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {autoAssignBusy ? "Assigning..." : autoAssignLabel}
                                    </button>
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-2">
                                    Best results come after scheduling matches first. Schedule conflicts are protected automatically, but unscheduled matches can still share the same pool of courts and referees.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl p-5 space-y-1">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 border-l-2 border-blue-500 pl-3">
                        Actions
                    </h2>

                    {/* Close registration */}
                    {isUpcoming && tournament.registration_open && (
                        <ActionRow
                            label="Close Registration"
                            desc={`Lock the participant list (${tournament.participant_count} registered)`}
                            buttonLabel="Close Registration"
                            icon="🔒"
                            variant="blue"
                            danger={false}
                            busy={busy}
                            confirm={confirmClose}
                            setConfirm={setConfirmClose}
                            onConfirm={() => { setConfirmClose(false); apiPost("close-registration"); }}
                        />
                    )}

                    {/* Knockout Best-of selector — only for formats with a knockout stage, before bracket generation */}
                    {isUpcoming && ["single_elimination", "double_elimination", "group_stage_knockout"].includes(tournament.format) && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Knockout Match Format</div>
                                <div className="text-xs text-zinc-600">How many games to win a knockout match?</div>
                            </div>
                            <div className="flex gap-2">
                                {([1, 3] as const).map(bo => {
                                    const active = (tournament.knockout_best_of ?? 3) === bo;
                                    return (
                                        <button
                                            key={bo}
                                            disabled={busy}
                                            onClick={async () => {
                                                const token = getAccessToken();
                                                if (!token) return;
                                                setBusy(true);
                                                try {
                                                    const res = await fetch(`/api/tournaments/${tourId}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                                        body: JSON.stringify({ knockout_best_of: bo }),
                                                    });
                                                    if (res.ok) { flash(`Knockout format set to Best of ${bo}.`); await fetchDetail(token); }
                                                    else { const d = await res.json(); flash(d.detail || "Failed.", true); }
                                                } catch { flash("Network error.", true); }
                                                finally { setBusy(false); }
                                            }}
                                            className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                                                active
                                                    ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                                                    : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                                            }`}
                                        >
                                            Best of {bo}
                                            <div className={`text-[10px] font-normal mt-0.5 ${active ? "text-blue-600" : "text-zinc-700"}`}>
                                                {bo === 1 ? "Win 1 game to advance" : "Win 2 of 3 games to advance"}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Group Stage Best-of selector — formats with round-robin / pool / group stages */}
                    {isUpcoming && !hasBracket && ["group_stage_knockout", "pool_play", "round_robin", "swiss"].includes(tournament.format) && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
                                    {["group_stage_knockout", "pool_play"].includes(tournament.format) ? "Pool Match Format" : "Match Format"}
                                </div>
                                <div className="text-xs text-zinc-600">How many games to win each {["group_stage_knockout", "pool_play"].includes(tournament.format) ? "pool " : ""}match?</div>
                            </div>
                            <div className="flex gap-2">
                                {([1, 3] as const).map(bo => {
                                    const active = (tournament.group_stage_best_of ?? 1) === bo;
                                    return (
                                        <button
                                            key={bo}
                                            disabled={busy}
                                            onClick={async () => {
                                                const token = getAccessToken();
                                                if (!token) return;
                                                setBusy(true);
                                                try {
                                                    const res = await fetch(`/api/tournaments/${tourId}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                                        body: JSON.stringify({ group_stage_best_of: bo }),
                                                    });
                                    if (res.ok) { flash(`Pool match format set to Best of ${bo}.`); await fetchDetail(token); }
                                                    else { const d = await res.json(); flash(d.detail || "Failed.", true); }
                                                } catch { flash("Network error.", true); }
                                                finally { setBusy(false); }
                                            }}
                                            className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                                                active
                                                    ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                                                    : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                                            }`}
                                        >
                                            Best of {bo}
                                            <div className={`text-[10px] font-normal mt-0.5 ${active ? "text-violet-600" : "text-zinc-700"}`}>
                                                {bo === 1 ? "Single game decides" : "Win 2 of 3 games"}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Pool Play Configuration ── */}
                    {tournament.format === "pool_play" && isUpcoming && !tournament.registration_open && !hasBracket && (
                        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-5 space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-0.5">Pool Configuration</div>
                                    <div className="text-[11px] text-zinc-600">{confirmedCount} confirmed players</div>
                                </div>
                                {poolOptsLoading && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                            </div>

                            {poolOptions.length === 0 && !poolOptsLoading && (
                                <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                                    ⚠ No valid pool configurations found for {confirmedCount} players. Each pool must have 3–6 players. Try adjusting the participant count.
                                </div>
                            )}

                            {poolOptions.length > 0 && (
                                <>
                                    {/* Pool count buttons */}
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Number of Pools</div>
                                        <div className="flex flex-wrap gap-2">
                                            {poolOptions.map(opt => (
                                                <button
                                                    key={opt.num_pools}
                                                    onClick={() => setSelectedNumPools(opt.num_pools)}
                                                    className={`relative px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all ${
                                                        selectedNumPools === opt.num_pools
                                                            ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                                                            : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                    }`}
                                                >
                                                    {opt.num_pools} pools
                                                    {opt.is_recommended && (
                                                        <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-emerald-500 text-black px-1 py-0.5 rounded-full leading-none">REC</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Selected config preview */}
                                    {selectedPoolOpt && (
                                        <div className="space-y-4">
                                            {/* Pool size visual */}
                                            <div>
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Pool Structure</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedPoolOpt.pool_sizes.map((sz, i) => (
                                                        <div key={i} className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-center min-w-[72px]">
                                                            <div className="text-xs font-black text-white">Group {String.fromCharCode(65 + i)}</div>
                                                            <div className="text-[10px] text-zinc-500 mt-0.5">{sz} players</div>
                                                            <div className="flex justify-center gap-0.5 mt-1.5">
                                                                {Array.from({ length: sz }).map((_, j) => (
                                                                    <div key={j} className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Stats row */}
                                            <div className="grid grid-cols-4 gap-2">
                                                <div className="bg-zinc-950/60 rounded-xl p-3 border border-white/5 text-center">
                                                    <div className="text-base font-black text-white">{selectedPoolOpt.num_pools}</div>
                                                    <div className="text-[9px] text-zinc-600 uppercase tracking-tight mt-0.5">Pools</div>
                                                </div>
                                                <div className="bg-zinc-950/60 rounded-xl p-3 border border-white/5 text-center">
                                                    <div className="text-base font-black text-white">{selectedPoolOpt.pool_matches}</div>
                                                    <div className="text-[9px] text-zinc-600 uppercase tracking-tight mt-0.5">Matches</div>
                                                </div>
                                                <div className="bg-zinc-950/60 rounded-xl p-3 border border-white/5 text-center">
                                                    <div className="text-base font-black text-emerald-400">{selectedPoolOpt.qualifiers}</div>
                                                    <div className="text-[9px] text-zinc-600 uppercase tracking-tight mt-0.5">Qualify</div>
                                                </div>
                                                <div className="bg-zinc-950/60 rounded-xl p-3 border border-white/5 text-center">
                                                    <div className="text-[11px] font-black text-purple-400 leading-tight">{selectedPoolOpt.knockout_stage}</div>
                                                    <div className="text-[9px] text-zinc-600 uppercase tracking-tight mt-0.5">KO Stage</div>
                                                </div>
                                            </div>

                                            {/* Flow hint */}
                                            <div className="text-[11px] text-zinc-500 bg-zinc-950/40 rounded-xl px-4 py-2.5 border border-white/5 flex items-center gap-2">
                                                <span className="text-zinc-600">Pool Stage</span>
                                                <span className="text-zinc-700">→</span>
                                                <span className="text-emerald-400">Top {selectedPoolOpt.qualifiers} advance</span>
                                                <span className="text-zinc-700">→</span>
                                                <span className="text-purple-400">{selectedPoolOpt.knockout_stage}</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Bracket preview card (non-pool-play formats) */}
                    {isUpcoming && !tournament.registration_open && !hasBracket && tournament.format !== "pool_play" && (
                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-0.5">Bracket Preview</div>
                                    <div className="text-[11px] text-zinc-500">Based on {confirmedCount} confirmed participants</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-black text-white leading-none">{byeInfo?.ideal || confirmedCount}</div>
                                    <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Slots</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-zinc-900/60 rounded-xl p-3 border border-white/5 text-center">
                                    <div className="text-sm font-bold text-zinc-300">
                                        {tournament.format === "single_elimination" ? Math.ceil(Math.log2(byeInfo?.ideal || confirmedCount)) : "?"}
                                    </div>
                                    <div className="text-[9px] text-zinc-600 uppercase tracking-tight mt-0.5">Rounds</div>
                                </div>
                                <div className="bg-zinc-900/60 rounded-xl p-3 border border-white/5 text-center">
                                    <div className="text-sm font-bold text-zinc-300">{byeInfo?.byes || 0}</div>
                                    <div className="text-[9px] text-zinc-600 uppercase tracking-tight mt-0.5">Byes</div>
                                </div>
                                <div className="bg-zinc-900/60 rounded-xl p-3 border border-white/5 text-center">
                                    <div className="text-sm font-bold text-zinc-300">
                                        {tournament.format === "single_elimination" ? (byeInfo?.ideal || confirmedCount) - 1 : "?"}
                                    </div>
                                    <div className="text-[9px] text-zinc-600 uppercase tracking-tight mt-0.5">Matches</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 h-8 px-2 bg-zinc-950/50 rounded-lg border border-white/5">
                                {Array.from({ length: Math.min(16, byeInfo?.ideal || confirmedCount) }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`flex-1 h-2 rounded-full ${i < confirmedCount ? "bg-blue-500/40" : "bg-zinc-800"}`}
                                        title={i < confirmedCount ? "Filled" : "Bye"}
                                    />
                                ))}
                                {(byeInfo?.ideal || confirmedCount) > 16 && <span className="text-[8px] text-zinc-700 ml-1">+{(byeInfo?.ideal || confirmedCount) - 16}</span>}
                            </div>
                        </div>
                    )}

                    {/* Reset bracket — only when bracket exists but tournament hasn't started */}
                    {hasBracket && isRegClosed && (
                        <ActionRow
                            label="Reset Bracket"
                            desc="Delete the current bracket so you can regenerate it. Tournament will revert to upcoming."
                            buttonLabel="Reset Bracket"
                            icon="🔄"
                            variant="red"
                            danger={true}
                            busy={busy}
                            confirm={confirmReset}
                            setConfirm={setConfirmReset}
                            onConfirm={() => { setConfirmReset(false); apiDelete("bracket"); }}
                        />
                    )}

                    {/* Generate bracket */}
                    {isUpcoming && !tournament.registration_open && (tournament.format !== "pool_play" || (poolOptions.length > 0 && selectedPoolOpt)) ? (
                        <ActionRow
                            label={tournament.format === "pool_play" ? "Generate Pool Play" : "Generate Bracket"}
                            desc={tournament.format === "pool_play"
                                ? `${selectedPoolOpt!.num_pools} pools (${selectedPoolOpt!.size_summary}) · ${selectedPoolOpt!.pool_matches} matches · Top ${selectedPoolOpt!.qualifiers} → ${selectedPoolOpt!.knockout_stage}`
                                : `Create the ${getTournamentFormatLabel(tournament.format)} bracket from ${tournament.participant_count} players`}
                            buttonLabel={tournament.format === "pool_play" ? "Generate Pool Play" : "Generate Bracket"}
                            icon={tournament.format === "pool_play" ? "🏊" : "🗂"}
                            variant="blue"
                            danger={false}
                            busy={busy}
                            confirm={confirmGenerate}
                            setConfirm={setConfirmGenerate}
                            onConfirm={() => {
                                setConfirmGenerate(false);
                                if (tournament.format === "pool_play" && selectedPoolOpt) {
                                    apiPost("generate-bracket", { num_pools: selectedPoolOpt.num_pools });
                                } else {
                                    apiPost("generate-bracket");
                                }
                            }}
                        />
                    ) : null}

                    {/* Start tournament — extra prominent */}
                    {isRegClosed && (
                        <ActionRow
                            label="Start Tournament"
                            desc="Mark tournament as ongoing and notify all participants"
                            buttonLabel="Start Tournament"
                            icon="🚀"
                            variant="green"
                            danger={false}
                            busy={busy}
                            confirm={confirmStart}
                            setConfirm={setConfirmStart}
                            onConfirm={() => { setConfirmStart(false); apiPost("start"); }}
                        />
                    )}

                    {/* Generate next Swiss round */}
                    {isSwiss && isOngoing && (
                        <ActionRow
                            label="Generate Next Round"
                            desc="Pair players by current standings for the next Swiss round"
                            buttonLabel="Generate Next Round"
                            icon="⚙️"
                            variant="orange"
                            danger={false}
                            busy={busy}
                            confirm={confirmNextRound}
                            setConfirm={setConfirmNextRound}
                            onConfirm={() => { setConfirmNextRound(false); apiPost("generate-next-round"); }}
                        />
                    )}

                    {/* Promote to Knockout — group_stage_knockout only, while ongoing */}
                    {tournament.format === "group_stage_knockout" && isOngoing && (() => {
                        const groupMatches = bracketSections
                            .filter(s => s.section !== "K")
                            .flatMap(s => s.rounds.flatMap(r => r.matches));
                        const koMatches = bracketSections
                            .find(s => s.section === "K")?.rounds.flatMap(r => r.matches) ?? [];
                        const totalGroup     = groupMatches.length;
                        const completedGroup = groupMatches.filter(m => m.status === "completed").length;
                        const allDone        = totalGroup > 0 && completedGroup === totalGroup;
                        const koPopulated    = koMatches.some(m => m.player1 || m.player2);
                        if (koPopulated) return null; // already promoted
                        return (
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-0.5">
                                        Promote to Knockout
                                    </div>
                                    <div className="text-xs text-zinc-600">
                                        Top 2 from each group advance. QF/SF = Best of 3 · Final = Best of 5.
                                    </div>
                                </div>

                                {/* Group completion status bar */}
                                <div>
                                    <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                                        <span>Group matches completed</span>
                                        <span className={allDone ? "text-emerald-400 font-semibold" : ""}>
                                            {completedGroup} / {totalGroup}
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-blue-500"}`}
                                            style={{ width: totalGroup > 0 ? `${Math.round((completedGroup / totalGroup) * 100)}%` : "0%" }}
                                        />
                                    </div>
                                </div>

                                {allDone ? (
                                    confirmPromote ? (
                                        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-3">
                                            <p className="text-xs text-emerald-300">
                                                Generate the knockout bracket now? This cannot be undone.
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setConfirmPromote(false); apiPost("promote-to-knockout"); }}
                                                    disabled={busy}
                                                    className="flex-1 text-xs font-bold py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                                                >
                                                    {busy ? "Generating…" : "Yes, Generate Knockout"}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmPromote(false)}
                                                    className="text-xs text-zinc-400 hover:text-zinc-200 px-4 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmPromote(true)}
                                            disabled={busy}
                                            className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-all"
                                        >
                                            🏆 Generate Knockout Bracket
                                        </button>
                                    )
                                ) : (
                                    <div className="text-[11px] text-amber-400/70 flex items-center gap-1.5">
                                        <span>⏳</span>
                                        {totalGroup - completedGroup} group match{totalGroup - completedGroup !== 1 ? "es" : ""} remaining
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* End tournament */}
                    {isOngoing && (
                        <ActionRow
                            label="End Tournament"
                            desc="Mark the tournament as completed"
                            buttonLabel="End Tournament"
                            icon="🏁"
                            variant="red"
                            danger={true}
                            busy={busy}
                            confirm={confirmEnd}
                            setConfirm={setConfirmEnd}
                            onConfirm={() => { setConfirmEnd(false); apiPost("end"); }}
                        />
                    )}

                    {isCompleted && (
                        <div className="flex items-center gap-3 py-4 text-sm text-zinc-500">
                            <span className="text-lg">🏆</span>
                            This tournament is completed. No further actions available.
                        </div>
                    )}

                    {/* Delete — available while upcoming or after completion */}
                    {(isUpcoming || isCompleted) && (
                        <div className="pt-3 border-t border-zinc-800 mt-2">
                            {confirmDelete ? (
                                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 space-y-3">
                                    <p className="text-xs text-red-400 leading-relaxed">
                                        Permanently delete <span className="font-semibold text-red-300">{tournament.name}</span>?
                                        {isCompleted && (
                                            <span className="block mt-1 text-red-400/70">
                                                All match history and results will be permanently removed.
                                            </span>
                                        )}
                                        {" "}This cannot be undone.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={deleteTournament}
                                            disabled={busy}
                                            className="flex-1 text-xs font-bold py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                                        >
                                            {busy ? "Deleting…" : "Yes, Delete Forever"}
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete(false)}
                                            className="text-xs text-zinc-400 hover:text-zinc-200 px-4 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    className="flex items-center gap-2 text-xs text-red-500/80 hover:text-red-400 transition-colors py-1.5"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete Tournament
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Smart Tiered Preview ── */}
                <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl p-5 space-y-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-l-2 border-blue-500 pl-3">
                                    Tournament Referees
                                </h2>
                                <p className="text-xs text-zinc-500 mt-2 pl-3">
                                    Register your referee roster here. Referees assigned through match operations are added automatically.
                                </p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center min-w-[240px]">
                                <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-3 py-2">
                                    <div className="text-lg font-black text-white">{registeredRefereesCount}</div>
                                    <div className="text-[9px] uppercase tracking-wide text-zinc-600">Registered</div>
                                </div>
                                <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-3 py-2">
                                    <div className="text-lg font-black text-emerald-400">{checkedInTournamentRefereesCount}</div>
                                    <div className="text-[9px] uppercase tracking-wide text-zinc-600">Checked In</div>
                                </div>
                                <div className="rounded-xl border border-white/5 bg-zinc-950/60 px-3 py-2">
                                    <div className="text-lg font-black text-blue-400">{activeTournamentRefereesCount}</div>
                                    <div className="text-[9px] uppercase tracking-wide text-zinc-600">Active</div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                            <div className="flex gap-2 items-start">
                                <div className="flex-1 min-w-0">
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                                            </svg>
                                        </div>
                                        <input
                                            type="text"
                                            value={refereeSearchTerm}
                                            onChange={e => handleRefereeSearchInput(e.target.value)}
                                            onBlur={() => setTimeout(() => setShowRefereeDropdown(false), 150)}
                                            onFocus={() => { if (refereeSearchResults.length > 0) setShowRefereeDropdown(true); }}
                                            autoComplete="off"
                                            placeholder="Search a player to register as tournament referee..."
                                            className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-all"
                                        />
                                    </div>
                                    {showRefereeDropdown && refereeSearchResults.length > 0 && (
                                        <div className="mt-1.5 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-zinc-700/50 max-h-72 overflow-y-auto">
                                            {refereeSearchLoading && (
                                                <div className="px-4 py-2.5 text-xs text-zinc-500 flex items-center gap-2">
                                                    <span className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                                                    Searching...
                                                </div>
                                            )}
                                            {refereeSearchResults.map(player => {
                                                const alreadyRegistered = tournamentReferees.some(referee => referee.id === player.id);
                                                return (
                                                    <button
                                                        key={player.id}
                                                        type="button"
                                                        disabled={alreadyRegistered || refereeRosterBusy}
                                                        onMouseDown={() => {
                                                            if (!alreadyRegistered) {
                                                                void addTournamentReferee(player);
                                                            }
                                                        }}
                                                        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-700/70 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-white truncate">
                                                                {`${player.first_name || ''} ${player.last_name || ''}`.trim() || player.id.slice(0, 8)}
                                                            </div>
                                                        </div>
                                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                                                            alreadyRegistered
                                                                ? "bg-zinc-700/60 text-zinc-400 border-zinc-600"
                                                                : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                        }`}>
                                                            {alreadyRegistered ? "Registered" : "Add"}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {showRefereeDropdown && !refereeSearchLoading && refereeSearchResults.length === 0 && refereeSearchTerm.trim().length >= 2 && (
                                        <div className="mt-1.5 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl px-4 py-3 text-xs text-zinc-500">
                                            No users found for &quot;{refereeSearchTerm}&quot;
                                        </div>
                                    )}
                                </div>
                                <div className="shrink-0 text-[11px] text-zinc-500 max-w-[220px] leading-relaxed pt-1">
                                    Add referees before bracket operations so they are easier to track and assign later.
                                </div>
                            </div>
                        </div>

                        {refereeRosterLoading ? (
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500 flex items-center justify-center gap-2">
                                <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                                Loading tournament referees...
                            </div>
                        ) : tournamentReferees.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 px-4 py-8 text-center">
                                <div className="text-sm font-semibold text-zinc-300">No tournament referees registered yet.</div>
                                <div className="text-xs text-zinc-500 mt-2">
                                    Search for a user above, or assign a referee on a match and they will be added here automatically.
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {tournamentReferees.map(referee => (
                                    <div
                                        key={referee.id}
                                        className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-4 flex items-start gap-3"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-sm font-black text-white shrink-0">
                                            {(referee.first_name?.[0] || "?").toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-white">
                                                    {`${referee.first_name || ''} ${referee.last_name || ''}`.trim() || referee.id.slice(0, 8)}
                                                </span>
                                                {referee.has_referee_role && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                        Referee role
                                                    </span>
                                                )}
                                                {referee.is_club_member ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        {referee.club_role ? `${referee.club_role} member` : "Club member"}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                                                        External
                                                    </span>
                                                )}
                                                {referee.is_checked_in && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        {referee.checkin_status === "available_to_ref" ? "Ready to ref" : "Checked in"}
                                                    </span>
                                                )}
                                                {referee.is_participant && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        Participant
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-1">{referee.registered_at ? new Date(referee.registered_at).toLocaleDateString() : ""}</div>
                                            <div className="flex items-center gap-4 flex-wrap mt-3 text-[11px] text-zinc-500">
                                                <span>Current matches: <span className="text-zinc-300 font-semibold">{referee.current_match_load}</span></span>
                                                <span>Total assigned: <span className="text-zinc-300 font-semibold">{referee.total_match_assignments}</span></span>
                                                <span>Registered: <span className="text-zinc-300 font-semibold">{referee.registered_at ? new Date(referee.registered_at).toLocaleDateString() : "Recently"}</span></span>
                                                {referee.registered_by_name && (
                                                    <span>Added by: <span className="text-zinc-300 font-semibold">{referee.registered_by_name}</span></span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => void removeTournamentReferee(referee)}
                                            disabled={refereeRosterBusy || !referee.can_remove}
                                            className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                                            title={referee.can_remove ? "Remove referee from this tournament roster" : "This referee is assigned to an active match"}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                {tournament.draw_method === "smart_tiered" && isUpcoming && (
                    <div className="bg-zinc-900/80 backdrop-blur-sm border border-cyan-500/20 ring-1 ring-white/5 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="flex items-center gap-2 border-l-2 border-cyan-500 pl-3">
                                    <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Smart Tiered Preview</h2>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">AI</span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-1 pl-3">Preview how the AI will distribute participants into groups.</p>
                            </div>
                            <button
                                onClick={loadPreview}
                                disabled={previewLoading || registrations.filter(r => r.status === "confirmed").length < 2}
                                className="text-xs font-semibold px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 rounded-xl hover:bg-cyan-500/20 disabled:opacity-40 transition-colors shrink-0"
                            >
                                {previewLoading ? "Analyzing…" : previewGroups ? "↻ Refresh" : "Preview Groups"}
                            </button>
                        </div>

                        {previewScores && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                                {[
                                    { label: "Balance",         value: `${previewScores.strength_balance_score}`, unit: "/100", color: "text-emerald-400" },
                                    { label: "Competitive",     value: `${previewScores.competitiveness_score}`,  unit: "/100", color: "text-blue-400" },
                                    { label: "Club Collisions", value: `${previewScores.club_collision_count}`,   unit: "",     color: previewScores.club_collision_count === 0 ? "text-emerald-400" : "text-yellow-400" },
                                    { label: "Fairness",        value: `${previewScores.combined_score}`,        unit: "/100", color: "text-cyan-400" },
                                ].map(s => (
                                    <div key={s.label} className="bg-zinc-800/60 rounded-xl p-3 text-center border border-white/5">
                                        <div className={`text-xl font-extrabold font-mono ${s.color}`}>
                                            {s.value}<span className="text-xs text-zinc-600 font-normal">{s.unit}</span>
                                        </div>
                                        <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wide">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {previewGroups && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {previewGroups.map(group => (
                                    <div key={group.label} className="bg-zinc-800/50 rounded-xl p-3 border border-white/5">
                                        <p className="text-[10px] font-bold text-cyan-500/80 uppercase tracking-widest mb-2.5">Group {group.label}</p>
                                        <div className="space-y-2">
                                            {group.members.map(m => (
                                                <div key={m.player_id} className="flex items-center justify-between">
                                                    <div className="text-sm text-zinc-200">
                                                        {`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.player_id.slice(0, 8)}
                                                    </div>
                                                    <div className="text-xs font-mono text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded">{m.rating}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Invite Player ── */}
                {isUpcoming && (
                    <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl p-5">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 border-l-2 border-blue-500 pl-3">
                            Invite Player
                        </h2>
                        <form onSubmit={sendInvite} className="flex gap-2 items-start">
                            <div className="flex-1 min-w-0">
                                <div className="relative">
                                {/* Search icon */}
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search by name…"
                                        value={inviteQuery}
                                        onChange={e => handleInviteInput(e.target.value)}
                                        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                                        onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                                        autoComplete="off"
                                        className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-all"
                                    />
                                </div>
                                {/* Dropdown */}
                                {showDropdown && searchResults.length > 0 && (
                                    <div className="mt-1.5 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-zinc-700/50 max-h-72 overflow-y-auto">
                                        {searchLoading && (
                                            <div className="px-4 py-2.5 text-xs text-zinc-500 flex items-center gap-2">
                                                <span className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                                                Searching…
                                            </div>
                                        )}
                                        {searchResults.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onMouseDown={() => selectSearchResult(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id.slice(0, 8))}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-700/70 transition-colors text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-xs font-bold shrink-0 text-white">
                                                    {(p.first_name?.[0] || "?").toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-white truncate">
                                                        {`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id.slice(0, 8)}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {showDropdown && !searchLoading && searchResults.length === 0 && inviteQuery.trim().length >= 2 && (
                                    <div className="mt-1.5 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl px-4 py-3 text-xs text-zinc-500">
                                        No users found for &quot;{inviteQuery}&quot;
                                    </div>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={inviteBusy || !invitePlayerId.trim()}
                                className="text-sm font-semibold px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
                            >
                                {inviteBusy ? "Sending…" : "Send Invite"}
                            </button>
                        </form>
                        {inviteMsg && (
                            <p className={`text-xs mt-2 pl-1 ${
                                inviteMsg.includes("fail") || inviteMsg.includes("not found") || inviteMsg.includes("already")
                                    ? "text-red-400"
                                    : "text-emerald-400"
                            }`}>
                                {inviteMsg}
                            </p>
                        )}
                    </div>
                )}

                {/* ── Join Requests ── */}
                {(() => {
                    const isDoublesFmt = tournament?.match_format === "doubles" || tournament?.match_format === "mixed_doubles";
                    const pendingApproval = registrations.filter(r => r.status === "pending_approval");
                    const pendingPartner  = registrations.filter(r => r.status === "pending_partner");
                    const totalRequests   = isDoublesFmt
                        ? pendingApproval.length + pendingPartner.length
                        : pendingApproval.length;
                    if (!totalRequests) return null;

                    // ── Singles: flat list ────────────────────────────────────
                    if (!isDoublesFmt) {
                        return (
                            <div className="bg-zinc-900/80 backdrop-blur-sm border border-yellow-500/20 ring-1 ring-white/5 rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4 border-l-2 border-yellow-500 pl-3">
                                    <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Join Requests</h2>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">{pendingApproval.length}</span>
                                </div>
                                <div className="space-y-3">
                                    {pendingApproval.map(reg => <SinglePlayerCard key={reg.registration_id} reg={reg} busy={busy} isUpcoming={isUpcoming} onApprove={() => approveRequest(reg)} onReject={() => rejectRequest(reg)} />)}
                                </div>
                            </div>
                        );
                    }

                    // ── Doubles: group into team pairs ────────────────────────
                    type TeamEntry = { p1: Registration; p2: Registration | null; forming: boolean };
                    const teams: TeamEntry[] = [];
                    const seen = new Set<string>();

                    // Confirmed pairs (both pending_approval)
                    for (const reg of pendingApproval) {
                        if (seen.has(reg.registration_id)) continue;
                        seen.add(reg.registration_id);
                        const partner = reg.partner_id
                            ? pendingApproval.find(r => r.player_id === reg.partner_id) ?? null
                            : null;
                        if (partner) seen.add(partner.registration_id);
                        teams.push({ p1: reg, p2: partner, forming: false });
                    }
                    // Forming pairs (p1 invited p2, waiting for p2 to accept)
                    for (const reg of pendingPartner) {
                        if (!seen.has(reg.registration_id)) {
                            seen.add(reg.registration_id);
                            teams.push({ p1: reg, p2: null, forming: true });
                        }
                    }

                    return (
                        <div className="bg-zinc-900/80 backdrop-blur-sm border border-yellow-500/20 ring-1 ring-white/5 rounded-2xl p-5">
                            <div className="flex items-center gap-3 mb-4 border-l-2 border-yellow-500 pl-3">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Join Requests</h2>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">{teams.length} team{teams.length !== 1 ? "s" : ""}</span>
                                <span className="text-[10px] text-zinc-600 ml-auto capitalize">{tournament.match_format.replace("_", " ")}</span>
                            </div>
                            <div className="space-y-4">
                                {teams.map(({ p1, p2, forming }) => {
                                    const avgScore = p2 && p1.assessment && p2.assessment
                                        ? Math.round((p1.assessment.readiness_score + p2.assessment.readiness_score) / 2)
                                        : p1.assessment?.readiness_score ?? 50;
                                    const borderColor = forming
                                        ? "border-blue-500/50"
                                        : avgScore >= 70 ? "border-emerald-500/50"
                                        : avgScore >= 40 ? "border-yellow-500/50"
                                        : "border-red-500/50";
                                    const teamKey = p1.registration_id + (p2?.registration_id ?? "forming");

                                    return (
                                        <div key={teamKey} className={`rounded-2xl border ${borderColor} bg-zinc-800/40 overflow-hidden`}>

                                            {/* ── Team header strip ── */}
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/60 border-b border-zinc-700/40">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm">🏸</span>
                                                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Doubles Team</span>
                                                </div>
                                                {forming ? (
                                                    <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                                        Partner pending
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                                                        Awaiting approval
                                                    </span>
                                                )}
                                            </div>

                                            {/* ── Player 1 ── */}
                                            <PlayerRow reg={p1} label="Player 1" />

                                            {/* ── Connector ── */}
                                            <div className="flex items-center gap-3 px-4 py-1.5 bg-zinc-900/40">
                                                <div className="flex-1 h-px bg-zinc-700/50" />
                                                <span className="text-[10px] font-black text-zinc-600 tracking-widest">+ PARTNER</span>
                                                <div className="flex-1 h-px bg-zinc-700/50" />
                                            </div>

                                            {/* ── Player 2 / Pending slot ── */}
                                            {p2 ? (
                                                <PlayerRow reg={p2} label="Player 2" />
                                            ) : forming ? (
                                                <div className="flex items-center gap-3 px-4 py-3">
                                                    <div className="w-9 h-9 rounded-full bg-zinc-700/60 border-2 border-dashed border-zinc-600 flex items-center justify-center shrink-0">
                                                        <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-zinc-400">
                                                            {p1.partner_first_name || p1.partner_last_name ? `${p1.partner_first_name || ''} ${p1.partner_last_name || ''}`.trim() : "Invited player"}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                                            <span className="text-[11px] text-blue-400">Invite sent · waiting for acceptance</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <div className="text-xs text-zinc-600">⏳</div>
                                                        <div className="text-[10px] text-zinc-600 uppercase tracking-wide mt-0.5">Pending</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="px-4 py-3 text-xs text-zinc-600 italic">Partner info unavailable</div>
                                            )}

                                            {/* ── Combined flags ── */}
                                            {(() => {
                                                const allFlags = [
                                                    ...(p1.assessment?.flags ?? []).map(f => ({ f, player: `${p1.first_name || ''} ${p1.last_name || ''}`.trim() })),
                                                    ...(p2?.assessment?.flags ?? []).map(f => ({ f, player: `${p2?.first_name || ''} ${p2?.last_name || ''}`.trim() })),
                                                ];
                                                if (!allFlags.length) return null;
                                                return (
                                                    <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-zinc-700/40">
                                                        {allFlags.map(({ f, player }, i) => (
                                                            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                                                f.includes("below") || f.includes("above") || f.includes("Inactive")
                                                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                                    : "bg-zinc-700/60 text-zinc-400 border-zinc-600/60"
                                                            }`}>
                                                                {f} <span className="opacity-50">· @{player}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                );
                                            })()}

                                            {/* ── Note when forming (no approve buttons) ── */}
                                            {forming && (
                                                <div className="px-4 py-2.5 border-t border-zinc-700/40 bg-blue-500/5">
                                                    <p className="text-[11px] text-blue-400/80 text-center">
                                                        This team will enter the approval queue once the invited partner accepts.
                                                    </p>
                                                </div>
                                            )}

                                            {/* ── Approve / Reject ── */}
                                            {!forming && isUpcoming && (
                                                <div className="grid grid-cols-2 border-t border-zinc-700/40">
                                                    <button
                                                        onClick={() => approveTeam(p1, p2)}
                                                        disabled={busy}
                                                        className="py-3 text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 transition-colors rounded-bl-2xl flex items-center justify-center gap-1.5"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                        Approve Team
                                                    </button>
                                                    <button
                                                        onClick={() => rejectTeam(p1, p2)}
                                                        disabled={busy}
                                                        className="py-3 text-xs font-bold bg-red-500/8 hover:bg-red-500/15 text-red-400 disabled:opacity-40 transition-colors rounded-br-2xl flex items-center justify-center gap-1.5 border-l border-zinc-700/40"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                        Reject Team
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* ── Participants (confirmed) ── */}
                <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-l-2 border-blue-500 pl-3 shrink-0">
                                Participants
                                <span className="ml-2 font-mono text-zinc-400 normal-case tracking-normal">
                                    {confirmedCount} / {tournament.max_participants}
                                </span>
                            </h2>
                            {/* Bracket size advisory chip */}
                            {confirmedCount > 0 && isRegClosed && (
                                byeInfo ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 whitespace-nowrap">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                                        </svg>
                                        {byeInfo.msg}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 whitespace-nowrap">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                        </svg>
                                        Perfect bracket size
                                    </span>
                                )
                            )}
                        </div>
                        {isUpcoming && (
                            <span className="text-[10px] text-zinc-600 uppercase tracking-wide shrink-0">Click seed to edit</span>
                        )}
                    </div>

                    {(() => {
                        const isDoublesP = tournament?.match_format === "doubles" || tournament?.match_format === "mixed_doubles";
                        const confirmedList = registrations.filter(r => r.status === "confirmed");

                        if (confirmedList.length === 0) {
                            return <p className="text-sm text-zinc-500 py-8 text-center">No confirmed participants yet.</p>;
                        }

                        if (isDoublesP) {
                            const seen = new Set<string>();
                            const teams: [Registration, Registration | null][] = [];
                            for (const reg of confirmedList) {
                                if (seen.has(reg.registration_id)) continue;
                                seen.add(reg.registration_id);
                                const partner = reg.partner_id
                                    ? confirmedList.find(r => r.player_id === reg.partner_id) ?? null
                                    : null;
                                if (partner && !seen.has(partner.registration_id)) {
                                    seen.add(partner.registration_id);
                                    teams.push([reg, partner]);
                                } else {
                                    teams.push([reg, null]);
                                }
                            }
                            const mkInit = (r: Registration) => (r.first_name?.[0] || "?").toUpperCase();
                            const mkName = (r: Registration) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.player_id.slice(0, 8);
                            return (
                                <div>
                                    {teams.map(([p1, p2], i) => (
                                        <div
                                            key={p1.registration_id}
                                            className={`px-5 py-3 ${i % 2 === 0 ? "bg-zinc-900/60" : "bg-zinc-800/30"} border-b border-zinc-800/60 last:border-0`}
                                        >
                                            {/* Seed + team label */}
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="w-9 shrink-0 text-center">
                                                    {editingSeed === p1.registration_id ? (
                                                        <input
                                                            type="number" min={1} value={seedValue}
                                                            onChange={e => setSeedValue(e.target.value)}
                                                            onBlur={() => saveSeed(p1)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveSeed(p1); if (e.key === "Escape") setEditingSeed(null); }}
                                                            className="w-9 bg-zinc-700 border border-blue-500/50 rounded-md text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <button
                                                            onClick={() => { if (!isUpcoming) return; setEditingSeed(p1.registration_id); setSeedValue(p1.seed ? String(p1.seed) : ""); }}
                                                            className={`text-xs font-mono px-1.5 py-0.5 rounded-md border transition-colors ${isUpcoming ? "text-zinc-300 border-zinc-700 hover:border-blue-500/50 hover:text-white hover:bg-blue-500/10 cursor-pointer" : "text-zinc-600 border-zinc-800 cursor-default"}`}
                                                            title={isUpcoming ? "Click to set seed" : ""}
                                                        >
                                                            #{p1.seed ?? i + 1}
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="text-[10px] font-black tracking-widest text-zinc-600 uppercase">Doubles Team</span>
                                            </div>
                                            {/* Player 1 */}
                                            <div className="flex items-center gap-3 pl-12">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-white border border-zinc-700">
                                                    {mkInit(p1)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-sm font-medium text-white">{mkName(p1)}</span>
                                                        {p1.source === "organizer_invited" && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Via invite</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-zinc-600">{p1.registered_at ? new Date(p1.registered_at).toLocaleDateString() : ""}</div>
                                                </div>
                                                {isUpcoming && (
                                                    <button onClick={() => removeParticipant(p1)} className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/5">Remove</button>
                                                )}
                                            </div>
                                            {/* Divider */}
                                            <div className="flex items-center gap-2 pl-12 my-1.5">
                                                <div className="flex-1 h-px bg-zinc-800" />
                                                <span className="text-[9px] font-bold text-zinc-700">+</span>
                                                <div className="flex-1 h-px bg-zinc-800" />
                                            </div>
                                            {/* Player 2 */}
                                            {p2 ? (
                                                <div className="flex items-center gap-3 pl-12">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-white border border-zinc-700">
                                                        {mkInit(p2)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-sm font-medium text-white">{mkName(p2)}</span>
                                                            {p2.source === "organizer_invited" && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Via invite</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-zinc-600">{p2.registered_at ? new Date(p2.registered_at).toLocaleDateString() : ""}</div>
                                                    </div>
                                                    {isUpcoming && (
                                                        <button onClick={() => removeParticipant(p2)} className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/5">Remove</button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 pl-12">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-800/50 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 shrink-0">?</div>
                                                    <span className="text-xs text-zinc-600 italic">Partner slot open</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        }

                        // Singles: flat list
                        return (
                            <div>
                                {confirmedList.map((reg, i) => (
                                    <div
                                        key={reg.registration_id}
                                        className={`flex items-center gap-3 px-5 py-3 ${i % 2 === 0 ? "bg-zinc-900/60" : "bg-zinc-800/30"} border-b border-zinc-800/60 last:border-0`}
                                    >
                                        {/* Seed pill */}
                                        <div className="w-9 shrink-0 text-center">
                                            {editingSeed === reg.registration_id ? (
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={seedValue}
                                                    onChange={e => setSeedValue(e.target.value)}
                                                    onBlur={() => saveSeed(reg)}
                                                    onKeyDown={e => { if (e.key === "Enter") saveSeed(reg); if (e.key === "Escape") setEditingSeed(null); }}
                                                    className="w-9 bg-zinc-700 border border-blue-500/50 rounded-md text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                                                    autoFocus
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        if (!isUpcoming) return;
                                                        setEditingSeed(reg.registration_id);
                                                        setSeedValue(reg.seed ? String(reg.seed) : "");
                                                    }}
                                                    className={`text-xs font-mono px-1.5 py-0.5 rounded-md border transition-colors ${
                                                        isUpcoming
                                                            ? "text-zinc-300 border-zinc-700 hover:border-blue-500/50 hover:text-white hover:bg-blue-500/10 cursor-pointer"
                                                            : "text-zinc-600 border-zinc-800 cursor-default"
                                                    }`}
                                                    title={isUpcoming ? "Click to set seed" : ""}
                                                >
                                                    #{reg.seed ?? i + 1}
                                                </button>
                                            )}
                                        </div>
                                        {/* Avatar */}
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-white border border-zinc-700">
                                            {(reg.first_name?.[0] || "?").toUpperCase()}
                                        </div>
                                        {/* Name */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-sm font-medium text-white">
                                                    {`${reg.first_name || ''} ${reg.last_name || ''}`.trim() || reg.player_id.slice(0, 8)}
                                                </span>
                                                {reg.source === "organizer_invited" && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Via invite</span>
                                                )}
                                            </div>
                                        </div>
                                        {/* Remove */}
                                        {isUpcoming && (
                                            <button
                                                onClick={() => removeParticipant(reg)}
                                                className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/5"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                {/* ── Pending Partner Invites (doubles) ── */}
                {registrations.some(r => r.status === "pending_partner") && (
                    <div className="bg-zinc-900/80 backdrop-blur-sm border border-purple-500/20 ring-1 ring-purple-500/10 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400 border-l-2 border-purple-500 pl-3">
                                Awaiting Partner Confirmation
                            </h2>
                            <span className="text-[10px] text-zinc-500">
                                {registrations.filter(r => r.status === "pending_partner").length} pending
                            </span>
                        </div>
                        <div>
                            {registrations.filter(r => r.status === "pending_partner").map((reg, i) => (
                                <div
                                    key={reg.registration_id}
                                    className={`flex items-center gap-3 px-5 py-3 border-b border-zinc-800/60 last:border-0 ${i % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-800/20"}`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold shrink-0 text-purple-300 border border-purple-500/20">
                                        {(reg.first_name?.[0] || "?").toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-sm font-medium text-white">
                                                {`${reg.first_name || ''} ${reg.last_name || ''}`.trim() || reg.player_id.slice(0, 8)}
                                            </span>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
                                                Waiting for partner
                                            </span>
                                        </div>
                                        <div className="text-xs text-zinc-600">
                                            {reg.partner_first_name || reg.partner_last_name
                                                ? `invited: ${`${reg.partner_first_name || ''} ${reg.partner_last_name || ''}`.trim()}`
                                                : ""}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-5 py-3 bg-purple-500/5 border-t border-purple-500/10">
                            <p className="text-[11px] text-zinc-500">
                                ⚠ The bracket cannot be generated until all partner invites are accepted or cancelled.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Invitations ── */}
                {registrations.some(r => r.status === "invited" || r.status === "declined") && (
                    <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-800">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 border-l-2 border-zinc-600 pl-3">
                                Invitations
                            </h2>
                        </div>
                        <div>
                            {registrations.filter(r => r.status === "invited" || r.status === "declined").map((reg, i) => (
                                <div
                                    key={reg.registration_id}
                                    className={`flex items-center gap-3 px-5 py-3 border-b border-zinc-800/60 last:border-0 ${
                                        reg.status === "declined" ? "opacity-45" : ""
                                    } ${i % 2 === 0 ? "bg-zinc-900/40" : "bg-zinc-800/20"}`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 text-white border border-zinc-700">
                                        {(reg.first_name?.[0] || "?").toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-sm font-medium text-white">
                                                {`${reg.first_name || ''} ${reg.last_name || ''}`.trim() || reg.player_id.slice(0, 8)}
                                            </span>
                                            {reg.status === "invited" && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">Pending</span>
                                            )}
                                            {reg.status === "declined" && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Declined</span>
                                            )}
                                        </div>
                                    </div>
                                    {isUpcoming && reg.status === "invited" && (
                                        <button
                                            onClick={() => removeParticipant(reg)}
                                            className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/5"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {/* ── Bracket + Live — full-width so all rounds have room ── */}
            {(bracketRounds.length > 0 || bracketSections.length > 0) && (
                <div className="relative z-10 max-w-7xl mx-auto px-4 pb-8">
                    <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 ring-1 ring-white/5 rounded-2xl overflow-hidden">
                        {/* Tab header */}
                        <div className="flex items-center gap-0 px-4 pt-4 border-b border-zinc-800">
                            {[
                                { key: "bracket" as const, label: "🗂 Bracket" },
                                ...(isOngoing ? [{ key: "live" as const, label: liveCount > 0 ? `🔴 Live (${liveCount})` : "🔴 Live" }] : []),
                            ].map(t => (
                                <button
                                    key={t.key}
                                    onClick={() => setBracketTab(t.key)}
                                    className={`px-4 pb-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 -mb-px ${
                                        bracketTab === t.key
                                            ? "border-blue-500 text-white"
                                            : "border-transparent text-zinc-500 hover:text-zinc-300"
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                            <div className="flex-1" />
                            {bracketTab === "bracket" && isOngoing && (
                                <span className="text-[11px] text-zinc-500 pb-3">Click any match to enter scores</span>
                            )}
                        </div>

                        <div className="p-6">
                            {bracketTab === "bracket" ? (
                                <OrganizerBracketView
                                    rounds={bracketSections.length > 0
                                        ? bracketSections.flatMap(s => s.rounds)
                                        : bracketRounds}
                                    onScoreClick={openScoreModal}
                                    onOpenOps={setOpsMatch}
                                    onQuickAction={handleBracketQuickAction}
                                    isOrganizer={true}
                                    isOngoing={isOngoing}
                                />
                            ) : (
                                <LiveMatchesView
                                    matches={allMatches}
                                    isOrganizer={true}
                                    onScoreClick={openScoreModal}
                                    onOpenOps={setOpsMatch}
                                    isOngoing={isOngoing}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Score Entry Modal ── */}
            {scoreModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-black/80 backdrop-blur-md">
                    <div className="bg-zinc-950 border border-zinc-700 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden">

                        {/* Header — VS */}
                        <div className="relative px-6 pt-6 pb-5 border-b border-zinc-800/80 bg-gradient-to-b from-zinc-900 to-zinc-950">
                            <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] text-center mb-4">Match Score</p>
                            <div className="flex items-stretch justify-center gap-4">
                                {/* P1 */}
                                <div className="flex-1 flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-800 flex items-center justify-center text-base font-black text-white shadow-lg shadow-blue-900/30">
                                        {(scoreModal.player1?.first_name?.[0] || "?").toUpperCase()}
                                    </div>
                                    <p className="text-sm font-bold text-white text-center leading-tight">
                                        {scoreModal.is_doubles && scoreModal.team1?.some(Boolean)
                                            ? scoreModal.team1!.filter(Boolean).map(p => `${p!.first_name || ''} ${p!.last_name || ''}`.trim() || "?").join(" / ")
                                            : (`${scoreModal.player1?.first_name || ''} ${scoreModal.player1?.last_name || ''}`.trim() || "P1")}
                                    </p>
                                </div>
                                {/* VS */}
                                <div className="flex flex-col items-center justify-center py-1">
                                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                        <span className="text-[10px] font-black text-zinc-500">VS</span>
                                    </div>
                                </div>
                                {/* P2 */}
                                <div className="flex-1 flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-800 flex items-center justify-center text-base font-black text-white shadow-lg shadow-purple-900/30">
                                        {(scoreModal.player2?.first_name?.[0] || "?").toUpperCase()}
                                    </div>
                                    <p className="text-sm font-bold text-white text-center leading-tight">
                                        {scoreModal.is_doubles && scoreModal.team2?.some(Boolean)
                                            ? scoreModal.team2!.filter(Boolean).map(p => `${p!.first_name || ''} ${p!.last_name || ''}`.trim() || "?").join(" / ")
                                            : (`${scoreModal.player2?.first_name || ''} ${scoreModal.player2?.last_name || ''}`.trim() || "P2")}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-5 space-y-6">
                            {/* Set scores */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-semibold">Set Scores</p>
                                    {/* Column headers */}
                                    <div className="flex items-center gap-2 mr-6">
                                        <span className="text-[10px] text-blue-400/70 w-16 text-center">
                                            {`${scoreModal.player1?.first_name || ''} ${scoreModal.player1?.last_name || ''}`.trim() || "P1"}
                                        </span>
                                        <span className="text-[10px] text-zinc-700 w-4 text-center">—</span>
                                        <span className="text-[10px] text-purple-400/70 w-16 text-center">
                                            {`${scoreModal.player2?.first_name || ''} ${scoreModal.player2?.last_name || ''}`.trim() || "P2"}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {scoreSets.map((s, i) => {
                                        const p1Val = parseInt(s.p1) || 0;
                                        const p2Val = parseInt(s.p2) || 0;
                                        const p1Over = s.p1 !== "" && p1Val > MAX_SCORE;
                                        const p2Over = s.p2 !== "" && p2Val > MAX_SCORE;
                                        const p1Wins = s.p1 !== "" && s.p2 !== "" && p1Val > p2Val && p1Val >= MAX_SCORE;
                                        const p2Wins = s.p1 !== "" && s.p2 !== "" && p2Val > p1Val && p2Val >= MAX_SCORE;
                                        return (
                                            <div key={i} className="flex items-center gap-2">
                                                {/* Set label + set winner dot */}
                                                <span className="text-xs text-zinc-600 font-mono w-8 shrink-0 text-center">
                                                    S{i + 1}
                                                </span>

                                                {/* P1 score */}
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        value={s.p1}
                                                        onChange={e => handleSetScoreChange(i, "p1", e.target.value)}
                                                        placeholder="0"
                                                        className={`w-16 bg-zinc-900 border-2 rounded-xl px-2 py-3 text-lg font-black text-center focus:outline-none transition-colors placeholder:text-zinc-700 ${
                                                            p1Over
                                                                ? "border-red-500 text-red-400"
                                                                : p1Wins
                                                                    ? "border-blue-500 text-blue-300"
                                                                    : "border-zinc-700 hover:border-blue-500/40 focus:border-blue-500 text-white"
                                                        }`}
                                                    />
                                                    {p1Over && (
                                                        <span className="absolute -top-4 left-0 text-[9px] text-red-400 whitespace-nowrap">max {MAX_SCORE}</span>
                                                    )}
                                                </div>

                                                {/* Divider */}
                                                <span className="text-zinc-700 text-base font-bold shrink-0">:</span>

                                                {/* P2 score */}
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        value={s.p2}
                                                        onChange={e => handleSetScoreChange(i, "p2", e.target.value)}
                                                        placeholder="0"
                                                        className={`w-16 bg-zinc-900 border-2 rounded-xl px-2 py-3 text-lg font-black text-center focus:outline-none transition-colors placeholder:text-zinc-700 ${
                                                            p2Over
                                                                ? "border-red-500 text-red-400"
                                                                : p2Wins
                                                                    ? "border-purple-500 text-purple-300"
                                                                    : "border-zinc-700 hover:border-purple-500/40 focus:border-purple-500 text-white"
                                                        }`}
                                                    />
                                                    {p2Over && (
                                                        <span className="absolute -top-4 right-0 text-[9px] text-red-400 whitespace-nowrap">max {MAX_SCORE}</span>
                                                    )}
                                                </div>

                                                {/* Winner pip */}
                                                <span className={`text-[10px] w-5 shrink-0 ${p1Wins ? "text-blue-400" : p2Wins ? "text-purple-400" : "text-zinc-800"}`}>
                                                    {p1Wins ? "●" : p2Wins ? "●" : "○"}
                                                </span>

                                                {/* Remove */}
                                                {i > 0 ? (
                                                    <button
                                                        onClick={() => {
                                                            const updated = scoreSets.filter((_, j) => j !== i);
                                                            setScoreSets(updated);
                                                            const predicted = derivedWinnerFromSets(updated, scoreModal);
                                                            if (predicted) setScoreWinner(predicted);
                                                        }}
                                                        className="ml-auto text-zinc-700 hover:text-red-400 transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500/10 shrink-0 text-xs"
                                                    >✕</button>
                                                ) : (
                                                    <span className="w-7 shrink-0 ml-auto" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Set score rule hint */}
                                <p className="text-[10px] text-zinc-600 pl-10 mt-1.5">
                                    First to {MAX_SCORE} wins the set · Max {MAX_SETS} sets
                                </p>

                                {scoreSets.length < MAX_SETS && (
                                    <button
                                        onClick={() => setScoreSets(prev => [...prev, { p1: "", p2: "" }])}
                                        className="mt-2 text-xs text-zinc-500 hover:text-blue-400 transition-colors flex items-center gap-1.5 pl-10"
                                    >
                                        <span className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">+</span>
                                        Add set
                                    </button>
                                )}
                            </div>

                            {/* Winner */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-semibold">Winner</p>
                                    {(() => {
                                        const predicted = derivedWinnerFromSets(scoreSets, scoreModal);
                                        if (!predicted) return null;
                                        const name = predicted === scoreModal?.player1?.id
                                            ? `${scoreModal.player1?.first_name || ''} ${scoreModal.player1?.last_name || ''}`.trim()
                                            : `${scoreModal?.player2?.first_name || ''} ${scoreModal?.player2?.last_name || ''}`.trim();
                                        return (
                                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                                                <span>✓</span>
                                                <span>Predicted: <span className="font-bold">{name}</span></span>
                                            </span>
                                        );
                                    })()}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { player: scoreModal.player1, color: "blue" },
                                        { player: scoreModal.player2, color: "purple" },
                                    ] as const).map(({ player: p, color }) => {
                                        if (!p) return null;
                                        const selected = scoreWinner === p.id;
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => setScoreWinner(p.id)}
                                                className={`relative flex flex-col items-center gap-2 px-4 py-4 rounded-2xl border-2 transition-all ${
                                                    selected
                                                        ? color === "blue"
                                                            ? "bg-blue-500/15 border-blue-500 shadow-lg shadow-blue-500/20"
                                                            : "bg-purple-500/15 border-purple-500 shadow-lg shadow-purple-500/20"
                                                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-600"
                                                }`}
                                            >
                                                {selected && (
                                                    <span className="absolute top-2 right-2 text-xs">
                                                        {color === "blue" ? "🏆" : "🏆"}
                                                    </span>
                                                )}
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black ${
                                                    selected
                                                        ? color === "blue" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"
                                                        : "bg-zinc-800 text-zinc-400"
                                                }`}>
                                                    {(p.first_name?.[0] || "?").toUpperCase()}
                                                </div>
                                                <span className={`text-sm font-bold truncate max-w-full text-center ${selected ? "text-white" : "text-zinc-400"}`}>
                                                    {scoreModal.is_doubles
                                                        ? (color === "blue" ? scoreModal.team1 : scoreModal.team2)
                                                            ?.filter(Boolean).map(m => `${m!.first_name || ''} ${m!.last_name || ''}`.trim() || "?").join(" / ")
                                                            || `${p.first_name || ''} ${p.last_name || ''}`.trim()
                                                        : `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id.slice(0, 8)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Submit */}
                            <div className="flex gap-2 pt-1 pb-safe">
                                <button
                                    onClick={submitScore}
                                    disabled={scoreBusy || !scoreWinner || scoreSets.some(s => (parseInt(s.p1) || 0) > MAX_SCORE || (parseInt(s.p2) || 0) > MAX_SCORE)}
                                    className={`flex-1 text-sm font-black py-3.5 rounded-xl transition-all disabled:opacity-40 ${
                                        scoreWinner
                                            ? "bg-white text-black hover:bg-zinc-100 shadow-lg"
                                            : "bg-zinc-800 text-zinc-500"
                                    }`}
                                >
                                    {scoreBusy ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                            Submitting…
                                        </span>
                                    ) : "Submit Score"}
                                </button>
                                <button
                                    onClick={() => setScoreModal(null)}
                                    className="px-5 text-sm text-zinc-500 border border-zinc-800 rounded-xl hover:bg-zinc-900 hover:text-zinc-300 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <TournamentMatchOpsModal
                open={opsMatch !== null}
                match={opsMatch}
                tournamentId={tourId}
                clubId={tournament?.club_id ?? null}
                onClose={() => setOpsMatch(null)}
                onSaved={async () => {
                    const token = getAccessToken();
                    if (!token) return;
                    await fetchDetail(token);
                }}
            />
        </div>
    );
}

function OrganizerBracketView({
    rounds, onScoreClick, onOpenOps, onQuickAction, isOrganizer, isOngoing,
}: {
    rounds: BracketRound[];
    onScoreClick: (m: BracketMatch) => void;
    onOpenOps: (m: BracketMatch) => void;
    onQuickAction: (m: BracketMatch, action: "call" | "start" | "notify-referee") => void;
    isOrganizer: boolean;
    isOngoing: boolean;
}) {
    if (!rounds.length) return null;

    return (
        <div className="overflow-x-auto pb-3 -mx-1">
            <div className="flex gap-5 min-w-max px-1 items-start">
                {rounds.map((round, ri) => (
                    <div key={round.round} className="w-64 shrink-0 flex flex-col gap-3">

                        {/* Round header */}
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-black text-zinc-400">{ri + 1}</span>
                            </div>
                            <span className="text-xs font-bold text-zinc-300 tracking-wide whitespace-nowrap">{round.label}</span>
                            <div className="flex-1 h-px bg-zinc-800" />
                            <span className="text-[10px] text-zinc-700 shrink-0">{round.matches.length}m</span>
                        </div>

                        {/* Match cards */}
                        {round.matches.map(match => {
                            const completed  = match.status === "completed";
                            const ongoing    = match.status === "ongoing";
                            const hasBoth    = !!match.player1 && !!match.player2;
                            const canScore   = isOngoing && hasBoth && !completed;
                            const phase      = match.tournament_phase ?? null;
                            const lobbyOpen  = phase === "called" || phase === "ready";

                            // Tally sets
                            let p1Sets = 0, p2Sets = 0;
                            for (const s of match.sets) {
                                if (s.player1_score > s.player2_score) p1Sets++;
                                else if (s.player2_score > s.player1_score) p2Sets++;
                            }
                            // Detailed score string e.g. "21–15, 18–21, 21–19"
                            const setDetail = match.sets.length > 0
                                ? match.sets.map(s => `${s.player1_score}–${s.player2_score}`).join("  ")
                                : null;

                            const borderCls = completed
                                ? "border-zinc-700/50"
                                : ongoing
                                    ? "border-emerald-500/30"
                                    : canScore
                                        ? "border-blue-500/25 hover:border-blue-400/50 hover:shadow-[0_0_16px_rgba(96,165,250,0.08)] cursor-pointer"
                                        : "border-zinc-800";

                            return (
                                <div
                                    key={match.match_id}
                                    className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${borderCls}`}
                                    onClick={() => canScore && onScoreClick(match)}
                                >
                                    {/* Status strip */}
                                    <div className={`px-3 py-1.5 flex items-center justify-between border-b ${
                                        completed  ? "bg-zinc-800/30 border-zinc-800/50" :
                                        ongoing    ? "bg-emerald-500/5 border-emerald-500/20" :
                                        canScore   ? "bg-blue-500/5 border-blue-500/15" :
                                        phase === "ready"  ? "bg-emerald-500/5 border-emerald-500/15" :
                                        phase === "called" ? "bg-amber-500/5 border-amber-500/15" :
                                        "bg-zinc-900 border-zinc-800/50"
                                    }`}>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                completed  ? "bg-zinc-600" :
                                                ongoing    ? "bg-emerald-400 animate-pulse" :
                                                canScore   ? "bg-blue-400 animate-pulse" :
                                                phase === "ready"  ? "bg-emerald-400 animate-pulse" :
                                                phase === "called" ? "bg-amber-400 animate-pulse" :
                                                "bg-zinc-700"
                                            }`} />
                                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                                                completed  ? "text-zinc-600" :
                                                ongoing    ? "text-emerald-400" :
                                                canScore   ? "text-blue-400" :
                                                phase === "ready"  ? "text-emerald-400" :
                                                phase === "called" ? "text-amber-400" :
                                                "text-zinc-700"
                                            }`}>
                                                {completed ? "Completed" : ongoing ? "In Progress" :
                                                 phase === "ready" ? "Ready to Start" :
                                                 phase === "called" ? "Lobby Open" :
                                                 hasBoth ? "Pending" : "Awaiting Players"}
                                            </span>
                                        </div>
                                        {match.scheduled_at && !completed && (
                                            <span className="text-[10px] text-zinc-600">
                                                {new Date(match.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Players */}
                                    {([
                                        { player: match.player1, sets: p1Sets },
                                        { player: match.player2, sets: p2Sets },
                                    ] as const).map(({ player: p, sets }, idx) => {
                                        const isWinner = completed && p && match.winner_id === p.id;
                                        const isLoser  = completed && p && match.winner_id !== p.id;
                                        return (
                                            <div
                                                key={idx}
                                                className={`flex items-center gap-3 px-3 py-3 ${
                                                    idx === 0 ? "border-b border-zinc-800/60" : ""
                                                } ${isWinner ? "bg-yellow-400/5" : ""}`}
                                            >
                                                {/* Avatar */}
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                                    isWinner ? "bg-yellow-500/20 text-yellow-300" :
                                                    p        ? "bg-zinc-800 text-zinc-400" :
                                                    "bg-zinc-900 text-zinc-700"
                                                }`}>
                                                    {p ? (p.first_name?.[0] || "?").toUpperCase() : "?"}
                                                </div>

                                                {/* Name */}
                                                <div className="flex-1 min-w-0">
                                                    {p ? (() => {
                                                        const team = idx === 0 ? match.team1 : match.team2;
                                                        const members = team?.filter(Boolean) ?? [];
                                                        const names = members.length > 0
                                                            ? members.map(m => `${m!.first_name || ''} ${m!.last_name || ''}`.trim() || "?").join(" / ")
                                                            : `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id.slice(0, 8);
                                                        return (
                                                            <>
                                                                <div className={`text-sm font-semibold truncate ${
                                                                    isWinner ? "text-white" : isLoser ? "text-zinc-500" : "text-zinc-200"
                                                                }`}>
                                                                    {names}
                                                                    {isWinner && <span className="ml-1.5 text-yellow-400">👑</span>}
                                                                </div>
                                                            </>
                                                        );
                                                    })() : (
                                                        <span className="text-xs text-zinc-700 italic">TBD</span>
                                                    )}
                                                </div>

                                                {/* Set score */}
                                                {match.sets.length > 0 && (
                                                    <span className={`text-base font-black font-mono shrink-0 ${
                                                        isWinner ? "text-white" : isLoser ? "text-zinc-600" : "text-zinc-400"
                                                    }`}>
                                                        {sets}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Set detail row */}
                                    {setDetail && (
                                        <div className="px-3 py-2 border-t border-zinc-800/50 bg-zinc-950/40">
                                            <p className="text-[10px] text-zinc-600 font-mono tracking-wide">{setDetail}</p>
                                        </div>
                                    )}

                                    {/* Referee label */}
                                    {(match.referee_name || (!completed && isOrganizer)) && (
                                        <div className="px-3 py-1.5 border-t border-zinc-800/50 flex items-center gap-1.5">
                                            <svg className="w-3 h-3 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                            </svg>
                                            {match.referee_name ? (
                                                <span className="text-[10px] text-zinc-400 font-semibold truncate">
                                                    {match.referee_name}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-red-400/70 font-semibold">No referee</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Lobby check-in status — visible once the lobby is open */}
                                    {lobbyOpen && !completed && !ongoing && (
                                        <div className="px-3 py-2 border-t border-zinc-800/50 flex items-center gap-2 flex-wrap">
                                            {[
                                                { label: "P1", ready: !!match.team1_ready_at },
                                                { label: "P2", ready: !!match.team2_ready_at },
                                                ...(match.referee_id ? [{ label: "Ref", ready: !!match.referee_ready_at }] : []),
                                            ].map(({ label, ready }) => (
                                                <span
                                                    key={label}
                                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                        ready
                                                            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                                                            : "bg-zinc-800/60 border-zinc-700/50 text-zinc-500"
                                                    }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ready ? "bg-emerald-400" : "bg-zinc-600 animate-pulse"}`} />
                                                    {label}
                                                </span>
                                            ))}
                                            <span className="ml-auto text-[10px] text-zinc-600 font-semibold">
                                                {[!!match.team1_ready_at, !!match.team2_ready_at, ...(match.referee_id ? [!!match.referee_ready_at] : [])].filter(Boolean).length}
                                                /{match.referee_id ? 3 : 2} in lobby
                                            </span>
                                        </div>
                                    )}

                                    {/* Enter score CTA */}
                                    {canScore && (
                                        <div className="px-3 py-2 bg-blue-500/8 border-t border-blue-500/15 flex items-center justify-center gap-2">
                                            <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                            </svg>
                                            <span className="text-[11px] text-blue-400 font-bold">Enter Score</span>
                                        </div>
                                    )}
                                    {isOrganizer && (
                                        <div className="px-3 py-3 border-t border-zinc-800/50 bg-zinc-950/40 flex flex-wrap gap-2">
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onOpenOps(match);
                                                }}
                                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-zinc-300 hover:bg-white/10"
                                            >
                                                Manage Ops
                                            </button>
                                            {hasBoth && !completed && !ongoing && (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onQuickAction(match, "call");
                                                    }}
                                                    className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-300 hover:bg-amber-500/15"
                                                >
                                                    Call Lobby
                                                </button>
                                            )}
                                            {lobbyOpen && !!match.referee_id && !match.referee_ready_at && (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onQuickAction(match, "notify-referee");
                                                    }}
                                                    className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-300 hover:bg-violet-500/15"
                                                >
                                                    Notify Ref
                                                </button>
                                            )}
                                            {hasBoth && !completed && (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onQuickAction(match, "start");
                                                    }}
                                                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-300 hover:bg-emerald-500/15"
                                                >
                                                    Start Match
                                                </button>
                                            )}
                                            {canScore && (
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        onScoreClick(match);
                                                    }}
                                                    className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-300 hover:bg-blue-500/15"
                                                >
                                                    Enter Score
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Live Matches view ──────────────────────────────────────────────────────────

function teamLabel(team: PlayerMini[] | null | undefined, fallback: PlayerMini): React.ReactNode {
    if (team && team.length > 0 && team.some(p => p !== null)) {
        const names = team.filter(Boolean).map(p => `${p!.first_name || ''} ${p!.last_name || ''}`.trim() || "?");
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

function formatMatchDateTime(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
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

const STATUS_ORDER_LIVE = ["ongoing", "pending", "assembling", "completed", "cancelled"];
const STATUS_META_LIVE: Record<string, { label: string; dot: string; border: string; bg: string }> = {
    ongoing:    { label: "🔴 Live Now",           dot: "bg-emerald-500 animate-pulse", border: "border-emerald-500/30", bg: "bg-emerald-500/5"  },
    pending:    { label: "⏳ Preparing",           dot: "bg-yellow-500",                border: "border-yellow-500/20",  bg: "bg-yellow-500/5"   },
    assembling: { label: "⏳ Warming Up",          dot: "bg-orange-400",                border: "border-orange-500/20",  bg: "bg-orange-500/5"   },
    completed:  { label: "✅ Recently Completed",  dot: "bg-zinc-500",                  border: "border-zinc-700",       bg: "bg-zinc-900/40"    },
    cancelled:  { label: "❌ Cancelled",            dot: "bg-red-500",                   border: "border-red-500/20",     bg: "bg-red-500/5"      },
};

function LiveMatchCard({ match, isOrganizer, onScoreClick, onOpenOps, isOngoing }: {
    match: BracketMatch; isOrganizer: boolean;
    onScoreClick: (m: BracketMatch) => void;
    onOpenOps: (m: BracketMatch) => void;
    isOngoing: boolean;
}) {
    const ongoing   = match.status === "ongoing";
    const completed = match.status === "completed";
    const hasBoth   = !!match.player1 && !!match.player2;
    const canScore  = isOngoing && hasBoth && !completed;
    const meta      = STATUS_META_LIVE[match.status] ?? STATUS_META_LIVE.pending;
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
        <div
            className={`border rounded-2xl overflow-hidden transition-all ${meta.border} ${meta.bg} ${canScore ? "cursor-pointer hover:scale-[1.01] active:scale-[0.99]" : ""}`}
            onClick={() => canScore && onScoreClick(match)}
        >
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                        {match.round_number != null ? `Round ${match.round_number}` : "Match"}
                        {match.bracket_position != null ? ` · #${match.bracket_position}` : ""}
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

            {/* Scoreboard / players */}
            {match.is_doubles && match.team1 && match.team2 ? (() => {
                const isLobbyActive = !!(match.team1_ready_at || match.team2_ready_at || match.referee_ready_at);
                const t1p1 = match.team1[0]; const t1p2 = match.team1[1];
                const t2p1 = match.team2[0]; const t2p2 = match.team2[1];
                const side1Win = completed && match.winner_id === match.player1?.id;
                const side2Win = completed && match.winner_id === match.player2?.id;

                function DoublesPlayerRow({ player, inLobby, winner }: { player: PlayerMini; inLobby: boolean; winner: boolean }) {
                    if (!player) return (
                        <div className="flex items-center gap-2 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" />
                            <span className="text-xs text-zinc-600 italic">TBD</span>
                        </div>
                    );
                    const initials = (player.first_name?.[0] || "?").toUpperCase();
                    const name = `${player.first_name || ''} ${player.last_name || ''}`.trim() || player.id.slice(0, 8);
                    return (
                        <div className="flex items-center gap-2 py-1">
                            {isLobbyActive
                                ? <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inLobby ? "bg-emerald-500" : "bg-zinc-700"}`} title={inLobby ? "In lobby" : "Not checked in"} />
                                : <span className="w-1.5 h-1.5 rounded-full bg-zinc-800 shrink-0" />
                            }
                            <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">{initials}</div>
                            <span className={`text-sm font-semibold truncate flex-1 ${winner ? "text-white" : "text-zinc-300"}`}>{name}</span>
                            {winner && <span className="text-yellow-400 text-xs shrink-0">👑</span>}
                        </div>
                    );
                }

                return (
                    <div className="px-4 py-2 space-y-1">
                        {/* Set score row */}
                        {match.sets.length > 0 && (
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Score</span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xl font-black tabular-nums ${p1Sets > p2Sets ? "text-white" : "text-zinc-500"}`}>{p1Sets}</span>
                                    <span className="text-zinc-600 font-bold text-sm">–</span>
                                    <span className={`text-xl font-black tabular-nums ${p2Sets > p1Sets ? "text-white" : "text-zinc-500"}`}>{p2Sets}</span>
                                </div>
                            </div>
                        )}
                        {/* Team 1 */}
                        <div className={`rounded-xl px-3 py-2 ${side1Win ? "bg-white/5 border border-white/10" : "bg-black/20 border border-white/5"}`}>
                            <div className="text-[9px] font-black tracking-widest text-zinc-600 uppercase mb-1">Team 1{side1Win ? " · Winner" : ""}</div>
                            <DoublesPlayerRow player={t1p1!} inLobby={!!match.team1_ready_at} winner={side1Win} />
                            <DoublesPlayerRow player={t1p2!} inLobby={!!match.team1_ready_at} winner={side1Win} />
                        </div>
                        <div className="text-center text-[10px] font-black text-zinc-700 py-0.5">VS</div>
                        {/* Team 2 */}
                        <div className={`rounded-xl px-3 py-2 ${side2Win ? "bg-white/5 border border-white/10" : "bg-black/20 border border-white/5"}`}>
                            <div className="text-[9px] font-black tracking-widest text-zinc-600 uppercase mb-1">Team 2{side2Win ? " · Winner" : ""}</div>
                            <DoublesPlayerRow player={t2p1!} inLobby={!!match.team2_ready_at} winner={side2Win} />
                            <DoublesPlayerRow player={t2p2!} inLobby={!!match.team2_ready_at} winner={side2Win} />
                        </div>
                        {/* Referee row */}
                        <div className="flex items-center gap-2 pt-1">
                            {isLobbyActive
                                ? <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${match.referee_ready_at ? "bg-emerald-500" : "bg-zinc-700"}`} title={match.referee_ready_at ? "Ref in lobby" : "Ref not checked in"} />
                                : <span className="w-1.5 h-1.5 rounded-full bg-zinc-800 shrink-0" />
                            }
                            <span className="text-[10px] text-zinc-600 shrink-0">Ref</span>
                            {match.referee_name ? (
                                <span className={`text-xs truncate ${match.referee_ready_at ? "text-zinc-300 font-medium" : "text-zinc-500"}`}>
                                    {match.referee_name}
                                </span>
                            ) : (
                                <span className="text-xs text-red-400/70 italic">No referee assigned</span>
                            )}
                        </div>
                        {ongoing && latestSet && (
                            <div className="mt-1 text-center">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Set {latestSet.set_number}</span>
                                <span className="text-lg font-black text-emerald-400 ml-2">{latestSet.player1_score} – {latestSet.player2_score}</span>
                            </div>
                        )}
                        {completed && setScoreStr && (
                            <p className="text-center text-[10px] font-mono text-zinc-500 pt-1">{setScoreStr}</p>
                        )}
                    </div>
                );
            })() : (
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <p className={`font-black text-base truncate leading-tight ${
                                completed && match.winner_id === match.player1?.id ? "text-white" : "text-zinc-300"
                            }`}>
                                {teamLabel(match.team1, match.player1)}
                                {completed && match.winner_id === match.player1?.id && <span className="ml-1 text-yellow-400">👑</span>}
                            </p>
                        </div>
                        {(ongoing || completed) && match.sets.length > 0 ? (
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-2xl font-black tabular-nums ${p1Sets > p2Sets ? "text-white" : "text-zinc-500"}`}>{p1Sets}</span>
                                <span className="text-zinc-600 font-bold">–</span>
                                <span className={`text-2xl font-black tabular-nums ${p2Sets > p1Sets ? "text-white" : "text-zinc-500"}`}>{p2Sets}</span>
                            </div>
                        ) : (
                            <div className="text-zinc-600 font-black text-sm">vs</div>
                        )}
                        <div className="flex-1 min-w-0 text-right">
                            <p className={`font-black text-base truncate leading-tight ${
                                completed && match.winner_id === match.player2?.id ? "text-white" : "text-zinc-300"
                            }`}>
                                {completed && match.winner_id === match.player2?.id && <span className="mr-1 text-yellow-400">👑</span>}
                                {teamLabel(match.team2, match.player2)}
                            </p>
                        </div>
                    </div>
                    {ongoing && latestSet && (
                        <div className="mt-2 text-center">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Set {latestSet.set_number}</span>
                            <span className="text-lg font-black text-emerald-400 ml-2">{latestSet.player1_score} – {latestSet.player2_score}</span>
                        </div>
                    )}
                    {completed && setScoreStr && (
                        <p className="mt-1.5 text-center text-[10px] font-mono text-zinc-500">{setScoreStr}</p>
                    )}
                </div>
            )}

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
                {!match.is_doubles && match.referee_name && (
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">
                        🟡 {match.referee_name}
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
                {!match.is_doubles && readiness.map(label => (
                    <span key={label} className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full font-semibold">
                        {label}
                    </span>
                ))}
                {isOrganizer && !match.referee_name && !match.is_doubles && (
                    <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                        ⚠️ No referee
                    </span>
                )}
                {canScore && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">
                        ✏️ Click to score
                    </span>
                )}
            </div>
            {(latestAction || match.dispute_reason) && (
                <div className="mx-4 mb-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Latest update</div>
                    <p className={`mt-1 text-sm ${match.dispute_reason ? "text-red-200" : "text-zinc-200"}`}>
                        {match.dispute_reason || latestAction?.description}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                        {match.dispute_reason
                            ? "Official review is required before this result is finalized."
                            : formatMatchDateTime(latestAction?.created_at) || latestAction?.type || ""}
                    </p>
                </div>
            )}
            {isOrganizer && (
                <div className="px-4 pb-4 flex flex-wrap gap-2">
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpenOps(match);
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-zinc-300 hover:bg-white/10"
                    >
                        Manage Ops
                    </button>
                    {canScore && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onScoreClick(match);
                            }}
                            className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-300 hover:bg-blue-500/15"
                        >
                            Enter Score
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function LiveMatchesView({ matches, isOrganizer, onScoreClick, onOpenOps, isOngoing }: {
    matches: BracketMatch[]; isOrganizer: boolean;
    onScoreClick: (m: BracketMatch) => void;
    onOpenOps: (m: BracketMatch) => void;
    isOngoing: boolean;
}) {
    const [filter, setFilter] = useState<string>("all");
    const [, forceRefresh]    = useState(0);

    useEffect(() => {
        const id = setInterval(() => forceRefresh(n => n + 1), 10_000);
        return () => clearInterval(id);
    }, []);

    const relevant = matches;
    const groups: Record<string, BracketMatch[]> = {};
    for (const m of relevant) { (groups[m.status] ??= []).push(m); }

    const filtered = filter === "all" ? relevant : relevant.filter(m => m.status === filter);
    const liveCount      = (groups["ongoing"]    ?? []).length;
    const preparingCount = ((groups["pending"] ?? []).length + (groups["assembling"] ?? []).length);
    const doneCount      = (groups["completed"]  ?? []).length;
    const noRefCount     = relevant.filter(m => !m.referee_name && m.status !== "completed").length;

    const filters = [
        { key: "all",       label: "All",         count: relevant.length },
        { key: "ongoing",   label: "🔴 Live",     count: liveCount },
        { key: "pending",   label: "⏳ Preparing", count: preparingCount },
        { key: "completed", label: "✅ Done",      count: doneCount },
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
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: "Live Now",    value: liveCount,      color: "text-emerald-400" },
                    { label: "Preparing",   value: preparingCount, color: "text-yellow-400"  },
                    { label: "Completed",   value: doneCount,      color: "text-zinc-400"    },
                    { label: "No Referee",  value: noRefCount,     color: noRefCount > 0 ? "text-red-400" : "text-zinc-600" },
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
                    .sort((a, b) => STATUS_ORDER_LIVE.indexOf(a.status) - STATUS_ORDER_LIVE.indexOf(b.status))
                    .map(m => (
                        <LiveMatchCard
                            key={m.match_id}
                            match={m}
                            isOrganizer={isOrganizer}
                            onScoreClick={onScoreClick}
                            onOpenOps={onOpenOps}
                            isOngoing={isOngoing}
                        />
                    ))
                }
            </div>
        </div>
    );
}

function ActionRow({
    label, desc, buttonLabel, icon, variant, danger, busy, confirm, setConfirm, onConfirm,
}: {
    label: string; desc: string; buttonLabel: string;
    icon?: string; variant?: "blue" | "green" | "orange" | "red";
    danger: boolean;
    busy: boolean; confirm: boolean; setConfirm: (v: boolean) => void; onConfirm: () => void;
}) {
    const borderColor =
        variant === "green"  ? "border-l-emerald-500" :
        variant === "orange" ? "border-l-orange-500"  :
        variant === "red"    ? "border-l-red-500"     :
        "border-l-blue-500";

    const isGreen = variant === "green";

    return (
        <div className={`rounded-xl border-l-2 ${borderColor} ${
            isGreen
                ? "bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 border-l-emerald-500"
                : "border border-zinc-800/60"
        } overflow-hidden`}>
            {/* Row header */}
            <div className="flex items-center gap-3 px-4 py-3.5">
                {icon && (
                    <span className="text-xl shrink-0 select-none">{icon}</span>
                )}
                <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${isGreen ? "text-emerald-200" : "text-white"}`}>{label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{desc}</div>
                </div>
                {!confirm && (
                    <button
                        onClick={() => setConfirm(true)}
                        disabled={busy}
                        className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all disabled:opacity-50 shrink-0 ${
                            isGreen
                                ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)] hover:shadow-[0_0_16px_rgba(16,185,129,0.5)]"
                                : variant === "orange"
                                    ? "bg-orange-500/15 border border-orange-500/30 text-orange-300 hover:bg-orange-500/25"
                                : danger
                                    ? "bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20"
                                : "bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700"
                        }`}
                    >
                        {buttonLabel}
                    </button>
                )}
            </div>

            {/* Inline confirm panel */}
            {confirm && (
                <div className={`px-4 pb-4 pt-1 border-t ${
                    danger ? "border-red-500/15 bg-red-500/5" : "border-zinc-800 bg-zinc-800/30"
                }`}>
                    <p className="text-xs text-zinc-400 mb-3">
                        {danger
                            ? `Are you sure you want to "${label}"? This action cannot be undone.`
                            : `Confirm: ${label}?`}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={onConfirm}
                            disabled={busy}
                            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors disabled:opacity-50 ${
                                isGreen
                                    ? "bg-emerald-500 hover:bg-emerald-400 text-white"
                                : danger
                                    ? "bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30"
                                : "bg-white text-black hover:bg-zinc-100"
                            }`}
                        >
                            {busy ? "Working…" : "Confirm"}
                        </button>
                        <button
                            onClick={() => setConfirm(false)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 px-4 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Join Request helper components ────────────────────────────────────────────

interface JoinRegistration {
    registration_id: string; player_id: string; seed: number | null;
    first_name: string | null; last_name: string | null;
    registered_at: string; status: string; source: string;
    partner_id?: string | null; partner_first_name?: string | null; partner_last_name?: string | null;
    assessment?: {
        rating: number; readiness_score: number;
        total_matches: number; win_rate: number; win_streak: number;
        meets_rating_requirement: boolean; flags: string[];
    };
}

function PlayerRow({ reg, label }: { reg: JoinRegistration; label: string }) {
    const a = reg.assessment;
    const score = a?.readiness_score ?? 50;
    const avatarBg =
        score >= 70 ? "from-emerald-700 to-emerald-900" :
        score >= 40 ? "from-yellow-700 to-yellow-900" :
        "from-red-700 to-red-900";
    const scoreColor = a?.meets_rating_requirement ? "text-emerald-400" : "text-red-400";

    return (
        <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarBg} flex items-center justify-center text-sm font-bold shrink-0 text-white`}>
                    {(reg.first_name?.[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white leading-tight">
                            {`${reg.first_name || ''} ${reg.last_name || ''}`.trim() || reg.player_id.slice(0, 8)}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-500">{label}</span>
                    </div>
                </div>
                {a && (
                    <div className={`text-right shrink-0 ${scoreColor}`}>
                        <div className="text-base font-extrabold font-mono leading-none">
                            {a.readiness_score}
                            <span className="text-[10px] text-zinc-600 font-normal">/100</span>
                        </div>
                        <div className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">Readiness</div>
                    </div>
                )}
            </div>
            {a && (
                <div className="grid grid-cols-4 gap-1 mt-2">
                    {[
                        { label: "Rating",   value: String(Math.round(a.rating)) },
                        { label: "Matches",  value: String(a.total_matches) },
                        { label: "Win Rate", value: `${Math.round(a.win_rate * 100)}%` },
                        { label: "Streak",   value: `${a.win_streak}W` },
                    ].map(s => (
                        <div key={s.label} className="bg-zinc-900/60 rounded-lg py-1.5 text-center">
                            <div className="text-xs font-bold text-white font-mono">{s.value}</div>
                            <div className="text-[9px] text-zinc-600 uppercase tracking-wide mt-0.5">{s.label}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SinglePlayerCard({
    reg, busy, isUpcoming, onApprove, onReject,
}: {
    reg: JoinRegistration; busy: boolean; isUpcoming: boolean;
    onApprove: () => void; onReject: () => void;
}) {
    const a = reg.assessment;
    const score = a?.readiness_score ?? 50;
    const borderAccent =
        score >= 70 ? "border-l-emerald-500" :
        score >= 40 ? "border-l-yellow-500" :
        "border-l-red-500";

    return (
        <div className={`bg-zinc-800/50 rounded-xl border border-zinc-700/50 border-l-2 ${borderAccent} overflow-hidden`}>
            <PlayerRow reg={reg} label="Player" />
            {a && a.flags.length > 0 && (
                <div className="flex flex-wrap gap-1 px-4 py-2 border-t border-zinc-700/40">
                    {a.flags.map(f => (
                        <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                            f.includes("below") || f.includes("above") || f.includes("Inactive")
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : "bg-zinc-700/60 text-zinc-400 border-zinc-600/60"
                        }`}>{f}</span>
                    ))}
                </div>
            )}
            {isUpcoming && (
                <div className="grid grid-cols-2 gap-px border-t border-zinc-700/40">
                    <button onClick={onApprove} disabled={busy} className="py-2.5 text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 transition-colors rounded-bl-xl">Approve</button>
                    <button onClick={onReject}  disabled={busy} className="py-2.5 text-xs font-bold bg-red-500/8 hover:bg-red-500/15 text-red-400 disabled:opacity-40 transition-colors rounded-br-xl">Reject</button>
                </div>
            )}
        </div>
    );
}
