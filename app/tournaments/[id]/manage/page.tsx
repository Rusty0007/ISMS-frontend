"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";

interface Tournament {
    id: string; name: string; sport: string; format: string;
    match_format: string; status: string; registration_open: boolean;
    max_participants: number; participant_count: number;
    starts_at: string | null; ends_at: string | null;
    draw_method: string; smart_tiered_config: Record<string, unknown> | null;
    min_rating: number | null; max_rating: number | null;
    requires_approval: boolean; knockout_best_of: 1 | 3;
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
    members: { player_id: string; username: string; first_name: string | null; last_name: string | null; rating: number }[];
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
    username: string; first_name: string | null; last_name: string | null;
    registered_at: string; status: string; source: string;
    partner_id?: string | null; partner_username?: string | null;
    assessment?: PlayerAssessment;
}

type PlayerMini = { id: string; username: string; first_name: string | null; last_name: string | null } | null;
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
    referee_id: string | null; referee_username: string | null; referee_name: string | null;
}
interface BracketRound   { round: number; label: string; matches: BracketMatch[] }
interface BracketSection { section: string; label: string; rounds: BracketRound[] }

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

    const [tournament,    setTournament]    = useState<Tournament | null>(null);
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
    const [inviteUsername,   setInviteUsername]   = useState("");
    const [inviteBusy,       setInviteBusy]       = useState(false);
    const [inviteMsg,        setInviteMsg]         = useState("");
    const [searchResults,    setSearchResults]    = useState<{ id: string; username: string; first_name: string | null; last_name: string | null }[]>([]);
    const [searchLoading,    setSearchLoading]    = useState(false);
    const [showDropdown,     setShowDropdown]     = useState(false);
    const inviteSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Bracket state
    const [bracketRounds,   setBracketRounds]   = useState<BracketRound[]>([]);
    const [bracketSections, setBracketSections] = useState<BracketSection[]>([]);
    const hasBracket = bracketRounds.length > 0 || bracketSections.length > 0;
    const [bracketTab, setBracketTab] = useState<"bracket" | "live">("bracket");

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

    // Seed editing state
    const [editingSeed,  setEditingSeed]   = useState<string | null>(null); // reg_id
    const [seedValue,    setSeedValue]     = useState("");

    // Confirm dialogs
    const [confirmClose,       setConfirmClose]       = useState(false);
    const [confirmGenerate,    setConfirmGenerate]    = useState(false);
    const [confirmStart,       setConfirmStart]       = useState(false);
    const [confirmEnd,         setConfirmEnd]         = useState(false);
    const [confirmNextRound,   setConfirmNextRound]   = useState(false);
    const [confirmPromote,     setConfirmPromote]     = useState(false);
    const [confirmDelete,      setConfirmDelete]      = useState(false);
    const [busy,               setBusy]               = useState(false);

    const fetchDetail = useCallback(async (token: string) => {
        const res = await fetch(`/api/tournaments/${tourId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (res.ok) {
            const d = await res.json();
            if (!d.is_organizer) { router.replace(`/tournaments/${tourId}`); return; }
            setTournament(d.tournament);
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
        }
    }, [tourId, router]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        fetchDetail(token).finally(() => setLoading(false));
    }, [fetchDetail]);

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
        setInviteUsername(value);
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

    function selectSearchResult(username: string) {
        setInviteUsername(username);
        setSearchResults([]);
        setShowDropdown(false);
    }

    async function sendInvite(e: React.FormEvent) {
        e.preventDefault();
        const username = inviteUsername.trim();
        if (!username) return;
        const token = getAccessToken(); if (!token) return;
        setInviteBusy(true); setInviteMsg("");
        setShowDropdown(false); setSearchResults([]);
        try {
            const res = await fetch(`/api/tournaments/${tourId}/invite`, {
                method:  "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body:    JSON.stringify({ username }),
            });
            const d = await res.json();
            if (!res.ok) { setInviteMsg(d.detail || "Failed to invite."); }
            else         { setInviteMsg(d.message || "Invited!"); setInviteUsername(""); fetchDetail(token); }
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
        if (!confirm(`Remove @${reg.username} from this tournament?`)) return;
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

            <NavBar />

            <div className="relative z-10 max-w-3xl mx-auto px-4 py-8 space-y-6">

                {/* Back */}
                <Link
                    href={`/tournaments/${tourId}`}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors group"
                >
                    <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
                    {tournament.name}
                </Link>

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
                                            {tournament.format.replace(/_/g, " ")}
                                        </span>
                                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10 capitalize">
                                            {tournament.match_format.replace(/_/g, " ")}
                                        </span>
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

                    {/* Generate bracket */}
                    {isUpcoming && !tournament.registration_open && (tournament.format !== "pool_play" || (poolOptions.length > 0 && selectedPoolOpt)) ? (
                        <ActionRow
                            label={tournament.format === "pool_play" ? "Generate Pool Play" : "Generate Bracket"}
                            desc={tournament.format === "pool_play"
                                ? `${selectedPoolOpt!.num_pools} pools (${selectedPoolOpt!.size_summary}) · ${selectedPoolOpt!.pool_matches} matches · Top ${selectedPoolOpt!.qualifiers} → ${selectedPoolOpt!.knockout_stage}`
                                : `Create the ${tournament.format.replace(/_/g, " ")} bracket from ${tournament.participant_count} players`}
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
                                                        {m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : m.username}
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
                        <form onSubmit={sendInvite} className="flex gap-2">
                            <div className="relative flex-1 z-50">
                                {/* Search icon */}
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search by username…"
                                    value={inviteUsername}
                                    onChange={e => handleInviteInput(e.target.value)}
                                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                                    onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                                    autoComplete="off"
                                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-all"
                                />
                                {/* Dropdown */}
                                {showDropdown && searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-zinc-700/50">
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
                                                onMouseDown={() => selectSearchResult(p.username)}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-700/70 transition-colors text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-xs font-bold shrink-0 text-white">
                                                    {(p.first_name?.[0] || p.username[0]).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-white truncate">
                                                        {p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username}
                                                    </div>
                                                    <div className="text-xs text-zinc-500">@{p.username}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {showDropdown && !searchLoading && searchResults.length === 0 && inviteUsername.trim().length >= 2 && (
                                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 px-4 py-3 text-xs text-zinc-500">
                                        No users found for &quot;{inviteUsername}&quot;
                                    </div>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={inviteBusy || !inviteUsername.trim()}
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
                    const pending = registrations.filter(r => r.status === "pending_approval");
                    if (!pending.length) return null;
                    return (
                        <div className="bg-zinc-900/80 backdrop-blur-sm border border-yellow-500/20 ring-1 ring-white/5 rounded-2xl p-5">
                            <div className="flex items-center gap-3 mb-4 border-l-2 border-yellow-500 pl-3">
                                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Join Requests</h2>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
                                    {pending.length}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {pending.map(reg => {
                                    const a = reg.assessment;
                                    const score = a?.readiness_score ?? 50;
                                    const borderAccent =
                                        score >= 70 ? "border-l-emerald-500" :
                                        score >= 40 ? "border-l-yellow-500" :
                                        "border-l-red-500";
                                    const avatarBg =
                                        score >= 70 ? "from-emerald-700 to-emerald-900" :
                                        score >= 40 ? "from-yellow-700 to-yellow-900" :
                                        "from-red-700 to-red-900";
                                    return (
                                        <div key={reg.registration_id} className={`bg-zinc-800/50 rounded-xl border border-zinc-700/50 border-l-2 ${borderAccent} overflow-hidden`}>
                                            {/* Player header */}
                                            <div className="flex items-center gap-3 p-3 pb-2">
                                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarBg} flex items-center justify-center text-sm font-bold shrink-0 text-white`}>
                                                    {(reg.first_name?.[0] || reg.username?.[0] || "?").toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-semibold text-white">
                                                        {reg.first_name && reg.last_name ? `${reg.first_name} ${reg.last_name}` : reg.username}
                                                    </div>
                                                    <div className="text-xs text-zinc-500">@{reg.username}</div>
                                                </div>
                                                {a && (
                                                    <div className={`text-right shrink-0 ${a.meets_rating_requirement ? "text-emerald-400" : "text-red-400"}`}>
                                                        <div className="text-lg font-extrabold font-mono leading-none">
                                                            {a.readiness_score}
                                                            <span className="text-[10px] text-zinc-600 font-normal">/100</span>
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Readiness</div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Assessment stats */}
                                            {a && (
                                                <div className="grid grid-cols-4 gap-px bg-zinc-700/30 border-t border-zinc-700/40">
                                                    {[
                                                        { label: "Rating",   value: String(Math.round(a.rating)) },
                                                        { label: "Matches",  value: String(a.total_matches) },
                                                        { label: "Win Rate", value: `${Math.round(a.win_rate * 100)}%` },
                                                        { label: "Streak",   value: `${a.win_streak}W` },
                                                    ].map(s => (
                                                        <div key={s.label} className="bg-zinc-800/80 py-2 text-center">
                                                            <div className="text-xs font-bold text-white font-mono">{s.value}</div>
                                                            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mt-0.5">{s.label}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Flags */}
                                            {a && a.flags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 px-3 py-2 border-t border-zinc-700/40">
                                                    {a.flags.map(f => (
                                                        <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                                            f.includes("below") || f.includes("above") || f.includes("Inactive")
                                                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                                : "bg-zinc-700/60 text-zinc-400 border-zinc-600/60"
                                                        }`}>{f}</span>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Approve / Reject — full-width split */}
                                            {isUpcoming && (
                                                <div className="grid grid-cols-2 gap-px border-t border-zinc-700/40">
                                                    <button
                                                        onClick={() => approveRequest(reg)}
                                                        disabled={busy}
                                                        className="py-2.5 text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 transition-colors rounded-bl-xl"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => rejectRequest(reg)}
                                                        disabled={busy}
                                                        className="py-2.5 text-xs font-bold bg-red-500/8 hover:bg-red-500/15 text-red-400 disabled:opacity-40 transition-colors rounded-br-xl"
                                                    >
                                                        Reject
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
                            {confirmedCount > 0 && (isUpcoming || isRegClosed) && (
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

                    {registrations.filter(r => r.status === "confirmed").length === 0 ? (
                        <p className="text-sm text-zinc-500 py-8 text-center">No confirmed participants yet.</p>
                    ) : (
                        <div>
                            {registrations.filter(r => r.status === "confirmed").map((reg, i) => (
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
                                        {(reg.first_name?.[0] || reg.username?.[0] || "?").toUpperCase()}
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-sm font-medium text-white">
                                                {reg.first_name && reg.last_name
                                                    ? `${reg.first_name} ${reg.last_name}`
                                                    : reg.username}
                                            </span>
                                            {reg.source === "organizer_invited" && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Via invite</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-zinc-600">@{reg.username}</div>
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
                    )}
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
                                        {(reg.first_name?.[0] || reg.username?.[0] || "?").toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-sm font-medium text-white">
                                                {reg.first_name && reg.last_name ? `${reg.first_name} ${reg.last_name}` : reg.username}
                                            </span>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/20">
                                                Waiting for partner
                                            </span>
                                        </div>
                                        <div className="text-xs text-zinc-600">
                                            @{reg.username}
                                            {reg.partner_username && (
                                                <> · invited <span className="text-zinc-500">@{reg.partner_username}</span></>
                                            )}
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
                                        {(reg.first_name?.[0] || reg.username?.[0] || "?").toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-sm font-medium text-white">
                                                {reg.first_name && reg.last_name ? `${reg.first_name} ${reg.last_name}` : reg.username}
                                            </span>
                                            {reg.status === "invited" && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">Pending</span>
                                            )}
                                            {reg.status === "declined" && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Declined</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-zinc-600">@{reg.username}</div>
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
                                    isOngoing={isOngoing}
                                />
                            ) : (
                                <LiveMatchesView matches={allMatches} isOrganizer={true} onScoreClick={openScoreModal} isOngoing={isOngoing} />
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
                                        {(scoreModal.player1?.first_name?.[0] || scoreModal.player1?.username?.[0] || "?").toUpperCase()}
                                    </div>
                                    <p className="text-sm font-bold text-white text-center leading-tight">
                                        {scoreModal.is_doubles && scoreModal.team1?.some(Boolean)
                                            ? scoreModal.team1!.filter(Boolean).map(p => p!.first_name || p!.username).join(" / ")
                                            : (scoreModal.player1?.first_name || scoreModal.player1?.username || "P1")}
                                    </p>
                                    <span className="text-[10px] text-zinc-600">
                                        {scoreModal.is_doubles && scoreModal.team1?.some(Boolean)
                                            ? scoreModal.team1!.filter(Boolean).map(p => `@${p!.username}`).join(" / ")
                                            : `@${scoreModal.player1?.username}`}
                                    </span>
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
                                        {(scoreModal.player2?.first_name?.[0] || scoreModal.player2?.username?.[0] || "?").toUpperCase()}
                                    </div>
                                    <p className="text-sm font-bold text-white text-center leading-tight">
                                        {scoreModal.is_doubles && scoreModal.team2?.some(Boolean)
                                            ? scoreModal.team2!.filter(Boolean).map(p => p!.first_name || p!.username).join(" / ")
                                            : (scoreModal.player2?.first_name || scoreModal.player2?.username || "P2")}
                                    </p>
                                    <span className="text-[10px] text-zinc-600">
                                        {scoreModal.is_doubles && scoreModal.team2?.some(Boolean)
                                            ? scoreModal.team2!.filter(Boolean).map(p => `@${p!.username}`).join(" / ")
                                            : `@${scoreModal.player2?.username}`}
                                    </span>
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
                                            {scoreModal.player1?.first_name || scoreModal.player1?.username || "P1"}
                                        </span>
                                        <span className="text-[10px] text-zinc-700 w-4 text-center">—</span>
                                        <span className="text-[10px] text-purple-400/70 w-16 text-center">
                                            {scoreModal.player2?.first_name || scoreModal.player2?.username || "P2"}
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
                                            ? (scoreModal.player1?.first_name || scoreModal.player1?.username)
                                            : (scoreModal?.player2?.first_name || scoreModal?.player2?.username);
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
                                                    {(p.first_name?.[0] || p.username[0]).toUpperCase()}
                                                </div>
                                                <span className={`text-sm font-bold truncate max-w-full text-center ${selected ? "text-white" : "text-zinc-400"}`}>
                                                    {scoreModal.is_doubles
                                                        ? (color === "blue" ? scoreModal.team1 : scoreModal.team2)
                                                            ?.filter(Boolean).map(m => m!.first_name || m!.username).join(" / ")
                                                            || p.first_name || p.username
                                                        : p.first_name || p.username}
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
        </div>
    );
}

function OrganizerBracketView({
    rounds, onScoreClick, isOngoing,
}: {
    rounds: BracketRound[];
    onScoreClick: (m: BracketMatch) => void;
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
                            const pending    = match.status === "pending";
                            const hasBoth    = !!match.player1 && !!match.player2;
                            const canScore   = isOngoing && hasBoth && !completed;

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
                                        completed ? "bg-zinc-800/30 border-zinc-800/50" :
                                        ongoing   ? "bg-emerald-500/5 border-emerald-500/20" :
                                        canScore  ? "bg-blue-500/5 border-blue-500/15" :
                                        "bg-zinc-900 border-zinc-800/50"
                                    }`}>
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                completed ? "bg-zinc-600" :
                                                ongoing   ? "bg-emerald-400 animate-pulse" :
                                                canScore  ? "bg-blue-400 animate-pulse" :
                                                "bg-zinc-700"
                                            }`} />
                                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                                                completed ? "text-zinc-600" :
                                                ongoing   ? "text-emerald-400" :
                                                canScore  ? "text-blue-400" :
                                                "text-zinc-700"
                                            }`}>
                                                {completed ? "Completed" : ongoing ? "In Progress" : hasBoth ? "Pending" : "Awaiting Players"}
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
                                                    {p ? (p.first_name?.[0] || p.username[0]).toUpperCase() : "?"}
                                                </div>

                                                {/* Name + username */}
                                                <div className="flex-1 min-w-0">
                                                    {p ? (() => {
                                                        const team = idx === 0 ? match.team1 : match.team2;
                                                        const members = team?.filter(Boolean) ?? [];
                                                        const names = members.length > 0
                                                            ? members.map(m => m!.first_name || m!.username).join(" / ")
                                                            : (p.first_name || p.username);
                                                        const usernames = members.length > 1
                                                            ? members.map(m => `@${m!.username}`).join(" / ")
                                                            : `@${p.username}`;
                                                        return (
                                                            <>
                                                                <div className={`text-sm font-semibold truncate ${
                                                                    isWinner ? "text-white" : isLoser ? "text-zinc-500" : "text-zinc-200"
                                                                }`}>
                                                                    {names}
                                                                    {isWinner && <span className="ml-1.5 text-yellow-400">👑</span>}
                                                                </div>
                                                                <div className="text-[10px] text-zinc-600 truncate">{usernames}</div>
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

                                    {/* Enter score CTA */}
                                    {canScore && (
                                        <div className="px-3 py-2 bg-blue-500/8 border-t border-blue-500/15 flex items-center justify-center gap-2">
                                            <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                            </svg>
                                            <span className="text-[11px] text-blue-400 font-bold">Enter Score</span>
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
        const names = team.filter(Boolean).map(p => p!.first_name || p!.username);
        return <span className="truncate">{names.join(" / ")}</span>;
    }
    if (!fallback) return <span className="text-zinc-600 italic text-xs">TBD</span>;
    return <span className="truncate">{fallback.first_name || fallback.username}</span>;
}

const STATUS_ORDER_LIVE = ["ongoing", "pending", "assembling", "completed", "cancelled"];
const STATUS_META_LIVE: Record<string, { label: string; dot: string; border: string; bg: string }> = {
    ongoing:    { label: "🔴 Live Now",           dot: "bg-emerald-500 animate-pulse", border: "border-emerald-500/30", bg: "bg-emerald-500/5"  },
    pending:    { label: "⏳ Preparing",           dot: "bg-yellow-500",                border: "border-yellow-500/20",  bg: "bg-yellow-500/5"   },
    assembling: { label: "⏳ Warming Up",          dot: "bg-orange-400",                border: "border-orange-500/20",  bg: "bg-orange-500/5"   },
    completed:  { label: "✅ Recently Completed",  dot: "bg-zinc-500",                  border: "border-zinc-700",       bg: "bg-zinc-900/40"    },
    cancelled:  { label: "❌ Cancelled",            dot: "bg-red-500",                   border: "border-red-500/20",     bg: "bg-red-500/5"      },
};

function LiveMatchCard({ match, isOrganizer, onScoreClick, isOngoing }: {
    match: BracketMatch; isOrganizer: boolean;
    onScoreClick: (m: BracketMatch) => void; isOngoing: boolean;
}) {
    const ongoing   = match.status === "ongoing";
    const completed = match.status === "completed";
    const hasBoth   = !!match.player1 && !!match.player2;
    const canScore  = isOngoing && hasBoth && !completed;
    const meta      = STATUS_META_LIVE[match.status] ?? STATUS_META_LIVE.pending;

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
                {canScore && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">
                        ✏️ Click to score
                    </span>
                )}
            </div>
        </div>
    );
}

function LiveMatchesView({ matches, isOrganizer, onScoreClick, isOngoing }: {
    matches: BracketMatch[]; isOrganizer: boolean;
    onScoreClick: (m: BracketMatch) => void; isOngoing: boolean;
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
    const noRefCount     = relevant.filter(m => !m.referee_username && m.status !== "completed").length;

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
                        <LiveMatchCard key={m.match_id} match={m} isOrganizer={isOrganizer} onScoreClick={onScoreClick} isOngoing={isOngoing} />
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
