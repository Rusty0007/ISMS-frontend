"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";
import Image from "next/image";
import ImageUpload from "@/components/ImageUpload";

// ── Sport surfaces ─────────────────────────────────────────────────────────

const SPORT_SURFACES: Record<string, string[]> = {
    badminton:    ["Wooden", "PVC Mat", "Synthetic", "Vinyl"],
    pickleball:   ["Concrete", "Asphalt", "Hardwood", "Acrylic", "PVC Mat", "Modular Tiles"],
    lawn_tennis:  ["Hard Court", "Clay", "Grass", "Synthetic Grass"],
    table_tennis: ["Wood", "Rubber Mat", "Vinyl"],
    default:      ["Wooden", "Concrete", "Acrylic", "Synthetic"],
};

// ── Types ──────────────────────────────────────────────────────────────────

interface ClubStats  { member_count: number; court_count: number; active_checkins: number; pending_bookings: number }
interface Member     { member_id: string; user_id: string; first_name: string | null; last_name: string | null; joined_at: string; is_admin: boolean; role?: string; duty_date?: string | null }
interface Court      { id: string; name: string; sport: string | null; surface: string | null; is_indoor: boolean | null; lighting: string | null; capacity: number | null; status: string; image_url?: string | null }
interface Booking    { id: string; court_id: string; court_name?: string; requested_by: string; requester_name?: string; scheduled_at: string; status: string; notes: string | null }
interface CheckedIn  { user_id: string; first_name: string | null; last_name: string | null; status: string; checked_in_at: string }
interface PendingMatch { match_id: string; sport: string; format: string; court_name: string | null; player1: string | null; player2: string | null; created_at: string }
interface LiveMatch  {
    match_id: string; sport: string; match_format: string; match_status: string;
    player1_id: string | null; player2_id: string | null; player3_id: string | null; player4_id: string | null;
    player1_name: string | null; player2_name: string | null;
    player3_name: string | null; player4_name: string | null;
    player1_matches_played: number | null; player2_matches_played: number | null;
    player3_matches_played: number | null; player4_matches_played: number | null;
    referee_id: string | null; referee_name: string | null; has_referee: boolean;
    scheduled_at: string | null; started_at: string | null;
    current_set: number; score: string;
}
interface LiveCourt  { court_id: string; court_name: string; sport: string | null; status: string; match: LiveMatch | null }

type Tab = "overview" | "members" | "courts" | "settings";

// ── HUD Helper Components ──────────────────────────────────────────────────

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <svg className={`absolute w-4 h-4 text-white/20 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M24 0H0V24" strokeLinecap="square" />
        </svg>
    );
}

function StatusBadge({ label, active = true, variant = "cyan" }: { label: string; active?: boolean; variant?: "cyan" | "emerald" | "amber" | "fuchsia" | "rose" }) {
    const variants = {
        cyan:    "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
        emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        amber:   "bg-amber-500/10 border-amber-500/20 text-amber-400",
        fuchsia: "bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400",
        rose:    "bg-rose-500/10 border-rose-500/20 text-rose-400",
    };
    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${variants[variant]}`}>
            <span className={`w-1 h-1 rounded-full bg-current ${active ? "animate-pulse shadow-[0_0_8px_currentColor]" : "opacity-40"}`} />
            {label}
        </div>
    );
}

function DataBar({ value, max = 100, color = "bg-cyan-500" }: { value: number; max?: number; color?: string }) {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div className="h-1 w-full bg-white/5 overflow-hidden rounded-full">
            <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ClubAdminPage() {
    const router  = useRouter();
    const params  = useParams();
    const clubId  = params.id as string;

    const [activeTab,     setActiveTab]    = useState<Tab>("overview");
    const [clubName,      setClubName]     = useState("");
    const [clubSport,     setClubSport]    = useState<string | null>(null);
    const [clubLogoUrl,   setClubLogoUrl]  = useState<string | null>(null);
    const [clubCoverUrl,  setClubCoverUrl] = useState<string | null>(null);
    const [approvalMode,  setApprovalMode] = useState<"auto" | "manual">("auto");
    const [openingTime,   setOpeningTime]  = useState("06:00");
    const [closingTime,   setClosingTime]  = useState("22:00");
    const [stats,         setStats]        = useState<ClubStats | null>(null);
    const [members,       setMembers]      = useState<Member[]>([]);
    const [courts,        setCourts]       = useState<Court[]>([]);
    const [bookings,      setBookings]     = useState<Booking[]>([]);
    const [,              setLive]         = useState<CheckedIn[]>([]);
    const [liveCourts,    setLiveCourts]   = useState<LiveCourt[]>([]);
    const [pendingMatches,setPendingMatches] = useState<PendingMatch[]>([]);
    const [loading,       setLoading]      = useState(true);
    const [,              setError]        = useState("");
    const [,              setUserProfile]  = useState<{ first_name: string | null; last_name: string | null; avatar_url: string | null } | null>(null);

    // Courts form
    const [newCourtName,     setNewCourtName]     = useState("");
    const [newCourtSurface,  setNewCourtSurface]  = useState("");
    const [newCourtIndoor,   setNewCourtIndoor]   = useState(true);
    const [newCourtLighting, setNewCourtLighting] = useState("good");
    const [newCourtCapacity, setNewCourtCapacity] = useState("");
    const [courtLoading,     setCourtLoading]     = useState(false);

    // Role editing state
    const [roleEdits, setRoleEdits] = useState<Record<string, { role: string; duty_date: string }>>({});

    function getToken() {
        const t = getAccessToken();
        if (!t) router.replace("/login");
        return t;
    }

    const fetchAll = useCallback(async () => {
        const token = getToken();
        if (!token) return;

        try {
            const [clubRes, statsRes, membersRes, courtsRes, bookingsRes, liveRes, liveCourtsRes, pendingRes, meRes] = await Promise.all([
                fetch(`/api/clubs/${clubId}`,                         { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/clubs/${clubId}/stats`,                   { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/clubs/${clubId}/members`,                 { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/clubs/${clubId}/courts`,          { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/clubs/${clubId}/courts/bookings`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/club%20check-ins/clubs/${clubId}/present`,{ headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/clubs/${clubId}/courts/live`,     { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/clubs/${clubId}/pending-matches`,         { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/players/me`,                              { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            if (isUnauthorized(clubRes.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (clubRes.status === 403) { router.replace("/clubs"); return; }

            if (clubRes.ok)       { const d = await clubRes.json();       setClubName(d.name); setClubSport(d.sport ?? null); setApprovalMode(d.approval_mode ?? "auto"); setClubLogoUrl(d.logo_url ?? null); setClubCoverUrl(d.cover_url ?? null); setOpeningTime(d.opening_time ?? "06:00"); setClosingTime(d.closing_time ?? "22:00"); }
            if (statsRes.ok)      { const d = await statsRes.json();      setStats(d); }
            if (membersRes.ok)    { const d = await membersRes.json();    setMembers(d); }
            if (courtsRes.ok)     { const d = await courtsRes.json();     setCourts(d.courts ?? d ?? []); }
            if (bookingsRes.ok)   { const d = await bookingsRes.json();   setBookings(d.bookings ?? d ?? []); }
            if (liveRes.ok)       { const d = await liveRes.json();       setLive(d.present ?? d ?? []); }
            if (liveCourtsRes.ok) { const d = await liveCourtsRes.json(); setLiveCourts(d.courts ?? []); }
            if (pendingRes.ok)    { const d = await pendingRes.json();    setPendingMatches(d.pending_matches ?? []); }
            if (meRes.ok)         { const d = await meRes.json();         setUserProfile(d.profile ?? null); }
        } catch {
            setError("Failed to load club data.");
        } finally {
            setLoading(false);
        }
    }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Actions ────────────────────────────────────────────────────────────

    async function handleRemoveMember(userId: string) {
        if (!confirm("Remove this member from the club?")) return;
        const token = getToken(); if (!token) return;
        const res = await fetch(`/api/clubs/${clubId}/members/${userId}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setMembers(prev => prev.filter(m => m.user_id !== userId));
    }

    async function handleSetRole(userId: string, role: string, duty_date?: string) {
        const token = getToken(); if (!token) return;
        const body: Record<string, string> = { role };
        if (duty_date) body.duty_date = duty_date;
        const res = await fetch(`/api/clubs/${clubId}/members/${userId}/role`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role, duty_date: duty_date ?? m.duty_date } : m));
            setRoleEdits(prev => { const n = { ...prev }; delete n[userId]; return n; });
        } else {
            const d = await res.json().catch(() => ({}));
            setError(d.detail || "Failed to update role.");
        }
    }

    async function handleApprovalModeToggle(mode: "auto" | "manual") {
        const token = getToken(); if (!token) return;
        const res = await fetch(`/api/clubs/${clubId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ approval_mode: mode }),
        });
        if (res.ok) setApprovalMode(mode);
        else {
            const d = await res.json().catch(() => ({}));
            setError(d.detail || "Failed to update approval mode.");
        }
    }

    async function handleSaveHours() {
        const token = getToken(); if (!token) return;
        await fetch(`/api/clubs/${clubId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ opening_time: openingTime, closing_time: closingTime }),
        });
    }

    async function handleMatchDecision(matchId: string, decision: "approve" | "reject", reason?: string) {
        const token = getToken(); if (!token) return;
        const body = decision === "reject" ? JSON.stringify({ reason: reason ?? "" }) : undefined;
        const res = await fetch(`/api/clubs/${clubId}/matches/${matchId}/${decision}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body,
        });
        if (res.ok) setPendingMatches(prev => prev.filter(m => m.match_id !== matchId));
        else {
            const d = await res.json().catch(() => ({}));
            setError(d.detail || `Failed to ${decision} match.`);
        }
    }

    async function handleAddCourt(e: React.FormEvent) {
        e.preventDefault();
        if (!newCourtName.trim()) return;
        const token = getToken(); if (!token) return;
        setCourtLoading(true);
        try {
            const res = await fetch(`/api/matches/clubs/${clubId}/courts`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name:      newCourtName.trim(),
                    sport:     clubSport || null,
                    surface:   newCourtSurface || null,
                    is_indoor: newCourtIndoor,
                    lighting:  newCourtLighting,
                    capacity:  newCourtCapacity ? parseInt(newCourtCapacity) : null,
                }),
            });
            if (res.ok) {
                setNewCourtName(""); setNewCourtSurface(""); setNewCourtIndoor(true);
                setNewCourtLighting("good"); setNewCourtCapacity("");
                const d = await res.json();
                setCourts(prev => [...prev, d.court ?? d]);
            }
        } finally { setCourtLoading(false); }
    }

    async function handleDeleteCourt(courtId: string) {
        if (!confirm("Delete this court?")) return;
        const token = getToken(); if (!token) return;
        const res = await fetch(`/api/matches/clubs/${clubId}/courts/${courtId}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setCourts(prev => prev.filter(c => c.id !== courtId));
    }

    async function handleBookingDecision(bookingId: string, decision: "approve" | "reject") {
        const token = getToken(); if (!token) return;
        const res = await fetch(`/api/matches/courts/bookings/${bookingId}/${decision}`, {
            method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
            setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: decision === "approve" ? "approved" : "rejected" } : b));
            if (stats) setStats({ ...stats, pending_bookings: Math.max(0, stats.pending_bookings - 1) });
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="min-h-screen bg-[#050b14] text-white flex items-center justify-center">
            <div className="text-cyan-500/50 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Initializing Command Console...</div>
        </div>
    );

    const pendingBookings = bookings.filter(b => b.status === "pending");
    const liveCourtsOccupied = liveCourts.filter(c => c.status === "occupied").length;
    const liveCourtsAvail    = liveCourts.filter(c => c.status === "available").length;
    const sportLabel = clubSport ? clubSport.replace(/_/g, " ") : null;

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            </div>

            <NavBar hideLogo backHref="/dashboard" backLabel="DASHBOARD" />

            <main className="relative z-10 max-w-[1600px] mx-auto px-4 py-8 pb-32 pt-24">
                
                {/* ── Hero Header ── */}
                <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl group mb-8">
                    <HUDCorner className="top-4 left-4" />
                    <HUDCorner className="top-4 right-4 rotate-90" />
                    
                    <div className="absolute inset-0 opacity-20 grayscale transition-all group-hover:opacity-30 group-hover:grayscale-0">
                        {clubCoverUrl ? (
                            <Image src={clubCoverUrl} alt="Cover" fill className="object-cover" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[#0a111a] via-cyan-950/20 to-[#0a111a]" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-r from-[#050b14] via-[#050b14]/90 to-transparent" />
                    </div>

                    <div className="relative p-8 lg:p-12 flex flex-col lg:flex-row items-center justify-between gap-12">
                        <div className="flex flex-col md:flex-row items-center md:items-end gap-8">
                            {/* Logo */}
                            <div className="relative group/logo">
                                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-50" />
                                <div className="relative w-32 h-32 rounded-[2rem] border-2 border-white/10 overflow-hidden bg-[#0a111a] shadow-2xl">
                                    {clubLogoUrl ? (
                                        <Image src={clubLogoUrl} alt="Logo" fill className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-5xl bg-cyan-500/5">🏟️</div>
                                    )}
                                </div>
                                <div className="absolute -bottom-2 -right-2">
                                    <ImageUpload
                                        currentUrl={clubLogoUrl}
                                        uploadEndpoint={`/api/upload/club/${clubId}/logo`}
                                        onSuccess={url => setClubLogoUrl(url)}
                                        shape="circle" size="sm" placeholder="📷" label="Logo"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4 text-center md:text-left">
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                                    <StatusBadge label="Facility Command" variant="cyan" />
                                    {sportLabel && <StatusBadge label={sportLabel} variant="fuchsia" />}
                                    <StatusBadge label={approvalMode === "auto" ? "Auto-Deploy" : "Manual Approval"} variant={approvalMode === "auto" ? "emerald" : "amber"} />
                                </div>
                                
                                <div>
                                    <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-white uppercase italic">
                                        {clubName || "Facility HQ"}
                                    </h1>
                                    <p className="text-lg text-slate-400 font-light mt-1">
                                        Operational Console for <span className="text-white italic font-medium">Strategic Facility Management</span>.
                                    </p>
                                </div>

                                {stats && (
                                    <div className="flex items-center justify-center md:justify-start gap-6 pt-2">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Garrison Size</span>
                                            <span className="text-lg font-black text-white italic">{stats.member_count} Members</span>
                                        </div>
                                        <div className="w-px h-8 bg-white/10" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Sectors</span>
                                            <span className="text-lg font-black text-white italic">{stats.court_count} Courts</span>
                                        </div>
                                        <div className="w-px h-8 bg-white/10" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Presence</span>
                                            <span className="text-lg font-black text-emerald-400 italic">{stats.active_checkins} Operators</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col items-center lg:items-end gap-4">
                            <div className="flex items-center gap-3">
                                <Link href={`/clubs/${clubId}`} className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-white/20 transition-all">
                                   View Public Page
                                </Link>
                                <button onClick={() => setActiveTab("settings")} className="px-6 py-3 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl">
                                   Club Settings
                                </button>                            </div>
                            <div className="relative">
                                <ImageUpload
                                    currentUrl={clubCoverUrl}
                                    uploadEndpoint={`/api/upload/club/${clubId}/cover`}
                                    onSuccess={url => setClubCoverUrl(url)}
                                    shape="rect" size="sm" placeholder="🖼️ Update Banner" label="Banner"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Navigation Tabs ── */}
                <div className="flex items-center gap-2 bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-2xl p-1 mb-8 self-start">
                    {(["overview", "members", "courts", "settings"] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                                activeTab === tab
                                    ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                                    : "text-slate-500 hover:text-white"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* ── Tab Content ── */}
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    
                    {activeTab === "overview" && (
                        <>
                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <TacticalStatCard 
                                    label="Operational Capacity" value={stats?.court_count || 0} unit="COURTS"
                                    sub={`${liveCourtsOccupied} DEPLOYED · ${liveCourtsAvail} READY`}
                                    progress={(liveCourtsOccupied / (stats?.court_count || 1)) * 100}
                                    color="cyan" icon="🏟️"
                                />
                                <TacticalStatCard 
                                    label="Network Strength" value={stats?.member_count || 0} unit="MEMBERS"
                                    sub="ACTIVE FACILITY OPERATORS"
                                    progress={100}
                                    color="fuchsia" icon="👥"
                                />
                                <TacticalStatCard 
                                    label="Field Activity" value={stats?.active_checkins || 0} unit="PRESENT"
                                    sub="OPERATORS DETECTED ON-SITE"
                                    progress={(stats?.active_checkins || 0) > 0 ? 100 : 0}
                                    color="emerald" icon="⚡"
                                />
                                <TacticalStatCard 
                                    label="Pending Logistics" value={stats?.pending_bookings || 0} unit="WAITING"
                                    sub="LOGISTICS REQUIRING APPROVAL"
                                    progress={(stats?.pending_bookings || 0) > 0 ? 100 : 0}
                                    color="amber" icon="📡"
                                    alert={(stats?.pending_bookings || 0) > 0}
                                />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Live Tactical Map (Courts) */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between px-2">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Real-Time Intel</p>
                                            <h2 className="text-2xl font-black uppercase italic tracking-tight">Tactical Court Map</h2>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {liveCourts.map(court => (
                                            <LiveCourtCard key={court.court_id} court={court} />
                                        ))}
                                    </div>
                                </section>

                                {/* Logistics & Approvals */}
                                <section className="space-y-8">
                                    {/* Match Approvals */}
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between px-2">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500">Authorization Hub</p>
                                                <h2 className="text-2xl font-black uppercase italic tracking-tight">Match Approvals</h2>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleApprovalModeToggle(approvalMode === "auto" ? "manual" : "auto")}
                                                    className={`px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
                                                        approvalMode === "auto" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                                    }`}
                                                >
                                                    Mode: {approvalMode}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] overflow-hidden">
                                            {pendingMatches.length === 0 ? (
                                                <div className="p-12 text-center space-y-4">
                                                    <span className="text-4xl block opacity-20">📡</span>
                                                    <p className="text-xs font-black text-slate-600 uppercase tracking-[0.2em]">No Matches Awaiting Authorization</p>
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-white/5">
                                                    {pendingMatches.map(m => (
                                                        <PendingMatchCard key={m.match_id} match={m} 
                                                            onApprove={() => handleMatchDecision(m.match_id, "approve")}
                                                            onReject={reason => handleMatchDecision(m.match_id, "reject", reason)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Court Bookings */}
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between px-2">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-orange-500">Logistics Queue</p>
                                                <h2 className="text-2xl font-black uppercase italic tracking-tight">Court Bookings</h2>
                                            </div>
                                        </div>
                                        <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] overflow-hidden">
                                            {pendingBookings.length === 0 ? (
                                                <div className="p-12 text-center space-y-4">
                                                    <span className="text-4xl block opacity-20">📅</span>
                                                    <p className="text-xs font-black text-slate-600 uppercase tracking-[0.2em]">No Pending Logistics Requests</p>
                                                </div>
                                            ) : (
                                                <div className="divide-y divide-white/5">
                                                    {pendingBookings.map(b => (
                                                        <div key={b.id} className="p-6 flex items-center justify-between gap-6 hover:bg-white/[0.02] transition-colors">
                                                            <div className="space-y-1">
                                                                <p className="text-sm font-black text-white uppercase italic">{b.requester_name || "Unknown Operator"}</p>
                                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                                    {b.court_name} · {new Date(b.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={() => handleBookingDecision(b.id, "approve")} className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">Approve</button>
                                                                <button onClick={() => handleBookingDecision(b.id, "reject")} className="px-4 py-2 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all">Reject</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </>
                    )}

                    {activeTab === "members" && (
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Personnel Intel</p>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tight">Facility Operators</h2>
                                </div>
                                <button className="px-6 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-all">
                                    + Recruit Member
                                </button>
                            </div>
                            
                            <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/5">
                                                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Operator</th>
                                                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Designation</th>
                                                <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Enlistment Date</th>
                                                <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {members.map(m => {
                                                const edit = roleEdits[m.user_id];
                                                const currentRole = edit?.role ?? m.role ?? "member";
                                                const currentDuty = edit?.duty_date ?? m.duty_date ?? "";
                                                return (
                                                    <tr key={m.member_id} className="hover:bg-white/[0.02] transition-colors group">
                                                        <td className="px-8 py-5">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex items-center justify-center text-lg font-black text-cyan-500">
                                                                    {(m.first_name?.[0] || m.user_id[0])?.toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-black text-white uppercase italic">{[m.first_name, m.last_name].filter(Boolean).join(" ") || "Unknown"}</p>
                                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{m.user_id.slice(0, 8)}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5">
                                                            <div className="flex items-center gap-2">
                                                                <select value={currentRole}
                                                                    onChange={e => setRoleEdits(prev => ({ ...prev, [m.user_id]: { role: e.target.value, duty_date: currentDuty } }))}
                                                                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-400 focus:outline-none focus:border-cyan-500/40"
                                                                >
                                                                    <option value="member">Member</option>
                                                                    <option value="assistant">Assistant</option>
                                                                    <option value="admin">Admin</option>
                                                                </select>
                                                                {currentRole === "assistant" && (
                                                                    <input type="date" value={currentDuty}
                                                                        onChange={e => setRoleEdits(prev => ({ ...prev, [m.user_id]: { role: currentRole, duty_date: e.target.value } }))}
                                                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-cyan-500/40"
                                                                    />
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                            {new Date(m.joined_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                                                        </td>
                                                        <td className="px-8 py-5">
                                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button onClick={() => handleSetRole(m.user_id, currentRole, currentRole === "assistant" ? currentDuty : undefined)}
                                                                    className="px-4 py-2 rounded-lg bg-cyan-500 text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                                                                    Update
                                                                </button>
                                                                {!m.is_admin && (
                                                                    <button onClick={() => handleRemoveMember(m.user_id)}
                                                                        className="px-4 py-2 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all">
                                                                        Terminate
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    )}

                    {activeTab === "courts" && (
                        <section className="space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">Sector Control</p>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tight">Facility Sectors</h2>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {courts.map(court => (
                                    <CourtAdminCard key={court.id} court={court} 
                                        onDelete={() => handleDeleteCourt(court.id)}
                                        onUpdateImage={url => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, image_url: url } : c))}
                                    />
                                ))}

                                {/* Add Court Sector */}
                                <article className="bg-[#0a111a]/60 border border-white/5 border-dashed rounded-[2rem] p-8 flex flex-col gap-6 hover:border-cyan-500/30 transition-all group">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">New Sector</p>
                                        <h3 className="text-xl font-black uppercase italic tracking-tight text-white/40 group-hover:text-white transition-colors">Deploy Sector</h3>
                                    </div>

                                    <form onSubmit={handleAddCourt} className="flex flex-col gap-4">
                                        <input type="text" value={newCourtName} onChange={e => setNewCourtName(e.target.value)}
                                            placeholder="SECTOR DESIGNATION (e.g. COURT 01)" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white placeholder-slate-600 outline-none focus:border-cyan-500/40" />
                                        
                                        <div className="space-y-2">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 px-1">Surface Protocol</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(SPORT_SURFACES[clubSport ?? ""] ?? SPORT_SURFACES["default"]).map(s => (
                                                    <button key={s} type="button" onClick={() => setNewCourtSurface(newCourtSurface === s ? "" : s)}
                                                        className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${newCourtSurface === s ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border-white/5 bg-white/5 text-slate-500 hover:text-white"}`}>{s}</button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            {[{ v: true, l: "Indoor" }, { v: false, l: "Outdoor" }].map(o => (
                                                <button key={String(o.v)} type="button" onClick={() => setNewCourtIndoor(o.v)}
                                                    className={`flex-1 py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${newCourtIndoor === o.v ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border-white/5 bg-white/5 text-slate-500"}`}>{o.l}</button>
                                            ))}
                                        </div>

                                        <input type="number" min={1} value={newCourtCapacity} onChange={e => setNewCourtCapacity(e.target.value)}
                                            placeholder="SQUAD CAPACITY (OPTIONAL)" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white placeholder-slate-600 outline-none focus:border-cyan-500/40" />
                                        
                                        <button type="submit" disabled={courtLoading || !newCourtName.trim()}
                                            className="w-full py-3 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50">
                                            {courtLoading ? "Processing..." : "Deploy Sector"}
                                        </button>
                                    </form>
                                </article>
                            </div>
                        </section>
                    )}

                    {activeTab === "settings" && (
                        <section className="max-w-4xl space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500">HQ Configuration</p>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tight">Facility Protocols</h2>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Operating Hours */}
                                    <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] p-8 space-y-6">
                                        <div className="space-y-1">
                                            <h3 className="text-lg font-black uppercase italic text-white">Operational Window</h3>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active hours for open play deployments.</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Engagement Start</label>
                                                <input type="time" value={openingTime} onChange={e => setOpeningTime(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/40 font-mono" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1">Engagement End</label>
                                                <input type="time" value={closingTime} onChange={e => setClosingTime(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/40 font-mono" />
                                            </div>
                                        </div>
                                        <button onClick={handleSaveHours}
                                            className="w-full py-3 rounded-xl bg-cyan-500 text-black text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-cyan-900/20">
                                            Update Protocols
                                        </button>
                                    </div>

                                    {/* Authorization Mode */}
                                    <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] p-8 space-y-6">
                                        <div className="space-y-1">
                                            <h3 className="text-lg font-black uppercase italic text-white">Authorization System</h3>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Deployment approval requirements.</p>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            {(["auto", "manual"] as const).map(mode => (
                                                <button key={mode} onClick={() => handleApprovalModeToggle(mode)}
                                                    className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                                                        approvalMode === mode 
                                                            ? "bg-cyan-500/10 border-cyan-500/40" 
                                                            : "bg-white/5 border-white/5 hover:border-white/20"
                                                    }`}
                                                >
                                                    <div className="text-left">
                                                        <p className={`text-xs font-black uppercase tracking-widest ${approvalMode === mode ? "text-cyan-400" : "text-white"}`}>{mode} Deployment</p>
                                                        <p className="text-[10px] text-slate-500 mt-0.5">{mode === "auto" ? "Instant match assignment" : "Requires admin validation"}</p>
                                                    </div>
                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${approvalMode === mode ? "border-cyan-500" : "border-slate-700"}`}>
                                                        {approvalMode === mode && <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Banner & Logo Settings */}
                                <div className="bg-[#0a111a]/60 border border-white/5 rounded-[2.5rem] p-10 space-y-8">
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-black uppercase italic text-white">Visual Identity</h3>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Facility branding and visual presence.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] px-1">Facility Insignia</p>
                                            <div className="bg-[#050b14] p-6 rounded-[2rem] border border-white/5 flex flex-col items-center">
                                                <ImageUpload currentUrl={clubLogoUrl} uploadEndpoint={`/api/upload/club/${clubId}/logo`} onSuccess={url => setClubLogoUrl(url)} shape="circle" size="lg" placeholder="🏟️" label="Logo" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] px-1">Theater Backdrop</p>
                                            <div className="bg-[#050b14] p-6 rounded-[2rem] border border-white/5">
                                                <ImageUpload currentUrl={clubCoverUrl} uploadEndpoint={`/api/upload/club/${clubId}/cover`} onSuccess={url => setClubCoverUrl(url)} shape="rect" size="lg" placeholder="🖼️" label="Cover" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}

// ── Tactical Sub-components ──────────────────────────────────────────────────

function TacticalStatCard({ label, value, unit, sub, progress, color, icon, alert }: {
    label: string; value: number | string; unit: string; sub: string;
    progress: number; color: "cyan" | "fuchsia" | "emerald" | "amber"; icon: string; alert?: boolean;
}) {
    const colors = {
        cyan:    "text-cyan-400 border-cyan-500/20 bg-cyan-500/10 shadow-cyan-900/20",
        fuchsia: "text-fuchsia-400 border-fuchsia-500/20 bg-fuchsia-500/10 shadow-fuchsia-900/20",
        emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10 shadow-emerald-900/20",
        amber:   "text-amber-400 border-amber-500/20 bg-amber-500/10 shadow-amber-900/20",
    };
    const progressColors = {
        cyan: "bg-cyan-500", fuchsia: "bg-fuchsia-500", emerald: "bg-emerald-500", amber: "bg-amber-500"
    };

    return (
        <div className={`relative overflow-hidden rounded-[2rem] border p-6 space-y-4 transition-all hover:-translate-y-1 shadow-2xl ${alert ? "border-amber-500/40 bg-amber-500/10" : "border-white/5 bg-[#0a111a]/80"}`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                <span className={`w-8 h-8 rounded-xl flex items-center justify-center border text-sm ${colors[color]}`}>{icon}</span>
            </div>
            <div>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black italic text-white tracking-tighter">{value}</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${colors[color].split(' ')[0]}`}>{unit}</span>
                </div>
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-1">{sub}</p>
            </div>
            <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-slate-700">
                    <span>STATUS: {progress >= 100 ? "OPTIMAL" : "DEPLOYING"}</span>
                    <span>{Math.round(progress)}%</span>
                </div>
                <DataBar value={progress} max={100} color={progressColors[color]} />
            </div>
        </div>
    );
}

function LiveCourtCard({ court }: { court: LiveCourt }) {
    const m = court.match;
    const isOccupied = court.status === "occupied";
    
    return (
        <article className={`relative overflow-hidden rounded-[2rem] border p-6 space-y-5 transition-all ${
            isOccupied ? "border-cyan-500/30 bg-cyan-500/5 shadow-2xl shadow-cyan-950/20" : "border-white/5 bg-[#0a111a]/60"
        }`}>
            <div className="flex items-start justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isOccupied ? "bg-cyan-400 animate-pulse" : "bg-emerald-400"} shadow-[0_0_8px_currentColor]`} />
                        <h4 className="text-lg font-black uppercase italic tracking-tight text-white">{court.court_name}</h4>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{court.sport?.replace(/_/g, ' ') || "GENERAL USE"}</p>
                </div>
                <StatusBadge label={court.status} variant={isOccupied ? "cyan" : "emerald"} active={isOccupied} />
            </div>

            {m ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between bg-white/5 rounded-2xl p-4 border border-white/5">
                        <div className="flex flex-col items-center flex-1 min-w-0">
                            <span className="text-xs font-black text-white uppercase italic truncate w-full text-center">{m.player1_name || "?"}</span>
                            {m.player3_name && <span className="text-[9px] font-bold text-slate-500 uppercase truncate w-full text-center">{m.player3_name}</span>}
                        </div>
                        <div className="px-4 py-1.5 bg-cyan-500 text-black rounded-xl text-lg font-black italic tracking-tighter shadow-lg shadow-cyan-900/20 mx-4">
                            {m.score || "0-0"}
                        </div>
                        <div className="flex flex-col items-center flex-1 min-w-0">
                            <span className="text-xs font-black text-white uppercase italic truncate w-full text-center">{m.player2_name || "?"}</span>
                            {m.player4_name && <span className="text-[9px] font-bold text-slate-500 uppercase truncate w-full text-center">{m.player4_name}</span>}
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                        <span className="text-cyan-500">{m.match_format?.replace(/_/g, ' ')}</span>
                        <span className="text-slate-600">SET {m.current_set}</span>
                    </div>
                    <Link href={`/matches/${m.match_id}`} className="w-full py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-[10px] font-black uppercase tracking-widest text-center hover:bg-cyan-500/10 transition-all block">
                        Watch Live →
                    </Link>
                </div>
            ) : (
                <div className="h-[134px] flex flex-col items-center justify-center text-center space-y-3 border border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                    <span className="text-2xl opacity-20">🍃</span>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">Sector Available for Deployment</p>
                </div>
            )}
        </article>
    );
}

function PendingMatchCard({ match, onApprove, onReject }: {
    match: PendingMatch;
    onApprove: () => void;
    onReject: (reason: string) => void;
}) {
    const [showReject, setShowReject] = useState(false);
    const [reason, setReason] = useState("");

    return (
        <div className="p-6 space-y-5 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-start justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">⚡</span>
                        <div>
                            <h4 className="text-sm font-black text-white uppercase italic">{match.sport.replace(/_/g, " ")} · {match.format.replace(/_/g, " ")}</h4>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{match.player1 || "?"} vs {match.player2 || "?"}</p>
                        </div>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        Sector: {match.court_name || "PENDING ASSIGNMENT"}
                    </div>
                </div>
                <StatusBadge label="Awaiting Auth" variant="amber" />
            </div>

            {!showReject ? (
                <div className="flex gap-2 pt-2">
                    <button onClick={onApprove} className="flex-1 py-3 rounded-xl bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-emerald-900/20">Authorize Deployment</button>
                    <button onClick={() => setShowReject(true)} className="px-6 py-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all">Reject</button>
                </div>
            ) : (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                    <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="REJECTION REASON (OPTIONAL)" className="w-full bg-white/5 border border-rose-500/20 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white placeholder-rose-900/40 outline-none" />
                    <div className="flex gap-2">
                        <button onClick={() => { onReject(reason); setShowReject(false); }} className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">Confirm Rejection</button>
                        <button onClick={() => { setShowReject(false); setReason(""); }} className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function CourtAdminCard({ court, onDelete, onUpdateImage }: { court: Court; onDelete: () => void; onUpdateImage: (url: string) => void }) {
    return (
        <article className="bg-[#0a111a]/60 border border-white/5 rounded-[2rem] overflow-hidden hover:border-white/15 transition-all group flex flex-col shadow-2xl">
            <div className="relative h-48 bg-slate-900">
                {court.image_url ? (
                    <Image src={court.image_url} alt={court.name} fill className="object-cover group-hover:scale-105 transition-transform duration-700" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-slate-900 to-slate-800 opacity-20">
                        {court.is_indoor === false ? "☀️" : "🏟"}
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a111a] via-transparent to-transparent" />
                <div className="absolute top-4 left-4 flex gap-2">
                    <StatusBadge label={court.is_indoor === false ? "OUTDOOR" : "INDOOR"} variant={court.is_indoor === false ? "amber" : "cyan"} />
                </div>
                <div className="absolute bottom-4 left-4">
                    <h4 className="text-xl font-black uppercase italic tracking-tight text-white">{court.name}</h4>
                </div>
            </div>
            
            <div className="p-6 space-y-5 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">Surface</p>
                        <p className="text-[10px] font-black text-white uppercase italic mt-1">{court.surface || "STANDARD"}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">Capacity</p>
                        <p className="text-[10px] font-black text-white uppercase italic mt-1">{court.capacity || 4} OPS</p>
                    </div>
                </div>

                <div className="mt-auto space-y-3">
                    <ImageUpload
                        currentUrl={court.image_url ?? null}
                        uploadEndpoint={`/api/upload/court/${court.id}/photo`}
                        onSuccess={onUpdateImage}
                        shape="rect" size="sm" placeholder="📷 UPDATE VISUAL" label="Photo"
                    />
                    <button onClick={onDelete}
                        className="w-full py-2.5 rounded-xl border border-rose-500/10 bg-rose-500/5 text-rose-400 text-[9px] font-black uppercase tracking-[0.2em] hover:bg-rose-500/10 transition-all">
                        Decommission Sector
                    </button>
                </div>
            </div>
        </article>
    );
}
