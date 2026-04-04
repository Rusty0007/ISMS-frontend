"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

interface Member {
    id: string;
    user_id: string | null;
    display_name: string;
    queue_position: number;
    games_played: number;
    wins: number;
}

interface Rotation {
    id: string;
    sport: string;
    format: string;
    status: string;
    court_size: number;
    created_by: string;
    members: Member[];
}

export default function RotationDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router  = useRouter();

    const [rotation,    setRotation]    = useState<Rotation | null>(null);
    const [loading,     setLoading]     = useState(true);
    const [myId,        setMyId]        = useState<string>("");
    const [showAdd,     setShowAdd]     = useState(false);
    const [search,      setSearch]      = useState("");
    const [results,     setResults]     = useState<{ id: string; username: string }[]>([]);
    const [guestName,   setGuestName]   = useState("");
    const [adding,      setAdding]      = useState(false);
    const [showAdvance, setShowAdvance] = useState(false);
    const [winnerIds,   setWinnerIds]   = useState<Set<string>>(new Set());
    const [advancing,   setAdvancing]   = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    function getToken() {
        const t = getAccessToken();
        if (!t) router.replace("/login");
        return t;
    }

    async function fetchRotation() {
        const token = getToken(); if (!token) return;
        const res = await fetch(`/api/rotations/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (res.ok) {
            const d = await res.json();
            setRotation(d);
        }
    }

    useEffect(() => {
        const token = getToken(); if (!token) return;

        // Get own user id
        fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.profile?.id) setMyId(d.profile.id); });

        fetchRotation().finally(() => setLoading(false));

        pollRef.current = setInterval(fetchRotation, 8000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Player search debounce
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

    async function addPlayerById(userId: string, displayName: string) {
        const token = getToken(); if (!token) return;
        setAdding(true);
        await fetch(`/api/rotations/${id}/members`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, display_name: displayName }),
        });
        setSearch(""); setResults([]);
        await fetchRotation();
        setAdding(false);
    }

    async function addGuest() {
        const name = guestName.trim(); if (!name) return;
        const token = getToken(); if (!token) return;
        setAdding(true);
        await fetch(`/api/rotations/${id}/members`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: name }),
        });
        setGuestName("");
        await fetchRotation();
        setAdding(false);
    }

    async function removeMember(memberId: string) {
        const token = getToken(); if (!token) return;
        await fetch(`/api/rotations/${id}/members/${memberId}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
        await fetchRotation();
    }

    async function advance() {
        if (winnerIds.size === 0) return;
        const token = getToken(); if (!token) return;
        setAdvancing(true);
        const res = await fetch(`/api/rotations/${id}/advance`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ winner_ids: Array.from(winnerIds) }),
        });
        if (res.ok) {
            const d = await res.json();
            setRotation(d.rotation);
        }
        setWinnerIds(new Set());
        setShowAdvance(false);
        setAdvancing(false);
    }

    async function endSession() {
        const token = getToken(); if (!token) return;
        if (!confirm("End this rotation session?")) return;
        await fetch(`/api/rotations/${id}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
        router.push("/rotation");
    }

    if (loading) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm animate-pulse">Loading rotation...</div>
        </div>
    );

    if (!rotation) return (
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm">Rotation not found.</div>
        </div>
    );

    const isCreator  = myId === rotation.created_by;
    const courtSize  = rotation.court_size;
    const onCourt    = rotation.members.filter(m => m.queue_position <= courtSize);
    const waiting    = rotation.members.filter(m => m.queue_position > courtSize);
    const isEnded    = rotation.status === "ended";

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar backHref="/rotation" backLabel="← Rotations" />

            <main className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-black capitalize">
                            {rotation.sport.replace("_", " ")} · {rotation.format}
                        </h1>
                        <p className="text-zinc-500 text-sm mt-0.5">
                            {rotation.members.length} players · court size {courtSize}
                            {isEnded && <span className="ml-2 text-red-400">· Ended</span>}
                        </p>
                    </div>
                    {isCreator && !isEnded && (
                        <button
                            onClick={endSession}
                            className="text-xs text-zinc-600 hover:text-red-400 transition-colors px-2 py-1"
                        >
                            End Session
                        </button>
                    )}
                </div>

                {/* On Court */}
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest">On Court</p>
                    {onCourt.length === 0 ? (
                        <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 text-center text-zinc-500 text-sm">
                            Add players to start the rotation.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {onCourt.map(m => (
                                <div key={m.id} className="flex items-center justify-between bg-zinc-900 border border-emerald-500/30 rounded-xl px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300">
                                                {m.display_name[0].toUpperCase()}
                                            </div>
                                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-zinc-900" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold">{m.display_name}</div>
                                            <div className="text-xs text-zinc-500">{m.games_played}G · {m.wins}W</div>
                                        </div>
                                    </div>
                                    {isCreator && !isEnded && (
                                        <button onClick={() => removeMember(m.id)} className="text-xs text-zinc-700 hover:text-red-400 transition-colors">✕</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Waiting Queue */}
                {waiting.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Waiting Queue</p>
                        {waiting.map(m => (
                            <div key={m.id} className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                                        {m.queue_position - courtSize}
                                    </span>
                                    <div>
                                        <div className="text-sm font-semibold text-zinc-300">{m.display_name}</div>
                                        <div className="text-xs text-zinc-600">{m.games_played}G · {m.wins}W</div>
                                    </div>
                                </div>
                                {isCreator && !isEnded && (
                                    <button onClick={() => removeMember(m.id)} className="text-xs text-zinc-700 hover:text-red-400 transition-colors">✕</button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Actions */}
                {isCreator && !isEnded && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowAdd(s => !s)}
                            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-bold text-zinc-300 hover:border-white/20 transition-colors"
                        >
                            + Add Player
                        </button>
                        {onCourt.length >= 2 && (
                            <button
                                onClick={() => { setShowAdvance(true); setWinnerIds(new Set()); }}
                                className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-zinc-950 font-black text-sm hover:bg-cyan-400 transition-colors"
                            >
                                Game Done →
                            </button>
                        )}
                    </div>
                )}

                {/* Add Player panel */}
                {showAdd && !isEnded && (
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                        <p className="text-xs font-bold text-zinc-400">Add by username search</p>
                        <input
                            type="text"
                            placeholder="Search username..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                        />
                        {results.length > 0 && (
                            <div className="flex flex-col gap-1">
                                {results.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => addPlayerById(p.id, p.username)}
                                        disabled={adding}
                                        className="flex items-center justify-between bg-zinc-800 rounded-xl px-3 py-2 hover:bg-zinc-700 transition-colors"
                                    >
                                        <span className="text-sm font-semibold">@{p.username}</span>
                                        <span className="text-xs text-cyan-400">+ Add</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="border-t border-white/5 pt-3">
                            <p className="text-xs font-bold text-zinc-400 mb-2">Or add a guest by name</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Guest name..."
                                    value={guestName}
                                    onChange={e => setGuestName(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") addGuest(); }}
                                    className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                />
                                <button
                                    onClick={addGuest}
                                    disabled={adding || !guestName.trim()}
                                    className="px-3 py-2 rounded-xl bg-zinc-700 text-sm font-bold text-white hover:bg-zinc-600 transition-colors disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Advance modal */}
                {showAdvance && (
                    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-lg p-5 flex flex-col gap-4">
                            <h2 className="text-lg font-black">Who won?</h2>
                            <p className="text-zinc-500 text-sm">Select the winner(s) from the players currently on court.</p>

                            <div className="flex flex-col gap-2">
                                {onCourt.map(m => {
                                    const selected = winnerIds.has(m.id);
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => {
                                                setWinnerIds(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                                                    return next;
                                                });
                                            }}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                                                selected
                                                    ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300"
                                                    : "bg-zinc-800 border-white/10 text-zinc-300 hover:border-white/20"
                                            }`}
                                        >
                                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${selected ? "border-cyan-400 bg-cyan-400 text-zinc-900" : "border-zinc-600"}`}>
                                                {selected ? "✓" : ""}
                                            </span>
                                            <span className="text-sm font-semibold">{m.display_name}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowAdvance(false)}
                                    className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-bold text-zinc-400 hover:border-white/20 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={advance}
                                    disabled={winnerIds.size === 0 || advancing}
                                    className="flex-1 py-3 rounded-xl bg-cyan-500 text-zinc-950 font-black text-sm hover:bg-cyan-400 transition-colors disabled:opacity-50"
                                >
                                    {advancing ? "Advancing..." : "Confirm & Rotate →"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
