"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

interface NearbyPlayer {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    club_id: string;
    checked_in_at: string;
}

export default function NearbyPage() {
    const router  = useRouter();
    const [nearby,   setNearby]   = useState<NearbyPlayer[]>([]);
    const [message,  setMessage]  = useState("");
    const [loading,  setLoading]  = useState(true);
    const [adding,   setAdding]   = useState<string | null>(null);
    const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        fetch("/api/friends/nearby", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                return r.ok ? r.json() : null;
            })
            .then(d => {
                if (!d) return;
                setNearby(d.nearby ?? []);
                setMessage(d.message ?? "");
            })
            .finally(() => setLoading(false));
    }, [router]);

    async function sendRequest(targetId: string) {
        const token = getAccessToken(); if (!token) return;
        setAdding(targetId);
        const res = await fetch(`/api/friends/request/${targetId}`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        setActionMsg(prev => ({ ...prev, [targetId]: res.ok ? "Request sent!" : (d.detail || "Failed.") }));
        setAdding(null);
    }

    function timeAgo(iso: string) {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1)  return "just now";
        if (mins < 60) return `${mins}m ago`;
        return `${Math.floor(mins / 60)}h ago`;
    }

    if (loading) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm animate-pulse">Looking for nearby players...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar backHref="/friends" backLabel="← Friends" />

            <main className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">

                <div>
                    <h1 className="text-2xl font-black">Nearby Players</h1>
                    <p className="text-zinc-500 text-sm mt-0.5">Players checked in at the same club as you</p>
                </div>

                {message && nearby.length === 0 ? (
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 text-center flex flex-col gap-3">
                        <span className="text-3xl">📍</span>
                        <p className="text-zinc-400 text-sm">{message}</p>
                        <p className="text-zinc-600 text-xs">Check in to a club to see who else is there.</p>
                    </div>
                ) : nearby.length === 0 ? (
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 text-center">
                        <p className="text-zinc-500 text-sm">No other players at your club right now.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-zinc-500">{nearby.length} player{nearby.length !== 1 ? "s" : ""} at your club</p>
                        {nearby.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-zinc-900 border border-emerald-500/20 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
                                            {p.username[0].toUpperCase()}
                                        </div>
                                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-zinc-900" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold">@{p.username}</div>
                                        <div className="text-xs text-zinc-500">
                                            {p.first_name} {p.last_name} · checked in {timeAgo(p.checked_in_at)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    {actionMsg[p.id] ? (
                                        <span className="text-xs text-cyan-400">{actionMsg[p.id]}</span>
                                    ) : (
                                        <button
                                            onClick={() => sendRequest(p.id)}
                                            disabled={adding === p.id}
                                            className="text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-lg hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                                        >
                                            {adding === p.id ? "…" : "+ Add"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
