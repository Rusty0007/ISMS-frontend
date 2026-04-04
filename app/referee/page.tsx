"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

const SPORTS_META: Record<string, { label: string; emoji: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓" },
    badminton:    { label: "Badminton",    emoji: "🏸" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾" },
    table_tennis: { label: "Table Tennis", emoji: "🏓" },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
    ongoing:   { label: "Live",      className: "bg-green-500/10 text-green-400 border border-green-500/30"   },
    completed: { label: "Completed", className: "bg-zinc-500/10  text-zinc-400  border border-zinc-500/30"   },
    pending:   { label: "Upcoming",  className: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30" },
};

interface RefereeMatch {
    id: string;
    sport: string;
    match_type: string;
    match_format: string;
    status: string;
    player1_id: string;
    player2_id: string | null;
    player3_id: string | null;
    player4_id: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
}

type SectionKey = "ongoing" | "upcoming" | "completed";

export default function RefereeDashboardPage() {
    const router = useRouter();
    const [data,        setData]        = useState<Record<SectionKey, RefereeMatch[]>>({ ongoing: [], upcoming: [], completed: [] });
    const [loading,     setLoading]     = useState(true);
    const [inviteCount, setInviteCount] = useState(0);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        Promise.all([
            fetch("/api/referee/my-matches", { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/referee/my-invites",  { headers: { Authorization: `Bearer ${token}` } }),
        ])
        .then(async ([matchRes, inviteRes]) => {
            if (isUnauthorized(matchRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (matchRes.ok) {
                const d = await matchRes.json();
                setData({ ongoing: d.ongoing ?? [], upcoming: d.upcoming ?? [], completed: d.completed ?? [] });
            }
            if (inviteRes.ok) {
                const d = await inviteRes.json();
                setInviteCount(d.count ?? 0);
            }
        })
        .catch(err => console.error("[referee/page]", err))
        .finally(() => setLoading(false));
    }, [router]);

    const total = data.ongoing.length + data.upcoming.length + data.completed.length;

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading referee matches...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            <NavBar backHref="/matches" backLabel="← My Matches" />

            <main className="relative z-10 max-w-4xl mx-auto w-full px-6 py-10 flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black">Referee Dashboard</h1>
                        <p className="text-zinc-500 text-sm mt-1">
                            {total} match{total !== 1 ? "es" : ""} assigned
                            {data.ongoing.length > 0 && <span className="text-green-400 ml-2">· {data.ongoing.length} live</span>}
                            {data.upcoming.length > 0 && <span className="text-yellow-400 ml-2">· {data.upcoming.length} upcoming</span>}
                        </p>
                    </div>
                    <Link
                        href="/referee/invites"
                        className={`flex-shrink-0 text-xs font-bold px-3 py-2 rounded-xl border transition-colors ${
                            inviteCount > 0
                                ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/20"
                                : "bg-zinc-900 border-white/10 text-zinc-400 hover:border-white/20"
                        }`}
                    >
                        🟡 Invites
                        {inviteCount > 0 && (
                            <span className="ml-1.5 bg-yellow-500 text-zinc-950 font-black text-xs px-1.5 py-0.5 rounded-full">
                                {inviteCount}
                            </span>
                        )}
                    </Link>
                </div>

                {/* Pending invite alert */}
                {inviteCount > 0 && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
                        <p className="text-sm font-bold text-yellow-400">
                            You have {inviteCount} pending referee invite{inviteCount > 1 ? "s" : ""}!
                        </p>
                        <Link
                            href="/referee/invites"
                            className="text-xs font-bold text-yellow-400 border border-yellow-500/30 px-3 py-1.5 rounded-lg hover:bg-yellow-500/20 transition-colors flex-shrink-0"
                        >
                            Respond →
                        </Link>
                    </div>
                )}

                {/* Live Now */}
                {data.ongoing.length > 0 && (
                    <MatchSection title="🔴 Live Now" matches={data.ongoing} />
                )}

                {/* Upcoming */}
                {data.upcoming.length > 0 && (
                    <MatchSection title="📅 Upcoming" matches={data.upcoming} />
                )}

                {/* Completed */}
                {data.completed.length > 0 && (
                    <MatchSection title="Completed" matches={data.completed} muted />
                )}

                {total === 0 && (
                    <div className="bg-zinc-900 border border-white/5 rounded-2xl p-12 text-center text-zinc-600 text-sm">
                        No referee assignments yet.{" "}
                        <Link href="/referee/invites" className="text-cyan-400 hover:underline">Check your invites →</Link>
                    </div>
                )}
            </main>
        </div>
    );
}

function MatchSection({ title, matches, muted = false }: { title: string; matches: RefereeMatch[]; muted?: boolean }) {
    return (
        <div>
            <h2 className={`text-xs font-bold tracking-[0.3em] uppercase mb-3 ${muted ? "text-zinc-600" : "text-zinc-400"}`}>
                {title}
            </h2>
            <div className="flex flex-col gap-3">
                {matches.map(m => {
                    const sport  = SPORTS_META[m.sport];
                    const status = STATUS_META[m.status] ?? STATUS_META.pending;
                    const isDoubles = m.match_format === "doubles";
                    return (
                        <div key={m.id} className={`bg-zinc-900 border rounded-2xl p-5 flex items-center gap-4 ${
                            m.status === "ongoing" ? "border-green-500/20" : "border-white/10"
                        }`}>
                            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-xl shrink-0">
                                {sport?.emoji ?? "🏅"}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm">{sport?.label ?? m.sport}</span>
                                    <span className="text-xs text-zinc-500 capitalize">
                                        {m.match_type.replace("_", " ")} · {isDoubles ? "Doubles" : "Singles"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.className}`}>
                                        {status.label}
                                    </span>
                                    {m.scheduled_at && m.status === "pending" && (
                                        <span className="text-xs text-zinc-600">
                                            {new Date(m.scheduled_at).toLocaleDateString()}
                                        </span>
                                    )}
                                    {m.started_at && m.status === "ongoing" && (
                                        <span className="text-xs text-zinc-600">
                                            Started {new Date(m.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <Link
                                href={`/matches/${m.id}`}
                                className="shrink-0 text-xs text-cyan-400 hover:text-cyan-300 font-semibold border border-cyan-500/30 hover:border-cyan-500/50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                View →
                            </Link>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
