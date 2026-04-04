"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";

// ── Bracket size advisor ──────────────────────────────────────────────────────

interface BracketInfo {
    idealCounts: number[];          // all valid sizes to show as chips
    description: string;            // one-liner explanation
    byeWarning: (n: number) => string | null; // null = no byes
    quickPick: (n: number) => number;         // snap to nearest valid
}

function getBracketInfo(format: string, groupCount: number): BracketInfo {
    const pow2 = [4, 8, 16, 32, 64];

    if (format === "single_elimination" || format === "double_elimination") {
        return {
            idealCounts: pow2,
            description: "Powers of 2 fill the bracket with zero byes.",
            byeWarning: (n) => {
                if (pow2.includes(n)) return null;
                const next = pow2.find(p => p >= n) ?? 64;
                return `${next - n} bye(s) will be added to reach ${next} slots.`;
            },
            quickPick: (n) => pow2.find(p => p >= n) ?? 64,
        };
    }

    if (format === "round_robin") {
        const counts = [4, 6, 8, 10, 12, 16, 20, 24, 32];
        return {
            idealCounts: counts,
            description: "Any size works — even numbers keep every round balanced (no byes).",
            byeWarning: (n) => n % 2 !== 0 ? "Odd count: one player gets a bye each round." : null,
            quickPick: (n) => {
                const even = n % 2 === 0 ? n : n + 1;
                return counts.includes(even) ? even : even;
            },
        };
    }

    if (format === "swiss") {
        const counts = [8, 12, 16, 20, 24, 32, 48, 64];
        return {
            idealCounts: counts,
            description: "Even numbers prevent forced byes. Rounds played ≈ ⌈log₂(players)⌉.",
            byeWarning: (n) => n % 2 !== 0 ? "Odd count: one player must receive a bye each round." : null,
            quickPick: (n) => {
                const even = n % 2 === 0 ? n : n + 1;
                return counts.find(c => c >= even) ?? 64;
            },
        };
    }

    if (format === "group_stage_knockout") {
        // advancing = groupCount × 2 must be a power of 2 → groupCount must be ∈ {1,2,4,8}
        // valid total = groupCount × playersPerGroup (3–6 players per group is typical)
        const gc = [2, 4, 8].includes(groupCount) ? groupCount : 4;
        const counts: number[] = [];
        for (let ppg = 3; ppg <= 8; ppg++) counts.push(gc * ppg);
        return {
            idealCounts: counts,
            description: `${gc} groups · each advancing 2 players → ${gc * 2}-team knockout bracket.`,
            byeWarning: (n) => {
                if (counts.includes(n)) return null;
                const ppg = n / gc;
                if (n % gc !== 0) {
                    const nearest = counts.find(c => c >= n) ?? counts[counts.length - 1];
                    return `${n} isn't evenly divisible into ${gc} groups. Nearest ideal: ${nearest}.`;
                }
                if (ppg < 3) return `Too few players per group (${ppg}). Aim for 3–6 per group.`;
                if (ppg > 8) return `Too many players per group (${ppg}). Consider more groups.`;
                return null;
            },
            quickPick: (n) => counts.find(c => c >= n) ?? counts[counts.length - 1],
        };
    }

    if (format === "pool_play") {
        // Valid totals: divisible by 4 (priority), 5, or 3 — producing ≥2 groups
        const validCounts: number[] = [];
        for (let n = 6; n <= 64; n++) {
            for (const gs of [4, 5, 3]) {
                if (n % gs === 0 && n / gs >= 2) { validCounts.push(n); break; }
            }
        }
        return {
            idealCounts: validCounts,
            description: "Equal-sized groups of 3, 4, or 5. Every team plays all others in their group. Priority: groups of 4.",
            byeWarning: (n) => {
                for (const gs of [4, 5, 3]) {
                    if (n % gs === 0 && n / gs >= 2) return null;
                }
                const next = validCounts.find(c => c > n);
                return `${n} entries cannot form equal groups of 3, 4, or 5. Nearest valid count: ${next ?? "—"}.`;
            },
            quickPick: (n) => validCounts.find(c => c >= n) ?? validCounts[validCounts.length - 1],
        };
    }

    // fallback
    return {
        idealCounts: pow2,
        description: "",
        byeWarning: () => null,
        quickPick: (n) => n,
    };
}

// All valid max-participant options for the dropdown
function getValidCounts(format: string, groupCount: number): number[] {
    if (format === "round_robin" || format === "swiss") {
        return [4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64];
    }
    if (format === "group_stage_knockout") {
        const gc = [2, 4, 8].includes(groupCount) ? groupCount : 4;
        const counts: number[] = [];
        for (let ppg = 3; ppg <= 8; ppg++) counts.push(gc * ppg);
        return counts;
    }
    if (format === "pool_play") {
        const counts: number[] = [];
        for (let n = 6; n <= 64; n++) {
            for (const gs of [4, 5, 3]) {
                if (n % gs === 0 && n / gs >= 2) { counts.push(n); break; }
            }
        }
        return counts;
    }
    return [4, 8, 16, 32, 64];
}

const SPORTS = [
    { value: "badminton",    label: "Badminton" },
    { value: "pickleball",   label: "Pickleball" },
    { value: "lawn_tennis",  label: "Lawn Tennis" },
    { value: "table_tennis", label: "Table Tennis" },
];
const FORMATS = [
    { value: "single_elimination",   label: "Single Elimination" },
    { value: "double_elimination",   label: "Double Elimination" },
    { value: "round_robin",          label: "Round Robin" },
    { value: "group_stage_knockout", label: "Group Stage + Knockout" },
    { value: "swiss",                label: "Swiss" },
    { value: "pool_play",            label: "Pool Play" },
];
const MATCH_FORMATS = [
    { value: "singles",       label: "Singles" },
    { value: "doubles",       label: "Doubles" },
    { value: "mixed_doubles", label: "Mixed Doubles" },
];
const DRAW_METHODS = [
    { value: "random",       label: "Random Draw",        desc: "Participants placed randomly into the bracket." },
    { value: "seeded",       label: "Seeded Draw",        desc: "Top-rated players are seeded and separated." },
    { value: "smart_tiered", label: "Smart Tiered Draw",  desc: "AI-assisted grouping balanced by rating and club." },
];

export default function NewTournamentPage() {
    const router = useRouter();

    const [name,          setName]          = useState("");
    const [description,   setDescription]   = useState("");
    const [sport,         setSport]         = useState("badminton");
    const [format,        setFormat]        = useState("single_elimination");
    const [matchFormat,   setMatchFormat]   = useState("singles");
    const [maxParticipants, setMaxParticipants] = useState("16");
    const [startsAt,      setStartsAt]      = useState("");
    const [endsAt,        setEndsAt]        = useState("");
    const [drawMethod,    setDrawMethod]    = useState("random");
    const [groupCount,    setGroupCount]    = useState("4");

    const effectiveFormat = drawMethod === "smart_tiered" ? "group_stage_knockout" : format;
    const bracketInfo = useMemo(
        () => getBracketInfo(effectiveFormat, parseInt(groupCount) || 4),
        [effectiveFormat, groupCount]
    );
    const validCounts = useMemo(
        () => getValidCounts(effectiveFormat, parseInt(groupCount) || 4),
        [effectiveFormat, groupCount]
    );
    const byeWarning = bracketInfo.byeWarning(parseInt(maxParticipants) || 16);
    const [balanceRating, setBalanceRating] = useState(true);
    const [separateClubs, setSeparateClubs] = useState(true);
    const [separateLocs,    setSeparateLocs]    = useState(false);
    const [minRating,       setMinRating]       = useState("");
    const [maxRating,       setMaxRating]       = useState("");
    const [requiresApproval, setRequiresApproval] = useState(false);
    const [knockoutBestOf,  setKnockoutBestOf]  = useState<1 | 3>(3);
    const [submitting,      setSubmitting]      = useState(false);
    const [error,           setError]           = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        if (!name.trim()) { setError("Tournament name is required."); return; }
        if (!sport)        { setError("Sport is required."); return; }

        setSubmitting(true);
        try {
            const res = await fetch("/api/tournaments", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name:             name.trim(),
                    description:      description.trim() || null,
                    sport,
                    format:           drawMethod === "smart_tiered" ? "group_stage_knockout" : format,
                    match_format:     matchFormat,
                    max_participants: parseInt(maxParticipants) || 16,
                    starts_at:        startsAt || null,
                    ends_at:          endsAt   || null,
                    draw_method:        drawMethod,
                    min_rating:         minRating ? parseFloat(minRating) : null,
                    max_rating:         maxRating ? parseFloat(maxRating) : null,
                    requires_approval:  requiresApproval,
                    knockout_best_of:   knockoutBestOf,
                    ...(drawMethod === "smart_tiered" ? {
                        group_count:        parseInt(groupCount) || 4,
                        balance_by_rating:  balanceRating,
                        separate_clubs:     separateClubs,
                        separate_locations: separateLocs,
                    } : {}),
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.detail || "Failed to create tournament.");
                return;
            }
            const d = await res.json();
            router.push(`/tournaments/${d.tournament.id}`);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <NavBar />
            <div className="max-w-lg mx-auto px-4 py-8">
                <div className="flex items-center gap-3 mb-6">
                    <Link href="/tournaments" className="text-zinc-400 hover:text-white transition-colors text-sm">
                        ← Tournaments
                    </Link>
                </div>

                <h1 className="text-2xl font-bold mb-6">Create Tournament</h1>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tournament Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. City Badminton Open 2025"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Optional description, rules, prizes..."
                            rows={3}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
                        />
                    </div>

                    {/* Sport */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1.5">Sport *</label>
                        <select
                            value={sport}
                            onChange={e => setSport(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                        >
                            {SPORTS.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Format row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tournament Format</label>
                            <select
                                value={format}
                                onChange={e => {
                                    setFormat(e.target.value);
                                    // snap maxParticipants to nearest valid for new format
                                    const gc = parseInt(groupCount) || 4;
                                    const info = getBracketInfo(e.target.value, gc);
                                    const snapped = info.quickPick(parseInt(maxParticipants) || 16);
                                    setMaxParticipants(String(snapped));
                                }}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                            >
                                {FORMATS.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Match Format</label>
                            <select
                                value={matchFormat}
                                onChange={e => setMatchFormat(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                            >
                                {MATCH_FORMATS.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Draw Method */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Draw Method</label>
                        <div className="grid grid-cols-1 gap-2">
                            {DRAW_METHODS.map(dm => (
                                <label
                                    key={dm.value}
                                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                        drawMethod === dm.value
                                            ? "border-white/30 bg-white/5"
                                            : "border-zinc-700 hover:border-zinc-600"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="drawMethod"
                                        value={dm.value}
                                        checked={drawMethod === dm.value}
                                        onChange={() => setDrawMethod(dm.value)}
                                        className="mt-0.5 accent-white"
                                    />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white">{dm.label}</span>
                                            {dm.value === "smart_tiered" && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">AI</span>
                                            )}
                                        </div>
                                        <span className="text-xs text-zinc-500">{dm.desc}</span>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Smart Tiered config */}
                        {drawMethod === "smart_tiered" && (
                            <div className="mt-3 bg-zinc-900 border border-cyan-500/15 rounded-xl p-4 space-y-3">
                                <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Smart Tiered Options</p>

                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1">Number of Groups</label>
                                    <select
                                        value={groupCount}
                                        onChange={e => {
                                            setGroupCount(e.target.value);
                                            const gc = parseInt(e.target.value) || 4;
                                            const info = getBracketInfo("group_stage_knockout", gc);
                                            setMaxParticipants(String(info.quickPick(parseInt(maxParticipants) || 16)));
                                        }}
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                                    >
                                        {[2,4,8].map(n => (
                                            <option key={n} value={n}>{n} groups</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-zinc-600 mt-1">Group counts of 2, 4, 8 produce clean knockout brackets.</p>
                                </div>

                                <div className="space-y-2">
                                    {[
                                        { label: "Balance groups by rating", value: balanceRating, set: setBalanceRating },
                                        { label: "Separate players from same club", value: separateClubs, set: setSeparateClubs },
                                        { label: "Separate players from same city", value: separateLocs, set: setSeparateLocs },
                                    ].map(opt => (
                                        <label key={opt.label} className="flex items-center gap-2.5 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={opt.value}
                                                onChange={e => opt.set(e.target.checked)}
                                                className="accent-cyan-400 w-4 h-4"
                                            />
                                            <span className="text-sm text-zinc-300">{opt.label}</span>
                                        </label>
                                    ))}
                                </div>

                                <p className="text-xs text-zinc-500">
                                    Smart Tiered will generate {groupCount} balanced groups then run a knockout stage.
                                    Tournament format is automatically set to Group Stage + Knockout.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Max participants + bracket advisor */}
                    <div className="space-y-2.5">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Max Participants</label>
                            <select
                                value={maxParticipants}
                                onChange={e => setMaxParticipants(e.target.value)}
                                className={`w-full bg-zinc-900 border rounded-xl px-4 py-3 text-white focus:outline-none transition-colors ${
                                    byeWarning ? "border-amber-500/50 focus:border-amber-400" : "border-zinc-700 focus:border-zinc-500"
                                }`}
                            >
                                {validCounts.map(n => {
                                    const warn = bracketInfo.byeWarning(n);
                                    return (
                                        <option key={n} value={n}>
                                            {n} players{warn ? " ⚠" : " ✓"}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        {/* Bracket size advisory panel */}
                        <div className={`rounded-xl border p-3.5 space-y-2.5 ${
                            byeWarning
                                ? "bg-amber-500/5 border-amber-500/20"
                                : "bg-emerald-500/5 border-emerald-500/20"
                        }`}>
                            <div className="flex items-start gap-2">
                                <span className="text-base leading-none mt-0.5">{byeWarning ? "⚠️" : "✅"}</span>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-semibold ${byeWarning ? "text-amber-400" : "text-emerald-400"}`}>
                                        {byeWarning ?? "Perfect bracket size — no byes needed."}
                                    </p>
                                    {bracketInfo.description && (
                                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{bracketInfo.description}</p>
                                    )}
                                </div>
                                {byeWarning && (
                                    <button
                                        type="button"
                                        onClick={() => setMaxParticipants(String(bracketInfo.quickPick(parseInt(maxParticipants) || 16)))}
                                        className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap"
                                    >
                                        Fix →
                                    </button>
                                )}
                            </div>

                            {/* Ideal count chips */}
                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-[10px] text-zinc-600 uppercase tracking-wide self-center mr-1">Ideal:</span>
                                {bracketInfo.idealCounts.map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setMaxParticipants(String(n))}
                                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                                            parseInt(maxParticipants) === n
                                                ? "bg-white text-zinc-950 border-white"
                                                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Start Date</label>
                            <input
                                type="datetime-local"
                                value={startsAt}
                                onChange={e => setStartsAt(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5">End Date</label>
                            <input
                                type="datetime-local"
                                value={endsAt}
                                onChange={e => setEndsAt(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-zinc-500 [color-scheme:dark]"
                            />
                        </div>
                    </div>

                    {/* Registration Settings */}
                    <div className="bg-zinc-900/60 border border-zinc-700/50 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-semibold text-zinc-300">Registration Settings</p>

                        {/* Rating range */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Min Rating</label>
                                <input
                                    type="number"
                                    min={0}
                                    placeholder="e.g. 1400"
                                    value={minRating}
                                    onChange={e => setMinRating(e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Max Rating</label>
                                <input
                                    type="number"
                                    min={0}
                                    placeholder="e.g. 2000"
                                    value={maxRating}
                                    onChange={e => setMaxRating(e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                                />
                            </div>
                        </div>

                        {/* Knockout Best-of (BO1 / BO3) — only for formats with a knockout stage */}
                        {["single_elimination", "double_elimination", "group_stage_knockout"].includes(effectiveFormat) && (
                            <div>
                                <div className="text-sm text-zinc-300 mb-2">Knockout Match Format</div>
                                <p className="text-xs text-zinc-500 mb-3">How many games does a player/team need to win to advance?</p>
                                <div className="flex gap-2">
                                    {([1, 3] as const).map(bo => (
                                        <button
                                            key={bo}
                                            type="button"
                                            onClick={() => setKnockoutBestOf(bo)}
                                            className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                                                knockoutBestOf === bo
                                                    ? "bg-white text-black border-white"
                                                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                                            }`}
                                        >
                                            {bo === 1 ? "Best of 1" : "Best of 3"}
                                            <div className={`text-[10px] font-normal mt-0.5 ${knockoutBestOf === bo ? "text-zinc-600" : "text-zinc-600"}`}>
                                                {bo === 1 ? "First to win 1 game" : "First to win 2 games"}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Requires approval toggle */}
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={requiresApproval}
                                onChange={e => setRequiresApproval(e.target.checked)}
                                className="w-4 h-4 accent-white"
                            />
                            <div>
                                <span className="text-sm text-zinc-300">Require organizer approval to join</span>
                                <p className="text-xs text-zinc-500">Players submit a request — you approve or reject each one.</p>
                            </div>
                        </label>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-zinc-100 disabled:opacity-50 transition-colors"
                    >
                        {submitting ? "Creating…" : "Create Tournament"}
                    </button>
                </form>
            </div>
        </div>
    );
}
