"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────

const SPORTS = [
    { value: "",             label: "All Sports",  icon: "🎯" },
    { value: "badminton",    label: "Badminton",   icon: "🏸" },
    { value: "pickleball",   label: "Pickleball",  icon: "🥒" },
    { value: "lawn_tennis",  label: "Tennis",      icon: "🎾" },
    { value: "table_tennis", label: "Table Tennis",icon: "🏓" },
];

const STATUSES = [
    { value: "",                   label: "All Status" },
    { value: "upcoming",           label: "Upcoming" },
    { value: "registration_closed",label: "Reg. Closed" },
    { value: "ongoing",            label: "Ongoing" },
    { value: "completed",          label: "Completed" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    upcoming:             { label: "Upcoming",           color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    registration_closed:  { label: "Reg. Closed",        color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
    ongoing:              { label: "Ongoing",            color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    completed:            { label: "Completed",          color: "bg-zinc-600/40 text-zinc-400 border-zinc-600/30" },
};

const FORMAT_LABELS: Record<string, string> = {
    single_elimination:    "Single Elim.",
    double_elimination:    "Double Elim.",
    round_robin:           "Round Robin",
    group_stage_knockout:  "Group + KO",
    swiss:                 "Swiss",
};

const SPORT_ICONS: Record<string, string> = {
    badminton:    "🏸",
    pickleball:   "🥒",
    lawn_tennis:  "🎾",
    table_tennis: "🏓",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tournament {
    id:                string;
    name:              string;
    description:       string | null;
    sport:             string;
    format:            string;
    match_format:      string;
    organizer_id:      string;
    status:            string;
    registration_open: boolean;
    max_participants:  number;
    participant_count: number;
    starts_at:         string | null;
    ends_at:           string | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TournamentsPage() {
    const router = useRouter();

    const [tournaments,  setTournaments]  = useState<Tournament[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [sportFilter,  setSportFilter]  = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const fetchTournaments = useCallback(async (sport: string, status: string) => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        const params = new URLSearchParams();
        if (sport)  params.set("sport", sport);
        if (status) params.set("status", status);

        setLoading(true);
        const res = await fetch(`/api/tournaments?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (res.ok) {
            const d = await res.json();
            setTournaments(d.tournaments ?? []);
        }
        setLoading(false);
    }, [router]);

    // Auto-refetch whenever filters change
    useEffect(() => {
        fetchTournaments(sportFilter, statusFilter);
    }, [sportFilter, statusFilter, fetchTournaments]);

    const upcoming  = tournaments.filter(t => t.status === "upcoming");
    const active    = tournaments.filter(t => t.status === "ongoing");
    const other     = tournaments.filter(t => t.status !== "upcoming" && t.status !== "ongoing");

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar />
            <div className="max-w-4xl mx-auto px-4 py-8">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition-colors mb-1 inline-block">
                            ← Dashboard
                        </Link>
                        <h1 className="text-2xl font-bold">Tournaments</h1>
                        <p className="text-zinc-400 text-sm mt-0.5">
                            {loading ? "Loading…" : `${tournaments.length} tournament${tournaments.length !== 1 ? "s" : ""} found`}
                        </p>
                    </div>
                    <Link
                        href="/tournaments/new"
                        className="bg-white text-black text-sm font-semibold px-4 py-2 rounded-xl hover:bg-zinc-100 transition-colors"
                    >
                        + Create
                    </Link>
                </div>

                {/* Sport filter pills */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-3 no-scrollbar">
                    {SPORTS.map(s => (
                        <button
                            key={s.value}
                            onClick={() => setSportFilter(s.value)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                                sportFilter === s.value
                                    ? "bg-white text-black"
                                    : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                            }`}
                        >
                            <span>{s.icon}</span>
                            <span>{s.label}</span>
                        </button>
                    ))}
                </div>

                {/* Status filter pills */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-6 no-scrollbar">
                    {STATUSES.map(s => (
                        <button
                            key={s.value}
                            onClick={() => setStatusFilter(s.value)}
                            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0 ${
                                statusFilter === s.value
                                    ? "bg-zinc-700 text-white font-medium"
                                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800"
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                ) : tournaments.length === 0 ? (
                    <div className="text-center py-20 text-zinc-500">
                        <div className="text-5xl mb-4">🏆</div>
                        <p className="font-medium text-zinc-300">No tournaments found</p>
                        <p className="text-sm mt-1">
                            {sportFilter || statusFilter
                                ? "Try clearing your filters"
                                : "Be the first to create one!"}
                        </p>
                        {(sportFilter || statusFilter) && (
                            <button
                                onClick={() => { setSportFilter(""); setStatusFilter(""); }}
                                className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Active / Ongoing */}
                        {active.length > 0 && (
                            <Section title="🔴 Live Now" tournaments={active} />
                        )}
                        {/* Upcoming */}
                        {upcoming.length > 0 && (
                            <Section title="📅 Upcoming" tournaments={upcoming} />
                        )}
                        {/* Completed / Closed */}
                        {other.length > 0 && (
                            <Section title="Past & Closed" tournaments={other} muted />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
    title,
    tournaments,
    muted = false,
}: {
    title: string;
    tournaments: Tournament[];
    muted?: boolean;
}) {
    return (
        <div>
            <h2 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted ? "text-zinc-600" : "text-zinc-400"}`}>
                {title}
            </h2>
            <div className="space-y-3">
                {tournaments.map(t => (
                    <TournamentCard key={t.id} t={t} />
                ))}
            </div>
        </div>
    );
}

// ── Tournament Card ────────────────────────────────────────────────────────────

function TournamentCard({ t }: { t: Tournament }) {
    const statusCfg = STATUS_CONFIG[t.status];
    const fillPct   = Math.min(100, Math.round((t.participant_count / t.max_participants) * 100));
    const isFull    = t.participant_count >= t.max_participants;

    return (
        <Link href={`/tournaments/${t.id}`}>
            <div className={`group bg-zinc-900 border rounded-2xl p-5 hover:border-zinc-600 transition-all cursor-pointer ${
                t.status === "ongoing" ? "border-emerald-500/30" : "border-zinc-800"
            }`}>
                <div className="flex items-start gap-4">
                    {/* Sport icon */}
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-xl shrink-0">
                        {SPORT_ICONS[t.sport] ?? "🎯"}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg?.color ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
                                {statusCfg?.label ?? t.status.replace(/_/g, " ")}
                            </span>
                            {t.registration_open && t.status === "upcoming" && (
                                <span className="text-[11px] font-medium text-emerald-400">
                                    · Open
                                </span>
                            )}
                        </div>
                        <h2 className="font-semibold text-white group-hover:text-zinc-100 truncate">
                            {t.name}
                        </h2>
                        {t.description && (
                            <p className="text-sm text-zinc-400 mt-0.5 line-clamp-1">{t.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500 flex-wrap">
                            <span>{FORMAT_LABELS[t.format] ?? t.format}</span>
                            <span className="text-zinc-700">·</span>
                            <span className="capitalize">{t.match_format.replace("_", " ")}</span>
                            {t.starts_at && (
                                <>
                                    <span className="text-zinc-700">·</span>
                                    <span>{new Date(t.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Participant count + bar */}
                    <div className="text-right shrink-0 min-w-[70px]">
                        <div className="text-sm font-bold text-white">
                            {t.participant_count}
                            <span className="text-zinc-600 font-normal">/{t.max_participants}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mb-1.5">players</div>
                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${isFull ? "bg-red-400" : "bg-emerald-400"}`}
                                style={{ width: `${fillPct}%` }}
                            />
                        </div>
                        {isFull && (
                            <div className="text-[10px] text-red-400 mt-0.5 font-medium">Full</div>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    );
}
