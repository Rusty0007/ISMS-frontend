"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { clearAuthSession, getAccessToken, setAccessToken, isUnauthorized } from "@/lib/auth";

type ProfileMini = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url?: string | null;
    rating?: number | null;
    rating_status?: string | null;
    skill_level?: string | null;
} | null;

type QueueEntry = {
    id: string;
    status: string;
    skip_count: number;
    queue_position: number | null;
    estimated_wait_minutes: number | null;
    players: ProfileMini[];
};

type Assignment = {
    id: string;
    status: string;
    assigned_at: string | null;
    ack_deadline_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    side1_score: number | null;
    side2_score: number | null;
    court: { id: string | null; name: string | null; status: string | null };
    sides: { side_no: number; players: { user_id: string; profile: ProfileMini; acknowledged_at: string | null }[] }[];
};

type SessionCourt = {
    id: string;
    status: string;
    display_order: number;
    court_role: string;
    consecutive_wins: number;
    max_consecutive_wins: number | null;
    effective_rotation_mode: string;
    court: { id: string; name: string; sport: string | null };
    current_assignment: Assignment | null;
};

type SessionDetail = {
    id: string;
    club_id: string;
    club_name: string;
    title: string;
    sport_emoji: string;
    match_format: string;
    session_date: string | null;
    max_players: number;
    confirmed_count: number;
    status: string;
    queue_mode: string;
    rotation_mode: string;
    ack_timeout_seconds: number;
    target_score: number;
    win_by_two: boolean;
    skill_min: number | null;
    skill_max: number | null;
    notes: string | null;
    queue_entries?: QueueEntry[];
    session_courts?: SessionCourt[];
    summary?: {
        ready_queue_entries: number;
        paused_queue_entries: number;
        active_games: number;
        called_games: number;
        available_courts: number;
        estimated_cycle_minutes: number;
        average_wait_minutes: number;
        total_skips: number;
        longest_court_streak: number;
        challenge_courts: number;
    };
    analytics?: {
        games_logged: number;
        fairness_score: number;
        social_mix_score: number;
        play_gap: number;
        wait_gap_minutes: number;
        repeat_teammate_pairs: number;
        repeat_opponent_pairs: number;
    };
};

function profileLabel(profile: ProfileMini): string {
    if (!profile) return "Unknown player";
    return `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown player";
}

function profileSkillText(profile: ProfileMini): string | null {
    if (!profile) return null;
    if (profile.rating == null && !profile.skill_level) return null;
    const ratingLabel = profile.rating != null ? `${Math.round(profile.rating)}` : null;
    if (profile.skill_level && ratingLabel) return `${profile.skill_level} / ${ratingLabel}`;
    return profile.skill_level || ratingLabel;
}

function shortTime(iso: string | null | undefined): string {
    if (!iso) return "TBA";
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? "TBA"
        : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return "TBA";
    if (value === 0) return "Now";
    return `${Number.isInteger(value) ? value : Number(value.toFixed(1))} min`;
}

function formatSkillRange(min: number | null, max: number | null): string {
    if (min == null && max == null) return "All ratings";
    if (min != null && max != null) return `Rating ${min}-${max}`;
    if (min != null) return `Rating ${min}+`;
    return `Up to ${max}`;
}

function titleCaseMode(value: string): string {
    return value.replace(/_/g, " ");
}

function statusTone(status: string): string {
    const tones: Record<string, string> = {
        upcoming: "border-white/10 bg-white/5 text-zinc-300",
        ongoing: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        completed: "border-zinc-700 bg-zinc-900 text-zinc-300",
        cancelled: "border-red-500/30 bg-red-500/10 text-red-300",
        waiting: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
        called: "border-amber-500/20 bg-amber-500/10 text-amber-300",
        playing: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
        holding: "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300",
        paused: "border-orange-500/20 bg-orange-500/10 text-orange-300",
        in_game: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
        idle: "border-white/10 bg-white/5 text-zinc-300",
    };
    return tones[status] ?? "border-white/10 bg-white/5 text-zinc-300";
}

function streamTone(status: "connecting" | "live" | "reconnecting"): string {
    if (status === "live") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    if (status === "reconnecting") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
}

export default function OpenPlayBoardPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const sessionId = params.id;

    const [session, setSession] = useState<SessionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [nowMs, setNowMs] = useState(Date.now());
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
    const [streamStatus, setStreamStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Seed token from query param so new-tab opens work (sessionStorage is per-tab).
    // We do this before any api() call so getAccessToken() finds it immediately.
    useEffect(() => {
        const urlToken = new URLSearchParams(window.location.search).get("token");
        if (urlToken && !getAccessToken()) {
            setAccessToken(urlToken);
            // Clean the token out of the URL bar without reloading
            const clean = window.location.pathname;
            window.history.replaceState(null, "", clean);
        }
    }, []);

    async function api(path: string) {
        const token = getAccessToken();
        if (!token) {
            router.replace("/login");
            return null;
        }
        const res = await fetch(path, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) {
            clearAuthSession();
            router.replace("/login");
            return null;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.detail || "Request failed.");
        }
        return data;
    }

    async function loadSession(showSpinner = false) {
        if (showSpinner) setLoading(true);
        try {
            const data = await api(`/api/open-play/${sessionId}`);
            if (!data) return;
            setSession(data as SessionDetail);
            setLastUpdatedAt(Date.now());
            setError("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load board.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadSession(true);
    }, [sessionId]);

    useEffect(() => {
        const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(tick);
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        handleFullscreenChange();
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        const streamToken = token;

        let es: EventSource | null = null;
        let retryDelay = 2000;
        let retryTimer: number | null = null;
        let fallbackPoll: number | null = null;
        let cancelled = false;

        function connectSSE() {
            if (cancelled) return;
            setStreamStatus(retryDelay > 2000 ? "reconnecting" : "connecting");
            es = new EventSource(`/api/open-play/${sessionId}/stream?token=${encodeURIComponent(streamToken)}`);

            es.onopen = () => {
                retryDelay = 2000;
                setStreamStatus("live");
            };

            es.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as { event?: string };
                    if (message.event === "session_update") {
                        void loadSession();
                    }
                } catch {
                    // Keep the board running even if a frame is malformed.
                }
            };

            es.onerror = () => {
                es?.close();
                if (!cancelled) {
                    setStreamStatus("reconnecting");
                    retryTimer = window.setTimeout(() => {
                        retryDelay = Math.min(retryDelay * 2, 30000);
                        connectSSE();
                    }, retryDelay);
                }
            };
        }

        connectSSE();
        fallbackPoll = window.setInterval(() => {
            void loadSession();
        }, 30000);

        function handleVisibility() {
            if (document.visibilityState === "visible") void loadSession();
        }
        window.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelled = true;
            es?.close();
            if (retryTimer) window.clearTimeout(retryTimer);
            if (fallbackPoll) window.clearInterval(fallbackPoll);
            window.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [sessionId]);

    async function toggleFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch {
            // Ignore fullscreen failures on browsers that block the request.
        }
    }

    const queueEntries = (session?.queue_entries ?? []).filter(entry => entry.status === "waiting");
    const pausedEntries = (session?.queue_entries ?? []).filter(entry => entry.status === "paused");
    const courts = session?.session_courts ?? [];
    const calledCourts = courts.filter(court => court.current_assignment?.status === "called");
    const liveCourts = courts.filter(court => court.current_assignment?.status === "in_game");

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-sm text-zinc-500 animate-pulse">Loading venue board...</div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-sm text-zinc-500">Open Play session not found.</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#0b1020,_#09090b)] text-white">
            <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-5 md:px-6 md:py-6">
                <section className="rounded-[2rem] border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/30 backdrop-blur">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                            <div className="flex items-start gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-emerald-500/20 bg-emerald-500/10 text-4xl">
                                    {session.sport_emoji}
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.32em] text-zinc-500">{session.club_name}</p>
                                    <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">{session.title}</h1>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                        <span className={`rounded-full border px-3 py-1 font-black ${statusTone(session.status)}`}>{session.status}</span>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">{titleCaseMode(session.match_format)}</span>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">{shortTime(session.session_date)} start</span>
                                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">{formatSkillRange(session.skill_min, session.skill_max)}</span>
                                    </div>
                                </div>
                            </div>
                            {session.notes && (
                                <p className="max-w-4xl text-sm leading-6 text-zinc-300">{session.notes}</p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 xl:max-w-md xl:justify-end">
                            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${streamTone(streamStatus)}`}>
                                Stream {streamStatus}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
                                Updated {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "waiting"}
                            </span>
                            <button
                                type="button"
                                onClick={() => void toggleFullscreen()}
                                className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-300 hover:bg-cyan-500/20"
                            >
                                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                            </button>
                            <Link
                                href={`/open-play/${session.id}`}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-200 hover:bg-white/10"
                            >
                                Session view
                            </Link>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-10">
                        <MetricTile label="Players" value={`${session.confirmed_count}/${session.max_players}`} />
                        <MetricTile label="Queue mode" value={titleCaseMode(session.queue_mode)} />
                        <MetricTile label="Rotation" value={titleCaseMode(session.rotation_mode)} />
                        <MetricTile label="Ack window" value={`${session.ack_timeout_seconds}s`} />
                        <MetricTile label="Live courts" value={String(liveCourts.length)} />
                        <MetricTile label="Now calling" value={String(calledCourts.length)} />
                        <MetricTile label="Avg wait" value={formatMinutes(session.summary?.average_wait_minutes)} />
                        <MetricTile label="Cycle est." value={formatMinutes(session.summary?.estimated_cycle_minutes)} />
                        <MetricTile label="Fairness" value={session.analytics ? `${session.analytics.fairness_score.toFixed(1)}%` : "TBA"} />
                        <MetricTile label="Social mix" value={session.analytics ? `${session.analytics.social_mix_score.toFixed(1)}%` : "TBA"} />
                    </div>
                </section>

                {error && (
                    <section className="rounded-3xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                        {error}
                    </section>
                )}

                <div className="grid flex-1 gap-6 xl:grid-cols-[1.6fr_0.95fr]">
                    <section className="rounded-[2rem] border border-white/10 bg-zinc-950/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.32em] text-zinc-500">Courts</p>
                                <p className="mt-2 text-sm text-zinc-400">
                                    {liveCourts.length} live / {calledCourts.length} calling / {session.summary?.available_courts ?? 0} available
                                </p>
                            </div>
                            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
                                Challenge courts {session.summary?.challenge_courts ?? 0}
                            </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                            {courts.map(court => (
                                <BoardCourtCard key={court.id} court={court} nowMs={nowMs} />
                            ))}
                            {courts.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-zinc-500">
                                    No courts are attached to this session yet.
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="grid gap-6">
                        <section className="rounded-[2rem] border border-white/10 bg-zinc-950/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.32em] text-zinc-500">Now calling</p>
                                    <p className="mt-2 text-sm text-zinc-400">Players who need to acknowledge and head to court.</p>
                                </div>
                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">
                                    {calledCourts.length} active
                                </span>
                            </div>

                            <div className="mt-4 flex flex-col gap-3">
                                {calledCourts.map(court => (
                                    <CallingCard key={court.id} court={court} nowMs={nowMs} />
                                ))}
                                {calledCourts.length === 0 && (
                                    <div className="rounded-3xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-zinc-500">
                                        No players are being called right now.
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="rounded-[2rem] border border-white/10 bg-zinc-950/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.32em] text-zinc-500">Queue</p>
                                    <p className="mt-2 text-sm text-zinc-400">Top waiting entries and current estimated waits.</p>
                                </div>
                                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-300">
                                    Ready {session.summary?.ready_queue_entries ?? queueEntries.length}
                                </span>
                            </div>

                            <div className="mt-4 flex flex-col gap-3">
                                {queueEntries.slice(0, 8).map(entry => (
                                    <QueueCard key={entry.id} entry={entry} />
                                ))}
                                {queueEntries.length === 0 && (
                                    <div className="rounded-3xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-zinc-500">
                                        No ready queue entries at the moment.
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <MetricTile label="Paused entries" value={String(session.summary?.paused_queue_entries ?? pausedEntries.length)} compact />
                                <MetricTile label="Total skips" value={String(session.summary?.total_skips ?? 0)} compact />
                                <MetricTile label="Top streak" value={String(session.summary?.longest_court_streak ?? 0)} compact />
                                <MetricTile
                                    label="Scoring rule"
                                    value={session.win_by_two ? `${session.target_score} and win by 2` : `${session.target_score} points`}
                                    compact
                                />
                                <MetricTile label="Repeat teammates" value={String(session.analytics?.repeat_teammate_pairs ?? 0)} compact />
                                <MetricTile label="Repeat opponents" value={String(session.analytics?.repeat_opponent_pairs ?? 0)} compact />
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

function MetricTile({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
    return (
        <div className={`rounded-2xl border border-white/10 bg-black/20 ${compact ? "px-4 py-3" : "px-4 py-4"}`}>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p>
            <p className={`${compact ? "mt-2 text-sm" : "mt-3 text-lg"} font-semibold text-white`}>{value}</p>
        </div>
    );
}

function QueueCard({ entry }: { entry: QueueEntry }) {
    return (
        <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-lg font-bold text-white">
                        {entry.players.filter(Boolean).map(profile => profileLabel(profile)).join(" / ")}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                        {entry.players
                            .filter(Boolean)
                            .map(profile => profileSkillText(profile))
                            .filter(Boolean)
                            .join(" / ") || "Rating details unavailable"}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-black text-cyan-300">#{entry.queue_position ?? "-"}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">{formatMinutes(entry.estimated_wait_minutes)}</p>
                </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(entry.status)}`}>{entry.status}</span>
                <span className="text-xs text-zinc-500">Skips {entry.skip_count}</span>
            </div>
        </div>
    );
}

function CallingCard({ court, nowMs }: { court: SessionCourt; nowMs: number }) {
    const assignment = court.current_assignment;
    if (!assignment) return null;

    const ackTotal = assignment.sides.reduce((count, side) => count + side.players.length, 0);
    const ackedCount = assignment.sides.reduce(
        (count, side) => count + side.players.filter(player => player.acknowledged_at).length,
        0,
    );
    const ackSeconds = assignment.ack_deadline_at
        ? Math.max(0, Math.ceil((new Date(assignment.ack_deadline_at).getTime() - nowMs) / 1000))
        : 0;

    return (
        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-lg font-black text-white">{court.court.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-amber-200/70">Acknowledge and proceed</p>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-black text-amber-300">{ackSeconds}s</p>
                    <p className="mt-1 text-xs text-amber-100/70">{ackedCount}/{ackTotal} acknowledged</p>
                </div>
            </div>
            <div className="mt-4 space-y-2">
                {assignment.sides.map(side => (
                    <div key={side.side_no} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Side {side.side_no}</p>
                        <p className="mt-2 text-sm text-white">{side.players.map(player => profileLabel(player.profile)).join(" / ")}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function BoardCourtCard({ court, nowMs }: { court: SessionCourt; nowMs: number }) {
    const assignment = court.current_assignment;
    const assignmentStatus = assignment?.status ?? "idle";
    const ackSeconds = assignment?.ack_deadline_at
        ? Math.max(0, Math.ceil((new Date(assignment.ack_deadline_at).getTime() - nowMs) / 1000))
        : 0;
    const borderTone =
        court.court_role === "challenge"
            ? "border-fuchsia-500/30 bg-fuchsia-500/5"
            : assignmentStatus === "in_game"
              ? "border-emerald-500/20 bg-emerald-500/5"
              : assignmentStatus === "called"
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-white/10 bg-black/20";

    return (
        <article className={`rounded-[1.75rem] border px-4 py-4 ${borderTone}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xl font-black text-white">{court.court.name}</p>
                    <p className="mt-2 text-xs text-zinc-500">Court #{court.display_order} / streak {court.consecutive_wins}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(court.status)}`}>{court.status}</span>
                    {court.court_role === "challenge" && (
                        <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-fuchsia-300">
                            Challenge
                        </span>
                    )}
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                    {titleCaseMode(court.effective_rotation_mode)}
                </span>
                {court.court_role === "challenge" && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                        Cap {court.max_consecutive_wins ?? 2}
                    </span>
                )}
                {assignment?.status === "called" && (
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">
                        {ackSeconds}s to acknowledge
                    </span>
                )}
            </div>

            {assignment ? (
                <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
                                    {assignment.status === "called" ? "Calling players" : assignment.status === "in_game" ? "In game" : assignment.status}
                                </p>
                                <p className="mt-2 text-xs text-zinc-500">
                                    Assigned {shortTime(assignment.assigned_at)}{assignment.started_at ? ` / Started ${shortTime(assignment.started_at)}` : ""}
                                </p>
                            </div>
                            {assignment.side1_score != null && assignment.side2_score != null && (
                                <div className="text-right">
                                    <p className="text-3xl font-black text-white">
                                        {assignment.side1_score}-{assignment.side2_score}
                                    </p>
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">score</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {assignment.sides.map(side => (
                        <div key={side.side_no} className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Side {side.side_no}</p>
                                    <p className="mt-2 text-base font-semibold text-white">
                                        {side.players.map(player => profileLabel(player.profile)).join(" / ")}
                                    </p>
                                    <p className="mt-2 text-xs text-zinc-500">
                                        {side.players
                                            .map(player => profileSkillText(player.profile))
                                            .filter(Boolean)
                                            .join(" / ") || "Rating details unavailable"}
                                    </p>
                                </div>
                                {assignment.status === "called" && (
                                    <div className="text-right text-xs text-zinc-400">
                                        {side.players.filter(player => player.acknowledged_at).length}/{side.players.length} ready
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
                    Awaiting the next assignment.
                </div>
            )}
        </article>
    );
}
