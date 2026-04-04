"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import NavBar from "@/components/NavBar";
import Link from "next/link";
import ImageUpload from "@/components/ImageUpload";

// ── Sport surfaces ─────────────────────────────────────────────────────────

const SPORT_SURFACES: Record<string, string[]> = {
    badminton:    ["Wooden", "PVC Mat", "Synthetic", "Vinyl"],
    pickleball:   ["Acrylic", "Concrete", "Modular Tiles", "Asphalt"],
    lawn_tennis:  ["Hard Court", "Clay", "Grass", "Synthetic Grass"],
    table_tennis: ["Wood", "Rubber Mat", "Vinyl"],
    default:      ["Wooden", "Concrete", "Acrylic", "Synthetic"],
};

// ── Types ──────────────────────────────────────────────────────────────────

interface ClubStats  { member_count: number; court_count: number; active_checkins: number; pending_bookings: number }
interface Member     { member_id: string; user_id: string; username: string | null; first_name: string | null; last_name: string | null; joined_at: string; is_admin: boolean; role?: string; duty_date?: string | null }
interface Court      { id: string; name: string; sport: string | null; surface: string | null; is_indoor: boolean | null; lighting: string | null; capacity: number | null; status: string; image_url?: string | null }
interface Booking    { id: string; court_id: string; court_name?: string; requested_by: string; requester_username?: string; scheduled_at: string; status: string; notes: string | null }
interface CheckedIn  { user_id: string; username: string | null; status: string; checked_in_at: string }
interface PendingMatch { match_id: string; sport: string; format: string; court_name: string | null; player1: string | null; player2: string | null; created_at: string }
interface LiveMatch  {
    match_id: string; sport: string; match_format: string; match_status: string;
    player1_id: string | null; player2_id: string | null; player3_id: string | null; player4_id: string | null;
    player1_username: string | null; player2_username: string | null;
    player3_username: string | null; player4_username: string | null;
    player1_matches_played: number | null; player2_matches_played: number | null;
    player3_matches_played: number | null; player4_matches_played: number | null;
    referee_id: string | null; referee_username: string | null; has_referee: boolean;
    scheduled_at: string | null; started_at: string | null;
    current_set: number; score: string;
}
interface LiveCourt  { court_id: string; court_name: string; sport: string | null; status: string; match: LiveMatch | null }

// ── Main ───────────────────────────────────────────────────────────────────

export default function ClubAdminPage() {
    const router  = useRouter();
    const params  = useParams();
    const clubId  = params.id as string;

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
    const [live,          setLive]         = useState<CheckedIn[]>([]);
    const [liveCourts,    setLiveCourts]   = useState<LiveCourt[]>([]);
    const [pendingMatches,setPendingMatches] = useState<PendingMatch[]>([]);
    const [loading,       setLoading]      = useState(true);
    const [error,         setError]        = useState("");

    // Courts form
    const [newCourtName,     setNewCourtName]     = useState("");
    const [newCourtSurface,  setNewCourtSurface]  = useState("");
    const [newCourtIndoor,   setNewCourtIndoor]   = useState(true);
    const [newCourtLighting, setNewCourtLighting] = useState("good");
    const [newCourtCapacity, setNewCourtCapacity] = useState("");
    const [courtLoading,     setCourtLoading]     = useState(false);

    // Role editing state: memberId -> { role, duty_date }
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
            const [clubRes, statsRes, membersRes, courtsRes, bookingsRes, liveRes, liveCourtsRes, pendingRes] = await Promise.all([
                fetch(`/api/clubs/${clubId}`,                         { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/clubs/${clubId}/stats`,                   { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/clubs/${clubId}/members`,                 { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/clubs/${clubId}/courts`,          { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/clubs/${clubId}/courts/bookings`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/club%20check-ins/clubs/${clubId}/present`,{ headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/matches/clubs/${clubId}/courts/live`,     { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/clubs/${clubId}/pending-matches`,         { headers: { Authorization: `Bearer ${token}` } }),
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
        <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
            <div className="text-zinc-500 text-sm animate-pulse">Loading admin panel...</div>
        </div>
    );

    const pendingBookings = bookings.filter(b => b.status === "pending");
    const liveCourtsOccupied = liveCourts.filter(c => c.status === "occupied").length;
    const liveCourtsAvail    = liveCourts.filter(c => c.status === "available").length;

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
            <div className="fixed inset-0 pointer-events-none"
                style={{ backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`, backgroundSize: "60px 60px" }} />

            <NavBar backHref="/clubs" backLabel="← Clubs" />

            <main className="relative z-10 max-w-5xl mx-auto w-full px-4 py-8 flex flex-col gap-8">

                {/* ── Cover Banner ── */}
                <ImageUpload
                    currentUrl={clubCoverUrl}
                    uploadEndpoint={`/api/upload/club/${clubId}/cover`}
                    onSuccess={url => setClubCoverUrl(url)}
                    shape="rect"
                    size="lg"
                    placeholder=""
                    label="Cover Photo"
                    recommendedSize="1200 × 400 px recommended"
                />

                {/* ── Header ── */}
                <div className="flex items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        <ImageUpload
                            currentUrl={clubLogoUrl}
                            uploadEndpoint={`/api/upload/club/${clubId}/logo`}
                            onSuccess={url => setClubLogoUrl(url)}
                            shape="circle"
                            size="lg"
                            placeholder="🏟️"
                            label="Club Logo"
                            recommendedSize="400 × 400 px"
                        />
                        <div>
                            <div className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-1">Club Admin Dashboard</div>
                            <h1 className="text-2xl font-black">{clubName || "Your Club"}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/clubs/${clubId}`}
                            className="text-xs text-zinc-400 hover:text-white border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            View Public Page →
                        </Link>
                        <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-full font-bold">Admin</span>
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

                {/* ── Stats Row ── */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatCard icon="👥" label="Members"          value={stats.member_count}     color="cyan"   />
                        <StatCard icon="🏟" label="Courts"           value={stats.court_count}      color="purple" />
                        <StatCard icon="🟢" label="Checked In Now"   value={stats.active_checkins}  color="emerald"/>
                        <StatCard icon="📅" label="Pending Bookings" value={stats.pending_bookings} color="orange" alert={stats.pending_bookings > 0} />
                    </div>
                )}

                {/* ── Alert Banners ── */}
                {(pendingBookings.length > 0 || pendingMatches.length > 0) && (
                    <div className="flex flex-col gap-2">
                        {pendingBookings.length > 0 && (
                            <div className="flex items-center gap-3 border border-orange-500/30 bg-orange-500/5 text-orange-400 text-sm font-bold py-3 px-4 rounded-xl">
                                <span>⚠</span>
                                <span>{pendingBookings.length} court booking{pendingBookings.length > 1 ? "s" : ""} awaiting approval</span>
                                <a href="#bookings" className="ml-auto text-xs underline opacity-70 hover:opacity-100">View ↓</a>
                            </div>
                        )}
                        {pendingMatches.length > 0 && (
                            <div className="flex items-center gap-3 border border-amber-500/30 bg-amber-500/5 text-amber-400 text-sm font-bold py-3 px-4 rounded-xl">
                                <span>✅</span>
                                <span>{pendingMatches.length} match{pendingMatches.length > 1 ? "es" : ""} awaiting your approval</span>
                                <a href="#approvals" className="ml-auto text-xs underline opacity-70 hover:opacity-100">View ↓</a>
                            </div>
                        )}
                    </div>
                )}

                {/* ── 2-column layout: Live + Presence / Approvals ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Live Courts */}
                    <div id="live" className="flex flex-col gap-3">
                        <SectionHeader
                            icon="🟢"
                            title="Live Court Status"
                            right={
                                <button onClick={() => fetchAll()} className="text-xs text-zinc-500 hover:text-zinc-300 border border-white/10 px-3 py-1 rounded-lg transition-colors">
                                    ↻ Refresh
                                </button>
                            }
                        />

                        {/* Mini stats */}
                        <div className="grid grid-cols-3 gap-2">
                            <MiniStat label="Courts Live"  value={liveCourtsOccupied} color="text-cyan-400"    />
                            <MiniStat label="Available"    value={liveCourtsAvail}    color="text-emerald-400" />
                            <MiniStat label="Checked In"   value={live.length}        color="text-purple-400"  />
                        </div>

                        {liveCourts.length === 0
                            ? <EmptyState msg="No courts configured yet." />
                            : liveCourts.map(court => <LiveCourtCard key={court.court_id} court={court} />)
                        }

                        {/* People present */}
                        {live.length > 0 && (
                            <>
                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">People Present</p>
                                <div className="flex flex-col gap-2">
                                    {live.map(p => (
                                        <div key={p.user_id} className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-base shrink-0">👤</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white">@{p.username ?? p.user_id.slice(0, 8)}</p>
                                                <p className="text-xs text-zinc-500">Since {new Date(p.checked_in_at).toLocaleTimeString()}</p>
                                            </div>
                                            <CheckinStatusBadge status={p.status} />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Match Approvals + Approval Mode */}
                    <div id="approvals" className="flex flex-col gap-3">
                        <SectionHeader icon="✅" title="Match Approvals" right={
                            <button onClick={() => fetchAll()} className="text-xs text-zinc-500 hover:text-zinc-300 border border-white/10 px-3 py-1 rounded-lg transition-colors">
                                ↻ Refresh
                            </button>
                        } />

                        {/* Approval mode toggle */}
                        <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-white">Match Approval Mode</p>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {approvalMode === "manual" ? "Manual — you approve each assignment" : "Auto — courts assigned instantly"}
                                    </p>
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                                    approvalMode === "manual"
                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                }`}>{approvalMode}</span>
                            </div>
                            <div className="flex gap-2">
                                {(["auto", "manual"] as const).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => handleApprovalModeToggle(mode)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all capitalize ${
                                            approvalMode === mode
                                                ? mode === "manual"
                                                    ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                                                    : "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                                                : "border-white/10 text-zinc-500 hover:text-zinc-300"
                                        }`}
                                    >
                                        {mode === "auto" ? "Auto" : "Manual"}{approvalMode === mode && " ✓"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {approvalMode === "auto" && (
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400">
                                Switch to <strong>manual</strong> mode above to require approval for court assignments.
                            </div>
                        )}

                        {pendingMatches.length === 0
                            ? <EmptyState msg="No matches awaiting approval." />
                            : pendingMatches.map(m => (
                                <PendingMatchCard
                                    key={m.match_id}
                                    match={m}
                                    onApprove={() => handleMatchDecision(m.match_id, "approve")}
                                    onReject={(reason) => handleMatchDecision(m.match_id, "reject", reason)}
                                />
                            ))
                        }
                    </div>
                </div>

                {/* ── Bookings ── */}
                <div id="bookings" className="flex flex-col gap-3">
                    <SectionHeader icon="📅" title={`Bookings${pendingBookings.length > 0 ? ` · ${pendingBookings.length} pending` : ""}`} />
                    {bookings.length === 0
                        ? <EmptyState msg="No booking requests." />
                        : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {bookings.map(b => (
                                    <div key={b.id} className={`bg-zinc-900 border rounded-xl p-4 flex flex-col gap-3 ${
                                        b.status === "pending" ? "border-orange-500/20" : "border-white/10"
                                    }`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-semibold text-white">
                                                    @{b.requester_username ?? b.requested_by.slice(0, 8)}
                                                </p>
                                                <p className="text-xs text-zinc-500 mt-0.5">
                                                    {b.court_name ?? b.court_id.slice(0, 8)} · {new Date(b.scheduled_at).toLocaleString()}
                                                </p>
                                                {b.notes && <p className="text-xs text-zinc-400 mt-1 italic">{b.notes}</p>}
                                            </div>
                                            <BookingStatusBadge status={b.status} />
                                        </div>
                                        {b.status === "pending" && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleBookingDecision(b.id, "approve")}
                                                    className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold py-2 rounded-lg transition-colors"
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    onClick={() => handleBookingDecision(b.id, "reject")}
                                                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold py-2 rounded-lg transition-colors"
                                                >
                                                    ✕ Reject
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    }
                </div>

                {/* ── Members + Courts side-by-side ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Members */}
                    <div className="flex flex-col gap-3">
                        <SectionHeader icon="👥" title={`Members · ${members.length}`} />
                        {members.length === 0
                            ? <EmptyState msg="No members yet." />
                            : members.map(m => {
                                const edit = roleEdits[m.user_id];
                                const currentRole = edit?.role ?? m.role ?? "member";
                                const currentDuty = edit?.duty_date ?? m.duty_date ?? "";
                                return (
                                    <div key={m.member_id} className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-base shrink-0">👤</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">
                                                    @{m.username ?? m.user_id.slice(0, 8)}
                                                    <RoleBadge role={m.role ?? (m.is_admin ? "admin" : "member")} />
                                                </p>
                                                <p className="text-xs text-zinc-500 truncate">
                                                    {m.first_name} {m.last_name} · Joined {new Date(m.joined_at).toLocaleDateString()}
                                                    {m.duty_date && ` · Duty: ${m.duty_date}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 border-t border-white/5 pt-2">
                                            <select
                                                value={currentRole}
                                                onChange={e => setRoleEdits(prev => ({ ...prev, [m.user_id]: { role: e.target.value, duty_date: currentDuty } }))}
                                                className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                                            >
                                                <option value="member">Member</option>
                                                <option value="assistant">Assistant</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                            {currentRole === "assistant" && (
                                                <input
                                                    type="date"
                                                    value={currentDuty}
                                                    onChange={e => setRoleEdits(prev => ({ ...prev, [m.user_id]: { role: currentRole, duty_date: e.target.value } }))}
                                                    className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                                                />
                                            )}
                                            <button
                                                onClick={() => handleSetRole(m.user_id, currentRole, currentRole === "assistant" ? currentDuty : undefined)}
                                                className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 hover:border-cyan-500/40 px-2.5 py-1.5 rounded-lg transition-colors"
                                            >
                                                Save
                                            </button>
                                            {!m.is_admin && (
                                                <button
                                                    onClick={() => handleRemoveMember(m.user_id)}
                                                    className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1.5 rounded-lg transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div>

                    {/* Courts */}
                    <div className="flex flex-col gap-3">
                        <SectionHeader icon="🏟" title={`Courts · ${courts.length}`} />

                        {/* Add court form */}
                        <form onSubmit={handleAddCourt} className="bg-zinc-900 border border-cyan-500/20 rounded-xl p-4 flex flex-col gap-3">
                            <p className="text-xs font-bold text-cyan-400 tracking-widest uppercase">+ Add Court / Table</p>
                            <input
                                type="text"
                                value={newCourtName}
                                onChange={e => setNewCourtName(e.target.value)}
                                placeholder="Court name (e.g. Court A, Table 1)"
                                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                            />
                            <div>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Surface</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(SPORT_SURFACES[clubSport ?? ""] ?? SPORT_SURFACES["default"]).map(s => (
                                        <button key={s} type="button"
                                            onClick={() => setNewCourtSurface(newCourtSurface === s ? "" : s)}
                                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                                                newCourtSurface === s
                                                    ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                                                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                            }`}
                                        >{s}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Env</p>
                                    <div className="flex gap-1.5">
                                        {[{ v: true, label: "Indoor" }, { v: false, label: "Outdoor" }].map(opt => (
                                            <button key={String(opt.v)} type="button"
                                                onClick={() => setNewCourtIndoor(opt.v)}
                                                className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                                                    newCourtIndoor === opt.v
                                                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                                                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                }`}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Lighting</p>
                                    <div className="flex gap-1.5">
                                        {["good", "fair", "poor"].map(l => (
                                            <button key={l} type="button"
                                                onClick={() => setNewCourtLighting(l)}
                                                className={`flex-1 text-xs py-1.5 rounded-lg border capitalize transition-colors ${
                                                    newCourtLighting === l
                                                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                                                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                }`}
                                            >{l}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="number" min={1}
                                    value={newCourtCapacity}
                                    onChange={e => setNewCourtCapacity(e.target.value)}
                                    placeholder="Capacity (optional)"
                                    className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                                />
                                <button
                                    type="submit"
                                    disabled={courtLoading || !newCourtName.trim()}
                                    className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-sm px-5 rounded-lg transition-colors disabled:opacity-40"
                                >
                                    {courtLoading ? "..." : "+ Add"}
                                </button>
                            </div>
                        </form>

                        {courts.length === 0
                            ? <EmptyState msg="No courts yet. Add one above." />
                            : courts.map(court => (
                                <div key={court.id} className="bg-zinc-900 border border-white/10 rounded-xl p-3 flex flex-col gap-3">
                                    <div className="flex items-center gap-3">
                                        {court.image_url
                                            ? <img src={court.image_url} alt={court.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                            : <div className="text-xl w-10 h-10 flex items-center justify-center">{court.is_indoor === false ? "☀️" : "🏟"}</div>
                                        }
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-white">{court.name}</p>
                                            <p className="text-xs text-zinc-500 capitalize">
                                                {[court.surface, court.is_indoor === false ? "Outdoor" : "Indoor",
                                                  court.lighting && `${court.lighting} lighting`,
                                                  court.capacity && `cap. ${court.capacity}`
                                                ].filter(Boolean).join(" · ")}
                                            </p>
                                        </div>
                                        <StatusDot status={court.status} />
                                        <button
                                            onClick={() => handleDeleteCourt(court.id)}
                                            className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1 rounded-lg transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                    <div className="border-t border-white/5 pt-2">
                                        <ImageUpload
                                            currentUrl={court.image_url ?? null}
                                            uploadEndpoint={`/api/upload/court/${court.id}/photo`}
                                            onSuccess={url => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, image_url: url } : c))}
                                            shape="rect"
                                            size="sm"
                                            placeholder="📷"
                                            label="Court Photo"
                                            recommendedSize="800 × 500 px"
                                        />
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>

                {/* ── Operating Hours ── */}
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
                    <p className="text-sm font-bold text-white">🕐 Operating Hours</p>
                    <p className="text-xs text-zinc-500">Controls which time slots appear on the Open Play tab for your club.</p>
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-500 font-semibold">Opens at</label>
                            <input
                                type="time"
                                value={openingTime}
                                onChange={e => setOpeningTime(e.target.value)}
                                className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-500 font-semibold">Closes at</label>
                            <input
                                type="time"
                                value={closingTime}
                                onChange={e => setClosingTime(e.target.value)}
                                className="bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/40"
                            />
                        </div>
                        <button
                            onClick={handleSaveHours}
                            className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black px-5 py-2 rounded-xl text-sm transition-colors"
                        >
                            Save Hours
                        </button>
                    </div>
                </div>

                {/* ── Role Reference ── */}
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                    <p className="text-sm font-bold text-white mb-3">⚙️ Role Reference</p>
                    <div className="text-xs text-zinc-500 flex flex-col gap-1.5">
                        <div><span className="text-cyan-400 font-semibold">Admin</span> — Full access: approve/reject matches, manage members and courts, change approval mode.</div>
                        <div><span className="text-purple-400 font-semibold">Assistant</span> — Can approve/reject matches on their assigned duty date only.</div>
                        <div><span className="text-zinc-400 font-semibold">Member</span> — Standard member, no administrative access.</div>
                    </div>
                </div>

            </main>
        </div>
    );
}

// ── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                <span>{icon}</span>
                <span>{title}</span>
            </h2>
            {right}
        </div>
    );
}

// ── Mini Stat ───────────────────────────────────────────────────────────────

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-3 text-center">
            <p className={`text-lg font-black ${color}`}>{value}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
        </div>
    );
}

// ── PendingMatchCard ────────────────────────────────────────────────────────

function PendingMatchCard({ match, onApprove, onReject }: {
    match: PendingMatch;
    onApprove: () => void;
    onReject: (reason: string) => void;
}) {
    const [showReject, setShowReject] = useState(false);
    const [reason, setReason] = useState("");

    return (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white capitalize">
                        {match.sport.replace("_", " ")} · {match.format}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1 font-medium">
                        @{match.player1 ?? "?"} vs @{match.player2 ?? "?"}
                    </p>
                    {match.court_name && (
                        <p className="text-xs text-zinc-500 mt-0.5">Court: {match.court_name}</p>
                    )}
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Requested {new Date(match.created_at).toLocaleString()}
                    </p>
                </div>
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full font-bold whitespace-nowrap">
                    Pending
                </span>
            </div>

            {!showReject ? (
                <div className="flex gap-2">
                    <button
                        onClick={onApprove}
                        className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold py-2 rounded-lg transition-colors"
                    >
                        ✓ Approve
                    </button>
                    <button
                        onClick={() => setShowReject(true)}
                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold py-2 rounded-lg transition-colors"
                    >
                        ✕ Reject
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <input
                        type="text"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/50"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => { onReject(reason); setShowReject(false); }}
                            className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold py-2 rounded-lg transition-colors"
                        >
                            Confirm Reject
                        </button>
                        <button
                            onClick={() => { setShowReject(false); setReason(""); }}
                            className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-2 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
    const map: Record<string, string> = {
        admin:     "ml-2 text-xs text-cyan-400 font-bold",
        assistant: "ml-2 text-xs text-purple-400 font-bold",
        owner:     "ml-2 text-xs text-yellow-400 font-bold",
    };
    const labels: Record<string, string> = { admin: "(Admin)", assistant: "(Assistant)", owner: "(Owner)" };
    if (!map[role]) return null;
    return <span className={map[role]}>{labels[role]}</span>;
}

function StatCard({ icon, label, value, color, alert }: { icon: string; label: string; value: number; color: string; alert?: boolean }) {
    const colors: Record<string, string> = {
        cyan:    "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",
        purple:  "text-purple-400 border-purple-500/20 bg-purple-500/5",
        emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
        orange:  "text-orange-400 border-orange-500/20 bg-orange-500/5",
    };
    return (
        <div className={`border rounded-2xl p-4 flex flex-col gap-1.5 ${alert ? "border-orange-500/40 bg-orange-500/10" : colors[color]}`}>
            <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
            </div>
            <p className={`text-3xl font-black ${alert ? "text-orange-400" : colors[color].split(" ")[0]}`}>{value}</p>
        </div>
    );
}

// ── Live Court Card ───────────────────────────────────────────────────────────

function fmtTime(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function runningMins(startedAt: string | null) {
    if (!startedAt) return null;
    const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
    return diff > 0 ? diff : null;
}

function PlayerChip({ username, matchesPlayed }: { username: string | null; matchesPlayed: number | null }) {
    return (
        <div className="flex flex-col items-center gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-white truncate max-w-[100px]">
                @{username ?? "?"}
            </span>
            {matchesPlayed !== null && (
                <span className="text-xs text-zinc-500">{matchesPlayed} played</span>
            )}
        </div>
    );
}

function LiveCourtCard({ court }: { court: LiveCourt }) {
    const m = court.match;
    const isDoubles = m?.match_format === "doubles" || m?.match_format === "mixed_doubles";
    const mins = m ? runningMins(m.started_at) : null;

    return (
        <div className={`bg-zinc-900 border rounded-xl p-4 flex flex-col gap-3 ${
            court.status === "occupied" ? "border-cyan-500/30" : "border-white/10"
        }`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <StatusDot status={court.status} />
                    <p className="text-sm font-bold text-white">{court.court_name}</p>
                    {court.sport && (
                        <span className="text-xs text-zinc-500 capitalize">{court.sport.replace(/_/g, " ")}</span>
                    )}
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border capitalize ${
                    court.status === "occupied"
                        ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                        : court.status === "available"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                }`}>{court.status}</span>
            </div>

            {m && (
                <div className="bg-zinc-800/60 rounded-lg p-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-400 capitalize">
                            {m.sport?.replace(/_/g, " ")} · {m.match_format?.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-zinc-500">Set {m.current_set}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                        {m.scheduled_at && <span>Scheduled: {fmtTime(m.scheduled_at)}</span>}
                        {m.started_at   && <span>Started: {fmtTime(m.started_at)}</span>}
                        {mins !== null && <span className="text-cyan-500 font-semibold">Running: {mins} min</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-500 shrink-0">Referee:</span>
                        {m.referee_username
                            ? <span className="text-purple-400 font-semibold">@{m.referee_username}</span>
                            : <span className="text-zinc-600 italic">None assigned</span>
                        }
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 flex flex-col items-center gap-1">
                            <PlayerChip username={m.player1_username} matchesPlayed={m.player1_matches_played} />
                            {isDoubles && m.player3_username && (
                                <PlayerChip username={m.player3_username} matchesPlayed={m.player3_matches_played} />
                            )}
                        </div>
                        <div className="px-3 py-1.5 bg-zinc-700 rounded-lg text-center shrink-0">
                            <p className="text-base font-black text-white tabular-nums">{m.score}</p>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-1">
                            <PlayerChip username={m.player2_username} matchesPlayed={m.player2_matches_played} />
                            {isDoubles && m.player4_username && (
                                <PlayerChip username={m.player4_username} matchesPlayed={m.player4_matches_played} />
                            )}
                        </div>
                    </div>
                    <a
                        href={`/matches/${m.match_id}`}
                        className="w-full text-center text-xs font-semibold text-cyan-400 border border-cyan-500/30 rounded-lg py-2 hover:bg-cyan-500/10 transition-colors"
                    >
                        View Live →
                    </a>
                </div>
            )}

            {!m && court.status === "available" && (
                <p className="text-xs text-zinc-600 italic">Court is free</p>
            )}
        </div>
    );
}

function StatusDot({ status }: { status: string }) {
    const map: Record<string, string> = {
        available:   "bg-emerald-400",
        occupied:    "bg-orange-400",
        maintenance: "bg-red-400",
    };
    return <div className={`w-2 h-2 rounded-full ${map[status] ?? "bg-zinc-600"}`} />;
}

function BookingStatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        pending:  "bg-orange-500/10 text-orange-400 border-orange-500/30",
        approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        rejected: "bg-red-500/10 text-red-400 border-red-500/30",
    };
    return (
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border capitalize ${map[status] ?? map.pending}`}>
            {status}
        </span>
    );
}

function CheckinStatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        present:          { label: "Present",   cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
        playing:          { label: "Playing",   cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"         },
        available_to_ref: { label: "Ref Ready", cls: "bg-purple-500/10 text-purple-400 border-purple-500/30"   },
    };
    const info = map[status] ?? { label: status, cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30" };
    return (
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${info.cls}`}>{info.label}</span>
    );
}

function EmptyState({ msg }: { msg: string }) {
    return (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 text-center text-zinc-600 text-sm">{msg}</div>
    );
}
