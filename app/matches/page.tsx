"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

const SPORTS_META: Record<string, { label: string; emoji: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓" },
    badminton:    { label: "Badminton",    emoji: "🏸" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾" },
    table_tennis: { label: "Table Tennis", emoji: "🏓" },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
    pending:   { label: "Pending",   className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30" },
    ongoing:   { label: "Live",      className: "bg-green-500/10  text-green-400  border border-green-500/30"  },
    completed: { label: "Completed", className: "bg-zinc-500/10  text-zinc-400   border border-zinc-500/30"   },
    cancelled: { label: "Cancelled", className: "bg-red-500/10   text-red-400    border border-red-500/30"    },
};

const TYPE_LABELS: Record<string, string> = {
    friendly: "Friendly",
    queue:    "Ranked Queue",
    book:     "Booked",
};

interface Match {
    id: string;
    sport: string;
    match_type: string;
    match_format: string;
    status: string;
    player1_id: string;
    player2_id: string | null;
    winner_id: string | null;
    created_at: string;
}

export default function MatchesPage() {
    const router = useRouter();
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        Promise.all([
            fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } }).then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                return r.ok ? r.json() : null;
            }),
            fetch("/api/matches/my", { headers: { Authorization: `Bearer ${token}` } }).then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                return r.ok ? r.json() : null;
            }),
        ])
        .then(([me, matchData]) => {
            if (me?.profile) setUserId(me.profile.id);
            if (matchData?.matches) setMatches(matchData.matches);
        })
        .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading matches...</div>
            </div>
        );
    }

    const active  = matches.filter(m => m.status === "ongoing");
    const pending = matches.filter(m => m.status === "pending");
    const past    = matches.filter(m => m.status === "completed" || m.status === "cancelled");

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            <NavBar backHref="/dashboard" backLabel="← Dashboard" />

            <main className="relative z-10 max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-black">My Matches</h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        {matches.length} total match{matches.length !== 1 ? "es" : ""}
                        {active.length > 0 && <span className="text-green-400 ml-2">· {active.length} live</span>}
                        {pending.length > 0 && <span className="text-yellow-400 ml-2">· {pending.length} pending</span>}
                    </p>
                </div>

                {/* Matchmaking entry panel */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Smart Match */}
                    <Link
                        href="/matches/queue"
                        className="group relative bg-zinc-900 border border-cyan-500/20 hover:border-cyan-500/50 rounded-2xl p-5 flex flex-col gap-3 transition-all hover:bg-cyan-500/5"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold tracking-[0.25em] uppercase text-cyan-500">Smart Match</span>
                            <span className="text-xs text-zinc-600 bg-zinc-800 border border-white/5 rounded-full px-2 py-0.5">AI</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white">Find Best Opponent</p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                AI pairs you instantly using Glicko-2 rating, location, and match history.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 mt-auto">
                            <span className="text-xs text-cyan-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                                Join Queue →
                            </span>
                        </div>
                        {/* Subtle glow */}
                        <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ boxShadow: "inset 0 0 40px rgba(6,182,212,0.04)" }} />
                    </Link>

                    {/* Organized Match */}
                    <Link
                        href="/matches/new"
                        className="group bg-zinc-900 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex flex-col gap-3 transition-all hover:bg-white/[0.02]"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold tracking-[0.25em] uppercase text-zinc-400">Organized Match</span>
                            <span className="text-xs text-zinc-600 bg-zinc-800 border border-white/5 rounded-full px-2 py-0.5">Manual</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white">Challenge or Book</p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                Invite a specific opponent for a friendly match or schedule a booked session.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 mt-auto">
                            <span className="text-xs text-zinc-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                                Set Up Match →
                            </span>
                        </div>
                    </Link>
                </div>

                {active.length > 0 && (
                    <Section title="🔴 Live Now">
                        {active.map(m => <MatchCard key={m.id} match={m} userId={userId} />)}
                    </Section>
                )}

                {pending.length > 0 && (
                    <Section title="⏳ Pending">
                        {pending.map(m => <MatchCard key={m.id} match={m} userId={userId} />)}
                    </Section>
                )}

                {past.length > 0 && (
                    <Section title="History" muted>
                        {past.map(m => <MatchCard key={m.id} match={m} userId={userId} />)}
                    </Section>
                )}

                {matches.length === 0 && (
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-14 text-center flex flex-col items-center gap-4">
                        <div className="text-5xl">🏆</div>
                        <p className="text-zinc-300 font-semibold">No matches yet</p>
                        <p className="text-zinc-500 text-sm">Use Smart Match to let AI find your best opponent, or set up an organized match manually.</p>
                        <Link
                            href="/matches/queue"
                            className="mt-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
                        >
                            Try Smart Match →
                        </Link>
                    </div>
                )}
            </main>
        </div>
    );
}

function Section({ title, children, muted = false }: { title: string; children: React.ReactNode; muted?: boolean }) {
    return (
        <div>
            <h2 className={`text-xs font-bold tracking-[0.3em] uppercase mb-3 ${muted ? "text-zinc-600" : "text-zinc-400"}`}>
                {title}
            </h2>
            <div className="flex flex-col gap-2.5">{children}</div>
        </div>
    );
}

function MatchCard({ match, userId }: { match: Match; userId: string | null }) {
    const meta       = SPORTS_META[match.sport];
    const statusMeta = STATUS_META[match.status] ?? STATUS_META.pending;
    const typeLabel  = TYPE_LABELS[match.match_type] ?? match.match_type;
    const isCompleted = match.status === "completed";
    const isWinner    = isCompleted && match.winner_id === userId;

    return (
        <Link
            href={`/matches/${match.id}`}
            className="bg-zinc-900 border border-white/10 hover:border-white/20 rounded-xl p-5 flex items-center justify-between transition-colors group"
        >
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-xl shrink-0">
                    {meta?.emoji ?? "🏅"}
                </div>
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{meta?.label ?? match.sport}</span>
                        <span className="text-zinc-600 text-xs">·</span>
                        <span className="text-zinc-500 text-xs">{typeLabel}</span>
                        <span className="text-zinc-600 text-xs">·</span>
                        <span className="text-zinc-500 text-xs capitalize">{match.match_format.replace("_", " ")}</span>
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5">
                        {new Date(match.created_at).toLocaleDateString("en-PH", {
                            month: "short", day: "numeric", year: "numeric",
                        })}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {isCompleted && (
                    <span className={`text-xs font-black ${isWinner ? "text-green-400" : "text-red-400"}`}>
                        {isWinner ? "WIN" : "LOSS"}
                    </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusMeta.className}`}>
                    {statusMeta.label}
                </span>
                <span className="text-zinc-700 group-hover:text-zinc-400 transition-colors text-sm">→</span>
            </div>
        </Link>
    );
}
