"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import { registerFcmToken, onForegroundMessage } from "@/lib/fcm";
import QueueBanner from "@/components/QueueBanner";
import type { ReactNode } from "react";

interface Notification {
    id: string;
    title: string;
    body: string;
    type: string;
    reference_id: string | null;
    is_read: boolean;
    created_at: string;
}

interface ToastItem {
    id: string;
    notif: Notification;
}

interface NavBarProps {
    backHref?: string;
    backLabel?: string;
    navLinks?: ReactNode;   // extra links rendered between logo and bell
}

export default function NavBar({ backHref, backLabel, navLinks }: NavBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [notifications,  setNotifications]  = useState<Notification[]>([]);
    const [unreadCount,    setUnreadCount]     = useState(0);
    const [dropdownOpen,   setDropdownOpen]    = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen]  = useState(false);
    const [respondingId,   setRespondingId]    = useState<string | null>(null);
    const [toasts,         setToasts]          = useState<ToastItem[]>([]);

    const [username,       setUsername]       = useState<string | null>(null);
    const [isAdmin,        setIsAdmin]        = useState(false);
    const [partyStatus,    setPartyStatus]    = useState<string | null>(null); // "forming"|"ready"|"in_queue"

    const dropdownRef       = useRef<HTMLDivElement>(null);
    const mobileMenuRef     = useRef<HTMLDivElement>(null);
    const pollRef           = useRef<ReturnType<typeof setInterval> | null>(null);
    const toastedIdsRef     = useRef(new Set<string>());
    const notifInitializedRef = useRef(false);
    const sseRef            = useRef<EventSource | null>(null);

    function resolveMatchRoute(matchId: string, rawStatus: unknown): string {
        const status = typeof rawStatus === "string" ? rawStatus : "";
        return status === "awaiting_players" ? `/matches/${matchId}/lobby` : `/matches/${matchId}`;
    }

    function shouldAutoRedirectToMatch(rawStatus: unknown): boolean {
        const status = typeof rawStatus === "string" ? rawStatus : "";
        return status === "awaiting_players"
            || status === "pending_approval"
            || status === "pending"
            || status === "assembling"
            || status === "ongoing";
    }

    function dismissToast(id: string) {
        setToasts(prev => prev.filter(t => t.id !== id));
    }

    function addToast(notif: Notification) {
        setToasts(prev => {
            // Cap at 3 visible toasts — drop oldest if needed
            const next = [...prev.slice(-2), { id: notif.id, notif }];
            return next;
        });
        setTimeout(() => dismissToast(notif.id), 6000);
    }

    async function fetchNotifications() {
        const token = getAccessToken();
        if (!token) return;
        try {
            const res = await fetch("/api/notifications?limit=20", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
            if (!res.ok) return;
            const data = await res.json();
            const allNotifs: Notification[] = data.notifications ?? [];

            if (!notifInitializedRef.current) {
                // First load — seed IDs so we don't toast old notifications
                notifInitializedRef.current = true;
                allNotifs.forEach(n => toastedIdsRef.current.add(n.id));

                // Check if player is mid-party (in_queue / match_found) but on a different page.
                // This catches the case where partner navigated away and missed the queue start.
                const partyRes = await fetch("/api/parties/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (partyRes.ok) {
                    const partyData = await partyRes.json();
                    const partyStatus: string | undefined = partyData?.party?.status;
                    if (partyStatus === "match_found" && partyData?.party?.match_id) {
                        const mRes = await fetch(`/api/matches/${partyData.party.match_id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (mRes.ok) {
                            const mData = await mRes.json();
                            const mStatus = mData?.status ?? mData?.match?.status;
                            if (shouldAutoRedirectToMatch(mStatus)) {
                                const target = resolveMatchRoute(partyData.party.match_id, mStatus);
                                if (pathname !== target) router.push(target);
                                return;
                            }
                        }
                    } else if (partyStatus === "in_queue" || partyStatus === "ready") {
                        // Don't force-redirect — just let the notification + party page handle it.
                        // But if a recent party_in_queue notification exists, redirect them there.
                        const recentQueue = allNotifs.find(n =>
                            n.type === "party_in_queue" &&
                            !n.is_read &&
                            (Date.now() - new Date(n.created_at).getTime()) < 5 * 60 * 1000
                        );
                        if (recentQueue) {
                            router.push("/matches/party");
                            return;
                        }
                    }
                }

                // If a party_match_found notification arrived while NavBar was unmounted
                // (e.g. Player B navigating between pages), catch it here and redirect.
                // Only act on notifications within the last 5 minutes to avoid stale redirects.
                const recentMatch = allNotifs.find(n =>
                    n.type === "party_match_found" &&
                    !n.is_read &&
                    n.reference_id &&
                    (Date.now() - new Date(n.created_at).getTime()) < 5 * 60 * 1000
                );
                if (recentMatch) {
                    // Always mark read — prevents this from firing on every page load
                    // regardless of whether the match is still valid or already dead.
                    fetch(`/api/notifications/${recentMatch.id}/read`, {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${token}` },
                    }).catch(() => {});
                    // Guard: don't redirect to an invalidated/cancelled match
                    const mRes = await fetch(`/api/matches/${recentMatch.reference_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (mRes.ok) {
                        const mData = await mRes.json();
                        const mStatus = mData?.status ?? mData?.match?.status;
                        if (shouldAutoRedirectToMatch(mStatus)) {
                            const target = mStatus === "awaiting_players"
                                ? `/matches/${recentMatch.reference_id}/lobby`
                                : `/matches/${recentMatch.reference_id}`;
                            router.push(target);
                            return;
                        }
                    }
                }
            } else {
                // Subsequent polls — toast anything new and unread
                const fresh = allNotifs.filter(n => !n.is_read && !toastedIdsRef.current.has(n.id));
                fresh.forEach(n => {
                    toastedIdsRef.current.add(n.id);
                    addToast(n);
                });
                // Auto-redirect partner to party page when leader starts queue
                const queueStarted = fresh.find(n => n.type === "party_in_queue");
                if (queueStarted) {
                    setPartyStatus("in_queue");
                    setDropdownOpen(false);
                    router.push("/matches/party");
                    return;
                }
                // Update pill instantly when queue is cancelled
                if (fresh.find(n => n.type === "party_queue_left")) {
                    setPartyStatus("ready");
                }
                // Clear pill when party disbanded
                if (fresh.find(n => n.type === "party_disbanded")) {
                    setPartyStatus(null);
                }
                // Auto-redirect on match found for party members (Player B never navigated to party page)
                const matchFound = fresh.find(n => n.type === "party_match_found" && n.reference_id);
                if (matchFound) {
                    // Guard: don't redirect to an invalidated/cancelled match
                    const mRes = await fetch(`/api/matches/${matchFound.reference_id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (mRes.ok) {
                        const mData = await mRes.json();
                        const mStatus = mData?.status ?? mData?.match?.status;
                        if (shouldAutoRedirectToMatch(mStatus)) {
                            const target = resolveMatchRoute(matchFound.reference_id!, mStatus);
                            setDropdownOpen(false);
                            if (pathname !== target) router.push(target);
                            return;
                        }
                    }
                }
            }

            setNotifications(allNotifs);
            setUnreadCount(data.unread_count ?? 0);
        } catch (err) {
            console.error("[NavBar] fetchNotifications error:", err);
        }
    }

    // Initial load + polling every 15s (reduced from 30s for faster alerts)
    useEffect(() => {
        setUsername(sessionStorage.getItem("username"));
        const roles: string[] = JSON.parse(sessionStorage.getItem("roles") ?? "[]");
        setIsAdmin(roles.includes("system_admin"));
    }, []);

    // Party status pill — poll every 10s so the pill appears/disappears without page reload
    useEffect(() => {
        async function checkParty() {
            const token = getAccessToken();
            if (!token) return;
            try {
                const res = await fetch("/api/parties/me", { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) { setPartyStatus(null); return; }
                const d = await res.json();
                const s: string | undefined = d?.party?.status;
                // Only show pill for active (non-terminal) states
                setPartyStatus(s && s !== "disbanded" && s !== "match_found" ? s : null);
            } catch { setPartyStatus(null); }
        }
        void checkParty();
        const id = setInterval(checkParty, 10000);
        return () => clearInterval(id);
    }, []);

    // SSE for instant notifications + 30s heartbeat poll as fallback
    // Runs once on mount — independent of dropdown state so the stream stays stable
    useEffect(() => {
        void fetchNotifications();

        let es: EventSource | null = null;
        let retryDelay = 2000;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        function connectSSE() {
            if (cancelled) return;
            const token = getAccessToken();
            if (!token) return;

            es = new EventSource(`/api/auth/notifications/stream?token=${encodeURIComponent(token)}`);

            es.onopen = () => { retryDelay = 2000; }; // reset backoff on successful connect

            es.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data) as { event?: string };
                    if (msg.event === "new_notification") {
                        // Optimistically bump the badge immediately, then sync from server
                        setUnreadCount(prev => prev + 1);
                        void fetchNotifications();
                    }
                } catch { /* ignore malformed frames */ }
            };

            es.onerror = () => {
                es?.close();
                if (!cancelled) {
                    // Exponential backoff: 2s → 4s → 8s → … → 30s max
                    retryTimer = setTimeout(() => {
                        retryDelay = Math.min(retryDelay * 2, 30000);
                        connectSSE();
                    }, retryDelay);
                }
            };
        }

        connectSSE();

        // Fallback poll every 30s — always runs regardless of dropdown state
        pollRef.current = setInterval(() => void fetchNotifications(), 30000);

        // Refresh immediately when the user switches back to this tab
        function handleVisibility() {
            if (document.visibilityState === "visible") void fetchNotifications();
        }
        window.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelled = true;
            es?.close();
            if (retryTimer) clearTimeout(retryTimer);
            if (pollRef.current) clearInterval(pollRef.current);
            window.removeEventListener("visibilitychange", handleVisibility);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Register FCM push token once on mount, then listen for foreground messages
    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        void registerFcmToken(token);

        const unsub = onForegroundMessage((payload) => {
            const title = payload.notification?.title ?? "ISMS";
            const body  = payload.notification?.body  ?? "";
            const fakeNotif: Notification = {
                id:           `fcm-${Date.now()}`,
                title,
                body,
                type:         payload.data?.type         ?? "general",
                reference_id: payload.data?.reference_id ?? null,
                is_read:      false,
                created_at:   new Date().toISOString(),
            };
            addToast(fakeNotif);
            // Also refresh the bell dropdown so the count stays accurate
            void fetchNotifications();
        });
        return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Session guard: SSE kick listener + browser-close beacon ────────────
    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;

        // 1. Open SSE stream — backend pushes "kicked" when another login is detected
        const es = new EventSource(`/api/auth/session/stream?token=${encodeURIComponent(token)}`);
        sseRef.current = es;

        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data) as { event?: string };
                if (msg.event === "kicked") {
                    es.close();
                    // Redirect to login with reason so the banner shows
                    import("@/lib/auth").then(({ handleSessionKicked }) => {
                        handleSessionKicked("kicked");
                    });
                }
            } catch { /* ignore malformed frames */ }
        };

        es.onerror = () => {
            // Connection dropped — close quietly; polling will catch token expiry anyway
            es.close();
        };

        // 2. Register beforeunload beacon so the server clears the session on tab/browser close
        function handleBeforeUnload() {
            const t = getAccessToken();
            if (!t) return;
            const blob = new Blob([JSON.stringify({ token: t })], { type: "application/json" });
            navigator.sendBeacon("/api/auth/logout-beacon", blob);
        }
        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            es.close();
            sseRef.current = null;
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
                setMobileMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    async function handleOpenDropdown() {
        setDropdownOpen(prev => !prev);
        if (!dropdownOpen && unreadCount > 0) {
            const token = getAccessToken();
            if (!token) return;
            try {
                await fetch("/api/notifications/read-all", {
                    method: "PUT",
                    headers: { Authorization: `Bearer ${token}` },
                });
                setUnreadCount(0);
                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            } catch (err) {
                console.error("[NavBar] mark-all-read error:", err);
            }
        }
    }

    function handleLogoClick() {
        setDropdownOpen(false);
        setMobileMenuOpen(false);

        if (pathname === "/dashboard") {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            window.location.assign("/dashboard");
            return;
        }

        router.push("/dashboard");
    }

    /** Icon emoji for a notification type. */
    function notifIcon(type: string): string {
        if (type.startsWith("tournament"))   return "🏆";
        if (type.startsWith("party"))        return "🎮";
        if (type === "referee_invite")       return "🟡";
        if (type === "referee_request")      return "🟡";
        if (type === "referee_accepted")     return "✅";
        if (type === "referee_declined")     return "❌";
        if (type === "referee_left")         return "🚨";
        if (type === "friend_request")       return "👋";
        if (type.startsWith("match"))        return "🎾";
        if (type.startsWith("club_invite"))  return "🏠";
        if (type.startsWith("open_play"))    return "🏓";
        if (type.startsWith("court"))        return "🏟️";
        return "🔔";
    }

    /** Returns the destination path for a notification, or null if no navigation. */
    function resolveNotifLink(type: string, referenceId: string | null): { href: string; label: string } | null {
        switch (type) {
            // ── Tournament (organizer-facing → manage page) ─────────────
            case "tournament_registration":
            case "tournament_join_request":
            case "tournament_invite_accepted":
                return referenceId ? { href: `/tournaments/${referenceId}/manage`, label: "Manage tournament →" } : null;

            // ── Tournament (player-facing → tournament detail) ──────────
            case "tournament_invitation":
            case "tournament_update":
            case "tournament_start":
            case "doubles_partner_accepted":
            case "doubles_partner_declined":
                return referenceId ? { href: `/tournaments/${referenceId}`, label: "View tournament →" } : null;

            // doubles_partner_invite has inline accept/decline — handled separately
            case "doubles_partner_invite":
                return null;

            // ── Match ────────────────────────────────────────────────────
            case "match_pending_approval":
            case "match_approved":
            case "match_rejected":
            case "match_result":
            case "match_scheduled":
            case "match_completed":
            case "match_created":
            case "referee_left":
                return referenceId ? { href: `/matches/${referenceId}`, label: "View match →" } : null;

            // ── Referee ──────────────────────────────────────────────────
            // referee_invite has inline accept/decline — handled separately (no link nav)
            case "referee_accepted":
                // sent to match organizer when the referee accepts — reference_id is match_id
                return referenceId ? { href: `/matches/${referenceId}`, label: "View match →" } : null;
            case "referee_declined":
                // sent to match organizer when the referee declines — reference_id is match_id
                return referenceId ? { href: `/matches/${referenceId}`, label: "View match →" } : null;
            case "referee_request":
                // reference_id is the open-request id; send to referee dashboard
                return { href: `/referee`, label: "View referee requests →" };

            // ── Club invites ──────────────────────────────────────────────
            case "club_invite":
                return { href: `/clubs?tab=invites`, label: "View invite →" };
            case "club_invite_accepted":
                return referenceId ? { href: `/clubs/${referenceId}`, label: "View club →" } : null;

            // ── Open Play ──────────────────────────────────────────────────────
            // open_play_session reference_id is session.id (no club_id) → go to clubs hub
            case "open_play_session":
                return { href: `/clubs`, label: "View open play →" };
            // open_play_join/promoted/cancelled reference_id is club_id
            case "open_play_join":
            case "open_play_promoted":
            case "open_play_cancelled":
                return referenceId ? { href: `/clubs/${referenceId}?tab=open-play`, label: "View session →" } : null;

            // ── Court Booking / Rental ─────────────────────────────────────────
            // court_rental reference_id is club_id
            case "court_rental":
                return referenceId ? { href: `/clubs/${referenceId}?tab=court-rental`, label: "View booking →" } : null;
            // court_booking reference_id is booking_id (no club_id available) → courts overview
            case "court_booking":
                return { href: `/courts`, label: "View booking →" };

            // ── Party / Duo Queue ──────────────────────────────────────────────
            // party_invite has inline accept/decline — no nav link
            case "party_invite":
                return null;
            // party_accepted/declined reference_id is party_id → go to duo queue page
            case "party_accepted":
            case "party_declined":
            case "party_disbanded":
            case "party_in_queue":
            case "party_queue_left":
                return { href: `/matches/party`, label: "View party →" };
            // party_match_found reference_id is match_id
            case "party_match_found":
                return referenceId ? { href: `/matches/${referenceId}/lobby`, label: "Enter lobby →" } : null;

            default:
                return null;
        }
    }

    async function handleRefereeResponse(inviteId: string, response: "accepted" | "declined") {
        const token = getAccessToken();
        if (!token) return;
        setRespondingId(inviteId);
        try {
            const res = await fetch(`/api/referee/invite/${inviteId}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ response }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = (err as { detail?: string }).detail ?? "Failed to respond to invite.";
                // Surface error as a temporary toast-style update on the notification itself
                setNotifications(prev => prev.map(n =>
                    n.reference_id === inviteId
                        ? { ...n, body: `⚠️ ${msg}` }
                        : n
                ));
                return;
            }
            const payload = await res.json().catch(() => ({})) as { match_id?: string };

            // Optimistically mark this notification as responded so buttons disappear immediately.
            setNotifications(prev => prev.map(n =>
                n.reference_id === inviteId
                    ? { ...n, type: response === "accepted" ? "referee_accepted" : "referee_declined", is_read: true }
                    : n
            ));

            // On accept, navigate to the referee console for that match
            if (response === "accepted" && payload.match_id) {
                setDropdownOpen(false);
                router.push(`/matches/${payload.match_id}/referee`);
            }
        } catch (err) {
            console.error(`[NavBar] handleRefereeResponse error (invite=${inviteId}, response=${response}):`, err);
        }
        finally { setRespondingId(null); }
    }

    async function handleFriendResponse(friendshipId: string, action: "accept" | "decline") {
        const token = getAccessToken();
        if (!token) return;
        setRespondingId(friendshipId);
        try {
            let res: Response;
            if (action === "accept") {
                res = await fetch(`/api/friends/${friendshipId}/accept`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
            } else {
                res = await fetch(`/api/friends/${friendshipId}`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                });
            }

            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                const message = (payload as { detail?: string }).detail ?? "Failed to update friend request.";
                throw new Error(message);
            }

            if (action === "accept") {
                setNotifications(prev => prev.map(n =>
                    n.reference_id === friendshipId
                        ? {
                            ...n,
                            type: "friend_request_accepted",
                            title: "Friend Request Accepted",
                            body: "You are now connected.",
                            is_read: true,
                        }
                        : n
                ));
            }

            await fetchNotifications();
        } catch (err) {
            console.error(`[NavBar] handleFriendResponse error:`, err);
        }
        finally { setRespondingId(null); }
    }

    async function handlePartnerInviteResponse(registrationId: string, action: "accept" | "decline") {
        const token = getAccessToken();
        if (!token) return;
        setRespondingId(registrationId);
        try {
            const res = await fetch(`/api/tournaments/partner-invite/${registrationId}/${action}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = (err as { detail?: string }).detail ?? "Failed to respond.";
                setNotifications(prev => prev.map(n =>
                    n.reference_id === registrationId ? { ...n, body: `⚠️ ${msg}` } : n
                ));
                return;
            }
            setNotifications(prev => prev.map(n =>
                n.reference_id === registrationId
                    ? { ...n, type: action === "accept" ? "doubles_partner_accepted" : "doubles_partner_declined", is_read: true }
                    : n
            ));
        } catch (err) {
            console.error(`[NavBar] handlePartnerInviteResponse error:`, err);
        } finally { setRespondingId(null); }
    }

    async function handlePartyInviteResponse(invitationId: string, action: "accept" | "decline") {
        const token = getAccessToken();
        if (!token) return;
        setRespondingId(invitationId);
        try {
            const res = await fetch(`/api/parties/invitation/${invitationId}/${action}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = err.detail ?? "Failed to respond";
                setNotifications(prev => prev.map(n =>
                    n.reference_id === invitationId ? { ...n, body: `⚠️ ${msg}` } : n
                ));
                return;
            }
            setNotifications(prev => prev.map(n =>
                n.reference_id === invitationId
                    ? { ...n, type: action === "accept" ? "party_accepted" : "party_declined", is_read: true }
                    : n
            ));
            // Bring Player B to the party page so they can see queue + match state in real-time
            if (action === "accept") {
                setDropdownOpen(false);
                router.push("/matches/party");
            }
        } catch (err) {
            console.error(`[NavBar] handlePartyInviteResponse error:`, err);
        } finally { setRespondingId(null); }
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            <nav className="relative z-30 border-b border-white/[0.08] bg-zinc-950/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] px-4 sm:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handleLogoClick}
                        aria-label="Go to dashboard"
                        className="transition-transform active:scale-95"
                    >
                        <Image src="/logo.png" alt="iSMS" width={120} height={40} priority className="h-10 w-auto" />
                    </button>
                    {username && (
                        <span className="hidden sm:block text-xs text-zinc-400 border-l border-zinc-700 pl-3">
                            {username}
                        </span>
                    )}
                    {isAdmin && (
                        <Link
                            href="/admin"
                            className="hidden lg:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                            style={{
                                background: "rgba(239,68,68,0.12)",
                                border: "1px solid rgba(239,68,68,0.25)",
                                color: "rgba(252,165,165,0.9)",
                            }}
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Admin
                        </Link>
                    )}
                </div>

                {navLinks && (
                    <div className="hidden md:flex items-center gap-4 flex-1 px-6">
                        {navLinks}
                    </div>
                )}

                {/* Party status pill — visible on every page when user is in an active party */}
                {partyStatus && (
                    <button
                        onClick={() => router.push("/matches/party")}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all mr-2"
                        style={{
                            background: partyStatus === "in_queue"
                                ? "rgba(139,92,246,0.18)"
                                : "rgba(34,197,94,0.12)",
                            border: partyStatus === "in_queue"
                                ? "1px solid rgba(139,92,246,0.4)"
                                : "1px solid rgba(34,197,94,0.3)",
                            color: partyStatus === "in_queue" ? "#a78bfa" : "#4ade80",
                        }}
                    >
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                style={{ background: partyStatus === "in_queue" ? "#a78bfa" : "#4ade80" }} />
                            <span className="relative inline-flex rounded-full h-2 w-2"
                                style={{ background: partyStatus === "in_queue" ? "#a78bfa" : "#4ade80" }} />
                        </span>
                        {partyStatus === "in_queue" ? "In Queue" : partyStatus === "ready" ? "Party Ready" : "In Party"}
                    </button>
                )}

                <div className="flex items-center gap-4">
                    {/* Notification bell */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={handleOpenDropdown}
                            className="relative text-zinc-400 hover:text-white transition-colors p-1"
                            aria-label="Notifications"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 text-zinc-950 text-[10px] font-black rounded-full flex items-center justify-center leading-none">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </button>

                        {dropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                                    <span className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Notifications</span>
                                    <Link href="/referee" className="text-xs text-blue-400 hover:underline">My Referee Matches</Link>
                                </div>

                                {notifications.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-zinc-600 text-sm">No notifications yet.</div>
                                ) : (
                                    <div className="max-h-96 overflow-y-auto">
                                        {notifications.map(n => {
                                            const dest = resolveNotifLink(n.type, n.reference_id);
                                            const hasInlineActions = (n.type === "referee_invite" || n.type === "friend_request" || n.type === "doubles_partner_invite" || n.type === "party_invite") && !!n.reference_id;
                                            const rowContent = (
                                                <>
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-lg shrink-0 mt-0.5">{notifIcon(n.type)}</span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <p className="text-sm font-semibold text-white leading-snug">{n.title}</p>
                                                                {!n.is_read && (
                                                                    <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0 mt-1" />
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-zinc-400 mt-0.5">{n.body}</p>
                                                            {dest && !hasInlineActions && (
                                                                <p className="text-[11px] text-blue-400/70 mt-1">{dest.label}</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Referee invite inline actions */}
                                                    {n.type === "referee_invite" && n.reference_id && (
                                                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handleRefereeResponse(n.reference_id!, "accepted")} disabled={respondingId === n.reference_id} className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                {respondingId === n.reference_id ? "…" : "✓ Accept"}
                                                            </button>
                                                            <button onClick={() => handleRefereeResponse(n.reference_id!, "declined")} disabled={respondingId === n.reference_id} className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                ✕ Decline
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Friend request inline actions */}
                                                    {n.type === "friend_request" && n.reference_id && (
                                                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handleFriendResponse(n.reference_id!, "accept")} disabled={respondingId === n.reference_id} className="flex-1 bg-blue-500 hover:bg-blue-400 text-zinc-950 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                {respondingId === n.reference_id ? "…" : "✓ Accept"}
                                                            </button>
                                                            <button onClick={() => handleFriendResponse(n.reference_id!, "decline")} disabled={respondingId === n.reference_id} className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                Decline
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Doubles partner invite inline actions */}
                                                    {n.type === "doubles_partner_invite" && n.reference_id && (
                                                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handlePartnerInviteResponse(n.reference_id!, "accept")} disabled={respondingId === n.reference_id} className="flex-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                {respondingId === n.reference_id ? "…" : "✓ Accept"}
                                                            </button>
                                                            <button onClick={() => handlePartnerInviteResponse(n.reference_id!, "decline")} disabled={respondingId === n.reference_id} className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                Decline
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Party invite inline actions */}
                                                    {n.type === "party_invite" && n.reference_id && (
                                                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handlePartyInviteResponse(n.reference_id!, "accept")} disabled={respondingId === n.reference_id} className="flex-1 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                {respondingId === n.reference_id ? "…" : "✓ Accept"}
                                                            </button>
                                                            <button onClick={() => handlePartyInviteResponse(n.reference_id!, "decline")} disabled={respondingId === n.reference_id} className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                Decline
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                            return dest && !hasInlineActions ? (
                                                <Link
                                                    key={n.id}
                                                    href={dest.href}
                                                    onClick={() => setDropdownOpen(false)}
                                                    className={`block px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors ${!n.is_read ? "bg-blue-500/5" : ""}`}
                                                >
                                                    <div className="flex flex-col gap-2">{rowContent}</div>
                                                </Link>
                                            ) : (
                                                <div key={n.id} className={`px-4 py-3 border-b border-white/5 last:border-0 flex flex-col gap-2 ${!n.is_read ? "bg-blue-500/5" : ""}`}>
                                                    {rowContent}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {backHref && backLabel && (
                        <Link href={backHref} className="hidden sm:block text-sm text-zinc-400 hover:text-white transition-colors">
                            {backLabel}
                        </Link>
                    )}

                    {/* Mobile Menu Button */}
                    <div className="md:hidden relative" ref={mobileMenuRef}>
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="p-1 text-zinc-400 hover:text-white transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"} />
                            </svg>
                        </button>

                        {mobileMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                                <div className="flex flex-col p-2">
                                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/dashboard" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🏠</span>
                                        <span className="text-sm font-bold">Dashboard</span>
                                    </Link>
                                    <Link href="/matches" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/matches" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🎾</span>
                                        <span className="text-sm font-bold">Matches</span>
                                    </Link>
                                    <Link href="/clubs" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/clubs" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🏢</span>
                                        <span className="text-sm font-bold">Clubs</span>
                                    </Link>
                                    <Link href="/tournaments" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/tournaments" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🏆</span>
                                        <span className="text-sm font-bold">Tournaments</span>
                                    </Link>
                                    <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/leaderboard" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">📊</span>
                                        <span className="text-sm font-bold">Leaderboard</span>
                                    </Link>
                                    <Link href="/friends" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/friends" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">👥</span>
                                        <span className="text-sm font-bold">Friends</span>
                                    </Link>
                                    <Link href="/referee" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/referee" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🟡</span>
                                        <span className="text-sm font-bold">Referee</span>
                                    </Link>
                                    <div className="h-px bg-white/5 my-2" />
                                    <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${pathname === "/profile" ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">👤</span>
                                        <span className="text-sm font-bold">My Profile</span>
                                    </Link>
                                    <button 
                                        onClick={() => {
                                            setMobileMenuOpen(false);
                                            // Handle logout - we need to pass this or handle it here. 
                                            // Since NavBar is a client component, we can probably import it.
                                            import("@/lib/auth").then(({ clearAuthSession }) => {
                                                clearAuthSession();
                                                window.location.href = "/login";
                                            });
                                        }} 
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                        <span className="text-lg">🚪</span>
                                        <span className="text-sm font-bold">Logout</span>
                                    </button>
                                    {isAdmin && (
                                        <>
                                            <div className="h-px bg-white/5 my-2" />
                                            <Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
                                                <span className="text-lg">🛡️</span>
                                                <span className="text-sm font-bold">Admin Console</span>
                                            </Link>
                                        </>
                                    )}
                                    {backHref && backLabel && (
                                        <Link href={backHref} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:bg-white/5 transition-colors">
                                            <span className="text-lg">⬅️</span>
                                            <span className="text-sm font-bold">{backLabel}</span>
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            {/* ── Queue status banner ── */}
            <QueueBanner />

            {/* ── Bottom Navigation Bar (Mobile Only) ── */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-zinc-950/80 backdrop-blur-xl border-t border-white/10 px-6 py-3 pb-safe">
                <div className="flex items-center justify-between max-w-lg mx-auto">
                    <Link href="/dashboard" className={`flex flex-col items-center gap-1 ${pathname === "/dashboard" ? "text-blue-400" : "text-zinc-500"}`}>
                        <span className="text-xl">🏠</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Home</span>
                    </Link>
                    <Link href="/matches" className={`flex flex-col items-center gap-1 ${pathname === "/matches" ? "text-blue-400" : "text-zinc-500"}`}>
                        <span className="text-xl">🎾</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Play</span>
                    </Link>
                    <Link href="/clubs" className={`flex flex-col items-center gap-1 ${pathname === "/clubs" ? "text-blue-400" : "text-zinc-500"}`}>
                        <span className="text-xl">🏢</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Clubs</span>
                    </Link>
                    <Link href="/tournaments" className={`flex flex-col items-center gap-1 ${pathname === "/tournaments" ? "text-blue-400" : "text-zinc-500"}`}>
                        <span className="text-xl">🏆</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Events</span>
                    </Link>
                    <Link href="/profile" className={`flex flex-col items-center gap-1 ${pathname === "/profile" ? "text-blue-400" : "text-zinc-500"}`}>
                        <span className="text-xl">👤</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">Me</span>
                    </Link>
                </div>
            </div>

            {/* ── Toast notifications ── */}
            <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[200] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => {
                    const dest = resolveNotifLink(t.notif.type, t.notif.reference_id);
                    const hasInlineActions = (t.notif.type === "referee_invite" || t.notif.type === "friend_request" || t.notif.type === "party_invite") && !!t.notif.reference_id;
                    const dotColor =
                        t.notif.type === "referee_invite" || t.notif.type === "referee_request" ? "bg-blue-400" :
                        t.notif.type === "friend_request"         ? "bg-violet-400" :
                        t.notif.type === "match_pending_approval" ? "bg-yellow-400" :
                        t.notif.type.startsWith("tournament")     ? "bg-cyan-400" :
                        t.notif.type.startsWith("club_invite")    ? "bg-emerald-400" :
                        "bg-zinc-500";

                    const inner = (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5 min-w-0">
                                    <span className={`mt-1 shrink-0 w-2 h-2 rounded-full ${dotColor}`} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-white leading-tight">{t.notif.title}</p>
                                        <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{t.notif.body}</p>
                                        {dest && !hasInlineActions && (
                                            <p className="text-[10px] text-zinc-600 mt-1">{dest.label}</p>
                                        )}
                                    </div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); dismissToast(t.id); }} className="text-zinc-500 hover:text-white text-lg shrink-0 leading-none" aria-label="Dismiss">✕</button>
                            </div>

                            {t.notif.type === "referee_invite" && t.notif.reference_id && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => { handleRefereeResponse(t.notif.reference_id!, "accepted"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        {respondingId === t.notif.reference_id ? "…" : "✓ Accept"}
                                    </button>
                                    <button onClick={() => { handleRefereeResponse(t.notif.reference_id!, "declined"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        ✕ Decline
                                    </button>
                                </div>
                            )}

                            {t.notif.type === "friend_request" && t.notif.reference_id && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => { handleFriendResponse(t.notif.reference_id!, "accept"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        {respondingId === t.notif.reference_id ? "…" : "✓ Accept"}
                                    </button>
                                    <button onClick={() => { handleFriendResponse(t.notif.reference_id!, "decline"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        Decline
                                    </button>
                                </div>
                            )}

                            {t.notif.type === "doubles_partner_invite" && t.notif.reference_id && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => { handlePartnerInviteResponse(t.notif.reference_id!, "accept"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        {respondingId === t.notif.reference_id ? "…" : "✓ Accept"}
                                    </button>
                                    <button onClick={() => { handlePartnerInviteResponse(t.notif.reference_id!, "decline"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        Decline
                                    </button>
                                </div>
                            )}

                            {t.notif.type === "party_invite" && t.notif.reference_id && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => { handlePartyInviteResponse(t.notif.reference_id!, "accept"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        {respondingId === t.notif.reference_id ? "…" : "✓ Accept"}
                                    </button>
                                    <button onClick={() => { handlePartyInviteResponse(t.notif.reference_id!, "decline"); dismissToast(t.id); }} disabled={respondingId === t.notif.reference_id} className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        Decline
                                    </button>
                                </div>
                            )}
                        </>
                    );

                    return dest && !hasInlineActions ? (
                        <Link
                            key={t.id}
                            href={dest.href}
                            onClick={() => dismissToast(t.id)}
                            className="block bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl p-4 pointer-events-auto hover:border-white/25 transition-colors cursor-pointer"
                        >
                            {inner}
                        </Link>
                    ) : (
                        <div key={t.id} className="bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl p-4 pointer-events-auto">
                            {inner}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
