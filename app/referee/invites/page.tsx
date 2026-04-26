"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";

const SPORTS_META: Record<string, { label: string; emoji: string; color: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-orange-400" },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-blue-400" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-lime-400" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-red-400" },
};

interface RefereeInvite {
    id: string;
    match_id: string;
    sport: string;
    match_format: string;
    match_type: string;
    match_status: string;
    invited_by_id: string;
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
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
            expired
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
        }`}>
            <span>{expired ? "⌛" : "⏱"}</span>
            <span>{remaining}</span>
        </div>
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
                router.push(`/matches/${data.match_id}/referee`);
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
            <div className="min-h-screen bg-[#050608] text-white flex flex-col items-center justify-center p-6 text-center">
                <div className="relative w-16 h-16 mb-6">
                    <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <h2 className="text-xl font-bold mb-2">Fetching Invitations</h2>
                <p className="text-zinc-500 text-sm max-w-xs">Scanning the network for pending officiating requests...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050608] text-white flex flex-col pb-24 sm:pb-10">
            {/* Grid background effect */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                    backgroundSize: "40px 40px",
                }}
            />

            <NavBar backHref="/referee" backLabel="Dashboard" title="Invites" />

            <main className="relative z-10 max-w-2xl mx-auto w-full px-4 sm:px-6 py-10 flex flex-col gap-8">

                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-1 bg-amber-500 rounded-full" />
                        <h1 className="text-3xl font-black tracking-tight uppercase">Invitations</h1>
                    </div>
                    <p className="text-zinc-500 text-sm font-medium">Officiating requests sent to you by match organizers.</p>
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm font-bold animate-in fade-in slide-in-from-top-2">
                        <span>⚠️</span> {error}
                    </div>
                )}

                {invites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-zinc-900/20 border border-dashed border-white/5 rounded-[2.5rem] animate-in fade-in zoom-in-95 duration-500">
                        <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center text-3xl mb-6 grayscale opacity-30 shadow-inner">
                            📬
                        </div>
                        <h3 className="text-xl font-bold text-zinc-300">Inbox is empty</h3>
                        <p className="text-sm text-zinc-500 mt-2 max-w-xs">New referee invites will appear here. Stay tuned for upcoming matches!</p>
                        <Link href="/referee" className="mt-8 px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all">
                            Back to Console
                        </Link>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {invites.map(inv => {
                            const sport = SPORTS_META[inv.sport];
                            const expired = inv.expires_at && new Date(inv.expires_at).getTime() < Date.now();
                            return (
                                <div key={inv.id} className="group bg-zinc-900/40 border border-white/5 rounded-[2rem] overflow-hidden transition-all duration-300 hover:bg-zinc-900/60 hover:border-amber-500/20">
                                    <div className="p-6">
                                        <div className="flex items-start justify-between gap-4 mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-[1.25rem] bg-zinc-800 flex items-center justify-center text-3xl shadow-inner border border-white/5 group-hover:scale-110 transition-transform">
                                                    {sport?.emoji ?? "🏅"}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg leading-tight">{sport?.label ?? inv.sport}</h3>
                                                    <p className="text-xs text-zinc-500 font-medium mt-1">
                                                        {inv.match_format === "doubles" ? "Doubles Match" : "Singles Match"}
                                                    </p>
                                                </div>
                                            </div>
                                            <ExpiryBadge expiresAt={inv.expires_at} />
                                        </div>

                                        <div className="bg-black/20 rounded-2xl p-4 border border-white/5 mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 text-xs font-black">
                                                    {inv.invited_by_name[0].toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 leading-none mb-1">Organizer</p>
                                                    <p className="text-sm font-bold text-zinc-200 truncate">
                                                        {inv.invited_by_name}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {!expired ? (
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => handleRespond(inv.id, "accepted")}
                                                    disabled={responding === inv.id}
                                                    className="flex-[2] h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-40 flex items-center justify-center gap-2"
                                                >
                                                    {responding === inv.id ? (
                                                        <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>✓ Accept</>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleRespond(inv.id, "declined")}
                                                    disabled={responding === inv.id}
                                                    className="flex-1 h-12 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-black text-xs uppercase tracking-widest rounded-xl transition-all border border-white/5 disabled:opacity-40 flex items-center justify-center"
                                                >
                                                    {responding === inv.id ? "..." : "Decline"}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="h-12 flex items-center justify-center bg-red-500/5 border border-red-500/10 rounded-xl">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-red-400 opacity-60">This request has expired</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                
                <p className="text-center text-[10px] text-zinc-600 font-medium uppercase tracking-[0.2em] mt-4">
                    Secure Officiating Network • v2.0
                </p>
            </main>
        </div>
    );
}
