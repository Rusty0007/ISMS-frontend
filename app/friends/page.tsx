"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

interface Friend {
    friendship_id: string;
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    since?: string;
    sent_at?: string;
}

export default function FriendsPage() {
    const router = useRouter();
    const [friends,   setFriends]   = useState<Friend[]>([]);
    const [requests,  setRequests]  = useState<Friend[]>([]);
    const [search,    setSearch]    = useState("");
    const [results,   setResults]   = useState<{ id: string; username: string; first_name: string; last_name: string }[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [actionMsg, setActionMsg] = useState("");

    function getToken() {
        const t = getAccessToken();
        if (!t) router.replace("/login");
        return t;
    }

    async function fetchAll() {
        const token = getToken(); if (!token) return;
        const [fRes, rRes] = await Promise.all([
            fetch("/api/friends",          { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/friends/requests", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (isUnauthorized(fRes.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (fRes.ok) { const d = await fRes.json(); setFriends(d.friends ?? []); }
        if (rRes.ok) { const d = await rRes.json(); setRequests(d.requests ?? []); }
    }

    useEffect(() => {
        fetchAll().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced player search
    useEffect(() => {
        if (search.length < 2) { setResults([]); return; }
        const token = getAccessToken(); if (!token) return;
        const t = setTimeout(async () => {
            const res = await fetch(`/api/players/search?q=${encodeURIComponent(search)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) { const d = await res.json(); setResults(d.players ?? []); }
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    async function sendRequest(targetId: string) {
        const token = getToken(); if (!token) return;
        const res = await fetch(`/api/friends/request/${targetId}`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        setActionMsg(res.ok ? "Friend request sent!" : d.detail || "Failed.");
        setSearch(""); setResults([]);
        setTimeout(() => setActionMsg(""), 3000);
    }

    async function acceptRequest(friendshipId: string) {
        const token = getToken(); if (!token) return;
        await fetch(`/api/friends/${friendshipId}/accept`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        await fetchAll();
    }

    async function removeFriend(friendshipId: string) {
        const token = getToken(); if (!token) return;
        await fetch(`/api/friends/${friendshipId}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
        await fetchAll();
    }

    if (loading) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm animate-pulse">Loading...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar backHref="/dashboard" backLabel="← Dashboard" />

            <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black">Friends</h1>
                        <p className="text-zinc-500 text-sm mt-0.5">
                            {friends.length} friend{friends.length !== 1 ? "s" : ""}
                            {requests.length > 0 && (
                                <span className="text-cyan-400 ml-2">· {requests.length} pending request{requests.length !== 1 ? "s" : ""}</span>
                            )}
                        </p>
                    </div>
                    <Link
                        href="/friends/nearby"
                        className="text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-2 rounded-lg hover:bg-emerald-500/20 transition-colors"
                    >
                        📍 Nearby
                    </Link>
                </div>

                {/* Search */}
                <div className="flex flex-col gap-2">
                    <input
                        type="text"
                        placeholder="Search players by username to add them…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                    />
                    {results.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            {results.map(p => (
                                <div key={p.id} className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-xl px-4 py-3">
                                    <div>
                                        <span className="text-sm font-semibold">@{p.username}</span>
                                        <span className="text-xs text-zinc-500 ml-2">{p.first_name} {p.last_name}</span>
                                    </div>
                                    <button
                                        onClick={() => sendRequest(p.id)}
                                        className="text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-lg hover:bg-cyan-500/20 transition-colors"
                                    >
                                        + Add
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {actionMsg && <p className="text-xs text-center text-cyan-400">{actionMsg}</p>}
                </div>

                {/* Two-column layout: Friends | Requests */}
                <div className="grid md:grid-cols-2 gap-6 items-start">

                    {/* Friends list */}
                    <div className="flex flex-col gap-3">
                        <h2 className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
                            Friends ({friends.length})
                        </h2>
                        {friends.length === 0 ? (
                            <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 text-center text-zinc-500 text-sm">
                                No friends yet. Search above to add players.
                            </div>
                        ) : (
                            friends.map(f => (
                                <div key={f.friendship_id} className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400 shrink-0">
                                            {f.username[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold">@{f.username}</div>
                                            <div className="text-xs text-zinc-500">{f.first_name} {f.last_name}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => removeFriend(f.friendship_id)}
                                        className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pending requests */}
                    <div className="flex flex-col gap-3">
                        <h2 className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
                            Pending Requests {requests.length > 0 && <span className="text-cyan-400">({requests.length})</span>}
                        </h2>
                        {requests.length === 0 ? (
                            <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 text-center text-zinc-500 text-sm">
                                No pending friend requests.
                            </div>
                        ) : (
                            requests.map(r => (
                                <div key={r.friendship_id} className="flex items-center justify-between bg-zinc-900 border border-cyan-500/20 rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400 shrink-0">
                                            {r.username[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold">@{r.username}</div>
                                            <div className="text-xs text-zinc-500">{r.first_name} {r.last_name}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => acceptRequest(r.friendship_id)}
                                            className="text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-3 py-1.5 rounded-lg hover:bg-cyan-500/20 transition-colors"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => removeFriend(r.friendship_id)}
                                            className="text-xs text-zinc-600 hover:text-red-400 px-2 transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}
