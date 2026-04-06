"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import NotificationModal from "@/components/NotificationModal";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

const SPORTS_META: Record<string, { label: string; emoji: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓" },
    badminton:    { label: "Badminton",    emoji: "🏸" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾" },
    table_tennis: { label: "Table Tennis", emoji: "🏓" },
};

const FORMATS = [
    { key: "singles",       label: "Singles"       },
    { key: "doubles",       label: "Doubles"       },
];

type MatchType = "friendly" | "book";

interface PlayerResult {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
}

export default function NewMatchPage() {
    const router = useRouter();
    const pathname = usePathname();
    const [userSports,  setUserSports]  = useState<string[]>([]);
    const [fetchingMe,  setFetchingMe]  = useState(true);
    const [matchType,   setMatchType]   = useState<MatchType>("friendly");
    const [sport,       setSport]       = useState("");
    const [format,      setFormat]      = useState("singles");
    const [scheduledAt, setScheduledAt] = useState("");
    const [loading,     setLoading]     = useState(false);
    const [modal, setModal] = useState<{ type: "success" | "error"; title: string; message: string } | null>(null);

    // Player search
    const [searchQuery,    setSearchQuery]   = useState("");
    const [searchResults,  setSearchResults] = useState<PlayerResult[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
    const [searching,      setSearching]     = useState(false);
    const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load user's registered sports on mount
    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        fetch("/api/players/me", {
            headers: { Authorization: `Bearer ${token}` },
        })
        .then(r => {
            if (isUnauthorized(r.status)) {
                clearAuthSession();
                router.replace("/login");
                return null;
            }
            if (!r.ok) throw new Error("Failed to load profile.");
            return r.json();
        })
        .then(data => {
            if (!data) return;
            const sports: string[] = (data.sports ?? []).map((s: { sport: string }) => s.sport);
            setUserSports(sports);
            if (sports.length === 1) setSport(sports[0]);
        })
        .catch(() => {
            setModal({ type: "error", title: "Connection Error", message: "Could not load your profile." });
        })
        .finally(() => setFetchingMe(false));
    }, []);

    useEffect(() => {
        if (selectedPlayer) return;
        if (searchQuery.length < 2) { setSearchResults([]); return; }

        if (searchRef.current) clearTimeout(searchRef.current);
        searchRef.current = setTimeout(async () => {
            setSearching(true);
            const token = getAccessToken();
            try {
                const res  = await fetch(`/api/players/search?q=${encodeURIComponent(searchQuery)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (isUnauthorized(res.status)) {
                    clearAuthSession();
                    router.replace("/login");
                    return;
                }
                if (!res.ok) return;
                const data = await res.json();
                setSearchResults(data.players ?? []);
            } catch { /* silent */ } finally {
                setSearching(false);
            }
        }, 350);
    }, [searchQuery, selectedPlayer]);

    function handleModalClose() {
        if (modal?.type === "success") router.push("/matches");
        setModal(null);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!sport) {
            setModal({ type: "error", title: "Missing Sport", message: "Please select a sport." });
            return;
        }
        if (!selectedPlayer) {
            setModal({ type: "error", title: "Missing Opponent", message: "Please search for and select an opponent." });
            return;
        }
        if (matchType === "book" && !scheduledAt) {
            setModal({ type: "error", title: "Missing Schedule", message: "Please set a date and time." });
            return;
        }

        setLoading(true);
        const token    = getAccessToken();
        if (!token) {
            router.replace("/login");
            return;
        }
        const endpoint = matchType === "friendly" ? "/matches/friendly" : "/matches/book";
        const body     = matchType === "friendly"
            ? { sport, match_format: format, opponent_id: selectedPlayer.id }
            : { sport, match_format: format, opponent_id: selectedPlayer.id, scheduled_at: scheduledAt };

        try {
            const res  = await fetch(`/api${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (isUnauthorized(res.status)) {
                clearAuthSession();
                router.replace("/login");
                return;
            }
            const data = await res.json();
            if (!res.ok) {
                setModal({ type: "error", title: "Failed", message: data.detail || "Something went wrong." });
                return;
            }
            setModal({
                type: "success",
                title: "Match Created!",
                message: matchType === "friendly"
                    ? "Friendly match created. Head to your matches to start playing."
                    : "Match booked successfully.",
            });
        } catch {
            setModal({ type: "error", title: "Connection Error", message: "Could not connect to the server." });
        } finally {
            setLoading(false);
        }
    }

    function handleLogoClick() {
        if (pathname === "/dashboard") {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            window.location.assign("/dashboard");
            return;
        }

        router.push("/dashboard");
    }

    const inputClass = "bg-zinc-800 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors placeholder-zinc-600";

    if (fetchingMe) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            <nav className="relative z-10 border-b border-white/10 bg-zinc-950/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
                <button
                    type="button"
                    onClick={handleLogoClick}
                    className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                    aria-label="Go to dashboard"
                >
                    <Image src="/logo.png" alt="iSMS" width={120} height={40} className="h-10 w-auto" />
                </button>
                <Link href="/matches" className="text-sm text-zinc-400 hover:text-white transition-colors">
                    ← My Matches
                </Link>
            </nav>

            <main className="relative z-10 max-w-md mx-auto px-6 py-10">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-black">New Match</h1>
                    <p className="text-zinc-500 text-sm mt-1">Invite a specific opponent to play.</p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="bg-zinc-900 border border-white/10 rounded-2xl p-8 flex flex-col gap-6"
                >
                    {/* Match type tabs */}
                    <div>
                        <label className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase mb-3 block">
                            Type
                        </label>
                        <div className="flex gap-2">
                            {(["friendly", "book"] as MatchType[]).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setMatchType(t)}
                                    className={`flex-1 text-sm font-semibold py-2.5 rounded-lg border transition-all ${
                                        matchType === t
                                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                                            : "border-white/10 text-zinc-400 hover:border-white/20"
                                    }`}
                                >
                                    {t === "friendly" ? "Friendly" : "Book"}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-zinc-600 mt-2">
                            {matchType === "friendly"
                                ? "Play immediately whenever both of you are ready."
                                : "Schedule a match for a specific date and time."}
                        </p>
                    </div>

                    {/* Sport */}
                    {userSports.length === 0 ? (
                        <p className="text-sm text-zinc-500">
                            You have no sports registered.{" "}
                            <Link href="/profile" className="text-cyan-400 hover:underline">
                                Add one in your profile →
                            </Link>
                        </p>
                    ) : userSports.length === 1 ? (
                        <div className="flex items-center gap-3 border border-cyan-500/30 bg-cyan-500/10 rounded-xl px-4 py-3">
                            <span className="text-xl">{SPORTS_META[userSports[0]]?.emoji}</span>
                            <span className="text-sm font-semibold text-cyan-400">{SPORTS_META[userSports[0]]?.label}</span>
                            <span className="text-xs text-zinc-500 ml-auto">your registered sport</span>
                        </div>
                    ) : (
                        <div>
                            <label className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase mb-3 block">
                                Sport
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {userSports.map(key => {
                                    const s = SPORTS_META[key];
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setSport(key)}
                                            className={`border rounded-xl p-3 text-left text-sm font-semibold transition-all ${
                                                sport === key
                                                    ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                                                    : "border-white/10 text-zinc-300 hover:border-white/20"
                                            }`}
                                        >
                                            {s?.emoji} {s?.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Format */}
                    <div>
                        <label className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase mb-3 block">
                            Format
                        </label>
                        <div className="flex gap-2">
                            {FORMATS.map(f => (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setFormat(f.key)}
                                    className={`flex-1 text-sm font-semibold py-2 rounded-lg border transition-all ${
                                        format === f.key
                                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                                            : "border-white/10 text-zinc-400 hover:border-white/20"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Opponent search */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
                            Opponent
                        </label>

                        {selectedPlayer ? (
                            /* Selected state */
                            <div className="flex items-center justify-between bg-zinc-800 border border-cyan-500/30 rounded-lg px-4 py-3">
                                <div>
                                    <span className="text-sm font-bold text-cyan-400">@{selectedPlayer.username}</span>
                                    <span className="text-xs text-zinc-500 ml-2">
                                        {selectedPlayer.first_name} {selectedPlayer.last_name}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedPlayer(null); setSearchQuery(""); setSearchResults([]); }}
                                    className="text-xs text-zinc-500 hover:text-white transition-colors"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            /* Search input */
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search by username..."
                                    className={inputClass + " w-full"}
                                />
                                {searching && (
                                    <span className="absolute right-3 top-3 text-xs text-zinc-500 animate-pulse">
                                        Searching...
                                    </span>
                                )}
                                {searchResults.length > 0 && (
                                    <div className="absolute w-full mt-1 bg-zinc-800 border border-white/10 rounded-lg overflow-hidden z-20">
                                        {searchResults.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedPlayer(p);
                                                    setSearchResults([]);
                                                }}
                                                className="w-full text-left px-4 py-3 hover:bg-zinc-700 transition-colors flex items-center justify-between"
                                            >
                                                <div>
                                                    <span className="text-sm font-semibold text-white">@{p.username}</span>
                                                    <span className="text-xs text-zinc-500 ml-2">
                                                        {p.first_name} {p.last_name}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                                    <p className="text-xs text-zinc-600 mt-1.5">No players found.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Scheduled date — book only */}
                    {matchType === "book" && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">
                                Scheduled Date & Time
                            </label>
                            <input
                                type="datetime-local"
                                value={scheduledAt}
                                onChange={e => setScheduledAt(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || userSports.length === 0}
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading
                            ? "Creating..."
                            : matchType === "friendly"
                            ? "Create Friendly Match"
                            : "Book Match"}
                    </button>
                </form>
            </main>

            {modal && (
                <NotificationModal
                    type={modal.type}
                    title={modal.title}
                    message={modal.message}
                    onClose={handleModalClose}
                />
            )}
        </div>
    );
}
