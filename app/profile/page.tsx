"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import NotificationModal from "@/components/NotificationModal";
import ImageUpload from "@/components/ImageUpload";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

const PSGC = "https://psgc.cloud/api";

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30"   },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/30" },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
};

const ALL_SPORTS = Object.keys(SPORTS_META);

const SKILL_BADGE: Record<string, { label: string; className: string }> = {
    Calibrating: { label: "Calibrating", className: "bg-zinc-700/60 text-zinc-400 border-zinc-600/40" },
    Beginner:    { label: "Beginner",    className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
    Intermediate:{ label: "Intermediate",className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    Advanced:    { label: "Advanced",    className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
    Expert:      { label: "Expert",      className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
    Elite:       { label: "Elite",       className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

function SkillBadge({ level }: { level: string }) {
    const meta = SKILL_BADGE[level] ?? SKILL_BADGE["Calibrating"];
    return (
        <span className={`text-xs font-semibold border rounded px-2 py-0.5 ${meta.className}`}>
            {meta.label}
        </span>
    );
}
const FORMAT_LABELS: Record<string, string> = {
    singles: "Singles",
    doubles: "Doubles",
    mixed_doubles: "Mixed",
};

interface Profile {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    region_code: string | null;
    province_code: string | null;
    city_mun_code: string | null;
    barangay_code: string | null;
}
interface Rating {
    sport: string;
    match_format: string;
    rating: number;
    rating_deviation: number;
    matches_played: number;
    wins: number;
    losses: number;
    rating_status: string;
    skill_level: string;
    calibration_matches_played: number;
    is_leaderboard_eligible: boolean;
}
interface Sport { sport: string }

export default function ProfilePage() {
    const router = useRouter();

    const [profile,  setProfile]  = useState<Profile | null>(null);
    const [sports,   setSports]   = useState<Sport[]>([]);
    const [ratings,  setRatings]  = useState<Rating[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [modal, setModal] = useState<{ type: "success" | "error"; title: string; message: string } | null>(null);

    const [locationNames, setLocationNames] = useState({ region: "", province: "", city: "", barangay: "" });
    const [editForm, setEditForm] = useState({ first_name: "", last_name: "" });

    const [regions,   setRegions]   = useState<any[]>([]);
    const [provinces, setProvinces] = useState<any[]>([]);
    const [cities,    setCities]    = useState<any[]>([]);
    const [barangays, setBarangays] = useState<any[]>([]);
    const [locEdit, setLocEdit] = useState({
        region_code: "", province_code: "", city_mun_code: "", barangay_code: "",
    });

    const [addingSport, setAddingSport] = useState(false);
    const [sportToAdd,  setSportToAdd]  = useState("");

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return null; }
            if (!res.ok) throw new Error();
            return res.json();
        })
        .then(async data => {
            if (!data) return;
            setProfile(data.profile);
            setSports(data.sports);
            setRatings(data.ratings);
            setEditForm({ first_name: data.profile.first_name, last_name: data.profile.last_name });
            setLocEdit({
                region_code:   data.profile.region_code   ?? "",
                province_code: data.profile.province_code ?? "",
                city_mun_code: data.profile.city_mun_code ?? "",
                barangay_code: data.profile.barangay_code ?? "",
            });
            await resolveLocationNames(data.profile);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function resolveLocationNames(p: Profile) {
        const names = { region: "", province: "", city: "", barangay: "" };
        try {
            await Promise.all([
                p.region_code   && fetch(`${PSGC}/regions/${p.region_code}`).then(r => r.json()).then(d => { names.region   = d.name ?? ""; }),
                p.province_code && fetch(`${PSGC}/provinces/${p.province_code}`).then(r => r.json()).then(d => { names.province = d.name ?? ""; }),
                p.city_mun_code && fetch(`${PSGC}/cities-municipalities/${p.city_mun_code}`).then(r => r.json()).then(d => { names.city = d.name ?? ""; }),
                p.barangay_code && fetch(`${PSGC}/barangays/${p.barangay_code}`).then(r => r.json()).then(d => { names.barangay = d.name ?? ""; }),
            ].filter(Boolean));
        } catch { /* silent */ }
        setLocationNames(names);
    }

    async function openEditMode() {
        setEditMode(true);
        const regs = await fetch(`${PSGC}/regions`).then(r => r.json());
        setRegions(regs);
        if (locEdit.region_code) {
            const provs = await fetch(`${PSGC}/regions/${locEdit.region_code}/provinces`).then(r => r.json());
            setProvinces(provs);
        }
        if (locEdit.province_code) {
            const cits = await fetch(`${PSGC}/provinces/${locEdit.province_code}/cities-municipalities`).then(r => r.json());
            setCities(cits);
        }
        if (locEdit.city_mun_code) {
            const brgys = await fetch(`${PSGC}/cities-municipalities/${locEdit.city_mun_code}/barangays`).then(r => r.json());
            setBarangays(brgys);
        }
    }

    async function handleRegionChange(code: string) {
        setLocEdit({ region_code: code, province_code: "", city_mun_code: "", barangay_code: "" });
        setProvinces([]); setCities([]); setBarangays([]);
        if (code) {
            const res = await fetch(`${PSGC}/regions/${code}/provinces`).then(r => r.json());
            setProvinces(res);
        }
    }
    async function handleProvinceChange(code: string) {
        setLocEdit(p => ({ ...p, province_code: code, city_mun_code: "", barangay_code: "" }));
        setCities([]); setBarangays([]);
        if (code) {
            const res = await fetch(`${PSGC}/provinces/${code}/cities-municipalities`).then(r => r.json());
            setCities(res);
        }
    }
    async function handleCityChange(code: string) {
        setLocEdit(p => ({ ...p, city_mun_code: code, barangay_code: "" }));
        setBarangays([]);
        if (code) {
            const res = await fetch(`${PSGC}/cities-municipalities/${code}/barangays`).then(r => r.json());
            setBarangays(res);
        }
    }

    async function handleSave() {
        setSaving(true);
        const token = getAccessToken();
        if (!token) { router.replace("/login"); setSaving(false); return; }
        try {
            const res = await fetch("/api/players/me", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...editForm, ...locEdit }),
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!res.ok) throw new Error();
            const freshRes = await fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } });
            if (isUnauthorized(freshRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            const fresh = await freshRes.json();
            setProfile(fresh.profile);
            await resolveLocationNames(fresh.profile);
            setEditMode(false);
            setModal({ type: "success", title: "Saved!", message: "Your profile has been updated." });
        } catch {
            setModal({ type: "error", title: "Save Failed", message: "Could not save your changes. Please try again." });
        } finally {
            setSaving(false);
        }
    }

    async function handleAddSport() {
        if (!sportToAdd) return;
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        try {
            const res = await fetch("/api/players/sports/register", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ sport: sportToAdd }),
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!res.ok) throw new Error();
            setSports(prev => [...prev, { sport: sportToAdd }]);
            setSportToAdd("");
            setAddingSport(false);
            setModal({ type: "success", title: "Sport Added!", message: `You are now registered for ${SPORTS_META[sportToAdd].label}.` });
        } catch {
            setModal({ type: "error", title: "Failed", message: "Could not register sport. Please try again." });
        }
    }

    function handleLogout() { clearAuthSession(); router.replace("/login"); }

    const registeredSportKeys = sports.map(s => s.sport);
    const unregisteredSports  = ALL_SPORTS.filter(s => !registeredSportKeys.includes(s));

    const totalMatches = ratings.reduce((s, r) => s + r.matches_played, 0);
    const totalWins    = ratings.reduce((s, r) => s + r.wins, 0);
    const winRate      = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
    const bestRating   = ratings.length > 0 ? Math.round(Math.max(...ratings.map(r => r.rating))) : 1500;

    const initials = profile
        ? `${profile.first_name[0] ?? ""}${profile.last_name[0] ?? ""}`.toUpperCase()
        : "?";

    const selectClass = "w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-40";
    const inputClass  = "bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors";

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
                <div className="text-zinc-500 text-sm animate-pulse">Loading profile...</div>
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

            <NavBar backHref="/dashboard" backLabel="← Dashboard" />

            <main className="relative z-10 max-w-5xl mx-auto px-6 py-10">
                <div className="grid lg:grid-cols-3 gap-6">

                    {/* ── Left column: Identity + Location ── */}
                    <div className="flex flex-col gap-4">

                        {/* Avatar + name card */}
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                                <ImageUpload
                                    currentUrl={profile?.avatar_url ?? null}
                                    uploadEndpoint="/api/upload/avatar"
                                    onSuccess={url => setProfile(p => p ? { ...p, avatar_url: url } : p)}
                                    shape="circle"
                                    size="md"
                                    placeholder={initials}
                                    label="Profile Photo"
                                    recommendedSize="400 × 400 px"
                                />
                                <div className="min-w-0">
                                    {editMode ? (
                                        <div className="flex flex-col gap-2">
                                            <input
                                                value={editForm.first_name}
                                                onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))}
                                                placeholder="First name"
                                                className={inputClass + " w-full"}
                                            />
                                            <input
                                                value={editForm.last_name}
                                                onChange={e => setEditForm(p => ({ ...p, last_name: e.target.value }))}
                                                placeholder="Last name"
                                                className={inputClass + " w-full"}
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <h1 className="text-lg font-black truncate">
                                                {profile?.first_name} {profile?.last_name}
                                            </h1>
                                            <p className="text-zinc-400 text-sm">@{profile?.username}</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {editMode ? (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditMode(false)}
                                        className="flex-1 text-sm py-2 border border-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="flex-1 text-sm py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {saving ? "Saving..." : "Save"}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={openEditMode}
                                    className="w-full text-sm py-2 border border-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
                                >
                                    Edit Profile
                                </button>
                            )}
                        </div>

                        {/* Location card */}
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
                            <p className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase mb-3">Location</p>

                            {editMode ? (
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-zinc-500">Region</label>
                                        <select value={locEdit.region_code} onChange={e => handleRegionChange(e.target.value)} className={selectClass}>
                                            <option value="">Select region...</option>
                                            {regions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-zinc-500">Province</label>
                                        <select value={locEdit.province_code} onChange={e => handleProvinceChange(e.target.value)} disabled={!locEdit.region_code} className={selectClass}>
                                            <option value="">Select province...</option>
                                            {provinces.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-zinc-500">City / Municipality</label>
                                        <select value={locEdit.city_mun_code} onChange={e => handleCityChange(e.target.value)} disabled={!locEdit.province_code} className={selectClass}>
                                            <option value="">Select city...</option>
                                            {cities.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-zinc-500">Barangay</label>
                                        <select value={locEdit.barangay_code} onChange={e => setLocEdit(p => ({ ...p, barangay_code: e.target.value }))} disabled={!locEdit.city_mun_code} className={selectClass}>
                                            <option value="">Select barangay...</option>
                                            {barangays.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ) : locationNames.region ? (
                                <div className="flex flex-col gap-1 text-sm text-zinc-300">
                                    {locationNames.barangay && <span className="text-xs text-zinc-400">Brgy. {locationNames.barangay}</span>}
                                    {locationNames.city     && <span>{locationNames.city}</span>}
                                    {locationNames.province && <span className="text-zinc-500 text-xs">{locationNames.province}</span>}
                                    {locationNames.region   && <span className="text-zinc-600 text-xs">{locationNames.region}</span>}
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-600 italic">No location set — edit your profile to add one.</p>
                            )}
                        </div>

                        {/* Quick links */}
                        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                            <Link href="/matches" className="text-sm text-zinc-400 hover:text-white flex items-center justify-between px-1 py-1 transition-colors">
                                <span>My Matches</span>
                                <span className="text-zinc-600">→</span>
                            </Link>
                            <Link href="/friends" className="text-sm text-zinc-400 hover:text-white flex items-center justify-between px-1 py-1 transition-colors">
                                <span>Friends</span>
                                <span className="text-zinc-600">→</span>
                            </Link>
                            <Link href="/leaderboard" className="text-sm text-zinc-400 hover:text-white flex items-center justify-between px-1 py-1 transition-colors">
                                <span>Leaderboard</span>
                                <span className="text-zinc-600">→</span>
                            </Link>
                            <div className="border-t border-white/10 mt-1 pt-2">
                                <button
                                    onClick={handleLogout}
                                    className="w-full text-sm text-zinc-600 hover:text-red-400 text-left px-1 py-1 transition-colors"
                                >
                                    Log out
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── Right column: Stats + Sports ── */}
                    <div className="lg:col-span-2 flex flex-col gap-5">

                        {/* Stats strip */}
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: "Matches",     value: totalMatches  },
                                { label: "Wins",        value: totalWins     },
                                { label: "Win Rate",    value: `${winRate}%` },
                                { label: "Best Rating", value: bestRating    },
                            ].map(s => (
                                <div key={s.label} className="bg-zinc-900 border border-white/10 rounded-xl p-4 text-center">
                                    <div className="text-xl font-black text-cyan-400">{s.value}</div>
                                    <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Sports & Ratings */}
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">Sports & Ratings</h2>
                                {unregisteredSports.length > 0 && !addingSport && (
                                    <button
                                        onClick={() => setAddingSport(true)}
                                        className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        + Add Sport
                                    </button>
                                )}
                            </div>

                            {addingSport && (
                                <div className="bg-zinc-900 border border-cyan-500/20 rounded-xl p-4 flex items-center gap-3">
                                    <select
                                        value={sportToAdd}
                                        onChange={e => setSportToAdd(e.target.value)}
                                        className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                    >
                                        <option value="">Select a sport...</option>
                                        {unregisteredSports.map(s => (
                                            <option key={s} value={s}>{SPORTS_META[s].emoji} {SPORTS_META[s].label}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleAddSport}
                                        disabled={!sportToAdd}
                                        className="text-sm px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold rounded-lg transition-colors disabled:opacity-40"
                                    >
                                        Register
                                    </button>
                                    <button
                                        onClick={() => { setAddingSport(false); setSportToAdd(""); }}
                                        className="text-sm text-zinc-500 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            {registeredSportKeys.length === 0 && (
                                <div className="bg-zinc-900 border border-white/10 rounded-xl p-10 text-center text-zinc-600 text-sm">
                                    No sports registered yet.
                                </div>
                            )}

                            {registeredSportKeys.map(sportKey => {
                                const meta = SPORTS_META[sportKey];
                                if (!meta) return null;
                                const fmts = ["singles", "doubles"];
                                const sportRatings = fmts.map(fmt => ({
                                    fmt,
                                    data: ratings.find(r => r.sport === sportKey && r.match_format === fmt),
                                }));
                                const totalSportMatches = sportRatings.reduce((s, r) => s + (r.data?.matches_played ?? 0), 0);

                                return (
                                    <div key={sportKey} className={`bg-zinc-900 border ${meta.border} rounded-2xl p-5`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{meta.emoji}</span>
                                                <div>
                                                    <h3 className={`font-bold ${meta.color}`}>{meta.label}</h3>
                                                    <p className="text-xs text-zinc-500">{totalSportMatches} matches played</p>
                                                </div>
                                            </div>
                                            <Link
                                                href="/matches/queue"
                                                className={`text-xs border ${meta.border} ${meta.bg} ${meta.color} px-3 py-1.5 rounded-lg font-semibold hover:opacity-80 transition-opacity`}
                                            >
                                                Play →
                                            </Link>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            {sportRatings.map(({ fmt, data }) => {
                                                const wr = data && data.matches_played > 0
                                                    ? Math.round((data.wins / data.matches_played) * 100)
                                                    : 0;
                                                const isCalibrating = data?.rating_status === "CALIBRATING";
                                                const calPlayed     = data?.calibration_matches_played ?? 0;
                                                const calTarget     = 10;
                                                const calPct        = Math.min(100, Math.round((calPlayed / calTarget) * 100));
                                                return (
                                                    <div key={fmt} className="flex flex-col bg-zinc-800/50 rounded-lg px-4 py-3 gap-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2 w-40">
                                                                <span className="text-xs text-zinc-400">{FORMAT_LABELS[fmt]}</span>
                                                                {data && <SkillBadge level={data.skill_level} />}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {isCalibrating && (
                                                                    <span className="text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-2 py-0.5">
                                                                        Calibrating
                                                                    </span>
                                                                )}
                                                                <span className={`text-sm font-black ${meta.color}`}>
                                                                    {data ? Math.round(data.rating) : 1500}
                                                                    {isCalibrating && <span className="text-xs font-normal text-zinc-500 ml-1">prov.</span>}
                                                                </span>
                                                            </div>
                                                            <span className="text-xs text-zinc-500">
                                                                {data?.matches_played ?? 0}G · {data?.wins ?? 0}W · {data?.losses ?? 0}L
                                                            </span>
                                                            <span className="text-xs text-zinc-400 w-10 text-right">{wr}%</span>
                                                        </div>
                                                        {isCalibrating && (
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex justify-between text-xs text-zinc-500">
                                                                    <span>Calibration: {calPlayed}/{calTarget} verified</span>
                                                                    <span>{calTarget - calPlayed} remaining</span>
                                                                </div>
                                                                <div className="w-full bg-zinc-700 rounded-full h-1.5">
                                                                    <div
                                                                        className="bg-amber-500 h-1.5 rounded-full transition-all"
                                                                        style={{ width: `${calPct}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            </main>

            {modal && (
                <NotificationModal
                    type={modal.type}
                    title={modal.title}
                    message={modal.message}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}
