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

interface RefereeInvite {
    id: string;
    match_id: string;
    sport: string;
    match_format: string;
    match_type: string;
    match_status: string;
    invited_by_id: string;
    invited_by_username: string | null;
    invited_by_name: string;
    expires_at: string | null;
    created_at: string;
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
    const [remaining, setRemaining] = useState("");

    useEffect(() => {
        if (!expiresAt) return;
        function update() {
            const diff = new Date(expiresAt!).getTime() - Date.now();
            if (diff <= 0) { setRemaining("Expired"); return; }
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setRemaining(`${m}m ${s}s`);
        }
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    if (!expiresAt) return null;
    const expired = remaining === "Expired";
    return (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            expired
                ? "bg-red-500/10 text-red-400 border border-red-500/30"
                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
        }`}>
            {expired ? "Expired" : `⏱ ${remaining}`}
        </span>
    );
}

export default function RefereeInvitesPage() {
    const router = useRouter();
    const [invites,    setInvites]    = useState<RefereeInvite[]>([]);
    const [loading,    setLoading]    = useState(true);
    const [responding, setResponding] = useState<string | null>(null);
    const [error,      setError]      = useState("");

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        fetch("/api/referee/my-invites", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                if (isUnauthorized(r.status)) { clearAuthSession(); router.replace("/login"); return null; }
                if (!r.ok) return null;
                return r.json();
            })
            .then(d => { if (d) setInvites(d.invites ?? []); })
            .catch(() => setError("Failed to load invites."))
            .finally(() => setLoading(false));
    }, [router]);

    async function handleRespond(inviteId: string, response: "accepted" | "declined") {
        const token = getAccessToken();
        if (!token) return;
        setResponding(inviteId);
        setError("");
        try {
            const res = await fetch(`/api/referee/invite/${inviteId}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ response }),
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            const data = await res.json();
            if (!res.ok) { setError(data.detail || "Failed to respond."); return; }

            if (response === "accepted" && data.match_id) {
                router.push(`/matches/${data.match_id}`);
            } else {
                setInvites(prev => prev.filter(inv => inv.id !== inviteId));
            }
        } catch {
            setError("Could not connect to server.");
        } finally {
            setResponding(null);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading invites...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
            <div className="fixed inset-0 pointer-events-none"
                style={{ backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />

            <NavBar backHref="/referee" backLabel="← Referee Dashboard" />

            <main className="relative z-10 max-w-2xl mx-auto w-full px-4 py-10 flex flex-col gap-6">

                <div>
                    <h1 className="text-2xl font-black">Referee Invites</h1>
                    <p className="text-zinc-500 text-sm mt-1">Pending invitations to referee a match.</p>
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                {invites.length === 0 ? (
                    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-10 text-center text-zinc-500 text-sm">
                        No pending referee invites.
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {invites.map(inv => {
                            const sport = SPORTS_META[inv.sport];
                            const expired = inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
                            return (
                                <div key={inv.id} className="bg-zinc-900 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-3xl">{sport?.emoji ?? "🏅"}</span>
                                            <div>
                                                <p className="font-bold text-sm">
                                                    {sport?.label ?? inv.sport} · {inv.match_format === "doubles" ? "Doubles" : "Singles"}
                                                </p>
                                                <p className="text-xs text-zinc-500 mt-0.5">
                                                    Invited by{" "}
                                                    <span className="text-zinc-300">
                                                        {inv.invited_by_username ? `@${inv.invited_by_username}` : inv.invited_by_name}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                        <ExpiryBadge expiresAt={inv.expires_at} />
                                    </div>

                                    {!expired ? (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleRespond(inv.id, "accepted")}
                                                disabled={responding === inv.id}
                                                className="flex-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-40"
                                            >
                                                {responding === inv.id ? "..." : "✓ Accept"}
                                            </button>
                                            <button
                                                onClick={() => handleRespond(inv.id, "declined")}
                                                disabled={responding === inv.id}
                                                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-40"
                                            >
                                                {responding === inv.id ? "..." : "✕ Decline"}
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-red-400 text-center">This invite has expired.</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
