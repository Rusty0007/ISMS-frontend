"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";

type PlayerMini = {
    id: string;
    first_name: string | null;
    last_name: string | null;
} | null;

type RecentAction = {
    id: string;
    type: string;
    description: string;
    created_at: string | null;
};

type TournamentMatch = {
    match_id: string;
    status: string;
    tournament_phase?: string | null;
    player1: PlayerMini;
    player2: PlayerMini;
    team1?: PlayerMini[] | null;
    team2?: PlayerMini[] | null;
    scheduled_at?: string | null;
    checkin_deadline_at?: string | null;
    court_id?: string | null;
    court_name?: string | null;
    referee_id?: string | null;
    referee_name?: string | null;
    referee_username?: string | null;
    recent_actions?: RecentAction[];
    dispute_reason?: string | null;
    result_confirmed_at?: string | null;
};

type CourtOption = {
    id: string;
    name: string;
    status?: string | null;
};

type SearchResult = {
    id: string;
    username?: string | null;
    first_name: string | null;
    last_name: string | null;
};

type TournamentRefereeOption = SearchResult & {
    has_referee_role: boolean;
    is_checked_in: boolean;
    checkin_status: string | null;
    is_participant: boolean;
    current_match_load: number;
    total_match_assignments: number;
    is_club_member: boolean;
    club_role: string | null;
};

function toDateTimeLocalValue(iso: string | null | undefined): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function teamLabel(team: PlayerMini[] | null | undefined, fallback: PlayerMini): string {
    if (team && team.length > 0 && team.some(Boolean)) {
        return team.filter(Boolean).map(player => {
            if (player!.first_name && player!.last_name) return `${player!.first_name} ${player!.last_name}`;
            return player!.first_name || player!.id.slice(0, 8);
        }).join(" / ");
    }
    if (!fallback) return "TBD";
    if (fallback.first_name && fallback.last_name) return `${fallback.first_name} ${fallback.last_name}`;
    return fallback.first_name || fallback.id.slice(0, 8);
}

function personName(firstName: string | null, lastName: string | null, fallbackId?: string | null): string {
    const fullName = `${firstName || ""} ${lastName || ""}`.trim();
    return fullName || (fallbackId ? fallbackId.slice(0, 8) : "Unnamed person");
}

function refereeLabel(referee: SearchResult | null): string {
    if (!referee) return "Unassigned";
    return personName(referee.first_name, referee.last_name, referee.id);
}

function personLabel(person: SearchResult): string {
    return personName(person.first_name, person.last_name, person.id);
}

export default function TournamentMatchOpsModal({
    open,
    match,
    tournamentId,
    onClose,
    onSaved,
}: {
    open: boolean;
    match: TournamentMatch | null;
    tournamentId: string;
    clubId: string | null | undefined;
    onClose: () => void;
    onSaved: () => Promise<void> | void;
}) {
    const [courts, setCourts] = useState<CourtOption[]>([]);
    const [scheduledAt, setScheduledAt] = useState("");
    const [checkinDeadlineAt, setCheckinDeadlineAt] = useState("");
    const [courtId, setCourtId] = useState("");
    const [refSearch, setRefSearch] = useState("");
    const [refResults, setRefResults] = useState<SearchResult[]>([]);
    const [tournamentReferees, setTournamentReferees] = useState<TournamentRefereeOption[]>([]);
    const [loadingTournamentReferees, setLoadingTournamentReferees] = useState(false);
    const [showRefDropdown, setShowRefDropdown] = useState(false);
    const [selectedRef, setSelectedRef] = useState<SearchResult | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [disputeReason, setDisputeReason] = useState("");
    const refSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!match || !open) return;
        setScheduledAt(toDateTimeLocalValue(match.scheduled_at));
        setCheckinDeadlineAt(toDateTimeLocalValue(match.checkin_deadline_at));
        setCourtId(match.court_id ?? "");
        setSelectedRef(match.referee_id
            ? {
                id: match.referee_id,
                username: match.referee_username ?? null,
                first_name: match.referee_name ?? null,
                last_name: null,
            }
            : null);
        setRefSearch("");
        setRefResults([]);
        setShowRefDropdown(false);
        setDisputeReason(match.dispute_reason ?? "");
        setMessage("");
        setError("");
    }, [match, open]);

    useEffect(() => {
        if (!open) return;
        const token = getAccessToken();
        if (!token) return;
        // Use the tournament-scoped courts endpoint — works for club, external, and tbd venues.
        fetch(`/api/tournaments/${tournamentId}/courts`, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.ok ? res.json() : { courts: [] })
            .then(data => setCourts(Array.isArray(data.courts) ? data.courts : []))
            .catch(() => setCourts([]));
    }, [open, tournamentId]);

    useEffect(() => {
        if (!open) return;
        const token = getAccessToken();
        if (!token) {
            setTournamentReferees([]);
            return;
        }
        let cancelled = false;
        setLoadingTournamentReferees(true);
        fetch(`/api/tournaments/${tournamentId}/referees`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async res => res.ok ? res.json() : { referees: [] })
            .then(data => {
                if (cancelled) return;
                setTournamentReferees(Array.isArray(data.referees) ? data.referees : []);
            })
            .catch(() => {
                if (cancelled) return;
                setTournamentReferees([]);
            })
            .finally(() => {
                if (cancelled) return;
                setLoadingTournamentReferees(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, tournamentId]);

    useEffect(() => {
        if (!open) return;
        if (refSearchTimer.current) clearTimeout(refSearchTimer.current);
        if (refSearch.trim().length < 2) {
            setRefResults([]);
            return;
        }
        refSearchTimer.current = setTimeout(async () => {
            const token = getAccessToken();
            if (!token) return;
            const res = await fetch(`/api/players/search?q=${encodeURIComponent(refSearch.trim())}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            setRefResults(Array.isArray(data.players) ? data.players : []);
        }, 250);
        return () => {
            if (refSearchTimer.current) clearTimeout(refSearchTimer.current);
        };
    }, [refSearch, open]);

    if (!open || !match) return null;
    const activeMatch = match;
    const refQuery = refSearch.trim().toLowerCase();
    const rosterIds = new Set(tournamentReferees.map(referee => referee.id));
    const matchParticipantIds = new Set(
        [
            activeMatch.player1?.id,
            activeMatch.player2?.id,
            ...(activeMatch.team1 ?? []).map(player => player?.id ?? null),
            ...(activeMatch.team2 ?? []).map(player => player?.id ?? null),
        ].filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    const filteredTournamentReferees = tournamentReferees.filter(referee => {
        if (!refQuery) return true;
        const fullName = `${referee.first_name || ""} ${referee.last_name || ""}`.trim().toLowerCase();
        return (
            (referee.username ?? "").toLowerCase().includes(refQuery)
            || fullName.includes(refQuery)
        );
    });
    const extraSearchResults = refResults.filter(result => !rosterIds.has(result.id));

    function selectReferee(referee: SearchResult) {
        setSelectedRef(referee);
        setRefSearch("");
        setRefResults([]);
        setShowRefDropdown(false);
    }

    async function runAction(path: string, init?: RequestInit) {
        const token = getAccessToken();
        if (!token) return;
        setSaving(true);
        setError("");
        setMessage("");
        try {
            const res = await fetch(`/api/tournaments/${tournamentId}/matches/${activeMatch.match_id}/${path}`, {
                ...init,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    ...(init?.headers ?? {}),
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.detail || "Action failed.");
                return;
            }
            setMessage(data.message || "Saved.");
            await onSaved();
        } catch {
            setError("Network error.");
        } finally {
            setSaving(false);
        }
    }

    function buildOpsPayload() {
        return {
            scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            checkin_deadline_at: checkinDeadlineAt ? new Date(checkinDeadlineAt).toISOString() : null,
            court_id: courtId || null,
            referee_id: selectedRef?.id ?? null,
        };
    }

    const canCall = !["completed", "ongoing", "cancelled", "invalidated"].includes(activeMatch.status);
    const canStart = !["completed", "ongoing", "cancelled", "invalidated"].includes(activeMatch.status);
    const canVerify = activeMatch.status === "completed" && !activeMatch.result_confirmed_at;

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-zinc-950 text-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-white/10">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-black">Tournament Match Ops</p>
                        <h2 className="text-xl font-black text-white mt-1">
                            {teamLabel(activeMatch.team1, activeMatch.player1)} vs {teamLabel(activeMatch.team2, activeMatch.player2)}
                        </h2>
                        <p className="text-xs text-zinc-500 mt-1">
                            Status: <span className="text-zinc-300">{activeMatch.status}</span>
                            {activeMatch.tournament_phase ? <>  |  Phase: <span className="text-zinc-300">{activeMatch.tournament_phase}</span></> : null}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        Close
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-0">
                    <div className="p-6 border-r border-white/10 space-y-6">
                        <section className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="space-y-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Schedule</span>
                                    <input
                                        type="datetime-local"
                                        value={scheduledAt}
                                        onChange={e => setScheduledAt(e.target.value)}
                                        className="w-full rounded-2xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-500/40"
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Check-In Deadline</span>
                                    <input
                                        type="datetime-local"
                                        value={checkinDeadlineAt}
                                        onChange={e => setCheckinDeadlineAt(e.target.value)}
                                        className="w-full rounded-2xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-500/40"
                                    />
                                </label>
                            </div>

                            <label className="space-y-2 block">
                                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Court</span>
                                <select
                                    value={courtId}
                                    onChange={e => setCourtId(e.target.value)}
                                    className="w-full rounded-2xl bg-zinc-900 border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-500/40"
                                >
                                    <option value="">Unassigned</option>
                                    {courts.map(court => (
                                        <option key={court.id} value={court.id}>
                                            {court.name}{court.status ? ` (${court.status})` : ""}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className="space-y-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Referee</span>
                                <div className="rounded-2xl border border-white/10 bg-zinc-900 p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm text-zinc-300">{refereeLabel(selectedRef)}</div>
                                        {selectedRef && (
                                            <button
                                                onClick={() => setSelectedRef(null)}
                                                className="text-xs text-red-400 hover:text-red-300"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        type="text"
                                        value={refSearch}
                                        onChange={e => {
                                            setRefSearch(e.target.value);
                                            setShowRefDropdown(true);
                                        }}
                                        onFocus={() => setShowRefDropdown(true)}
                                        onBlur={() => {
                                            window.setTimeout(() => setShowRefDropdown(false), 150);
                                        }}
                                        placeholder="Select a tournament referee or search all users"
                                        className="w-full rounded-xl bg-zinc-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-500/40"
                                    />
                                    {showRefDropdown && (
                                        <div className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-2 space-y-3">
                                            <div className="space-y-2">
                                                <div className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                                                    Registered Tournament Referees
                                                </div>
                                                {loadingTournamentReferees ? (
                                                    <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-3 text-sm text-zinc-500">
                                                        Loading registered referees...
                                                    </div>
                                                ) : filteredTournamentReferees.length > 0 ? (
                                                    filteredTournamentReferees.map(referee => {
                                                        const isBlockedForMatch = matchParticipantIds.has(referee.id);
                                                        return (
                                                            <button
                                                                key={referee.id}
                                                                type="button"
                                                                disabled={isBlockedForMatch}
                                                                onMouseDown={event => event.preventDefault()}
                                                                onClick={() => {
                                                                    if (!isBlockedForMatch) {
                                                                        selectReferee(referee);
                                                                    }
                                                                }}
                                                                className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                                                                    isBlockedForMatch
                                                                        ? "border-red-500/20 bg-red-500/5 text-zinc-500 cursor-not-allowed"
                                                                        : "border-white/10 bg-zinc-900/70 hover:bg-zinc-800"
                                                                }`}
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="text-sm font-semibold text-white">{personLabel(referee)}</div>
                                                                    {referee.is_checked_in && (
                                                                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                                                                            Checked In
                                                                        </span>
                                                                    )}
                                                                    {referee.current_match_load > 0 && (
                                                                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                                                                            {referee.current_match_load} Active {referee.current_match_load === 1 ? "Match" : "Matches"}
                                                                        </span>
                                                                    )}
                                                                    {isBlockedForMatch && (
                                                                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                                                                            Participant In This Match
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="mt-1 text-xs text-zinc-500">
                                                                    {referee.has_referee_role ? "Official referee" : "Will receive referee role on assignment"}
                                                                    {referee.club_role ? `  |  Club role: ${referee.club_role}` : ""}
                                                                    {referee.total_match_assignments > 0 ? `  |  ${referee.total_match_assignments} total assignments` : ""}
                                                                </div>
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-3 text-sm text-zinc-500">
                                                        {tournamentReferees.length === 0
                                                            ? "No referees are registered for this tournament yet. Search all users below."
                                                            : refQuery
                                                                ? "No registered referees match this search."
                                                                : "No registered referees available yet."}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2 border-t border-white/10 pt-3">
                                                <div className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                                                    Search All Users
                                                </div>
                                                {refSearch.trim().length < 2 ? (
                                                    <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-3 text-sm text-zinc-500">
                                                        Type at least 2 characters to search everyone outside the registered roster.
                                                    </div>
                                                ) : extraSearchResults.length > 0 ? (
                                                    extraSearchResults.map(result => {
                                                        const isBlockedForMatch = matchParticipantIds.has(result.id);
                                                        return (
                                                            <button
                                                                key={result.id}
                                                                type="button"
                                                                disabled={isBlockedForMatch}
                                                                onMouseDown={event => event.preventDefault()}
                                                                onClick={() => {
                                                                    if (!isBlockedForMatch) {
                                                                        selectReferee(result);
                                                                    }
                                                                }}
                                                                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                                                                    isBlockedForMatch
                                                                        ? "border-red-500/20 bg-red-500/5 text-zinc-500 cursor-not-allowed"
                                                                        : "border-white/10 bg-zinc-900/70 hover:bg-zinc-800"
                                                                }`}
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="text-sm text-white">{personLabel(result)}</div>
                                                                    {isBlockedForMatch && (
                                                                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                                                                            Participant In This Match
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-3 text-sm text-zinc-500">
                                                        No additional users found for this search.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-[11px] text-zinc-500">
                                        Registered tournament referees show up first here. Search all users only if you need someone outside the roster.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => runAction("operations", { method: "PATCH", body: JSON.stringify(buildOpsPayload()) })}
                                    disabled={saving}
                                    className="rounded-2xl bg-white text-zinc-950 px-5 py-3 text-sm font-black hover:bg-zinc-100 disabled:opacity-50"
                                >
                                    Save Match Details
                                </button>
                                {canCall && (
                                    <button
                                        onClick={() => runAction("call", { method: "POST" })}
                                        disabled={saving}
                                        className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm font-black text-amber-300 hover:bg-amber-500/15 disabled:opacity-50"
                                    >
                                        Call Players To Lobby
                                    </button>
                                )}
                                {canStart && (
                                    <button
                                        onClick={() => runAction("start", { method: "POST" })}
                                        disabled={saving}
                                        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
                                    >
                                        Start Match
                                    </button>
                                )}
                                {["called", "ready"].includes(activeMatch.tournament_phase ?? "") && (
                                    <Link
                                        href={`/matches/${activeMatch.match_id}/lobby`}
                                        className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-300 hover:bg-cyan-500/15"
                                    >
                                        Open Lobby
                                    </Link>
                                )}
                                <Link
                                    href={`/matches/${activeMatch.match_id}`}
                                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-black text-zinc-300 hover:bg-white/5"
                                >
                                    Open Match Page
                                </Link>
                            </div>
                        </section>

                        {canVerify && (
                            <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-5 space-y-4">
                                <div>
                                    <h3 className="text-sm font-black text-white">Result Verification</h3>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Confirm the official result or flag it for review if something is wrong.
                                    </p>
                                </div>
                                <textarea
                                    value={disputeReason}
                                    onChange={e => setDisputeReason(e.target.value)}
                                    rows={3}
                                    placeholder="Only needed when flagging a dispute or review."
                                    className="w-full rounded-2xl bg-zinc-950 border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-500/40"
                                />
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => runAction("verify-result", { method: "POST", body: JSON.stringify({ action: "confirm" }) })}
                                        disabled={saving}
                                        className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                                    >
                                        Confirm Result
                                    </button>
                                    <button
                                        onClick={() => runAction("verify-result", {
                                            method: "POST",
                                            body: JSON.stringify({ action: "dispute", reason: disputeReason }),
                                        })}
                                        disabled={saving || !disputeReason.trim()}
                                        className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                                    >
                                        Flag For Review
                                    </button>
                                </div>
                            </section>
                        )}

                        {(message || error) && (
                            <div className={`rounded-2xl border px-4 py-3 text-sm ${
                                error
                                    ? "border-red-500/30 bg-red-500/10 text-red-300"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            }`}>
                                {error || message}
                            </div>
                        )}
                    </div>

                    <aside className="p-6 space-y-4 bg-zinc-900/40">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-black">Current Setup</p>
                            <div className="mt-3 space-y-2 text-sm text-zinc-300">
                                <div>Schedule: {activeMatch.scheduled_at ? new Date(activeMatch.scheduled_at).toLocaleString() : "TBA"}</div>
                                <div>Court: {activeMatch.court_name || "Unassigned"}</div>
                                <div>Referee: {activeMatch.referee_name || (activeMatch.referee_id ? "Assigned referee" : "Unassigned")}</div>
                                <div>Verified: {activeMatch.result_confirmed_at ? "Yes" : "No"}</div>
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-black">Recent Actions</p>
                            <div className="mt-3 space-y-3">
                                {(activeMatch.recent_actions && activeMatch.recent_actions.length > 0) ? activeMatch.recent_actions.map(action => (
                                    <div key={action.id} className="rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-3">
                                        <div className="text-sm text-zinc-200">{action.description}</div>
                                        <div className="text-[11px] text-zinc-500 mt-1">
                                            {action.created_at ? new Date(action.created_at).toLocaleString() : action.type}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-3 text-sm text-zinc-500">
                                        No recent actions yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
