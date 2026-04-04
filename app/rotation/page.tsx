"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

const SPORTS_META: Record<string, { label: string; emoji: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓" },
    badminton:    { label: "Badminton",    emoji: "🏸" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾" },
    table_tennis: { label: "Table Tennis", emoji: "🏓" },
};

interface Rotation {
    id: string;
    sport: string;
    format: string;
    status: string;
    court_size: number;
    members: { id: string; display_name: string }[];
    created_at: string;
}

export default function RotationPage() {
    const router = useRouter();
    const [rotations,  setRotations]  = useState<Rotation[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [sport,      setSport]      = useState("badminton");
    const [format,     setFormat]     = useState<"singles" | "doubles">("singles");
    const [creating,   setCreating]   = useState(false);
    const [showForm,   setShowForm]   = useState(false);

    function getToken() {
        const t = getAccessToken();
        if (!t) { router.replace("/login"); }
        return t;
    }

    useEffect(() => {
        const token = getToken();
        if (!token) return;

        fetch("/api/rotations/mine", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                return r.ok ? r.json() : null;
            })
            .then(d => { if (d) setRotations(d.rotations ?? []); })
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function createRotation() {
        const token = getToken(); if (!token) return;
        setCreating(true);
        const res = await fetch("/api/rotations", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sport, format }),
        });
        const d = await res.json();
        setCreating(false);
        if (res.ok) router.push(`/rotation/${d.rotation_id}`);
    }

    if (loading) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm animate-pulse">Loading...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar backHref="/dashboard" backLabel="← Dashboard" />

            <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black">Court Rotation</h1>
                        <p className="text-zinc-500 text-sm mt-0.5">King-of-the-Court rotation tracker</p>
                    </div>
                    <button
                        onClick={() => setShowForm(f => !f)}
                        className="text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-2 rounded-lg hover:bg-cyan-500/20 transition-colors"
                    >
                        + New Session
                    </button>
                </div>

                {/* Create form */}
                {showForm && (
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
                        <h2 className="text-sm font-bold text-zinc-300">New Rotation Session</h2>

                        {/* Sport */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-zinc-500">Sport</label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(SPORTS_META).map(([key, meta]) => (
                                    <button
                                        key={key}
                                        onClick={() => setSport(key)}
                                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                                            sport === key
                                                ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300"
                                                : "bg-zinc-800 border-white/10 text-zinc-400 hover:border-white/20"
                                        }`}
                                    >
                                        <span>{meta.emoji}</span> {meta.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Format */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-zinc-500">Format</label>
                            <div className="flex gap-2">
                                {(["singles", "doubles"] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFormat(f)}
                                        className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition-colors capitalize ${
                                            format === f
                                                ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300"
                                                : "bg-zinc-800 border-white/10 text-zinc-400 hover:border-white/20"
                                        }`}
                                    >
                                        {f === "singles" ? "1v1 Singles" : "2v2 Doubles"}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-zinc-600">
                                {format === "singles" ? "2 players on court, rest wait in queue" : "4 players on court, rest wait in queue"}
                            </p>
                        </div>

                        <button
                            onClick={createRotation}
                            disabled={creating}
                            className="w-full py-3 rounded-xl bg-cyan-500 text-zinc-950 font-black text-sm hover:bg-cyan-400 transition-colors disabled:opacity-50"
                        >
                            {creating ? "Creating..." : "Start Session →"}
                        </button>
                    </div>
                )}

                {/* Active sessions */}
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Your Active Sessions</p>
                    {rotations.length === 0 ? (
                        <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 text-center text-zinc-500 text-sm">
                            No active sessions. Start one above!
                        </div>
                    ) : (
                        rotations.map(r => {
                            const meta = SPORTS_META[r.sport];
                            return (
                                <button
                                    key={r.id}
                                    onClick={() => router.push(`/rotation/${r.id}`)}
                                    className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 hover:border-white/20 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{meta?.emoji ?? "🎯"}</span>
                                        <div>
                                            <div className="text-sm font-semibold">{meta?.label ?? r.sport}</div>
                                            <div className="text-xs text-zinc-500 capitalize">
                                                {r.format} · {r.members.length} players · court size {r.court_size}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs text-zinc-500">Manage →</span>
                                </button>
                            );
                        })
                    )}
                </div>

            </main>
        </div>
    );
}
