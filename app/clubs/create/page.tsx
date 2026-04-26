"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// ── Sport config ───────────────────────────────────────────────────────────────

const SPORTS = [
    {
        key:   "badminton",
        label: "Badminton",
        emoji: "🏸",
        tagline: "Disciplined indoor play · Fast-paced rally culture",
        surfaces: ["Wooden", "PVC Mat", "Synthetic", "Vinyl"],
        facilityCues: ["Non-marking shoes required", "Shuttle type policy (feather/nylon)", "Ceiling clearance matters"],
    },
    {
        key:   "pickleball",
        label: "Pickleball",
        emoji: "🥒",
        tagline: "Community-driven · Social & intergenerational play",
        surfaces: ["Concrete", "Asphalt", "Hardwood", "Acrylic", "PVC Mat", "Modular Tiles"],
        facilityCues: ["Open-play rotation friendly", "Noise-aware scheduling", "Court sharing rules"],
    },
    {
        key:   "lawn_tennis",
        label: "Lawn Tennis",
        emoji: "🎾",
        tagline: "Classic club culture · Structured & competitive",
        surfaces: ["Hard Court", "Clay", "Grass", "Synthetic Grass"],
        facilityCues: ["Court surface affects play style", "Formal booking etiquette", "Attire standard enforced"],
    },
    {
        key:   "table_tennis",
        label: "Table Tennis",
        emoji: "🏓",
        tagline: "Technical & fast · Training-centered indoor play",
        surfaces: ["Wood", "Rubber Mat", "Vinyl"],
        facilityCues: ["Table spacing matters", "Quick rotation sessions", "Air flow & lighting quality"],
    },
];

const CATEGORIES = [
    { key: "community",  label: "Community Club",         icon: "🤝" },
    { key: "school",     label: "School / University",    icon: "🏫" },
    { key: "private",    label: "Private Sports Club",    icon: "🔒" },
    { key: "municipal",  label: "Municipal Sports Center", icon: "🏛" },
    { key: "barangay",   label: "Barangay Sports Club",   icon: "🏘" },
    { key: "academy",    label: "Training Academy",       icon: "🎯" },
    { key: "venue",      label: "Tournament Venue",       icon: "🏆" },
];

// ── Address result type ────────────────────────────────────────────────────

interface AddressResult {
    id: number;
    full_address: string;
    city_municipality: string;
    province: string;
    region: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CreateClubPage() {
    const router = useRouter();

    const [step,           setStep]          = useState(1);
    const [sport,          setSport]         = useState("");
    const [name,           setName]          = useState("");
    const [category,       setCategory]      = useState("");
    const [membershipType, setMembershipType]= useState("open");
    const [description,    setDescription]   = useState("");
    const [address,        setAddress]       = useState("");
    const [loading,        setLoading]       = useState(false);
    const [error,          setError]         = useState("");

    // Address search state
    const [addrQuery,    setAddrQuery]    = useState("");
    const [addrResults,  setAddrResults]  = useState<AddressResult[]>([]);
    const [addrOpen,     setAddrOpen]     = useState(false);
    const [addrLoading,  setAddrLoading]  = useState(false);
    const addrRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (addrRef.current && !addrRef.current.contains(e.target as Node)) {
                setAddrOpen(false);
            }
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    // Debounced address search
    useEffect(() => {
        if (addrQuery.length < 2) { setAddrResults([]); setAddrOpen(false); return; }
        const token = getAccessToken();
        if (!token) return;
        setAddrLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/clubs/addresses?q=${encodeURIComponent(addrQuery)}&limit=12`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data: AddressResult[] = await res.json();
                    setAddrResults(data);
                    setAddrOpen(data.length > 0);
                }
            } finally {
                setAddrLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [addrQuery]);

    function selectAddress(result: AddressResult) {
        setAddress(result.full_address);
        setAddrQuery(result.full_address);
        setAddrOpen(false);
        setAddrResults([]);
    }

    function clearAddress() {
        setAddress("");
        setAddrQuery("");
        setAddrResults([]);
        setAddrOpen(false);
    }

    const selectedSport = SPORTS.find(s => s.key === sport);

    function nextStep() {
        if (step === 1 && !sport) { setError("Please select a sport."); return; }
        if (step === 2 && !name.trim()) { setError("Club name is required."); return; }
        setError("");
        setStep(s => s + 1);
    }

    function prevStep() { setError(""); setStep(s => s - 1); }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        try {
            const res = await fetch("/api/clubs", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name:            name.trim(),
                    description:     description.trim() || null,
                    sport:           sport || null,
                    category:        category || null,
                    membership_type: membershipType,
                    address:         (address || addrQuery).trim() || null,
                }),
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            const data = await res.json();
            if (!res.ok) { setError(data.detail || "Failed to create club."); return; }
            router.push(`/clubs/${data.club_id}/admin`);
        } catch {
            setError("Could not connect to server.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
            <div className="fixed inset-0 pointer-events-none"
                style={{ backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />

            <NavBar backHref="/clubs" backLabel="← Clubs" />

            <main className="relative z-10 flex-1 flex items-start justify-center px-4 py-10">
                <div className="w-full max-w-lg">

                    {/* Step indicator */}
                    <div className="flex items-center gap-2 mb-8">
                        {["Sport", "Identity", "Facility"].map((label, i) => {
                            const idx = i + 1;
                            const done   = idx < step;
                            const active = idx === step;
                            return (
                                <div key={label} className="flex items-center gap-2">
                                    <div className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
                                        active ? "bg-cyan-500 text-zinc-950" :
                                        done   ? "bg-zinc-700 text-zinc-300" :
                                                 "bg-zinc-900 text-zinc-600 border border-zinc-800"
                                    }`}>
                                        <span>{done ? "✓" : idx}</span>
                                        <span className="tracking-wide uppercase">{label}</span>
                                    </div>
                                    {i < 2 && <span className="text-zinc-700 text-xs">─</span>}
                                </div>
                            );
                        })}
                    </div>

                    {/* ── STEP 1: Sport Selection ── */}
                    {step === 1 && (
                        <div>
                            <div className="mb-6">
                                <h1 className="text-2xl font-black">Select Sport Type</h1>
                                <p className="text-zinc-500 text-sm mt-1">Your sport determines the facility setup and rules for your club.</p>
                            </div>

                            <div className="flex flex-col gap-3">
                                {SPORTS.map(s => (
                                    <button
                                        key={s.key}
                                        type="button"
                                        onClick={() => { setSport(s.key); setError(""); }}
                                        className={`text-left border rounded-2xl p-4 transition-all ${
                                            sport === s.key
                                                ? "border-cyan-500/60 bg-cyan-500/10"
                                                : "border-white/10 bg-zinc-900 hover:border-white/20"
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-2xl">{s.emoji}</span>
                                            <div className="flex-1">
                                                <p className="font-bold text-white">{s.label}</p>
                                                <p className="text-xs text-zinc-500">{s.tagline}</p>
                                            </div>
                                            {sport === s.key && (
                                                <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center text-xs text-zinc-950 font-bold shrink-0">✓</div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {s.facilityCues.map(cue => (
                                                <span key={cue} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                                                    {cue}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

                            <button onClick={nextStep}
                                className="w-full mt-6 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black py-3 rounded-xl transition-colors text-sm">
                                Continue →
                            </button>
                        </div>
                    )}

                    {/* ── STEP 2: Club Identity ── */}
                    {step === 2 && (
                        <form onSubmit={e => { e.preventDefault(); nextStep(); }}>
                            <div className="mb-6">
                                <h1 className="text-2xl font-black">Club Identity</h1>
                                <p className="text-zinc-500 text-sm mt-1">
                                    Define your {selectedSport?.label} club&apos;s name, category, and membership style.
                                </p>
                            </div>

                            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-5">

                                <div>
                                    <label className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2 block">Club Name *</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder={`e.g. Davao ${selectedSport?.label} Club`}
                                        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2 block">Club Category</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {CATEGORIES.map(c => (
                                            <button
                                                key={c.key}
                                                type="button"
                                                onClick={() => setCategory(category === c.key ? "" : c.key)}
                                                className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-left transition-all ${
                                                    category === c.key
                                                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                                                        : "border-white/10 text-zinc-400 hover:border-white/20"
                                                }`}
                                            >
                                                <span>{c.icon}</span>
                                                <span className="text-xs font-medium">{c.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2 block">Membership Access</label>
                                    <div className="flex gap-2">
                                        {[
                                            { key: "open",        label: "Open",       desc: "Anyone can join",  icon: "🌐" },
                                            { key: "invite_only", label: "Invite Only", desc: "Admin approves",  icon: "🔒" },
                                        ].map(m => (
                                            <button
                                                key={m.key}
                                                type="button"
                                                onClick={() => setMembershipType(m.key)}
                                                className={`flex-1 flex flex-col items-center gap-1 border rounded-xl py-3 px-2 transition-all ${
                                                    membershipType === m.key
                                                        ? "border-cyan-500/50 bg-cyan-500/10"
                                                        : "border-white/10 hover:border-white/20"
                                                }`}
                                            >
                                                <span className="text-lg">{m.icon}</span>
                                                <span className="text-xs font-bold text-white">{m.label}</span>
                                                <span className="text-[10px] text-zinc-500">{m.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2 block">Description</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Describe your club's purpose, level, and community..."
                                        rows={3}
                                        className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 resize-none"
                                    />
                                </div>
                            </div>

                            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={prevStep}
                                    className="px-5 py-3 border border-white/10 text-zinc-400 font-bold rounded-xl hover:border-white/20 transition-colors text-sm">
                                    ← Back
                                </button>
                                <button type="submit"
                                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black py-3 rounded-xl transition-colors text-sm">
                                    Continue →
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── STEP 3: Facility Details ── */}
                    {step === 3 && (
                        <form onSubmit={handleSubmit}>
                            <div className="mb-6">
                                <h1 className="text-2xl font-black">Facility Details</h1>
                                <p className="text-zinc-500 text-sm mt-1">
                                    Set the physical location and play environment for your {selectedSport?.label} club.
                                </p>
                            </div>

                            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-5">

                                <div>
                                    <label className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2 block">Address / Location</label>
                                    <div ref={addrRef} className="relative">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={addrQuery}
                                                onChange={e => {
                                                    setAddrQuery(e.target.value);
                                                    // If the user edits manually, allow free-text fallback
                                                    if (e.target.value !== address) setAddress("");
                                                }}
                                                onFocus={() => { if (addrResults.length > 0) setAddrOpen(true); }}
                                                placeholder="Search barangay, city, or province…"
                                                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                            />
                                            {addrQuery && (
                                                <button
                                                    type="button"
                                                    onClick={clearAddress}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-lg leading-none"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        {/* Status line */}
                                        <div className="flex items-center gap-2 mt-1.5 px-1">
                                            {addrLoading && (
                                                <span className="text-[10px] text-zinc-500 animate-pulse">Searching…</span>
                                            )}
                                            {address && !addrLoading && (
                                                <span className="text-[10px] text-emerald-400">✓ {address}</span>
                                            )}
                                            {!address && addrQuery.length >= 2 && !addrLoading && addrResults.length === 0 && (
                                                <span className="text-[10px] text-zinc-500">No matches — your typed text will be saved as-is.</span>
                                            )}
                                            {addrQuery.length === 0 && (
                                                <span className="text-[10px] text-zinc-600">Type at least 2 characters to search Philippine locations.</span>
                                            )}
                                        </div>

                                        {/* Dropdown */}
                                        {addrOpen && addrResults.length > 0 && (
                                            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-800 border border-white/10 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                {addrResults.map(r => (
                                                    <button
                                                        key={r.id}
                                                        type="button"
                                                        onClick={() => selectAddress(r)}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-zinc-700 transition-colors border-b border-white/5 last:border-0"
                                                    >
                                                        <p className="text-sm text-white font-medium leading-tight">{r.full_address}</p>
                                                        <p className="text-[10px] text-zinc-500 mt-0.5">{r.region}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {selectedSport && (
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 p-4">
                                        <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-3">
                                            {selectedSport.label} Facility Standards
                                        </p>
                                        <div className="flex flex-col gap-1.5 mb-3">
                                            {selectedSport.facilityCues.map(cue => (
                                                <div key={cue} className="flex items-center gap-2 text-xs text-zinc-400">
                                                    <span className="text-cyan-500">▸</span> {cue}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="pt-3 border-t border-zinc-700">
                                            <p className="text-xs text-zinc-500 font-medium mb-1.5">Typical Court Surfaces</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedSport.surfaces.map(s => (
                                                    <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 border border-zinc-600">
                                                        {s}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-[10px] text-zinc-600 mt-2">
                                                Court surfaces are configured per court after club creation.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Review summary */}
                                <div className="rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 space-y-2">
                                    <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2">Summary</p>
                                    <SummaryRow label="Sport"    value={`${selectedSport?.emoji} ${selectedSport?.label}`} />
                                    <SummaryRow label="Name"     value={name} />
                                    <SummaryRow label="Category" value={CATEGORIES.find(c => c.key === category)?.label ?? "—"} />
                                    <SummaryRow label="Access"   value={membershipType === "open" ? "🌐 Open" : "🔒 Invite Only"} />
                                    {(address || addrQuery) && <SummaryRow label="Address" value={address || addrQuery} />}
                                </div>
                            </div>

                            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={prevStep}
                                    className="px-5 py-3 border border-white/10 text-zinc-400 font-bold rounded-xl hover:border-white/20 transition-colors text-sm">
                                    ← Back
                                </button>
                                <button type="submit" disabled={loading}
                                    className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black py-3 rounded-xl transition-colors disabled:opacity-40 text-sm">
                                    {loading ? "Creating..." : "Create Club →"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">{label}</span>
            <span className="text-white font-medium">{value}</span>
        </div>
    );
}
