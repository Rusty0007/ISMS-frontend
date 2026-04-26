"use client";

/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import NavBar from "@/components/NavBar";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

// ── Types ──────────────────────────────────────────────────────────────────

type ProfileMini = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url?: string | null;
    rating?: number | null;
    rating_status?: string | null;
    skill_level?: string | null;
    matches_played?: number | null;
} | null;

type Participant = {
    user_id: string;
    profile: ProfileMini;
    status: string;
    joined_at: string | null;
    queue_status: string | null;
    is_ready: boolean;
    is_available_for_pairing: boolean;
};

type QueueEntry = {
    id: string;
    created_by: string;
    entry_kind: string;
    status: string;
    is_ready: boolean;
    skip_count: number;
    queued_at: string | null;
    last_called_at: string | null;
    last_played_at: string | null;
    holding_court_id: string | null;
    queue_position: number | null;
    estimated_wait_minutes: number | null;
    player_count: number;
    players: ProfileMini[];
    is_my_entry: boolean;
};

type Assignment = {
    id: string;
    session_court_id: string;
    status: string;
    assigned_at: string | null;
    ack_deadline_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    winner_side: number | null;
    side1_score: number | null;
    side2_score: number | null;
    all_acknowledged: boolean;
    court: { id: string | null; name: string | null; status: string | null };
    sides: { side_no: number; players: { user_id: string; profile: ProfileMini; acknowledged_at: string | null; is_me: boolean }[] }[];
};

type CourtConfigDraft = { court_role: string; max_consecutive_wins: string };
type ScoreDraft = { side1: string; side2: string };

type SessionCourt = {
    id: string;
    status: string;
    display_order: number;
    court_role: string;
    consecutive_wins: number;
    max_consecutive_wins: number | null;
    effective_rotation_mode: string;
    is_active: boolean;
    court: { id: string; name: string; sport: string | null };
    current_assignment: Assignment | null;
};

type PlayerInsight = {
    user_id: string;
    profile: ProfileMini;
    queue_status: string | null;
    games_played: number;
    wins: number;
    losses: number;
    current_wait_minutes: number | null;
    skip_count: number;
    unique_teammates: number;
    unique_opponents: number;
};

type SessionDetail = {
    id: string;
    club_id: string;
    club_name: string;
    title: string;
    sport: string;
    sport_emoji: string;
    match_format: string;
    session_date: string | null;
    duration_hours: number;
    max_players: number;
    confirmed_count: number;
    waitlisted_count: number;
    price_per_head: number;
    status: string;
    is_joined: boolean;
    can_manage: boolean;
    court_name: string | null;
    queue_mode: string;
    rotation_mode: string;
    ack_timeout_seconds: number;
    target_score: number;
    win_by_two: boolean;
    auto_assign_enabled: boolean;
    skill_min: number | null;
    skill_max: number | null;
    description: string | null;
    notes: string | null;
    participants?: Participant[];
    queue_entries?: QueueEntry[];
    session_courts?: SessionCourt[];
    assignments?: Assignment[];
    my_queue_entry?: QueueEntry | null;
    my_assignment?: Assignment | null;
    summary?: {
        confirmed_participants: number;
        waitlisted_participants: number;
        ready_queue_entries: number;
        paused_queue_entries: number;
        active_games: number;
        called_games: number;
        completed_games: number;
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
        max_teammate_repeat: number;
        max_opponent_repeat: number;
        player_insights: PlayerInsight[];
    };
};

// ── HUD Helper Components ──────────────────────────────────────────────────

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <svg className={`absolute w-4 h-4 text-white/20 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 0H0V24" strokeLinecap="square" />
        </svg>
    );
}

function StatusBadge({ label, active = true, variant = "cyan" }: { label: string; active?: boolean; variant?: "cyan" | "emerald" | "amber" | "fuchsia" | "rose" | "zinc" }) {
    const variants = {
        cyan:    "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
        emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        amber:   "bg-amber-500/10 border-amber-500/20 text-amber-400",
        fuchsia: "bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400",
        rose:    "bg-rose-500/10 border-rose-500/20 text-rose-400",
        zinc:    "bg-white/5 border-white/10 text-zinc-400",
    };
    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${variants[variant]}`}>
            <span className={`w-1 h-1 rounded-full bg-current ${active ? "animate-pulse shadow-[0_0_8px_currentColor]" : "opacity-40"}`} />
            {label}
        </div>
    );
}

function DataBar({ value, max = 100, color = "bg-cyan-500" }: { value: number; max?: number; color?: string }) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div className="h-1 w-full bg-white/5 overflow-hidden rounded-full">
            <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
        </div>
    );
}

function TacticalStatCard({ label, value, unit, sub, progress, color, icon, alert }: {
    label: string; value: number | string; unit: string; sub: string;
    progress: number; color: "cyan" | "fuchsia" | "emerald" | "amber"; icon: string; alert?: boolean;
}) {
    const colors = {
        cyan:    "text-cyan-400 border-cyan-500/20 bg-cyan-500/10 shadow-cyan-900/20",
        fuchsia: "text-fuchsia-400 border-fuchsia-500/20 bg-fuchsia-500/10 shadow-fuchsia-900/20",
        emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10 shadow-emerald-900/20",
        amber:   "text-amber-400 border-amber-500/20 bg-amber-500/10 shadow-amber-900/20",
    };
    const progressColors = {
        cyan: "bg-cyan-500", fuchsia: "bg-fuchsia-500", emerald: "bg-emerald-500", amber: "bg-amber-500"
    };

    return (
        <div className={`relative overflow-hidden rounded-[1.5rem] border p-4 space-y-3 transition-all hover:-translate-y-1 shadow-2xl ${alert ? "border-amber-500/40 bg-amber-500/10" : "border-white/5 bg-[#0a111a]/80"}`}>
            <div className="flex items-center justify-between">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center border text-[10px] ${colors[color]}`}>{icon}</span>
            </div>
            <div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black italic text-white tracking-tighter">{value}</span>
                    <span className={`text-[8px] font-black uppercase tracking-widest ${colors[color].split(' ')[0]}`}>{unit}</span>
                </div>
                <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{sub}</p>
            </div>
            <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[7px] font-black uppercase tracking-widest text-slate-700">
                    <span>STATUS</span>
                    <span>{Math.round(progress)}%</span>
                </div>
                <DataBar value={progress} max={100} color={progressColors[color]} />
            </div>
        </div>
    );
}

// ── Utils ───────────────────────────────────────────────────────────────────

function profileLabel(profile: ProfileMini): string {
    if (!profile) return "Unknown player";
    const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    return fullName || "Unknown player";
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
    if (min == null && max == null) return "ALL LEVELS";
    if (min != null && max != null) return `RATING ${min}-${max}`;
    if (min != null) return `RATING ${min}+`;
    return `UP TO ${max}`;
}

function statusVariant(status: string): "zinc" | "emerald" | "cyan" | "amber" | "rose" | "fuchsia" {
    const map: Record<string, "zinc" | "emerald" | "cyan" | "amber" | "rose" | "fuchsia"> = {
        upcoming: "zinc",
        ongoing: "emerald",
        completed: "zinc",
        cancelled: "rose",
        confirmed: "emerald",
        joined: "cyan",
        ready: "cyan",
        waitlisted: "amber",
        waiting: "cyan",
        called: "amber",
        playing: "emerald",
        holding: "fuchsia",
        paused: "amber",
        in_game: "emerald",
    };
    return map[status] ?? "zinc";
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function OpenPlaySessionPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const sessionId = params.id;

    const [session, setSession] = useState<SessionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [partnerUserId, setPartnerUserId] = useState("");
    const [nowMs, setNowMs] = useState(Date.now());
    const [scoreDrafts, setScoreDrafts] = useState<Record<string, { side1: string; side2: string }>>({});
    const [courtDrafts, setCourtDrafts] = useState<Record<string, { court_role: string; max_consecutive_wins: string }>>({});

    async function api(path: string, init?: RequestInit) {
        const token = getAccessToken();
        if (!token) {
            router.replace("/login");
            return null;
        }
        const res = await fetch(path, {
            ...init,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(init?.body ? { "Content-Type": "application/json" } : {}),
                ...(init?.headers ?? {}),
            },
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

    async function loadSession() {
        try {
            const data = await api(`/api/open-play/${sessionId}`);
            if (!data) return;
            setSession(data as SessionDetail);
            setError("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load session.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadSession();
    }, [sessionId]);

    useEffect(() => {
        const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(tick);
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
            es = new EventSource(`/api/open-play/${sessionId}/stream?token=${encodeURIComponent(streamToken)}`);

            es.onopen = () => {
                retryDelay = 2000;
            };

            es.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as { event?: string };
                    if (message.event === "session_update") {
                        void loadSession();
                    }
                } catch {
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

    async function runAction(actionKey: string, path: string, init?: RequestInit, shouldRefresh = true) {
        setBusyAction(actionKey);
        setError("");
        try {
            await api(path, init);
            if (shouldRefresh) await loadSession();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Action failed.");
        } finally {
            setBusyAction(null);
        }
    }

    async function submitAssignmentResult(assignment: Assignment) {
        if (!session) return;
        const side1Raw = scoreDrafts[assignment.id]?.side1 ?? (assignment.side1_score != null ? String(assignment.side1_score) : "");
        const side2Raw = scoreDrafts[assignment.id]?.side2 ?? (assignment.side2_score != null ? String(assignment.side2_score) : "");
        const side1Score = Number(side1Raw);
        const side2Score = Number(side2Raw);

        if (!Number.isInteger(side1Score) || side1Score < 0 || !Number.isInteger(side2Score) || side2Score < 0) {
            setError("Enter whole-number scores for both sides.");
            return;
        }

        const actionKey = `complete-${assignment.id}`;
        setBusyAction(actionKey);
        setError("");
        try {
            await api(`/api/open-play/${session.id}/assignments/${assignment.id}/complete`, {
                method: "POST",
                body: JSON.stringify({ side1_score: side1Score, side2_score: side2Score }),
            });
            setScoreDrafts(prev => {
                const next = { ...prev };
                delete next[assignment.id];
                return next;
            });
            await loadSession();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not record the result.");
        } finally {
            setBusyAction(null);
        }
    }

    async function saveCourtConfig(court: SessionCourt) {
        if (!session) return;
        const draft = courtDrafts[court.id] ?? {
            court_role: court.court_role,
            max_consecutive_wins: court.max_consecutive_wins != null ? String(court.max_consecutive_wins) : "2",
        };
        const payload = {
            court_role: draft.court_role,
            max_consecutive_wins:
                draft.court_role === "challenge"
                    ? Math.max(1, Number.parseInt(draft.max_consecutive_wins || "2", 10) || 2)
                    : null,
        };
        const actionKey = `court-${court.id}`;
        setBusyAction(actionKey);
        setError("");
        try {
            await api(`/api/open-play/${session.id}/courts/${court.id}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            await loadSession();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update this court.");
        } finally {
            setBusyAction(null);
        }
    }

    const availablePartners = (session?.participants ?? []).filter(participant => participant.is_available_for_pairing);
    const myAckSeconds = session?.my_assignment?.ack_deadline_at
        ? Math.max(0, Math.ceil((new Date(session.my_assignment.ack_deadline_at).getTime() - nowMs) / 1000))
        : 0;

    if (loading) return (
        <div className="min-h-screen bg-[#050b14] text-white flex items-center justify-center">
            <div className="text-cyan-500/50 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Initializing Tactical Board...</div>
        </div>
    );

    if (!session) return null;

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            <NavBar hideLogo backHref={`/clubs/${session.club_id}?tab=open-play`} backLabel="OPEN PLAY" />

            <main className="relative z-10 max-w-[1400px] mx-auto px-4 py-8 pb-32 pt-24">
                
                {/* ── Hero Header ── */}
                <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl group mb-8">
                    <HUDCorner className="top-4 left-4" />
                    <HUDCorner className="top-4 right-4 rotate-90" />
                    
                    <div className="absolute inset-0 opacity-10 grayscale transition-all group-hover:opacity-20 group-hover:grayscale-0">
                        <Image src="/hero-athlete.jpg.png" alt="Hero" fill className="object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#050b14] via-[#050b14]/90 to-transparent" />
                    </div>

                    <div className="relative p-8 lg:p-12 flex flex-col lg:flex-row items-center justify-between gap-12">
                        <div className="flex flex-col md:flex-row items-center md:items-end gap-8">
                            <div className="relative group/logo">
                                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-50" />
                                <div className="relative w-24 h-24 rounded-2xl border-2 border-white/10 overflow-hidden bg-[#0a111a] shadow-2xl flex items-center justify-center text-4xl">
                                    {session.sport_emoji}
                                </div>
                            </div>

                            <div className="space-y-4 text-center md:text-left">
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                                    <StatusBadge label={session.club_name} variant="zinc" />
                                    <StatusBadge label={session.status} variant={statusVariant(session.status)} />
                                    <StatusBadge label={session.match_format.replace(/_/g, ' ')} variant="fuchsia" />
                                </div>
                                
                                <div>
                                    <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-white uppercase italic">
                                        {session.title}
                                    </h1>
                                    <p className="text-base text-slate-400 font-light mt-1 max-w-xl">
                                        Deploy to <span className="text-white italic font-medium">{session.rotation_mode.replace(/_/g, ' ')}</span> operations. {formatSkillRange(session.skill_min, session.skill_max)} authorized.
                                    </p>
                                </div>

                                <div className="flex items-center justify-center md:justify-start gap-6 pt-2">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Enlisted</span>
                                        <span className="text-lg font-black text-white italic">{session.confirmed_count}/{session.max_players}</span>
                                    </div>
                                    <div className="w-px h-8 bg-white/10" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Start Time</span>
                                        <span className="text-lg font-black text-white italic">{shortTime(session.session_date)}</span>
                                    </div>
                                    <div className="w-px h-8 bg-white/10" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Deployment Fee</span>
                                        <span className="text-lg font-black text-cyan-400 italic">₱{Math.round(session.price_per_head)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-center lg:items-end gap-4">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        const tok = getAccessToken();
                                        const url = `/open-play/${session.id}/board${tok ? `?token=${encodeURIComponent(tok)}` : ""}`;
                                        window.open(url, "_blank", "noreferrer");
                                    }}
                                    className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-white/20 transition-all"
                                >
                                    Strategic Board
                                </button>
                                {!session.is_joined && (
                                    <button
                                        onClick={() => void runAction("join-session", `/api/open-play/${session.id}/join`, { method: "POST" })}
                                        disabled={busyAction !== null}
                                        className="px-8 py-3 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                                    >
                                        Enlist Now
                                    </button>
                                )}
                                {session.can_manage && session.status === "upcoming" && (
                                    <button
                                        onClick={() => void runAction("start-session", `/api/open-play/${session.id}/start`, { method: "POST" })}
                                        disabled={busyAction !== null}
                                        className="px-8 py-3 rounded-xl bg-emerald-500 text-black text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-emerald-900/20 disabled:opacity-50"
                                    >
                                        Initiate Ops
                                    </button>
                                )}
                            </div>
                            {session.can_manage && session.status === "ongoing" && (
                                <button
                                    onClick={() => {
                                        if (window.confirm("Terminate this deployment?")) {
                                            void runAction("finish-session", `/api/open-play/${session.id}/finish`, { method: "POST" });
                                        }
                                    }}
                                    disabled={busyAction !== null}
                                    className="px-6 py-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                                >
                                    Decommission Session
                                </button>
                            )}
                        </div>
                    </div>
                </section>

                {error && (
                    <div className="mb-8 p-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-black uppercase tracking-widest flex items-center gap-3">
                        <span className="text-xl">⚠️</span> {error}
                    </div>
                )}

                {/* ── Status Bar ── */}
                {session.my_assignment?.status === "called" && (
                    <section className="mb-8 p-6 rounded-[2rem] border border-amber-500/40 bg-amber-500/10 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-6 animate-pulse">
                        <div className="flex items-center gap-4">
                            <span className="text-3xl">📡</span>
                            <div>
                                <h3 className="text-lg font-black uppercase italic text-amber-400 tracking-tight">Active Deployment Awaiting Acknowledgement</h3>
                                <p className="text-xs font-bold text-amber-300/60 uppercase tracking-widest">Acknowledge court assignment within {myAckSeconds}s</p>
                            </div>
                        </div>
                        <button
                            onClick={() => void runAction("ack", `/api/open-play/${session.id}/assignments/${session.my_assignment?.id}/ack`, { method: "POST" })}
                            disabled={busyAction !== null}
                            className="px-10 py-4 rounded-xl bg-amber-400 text-black text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-all shadow-xl shadow-amber-900/30"
                        >
                            Authorize Entry
                        </button>
                    </section>
                )}

                {/* ── Dashboard Content ── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* Left: Tactical Intel (Stats & Queue) */}
                    <div className="lg:col-span-8 space-y-10">
                        
                        {/* Tactical Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <TacticalStatCard 
                                label="Logistics Flow" value={formatMinutes(session.summary?.average_wait_minutes)} unit="WAIT"
                                sub="AVERAGE WAIT TIME"
                                progress={session.summary?.average_wait_minutes ? Math.min(100, (session.summary.average_wait_minutes / 20) * 100) : 0}
                                color="cyan" icon="⏳"
                            />
                            <TacticalStatCard 
                                label="Field Saturation" value={session.summary?.active_games || 0} unit="LIVE"
                                sub="ACTIVE SECTORS"
                                progress={((session.summary?.active_games || 0) / (session.session_courts?.length || 1)) * 100}
                                color="emerald" icon="🎮"
                            />
                            <TacticalStatCard 
                                label="Deployment Cycle" value={formatMinutes(session.summary?.estimated_cycle_minutes)} unit="CYCLE"
                                sub="ESTIMATED ROTATION"
                                progress={50}
                                color="fuchsia" icon="🔄"
                            />
                            <TacticalStatCard 
                                label="Strategic Fairness" value={session.analytics?.fairness_score ? `${session.analytics.fairness_score.toFixed(0)}%` : "0%"} unit="ELO"
                                sub="MATCH INTEGRITY SCORE"
                                progress={session.analytics?.fairness_score || 0}
                                color="amber" icon="⚖️"
                            />
                        </div>

                        {/* Live Queue Boards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            
                            {/* QUEUE CONTROLS / MY STATUS */}
                            <section className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Personnel Status</p>
                                        <h2 className="text-2xl font-black uppercase italic tracking-tight">Your Deployment</h2>
                                    </div>
                                </div>

                                <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] p-6 space-y-6 relative overflow-hidden">
                                    <HUDCorner className="top-4 left-4" />
                                    
                                    {session.is_joined && !session.my_queue_entry && !session.my_assignment ? (
                                        <div className="space-y-5">
                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center">
                                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Status: Standby</p>
                                                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Enlisted for current operation</p>
                                            </div>

                                            {session.match_format !== "singles" && (
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Tactical Partner (Optional)</label>
                                                    <select
                                                        value={partnerUserId}
                                                        onChange={e => setPartnerUserId(e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white outline-none focus:border-cyan-500/40"
                                                    >
                                                        <option value="">DEploy Solo</option>
                                                        {availablePartners.map(p => (
                                                            <option key={p.user_id} value={p.user_id}>{profileLabel(p.profile)}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <button
                                                onClick={() => void runAction(
                                                    "queue-join",
                                                    `/api/open-play/${session.id}/queue/join`,
                                                    { method: "POST", body: JSON.stringify({ partner_user_id: partnerUserId || null, ready: true }) },
                                                )}
                                                disabled={busyAction !== null || session.status !== "ongoing"}
                                                className="w-full py-4 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all shadow-xl disabled:opacity-50"
                                            >
                                                {session.status === "ongoing" ? "Initiate Rotation" : "Standby for Start"}
                                            </button>
                                        </div>
                                    ) : session.my_queue_entry ? (
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-lg font-black text-white uppercase italic">Active in Queue</p>
                                                    <div className="flex items-center gap-2">
                                                        <StatusBadge label={session.my_queue_entry.status} variant={statusVariant(session.my_queue_entry.status)} />
                                                        {session.my_queue_entry.queue_position && <StatusBadge label={`Pos #${session.my_queue_entry.queue_position}`} variant="zinc" />}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-2xl font-black text-cyan-400 tabular-nums italic">~{session.my_queue_entry.estimated_wait_minutes || 0}m</p>
                                                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Wait Est.</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                {session.my_queue_entry.status === "paused" ? (
                                                    <button onClick={() => void runAction("queue-ready", `/api/open-play/${session.id}/queue/me`, { method: "POST", body: JSON.stringify({ action: "ready" }) })}
                                                        className="py-3 rounded-xl bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all">Resume</button>
                                                ) : (
                                                    <button onClick={() => void runAction("queue-pause", `/api/open-play/${session.id}/queue/me`, { method: "POST", body: JSON.stringify({ action: "pause" }) })}
                                                        className="py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all">Pause</button>
                                                )}
                                                <button onClick={() => void runAction("queue-leave", `/api/open-play/${session.id}/queue/me`, { method: "POST", body: JSON.stringify({ action: "leave" }) })}
                                                    className="py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all">Withdraw</button>
                                            </div>
                                        </div>
                                    ) : !session.is_joined ? (
                                        <div className="p-8 text-center space-y-4">
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] italic">Access Denied. Enlistment Required.</p>
                                            <button onClick={() => void runAction("join-session", `/api/open-play/${session.id}/join`, { method: "POST" })}
                                                className="px-6 py-2.5 rounded-xl bg-white text-black text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all">Join Operation</button>
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center space-y-4">
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] italic">Currently Deployed on Sector</p>
                                            <StatusBadge label="In Game" variant="emerald" />
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* GLOBAL QUEUE LIST */}
                            <section className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-fuchsia-500">Tactical Sequence</p>
                                        <h2 className="text-2xl font-black uppercase italic tracking-tight">Active Queue</h2>
                                    </div>
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                                        {session.queue_entries?.length || 0} Entries
                                    </span>
                                </div>

                                <div className="space-y-3 overflow-y-auto max-h-[400px] no-scrollbar pr-1">
                                    {(session.queue_entries ?? []).map(entry => (
                                        <div key={entry.id} className={`p-4 rounded-2xl border transition-all ${entry.is_my_entry ? "border-cyan-500/30 bg-cyan-500/5" : "border-white/5 bg-[#0a111a]/60 hover:bg-[#0a111a]"}`}>
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-white uppercase italic truncate">
                                                        {entry.players.filter(Boolean).map(profile => profileLabel(profile)).join(" / ")}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {entry.queue_position && <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">POS #{entry.queue_position}</span>}
                                                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">• SKIPS: {entry.skip_count}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <StatusBadge label={entry.status} variant={statusVariant(entry.status)} />
                                                    <p className="text-[10px] font-black text-slate-500 mt-1 tabular-nums italic">~{entry.estimated_wait_minutes || 0}m</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(session.queue_entries ?? []).length === 0 && (
                                        <div className="p-12 text-center border border-dashed border-white/5 rounded-[2rem]">
                                            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest italic">No Strategic Queue Detected</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        {/* ANALYTICS PREVIEW */}
                        {session.analytics && (
                            <section className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500">Post-Op Analytics</p>
                                        <h2 className="text-2xl font-black uppercase italic tracking-tight">Efficiency & Fairness</h2>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-6 rounded-[2rem] border border-white/5 bg-[#0a111a]/60 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Playtime Distribution</p>
                                            <StatusBadge label="Fariplay" variant="emerald" />
                                        </div>
                                        <div className="space-y-3">
                                            {[...session.analytics.player_insights].sort((a,b) => b.games_played - a.games_played).slice(0, 4).map(pi => (
                                                <div key={pi.user_id} className="flex items-center justify-between gap-4">
                                                    <span className="text-[10px] font-black text-white uppercase italic truncate">{profileLabel(pi.profile)}</span>
                                                    <div className="flex-1 max-w-[120px]">
                                                        <DataBar value={pi.games_played} max={session.analytics?.games_logged || 1} color="bg-emerald-500" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-emerald-500 tabular-nums">{pi.games_played} OPS</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-6 rounded-[2rem] border border-white/5 bg-[#0a111a]/60 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Wait Pressure Map</p>
                                            <StatusBadge label="Logistics" variant="cyan" />
                                        </div>
                                        <div className="space-y-3">
                                            {[...session.analytics.player_insights].sort((a,b) => (b.current_wait_minutes || 0) - (a.current_wait_minutes || 0)).slice(0, 4).map(pi => (
                                                <div key={pi.user_id} className="flex items-center justify-between gap-4">
                                                    <span className="text-[10px] font-black text-white uppercase italic truncate">{profileLabel(pi.profile)}</span>
                                                    <div className="flex-1 max-w-[120px]">
                                                        <DataBar value={pi.current_wait_minutes || 0} max={20} color="bg-cyan-500" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-cyan-500 tabular-nums">{pi.current_wait_minutes || 0}m</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Right: Sector Intel (Courts) */}
                    <div className="lg:col-span-4 space-y-8">
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Sector Control</p>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tight">Tactical Map</h2>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {(session.session_courts ?? []).map(court => (
                                    <LiveCourtCardV2 
                                        key={court.id} 
                                        court={court} 
                                        canManage={session.can_manage}
                                        onSaveConfig={() => saveCourtConfig(court)}
                                        onRecordResult={() => submitAssignmentResult(court.current_assignment!)}
                                        busyAction={busyAction}
                                        drafts={{
                                            config: courtDrafts[court.id],
                                            score: court.current_assignment ? scoreDrafts[court.current_assignment.id] : undefined
                                        }}
                                        setDrafts={{
                                            config: (d: CourtConfigDraft) => setCourtDrafts(prev => ({ ...prev, [court.id]: d })),
                                            score: (d: ScoreDraft) => setScoreDrafts(prev => ({ ...prev, [court.current_assignment!.id]: d }))
                                        }}
                                    />
                                ))}
                            </div>
                        </section>

                        {/* Roster Module */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Enlisted Personnel</p>
                                    <h2 className="text-xl font-black uppercase italic tracking-tight">Roster Intel</h2>
                                </div>
                            </div>
                            <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] overflow-hidden">
                                <div className="divide-y divide-white/5">
                                    {(session.participants ?? []).slice(0, 10).map(p => (
                                        <div key={p.user_id} className="p-4 flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-[10px] font-black text-cyan-500">
                                                    {p.profile?.first_name?.[0]?.toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-white uppercase italic truncate">{profileLabel(p.profile)}</p>
                                                    <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">{p.profile?.skill_level || "CALIBRATING"}</p>
                                                </div>
                                            </div>
                                            <StatusBadge label={p.status} variant={statusVariant(p.status)} />
                                        </div>
                                    ))}
                                    {(session.participants?.length || 0) > 10 && (
                                        <div className="p-3 text-center">
                                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">And {session.participants!.length - 10} more operators...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

// ── Tactical Sub-components V2 ───────────────────────────────────────────────

function LiveCourtCardV2({
    court,
    canManage,
    drafts,
    setDrafts,
    onSaveConfig,
    onRecordResult,
    busyAction,
}: {
    court: SessionCourt;
    canManage: boolean;
    drafts: { config?: CourtConfigDraft; score?: ScoreDraft };
    setDrafts: { config: (draft: CourtConfigDraft) => void; score: (draft: ScoreDraft) => void };
    onSaveConfig: () => void;
    onRecordResult: () => void;
    busyAction: string | null;
}) {
    const m = court.current_assignment;
    const isOccupied = court.status === "occupied";
    const isChallenge = court.court_role === "challenge";

    return (
        <article className={`relative overflow-hidden rounded-[2rem] border transition-all ${
            isOccupied ? "border-cyan-500/30 bg-cyan-500/5 shadow-2xl" : "border-white/5 bg-[#0a111a]/60"
        }`}>
            <HUDCorner className="top-4 left-4" />
            
            <div className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isOccupied ? "bg-cyan-400 animate-pulse" : "bg-emerald-400"} shadow-[0_0_8px_currentColor]`} />
                            <h4 className="text-base font-black uppercase italic tracking-tight text-white">{court.court.name}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                            <StatusBadge label={court.status} variant={isOccupied ? "cyan" : "emerald"} active={isOccupied} />
                            {isChallenge && <StatusBadge label="Challenge" variant="fuchsia" />}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">STREAK</p>
                        <p className="text-lg font-black text-white italic tabular-nums">{court.consecutive_wins}</p>
                    </div>
                </div>

                {m ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-black/20 rounded-2xl p-4 border border-white/5">
                            <div className="flex flex-col items-center flex-1 min-w-0">
                                <span className="text-[10px] font-black text-white uppercase italic truncate w-full text-center">{m.sides[0].players.map((p) => profileLabel(p.profile)).join(" / ")}</span>
                            </div>
                            <div className="px-3 py-1 bg-cyan-500 text-black rounded-lg text-sm font-black italic tracking-tighter mx-3">
                                {m.side1_score ?? 0} - {m.side2_score ?? 0}
                            </div>
                            <div className="flex flex-col items-center flex-1 min-w-0">
                                <span className="text-[10px] font-black text-white uppercase italic truncate w-full text-center">{m.sides[1].players.map((p) => profileLabel(p.profile)).join(" / ")}</span>
                            </div>
                        </div>

                        {canManage && m.status === "in_game" && (
                            <div className="space-y-3 pt-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <input 
                                        type="number" 
                                        placeholder="SIDE 1"
                                        value={drafts.score?.side1 ?? ""}
                                        onChange={e => setDrafts.score({ side1: e.target.value, side2: drafts.score?.side2 ?? "" })}
                                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-center text-white outline-none focus:border-emerald-500/40"
                                    />
                                    <input 
                                        type="number" 
                                        placeholder="SIDE 2"
                                        value={drafts.score?.side2 ?? ""}
                                        onChange={e => setDrafts.score({ side1: drafts.score?.side1 ?? "", side2: e.target.value })}
                                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-center text-white outline-none focus:border-emerald-500/40"
                                    />
                                </div>
                                <button 
                                    onClick={() => onRecordResult()}
                                    disabled={busyAction === `complete-${m.id}`}
                                    className="w-full py-2.5 rounded-xl bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg"
                                >
                                    Record Operational Result
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-8 border border-dashed border-white/5 rounded-2xl bg-black/20 flex flex-col items-center justify-center text-center">
                        <span className="text-xl opacity-20 mb-2">📡</span>
                        <p className="text-[8px] font-black text-slate-700 uppercase tracking-[0.2em] italic">Sector Idle · Ready for Assignment</p>
                    </div>
                )}

                {canManage && (
                    <div className="pt-2 border-t border-white/5 space-y-3">
                        <div className="flex gap-2">
                            <select 
                                value={drafts.config?.court_role ?? court.court_role}
                                onChange={e => setDrafts.config({ court_role: e.target.value, max_consecutive_wins: drafts.config?.max_consecutive_wins ?? String(court.max_consecutive_wins || 2) })}
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400 focus:text-white"
                            >
                                <option value="standard">Standard Ops</option>
                                <option value="challenge">Challenge Sector</option>
                            </select>
                            { (drafts.config?.court_role ?? court.court_role) === "challenge" && (
                                <input 
                                    type="number" 
                                    value={drafts.config?.max_consecutive_wins ?? String(court.max_consecutive_wins || 2)}
                                    onChange={e => setDrafts.config({ court_role: drafts.config?.court_role ?? court.court_role, max_consecutive_wins: e.target.value })}
                                    className="w-12 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[8px] font-black text-white text-center"
                                />
                            )}
                            <button 
                                onClick={onSaveConfig}
                                disabled={busyAction === `court-${court.id}`}
                                className="px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[8px] font-black uppercase hover:bg-cyan-500/20"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}
