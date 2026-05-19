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
    data?: Record<string, string | null> | null;
    is_read: boolean;
    created_at: string;
}

interface ToastItem {
    id: string;
    notif: Notification;
}

interface GlobalAnnouncement {
    announcement_type: "new_club" | "new_tournament";
    id: string;
    name: string;
    sport: string;
    description: string;
    post_id: string;
    creator_name: string;
}

interface NavBarProps {
    backHref?: string;
    backLabel?: string;
    title?: string;
    navLinks?: ReactNode;   // extra links rendered between logo and bell
    hideLogo?: boolean;     // hide logo + username; shows back button on the left instead
}

function MobileNavIcon({
    kind,
    className = "w-5 h-5",
}: {
    kind: "hq" | "matches" | "clubs" | "tournaments" | "leaderboard" | "profile" | "play";
    className?: string;
}) {
    if (kind === "hq") {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5 12 3.75l8.25 6.75V20.25H14.25V15h-4.5v5.25H3.75V10.5Z" />
            </svg>
        );
    }
    if (kind === "matches") {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 5.25h9m-10.5 4.5h12m-10.5 4.5h9m-10.5 4.5h12" />
            </svg>
        );
    }
    if (kind === "clubs") {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 20.25h15M6 20.25V8.25l6-3 6 3v12M9 10.5h.008v.008H9V10.5Zm0 3h.008v.008H9V13.5Zm0 3h.008v.008H9V16.5Zm6-6h.008v.008H15V10.5Zm0 3h.008v.008H15V13.5Zm0 3h.008v.008H15V16.5Z" />
            </svg>
        );
    }
    if (kind === "tournaments") {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.503-1.125 1.125-1.125h.872m5.007 0V9.457c0-.621-.503-1.125-1.125-1.125h-3.465c-.622 0-1.125.503-1.125 1.125v5.918m4.716 0h-4.716m5.007 0h1.071c.621 0 1.125.503 1.125 1.125v1.125m-7.203-2.25H6.429c-.621 0-1.125.503-1.125 1.125v1.125m9.234-9.457V4.462c0-.621-.503-1.125-1.125-1.125h-2.13c-.622 0-1.125.503-1.125 1.125v3.87m4.38 0h-4.38" />
            </svg>
        );
    }
    if (kind === "leaderboard") {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125v-11.25ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
        );
    }
    if (kind === "profile") {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.118a7.5 7.5 0 0 1 15 0" />
            </svg>
        );
    }
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 8.25 12h4.5l-2.25 7.5 7.5-10.5h-4.5l2.25-4.5Z" />
        </svg>
    );
}

function isSameLocalDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function formatNotificationTimestamp(createdAt: string) {
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) return "";

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const timeLabel = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);

    if (isSameLocalDay(parsed, now)) {
        return `Today at ${timeLabel}`;
    }

    if (isSameLocalDay(parsed, yesterday)) {
        return `Yesterday at ${timeLabel}`;
    }

    const dateLabel = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(parsed);

    return `${dateLabel} at ${timeLabel}`;
}

export default function NavBar({ backHref, backLabel, title, navLinks, hideLogo }: NavBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [notifications,  setNotifications]  = useState<Notification[]>([]);
    const [unreadCount,    setUnreadCount]     = useState(0);
    const [feedUnreadCount, setFeedUnreadCount] = useState(() => {
        if (typeof window !== "undefined") {
            return parseInt(localStorage.getItem("feed_unread_count") ?? "0", 10) || 0;
        }
        return 0;
    });
    const [dropdownOpen,   setDropdownOpen]    = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen]  = useState(false);
    const [respondingId,   setRespondingId]    = useState<string | null>(null);
    const [toasts,         setToasts]          = useState<ToastItem[]>([]);
    const [announcement,   setAnnouncement]    = useState<GlobalAnnouncement | null>(null);
    const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [firstName,      setFirstName]      = useState<string | null>(null);
    const [lastName,       setLastName]       = useState<string | null>(null);
    const [isAdmin,        setIsAdmin]        = useState(false);
    const [partyStatus,    setPartyStatus]    = useState<string | null>(null); // "forming"|"ready"|"in_queue"
    const [missingPhone,   setMissingPhone]   = useState(false);

    const dropdownRef       = useRef<HTMLDivElement>(null);
    const profileRef        = useRef<HTMLDivElement>(null);
    const [profileOpen,    setProfileOpen]     = useState(false);
    const mobileMenuRef     = useRef<HTMLDivElement>(null);
    const pollRef           = useRef<ReturnType<typeof setInterval> | null>(null);
    const toastedIdsRef     = useRef(new Set<string>());
    const notifInitializedRef = useRef(false);
    const sseRef            = useRef<EventSource | null>(null);

    function resolveMatchRoute(matchId: string, rawStatus: unknown): string {
        const status = typeof rawStatus === "string" ? rawStatus : "";
        return status === "awaiting_players" ? `/matches/${matchId}/lobby` : `/matches/${matchId}`;
    }

    function getNotificationClubId(notif: Notification): string | null {
        const clubId = notif.data?.club_id;
        return typeof clubId === "string" && clubId.length > 0 ? clubId : null;
    }

    function hasMatchApprovalActions(notif: Notification): boolean {
        return notif.type === "match_pending_approval"
            && !!notif.reference_id
            && !!getNotificationClubId(notif);
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
        const storedFirst = localStorage.getItem("first_name");
        const storedLast = localStorage.getItem("last_name");

        if (storedFirst && storedLast) {
            setFirstName(storedFirst);
            setLastName(storedLast);
        } else {
            // Fallback: Fetch from profile if missing from storage (e.g. first visit or cleared storage)
            const token = getAccessToken();
            if (token) {
                fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data?.profile) {
                            setFirstName(data.profile.first_name);
                            setLastName(data.profile.last_name);
                            localStorage.setItem("first_name", data.profile.first_name || "");
                            localStorage.setItem("last_name", data.profile.last_name || "");
                        }
                    }).catch(() => {});
            }
        }

        const roles: string[] = JSON.parse(localStorage.getItem("roles") ?? "[]");
        setIsAdmin(roles.includes("system_admin"));
    }, []);

    // Check once on mount whether the user has a phone number set
    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.profile) {
                    setMissingPhone(!data.profile.phone_number);
                }
            })
            .catch(() => {});

        // Clear badge immediately when user saves their phone number
        const handler = () => setMissingPhone(false);
        window.addEventListener("phone_number_saved", handler);
        return () => window.removeEventListener("phone_number_saved", handler);
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
                    const msg = JSON.parse(e.data) as { event?: string; count?: number };
                    if (msg.event === "new_notification") {
                        setUnreadCount(prev => prev + 1);
                        void fetchNotifications();
                    } else if (msg.event === "feed_unread_count" && typeof msg.count === "number") {
                        setFeedUnreadCount(msg.count);
                        localStorage.setItem("feed_unread_count", String(msg.count));
                        window.dispatchEvent(new CustomEvent("feed_unread_count", { detail: msg.count }));
                    } else if (msg.event === "global_announcement") {
                        const a = msg as unknown as GlobalAnnouncement & { event: string };
                        setAnnouncement(a);
                        setFeedUnreadCount(prev => prev + 1);
                        localStorage.setItem("feed_unread_count", String(
                            (parseInt(localStorage.getItem("feed_unread_count") ?? "0", 10) || 0) + 1
                        ));
                        if (announcementTimer.current) clearTimeout(announcementTimer.current);
                        announcementTimer.current = setTimeout(() => setAnnouncement(null), 10000);
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
                data:         payload.data ?? null,
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
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
                setMobileMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    useEffect(() => {
        if (!dropdownOpen) return;
        if (typeof window === "undefined" || window.innerWidth >= 640) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [dropdownOpen]);

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

    async function handleLogout() {
        const token = getAccessToken();
        // Tell the backend to clear the Redis session key so the next login
        // doesn't see a stale "active session". Fire-and-forget — always clear
        // local state regardless of whether the API call succeeds.
        if (token) {
            fetch("/api/auth/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
        }
        clearAuthSession();
        window.location.href = "/login";
    }

    function isActiveRoute(href: string) {
        if (href === "/dashboard") return pathname === "/dashboard";
        if (href === "/matches/queue") return pathname === "/matches/queue";
        if (href === "/matches") return pathname === "/matches" || (pathname.startsWith("/matches/") && !pathname.startsWith("/matches/queue"));
        return pathname === href || pathname.startsWith(`${href}/`);
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
    function resolveNotifLink(
        type: string,
        referenceId: string | null,
        data?: Record<string, string | null> | null,
    ): { href: string; label: string } | null {
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
            case "tournament_match_called":
                return referenceId ? { href: `/matches/${referenceId}/lobby`, label: "Join match lobby ->" } : null;
            case "tournament_match_reminder":
            case "tournament_match_update":
            case "tournament_match_started":
            case "tournament_match_ready":
            case "tournament_match_verified":
            case "tournament_match_disputed":
                return referenceId ? { href: `/matches/${referenceId}`, label: "View match ->" } : null;

            case "doubles_partner_invite":
                return null;

            // ── Match ────────────────────────────────────────────────────
            case "match_pending_approval":
                if (typeof data?.club_id === "string" && data.club_id.length > 0) {
                    return { href: `/clubs/${data.club_id}/admin`, label: "Review request ->" };
                }
                return referenceId ? { href: `/matches/${referenceId}`, label: "View match â†’" } : null;
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
            // open_play session notifications reference_id is session.id
            case "open_play_session":
            case "open_play_join":
            case "open_play_promoted":
            case "open_play_cancelled":
            case "open_play_live":
            case "open_play_call":
            case "open_play_skipped":
                return referenceId ? { href: `/open-play/${referenceId}`, label: "View session →" } : { href: `/clubs`, label: "View open play →" };

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

    async function handleMatchApprovalResponse(notif: Notification, decision: "approve" | "reject") {
        const token = getAccessToken();
        const matchId = notif.reference_id;
        const clubId = getNotificationClubId(notif);
        if (!token || !matchId || !clubId) return;

        setRespondingId(notif.id);
        try {
            const res = await fetch(`/api/clubs/${clubId}/matches/${matchId}/${decision}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: decision === "reject"
                    ? JSON.stringify({ reason: "The club did not approve this match." })
                    : undefined,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = (err as { detail?: string }).detail ?? `Failed to ${decision} match.`;
                setNotifications(prev => prev.map(n =>
                    n.id === notif.id ? { ...n, body: `⚠️ ${msg}` } : n
                ));
                setToasts(prev => prev.map(t =>
                    t.notif.id === notif.id ? { ...t, notif: { ...t.notif, body: `⚠️ ${msg}` } } : t
                ));
                return;
            }

            await fetch(`/api/notifications/${notif.id}/read`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});

            const approved = decision === "approve";
            const nextType = approved ? "match_approved" : "match_rejected";
            const nextTitle = approved ? "Match Approved" : "Match Rejected";
            const nextBody = approved
                ? "You approved this club match."
                : "You rejected this club match.";

            setNotifications(prev => prev.map(n =>
                n.id === notif.id
                    ? { ...n, type: nextType, title: nextTitle, body: nextBody, is_read: true }
                    : n
            ));
            setToasts(prev => prev.map(t =>
                t.notif.id === notif.id
                    ? { ...t, notif: { ...t.notif, type: nextType, title: nextTitle, body: nextBody, is_read: true } }
                    : t
            ));
            if (!notif.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
            void fetchNotifications();
        } catch (err) {
            console.error("[NavBar] handleMatchApprovalResponse error:", err);
        } finally {
            setRespondingId(null);
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
            <nav className="sticky top-0 z-50 h-[64px] border-b border-white/5 bg-[#050b14]/80 backdrop-blur-xl px-[var(--mobile-padding)] sm:px-6 flex items-center justify-between shadow-lg shadow-black/20">
                <div className="flex items-center gap-3 shrink-0">
                    {hideLogo && backHref ? (
                        <Link
                            href={backHref}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/60 transition-all text-sm font-bold"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            {backLabel ?? "Back"}
                        </Link>
                    ) : (
                        <>
                            {pathname !== "/dashboard" && (
                                <button
                                    type="button"
                                    onClick={handleLogoClick}
                                    aria-label="Go to dashboard"
                                    className="transition-transform active:scale-95"
                                >
                                    <Image src="/logo.png" alt="iSMS" width={120} height={40} priority className={`w-auto ${title ? "h-8 sm:h-10" : "h-10"}`} />
                                </button>
                            )}
                            {firstName && pathname !== "/dashboard" && (
                                <span className="hidden sm:block text-xs text-zinc-400 border-l border-zinc-700 pl-3">
                                    {firstName}
                                </span>
                            )}
                        </>
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

                {title && (
                    <div className="pointer-events-none absolute inset-x-0 flex justify-center px-24 sm:hidden">
                        <span className="truncate text-sm font-semibold tracking-[0.01em] text-zinc-100">
                            {title}
                        </span>
                    </div>
                )}

                {navLinks && (
                    <div className="hidden md:flex items-center gap-1 flex-1 px-8">
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
                            className="relative rounded-xl border border-white/5 bg-white/[0.03] p-2 text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
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
                            <>
                                <button
                                    type="button"
                                    aria-label="Close notifications"
                                    onClick={() => setDropdownOpen(false)}
                                    className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] sm:hidden"
                                />
                                <div className="fixed inset-x-3 top-[76px] z-50 max-h-[min(72vh,560px)] overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900 shadow-2xl sm:absolute sm:right-0 sm:left-auto sm:top-full sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)] sm:max-h-none sm:rounded-2xl">
                                    <div className="px-4 py-3.5 border-b border-white/5 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <span className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Notifications</span>
                                            <p className="mt-1 text-[11px] text-zinc-500 sm:hidden">Updates, invites, and match alerts</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Link href="/referee" className="text-xs text-blue-400 hover:underline whitespace-nowrap">My Referee Matches</Link>
                                            <button
                                                type="button"
                                                onClick={() => setDropdownOpen(false)}
                                                className="sm:hidden rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-bold text-zinc-300"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>

                                    {notifications.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-zinc-600 text-sm">No notifications yet.</div>
                                    ) : (
                                        <div className="max-h-[calc(72vh-72px)] overflow-y-auto overscroll-contain sm:max-h-96">
                                            {notifications.map(n => {
                                            const dest = resolveNotifLink(n.type, n.reference_id, n.data);
                                            const hasInlineActions = (
                                                (n.type === "referee_invite" || n.type === "friend_request" || n.type === "doubles_partner_invite" || n.type === "party_invite")
                                                && !!n.reference_id
                                            ) || hasMatchApprovalActions(n);
                                            const receivedAt = formatNotificationTimestamp(n.created_at);
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
                                                            {receivedAt && (
                                                                <p className="text-[11px] text-zinc-500 mt-1">{receivedAt}</p>
                                                            )}
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

                                                    {hasMatchApprovalActions(n) && (
                                                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => handleMatchApprovalResponse(n, "approve")} disabled={respondingId === n.id} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                {respondingId === n.id ? "â€¦" : "Approve"}
                                                            </button>
                                                            <button onClick={() => handleMatchApprovalResponse(n, "reject")} disabled={respondingId === n.id} className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                                                Reject
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
                            </>
                        )}
                    </div>

                    {/* Desktop Profile Dropdown */}
                    <div className="hidden md:block relative" ref={profileRef}>
                        <button
                            onClick={() => setProfileOpen(!profileOpen)}
                            className="flex items-center gap-3 px-3 py-1.5 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                        >
                            <div className="flex flex-col items-end">
                                <span className="text-xs font-bold text-white leading-none">
                                    {firstName} {lastName}
                                </span>
                            </div>
                            <div className="relative">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-black">
                                    {firstName?.[0].toUpperCase()}
                                </div>
                                {missingPhone && (
                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#050b14] flex items-center justify-center">
                                        <span className="text-white text-[7px] font-black leading-none">!</span>
                                    </span>
                                )}
                            </div>
                        </button>

                        {profileOpen && (
                            <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden py-2">
                                <Link href="/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/5 hover:text-white transition-colors">
                                    <span className="text-sm">👤</span>
                                    <span className="flex-1">Profile</span>
                                    {missingPhone && (
                                        <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 uppercase tracking-wide">
                                            Add Phone
                                        </span>
                                    )}
                                </Link>
                                <Link href="/matches" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/5 hover:text-white transition-colors">
                                    <span className="text-sm">🎾</span>
                                    Match History
                                </Link>
                                <div className="h-px bg-white/5 my-1" />
                                <button
                                    onClick={() => { setProfileOpen(false); void handleLogout(); }}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <span className="text-sm">🚪</span>
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>

                    {backHref && backLabel && !hideLogo && (
                        <Link href={backHref} className="hidden sm:block text-sm text-zinc-400 hover:text-white transition-colors">
                            {backLabel}
                        </Link>
                    )}

                    {/* Mobile Menu Button */}
                    <div className="md:hidden relative" ref={mobileMenuRef}>
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="rounded-xl border border-white/5 bg-white/[0.03] p-2 text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"} />
                            </svg>
                        </button>

                        {mobileMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                                <div className="flex flex-col p-2">
                                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/dashboard") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🏠</span>
                                        <span className="text-sm font-bold">Dashboard</span>
                                    </Link>
                                    <Link href="/matches" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/matches") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🎾</span>
                                        <span className="text-sm font-bold">Matches</span>
                                    </Link>
                                    <Link href="/clubs" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/clubs") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🏢</span>
                                        <span className="text-sm font-bold">Clubs</span>
                                    </Link>
                                    <Link href="/tournaments" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/tournaments") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🏆</span>
                                        <span className="text-sm font-bold">Tournaments</span>
                                    </Link>
                                    <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/leaderboard") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">📊</span>
                                        <span className="text-sm font-bold">Leaderboard</span>
                                    </Link>
                                    <Link href="/friends" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/friends") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">👥</span>
                                        <span className="text-sm font-bold">Friends</span>
                                    </Link>
                                    <Link href="/referee" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/referee") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">🟡</span>
                                        <span className="text-sm font-bold">Referee</span>
                                    </Link>
                                    <Link href="/help" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/help") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">❓</span>
                                        <span className="text-sm font-bold">Help & FAQ</span>
                                    </Link>
                                    <div className="h-px bg-white/5 my-2" />
                                    <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActiveRoute("/profile") ? "bg-blue-600/10 text-blue-400" : "text-zinc-300 hover:bg-white/5"}`}>
                                        <span className="text-lg">👤</span>
                                        <span className="text-sm font-bold">Profile</span>
                                    </Link>
                                    <button 
                                        onClick={() => {
                                            setMobileMenuOpen(false);
                                            void handleLogout();
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
            <div className="md:hidden fixed inset-x-0 bottom-0 z-[100] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
                <div className="mx-auto max-w-md rounded-[28px] border border-white/10 bg-[#050b14]/95 px-3 py-2.5 shadow-[0_24px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
                    <div className="grid grid-cols-[1fr_1fr_auto_1fr_1fr] items-end gap-1">
                        <Link href="/dashboard" className={`flex flex-col items-center gap-1.5 px-1 py-1 ${isActiveRoute("/dashboard") ? "text-cyan-400" : "text-slate-500"}`}>
                            <MobileNavIcon kind="hq" className="w-5 h-5" />
                            <span className="text-center text-[8px] font-black uppercase tracking-widest leading-none">HQ</span>
                        </Link>
                        <Link href="/matches" className={`flex flex-col items-center gap-1.5 px-1 py-1 ${isActiveRoute("/matches") ? "text-cyan-400" : "text-slate-500"}`}>
                            <MobileNavIcon kind="matches" className="w-5 h-5" />
                            <span className="text-center text-[8px] font-black uppercase tracking-widest leading-none">Matches</span>
                        </Link>

                        {/* Floating Center "PLAY" Button */}
                        <div className="flex flex-col items-center gap-1 px-1">
                            <Link href="/matches/queue" className={`-mt-10 flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-[1.5rem] border shadow-[0_12px_30px_rgba(6,182,212,0.3)] transition-all active:scale-90 ${
                                isActiveRoute("/matches/queue")
                                    ? "border-cyan-400/50 bg-gradient-to-br from-cyan-500 to-blue-600"
                                    : "border-white/10 bg-zinc-900"
                            }`}>
                                <MobileNavIcon kind="play" className={`w-7 h-7 ${isActiveRoute("/matches/queue") ? "text-white" : "text-cyan-500"}`} />
                                <span className={`text-center text-[8px] font-black uppercase tracking-widest leading-none ${isActiveRoute("/matches/queue") ? "text-white" : "text-cyan-500"}`}>Play</span>
                            </Link>
                        </div>

                        <Link href="/friends" className={`flex flex-col items-center gap-1.5 px-1 py-1 ${isActiveRoute("/friends") ? "text-cyan-400" : "text-slate-500"}`}>
                            <MobileNavIcon kind="leaderboard" className="w-5 h-5" />
                            <span className="text-center text-[8px] font-black uppercase tracking-widest leading-none">Social</span>
                        </Link>
                        <Link href="/profile" className={`relative flex flex-col items-center gap-1.5 px-1 py-1 ${isActiveRoute("/profile") ? "text-cyan-400" : "text-slate-500"}`}>
                            <div className="relative">
                                <MobileNavIcon kind="profile" className="w-5 h-5" />
                                {missingPhone && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border border-[#050b14]" />
                                )}
                            </div>
                            <span className="text-center text-[8px] font-black uppercase tracking-widest leading-none">User</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── Toast notifications ── */}
            <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[200] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => {
                    const dest = resolveNotifLink(t.notif.type, t.notif.reference_id, t.notif.data);
                    const hasInlineActions = (
                        (t.notif.type === "referee_invite" || t.notif.type === "friend_request" || t.notif.type === "party_invite")
                        && !!t.notif.reference_id
                    ) || hasMatchApprovalActions(t.notif);
                    const receivedAt = formatNotificationTimestamp(t.notif.created_at);
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
                                        {receivedAt && (
                                            <p className="text-[11px] text-zinc-500 mt-1">{receivedAt}</p>
                                        )}
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

                            {hasMatchApprovalActions(t.notif) && (
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => { handleMatchApprovalResponse(t.notif, "approve"); dismissToast(t.id); }} disabled={respondingId === t.notif.id} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        {respondingId === t.notif.id ? "â€¦" : "Approve"}
                                    </button>
                                    <button onClick={() => { handleMatchApprovalResponse(t.notif, "reject"); dismissToast(t.id); }} disabled={respondingId === t.notif.id} className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50 touch-manipulation">
                                        Reject
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

            {/* ── Global Announcement Modal ── */}
            {announcement && (
                <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[calc(100vw-2rem)] max-w-sm pointer-events-auto">
                    <div
                        className="rounded-2xl border border-white/10 bg-[#0d1722]/95 backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden"
                        style={{ animation: "slideUp 0.3s ease" }}
                    >
                        {/* colour strip */}
                        <div className={`h-1 w-full ${announcement.announcement_type === "new_tournament" ? "bg-violet-500" : "bg-cyan-500"}`} />

                        <div className="p-4">
                            {/* header row */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 ${announcement.announcement_type === "new_tournament" ? "bg-violet-500/15 text-violet-400" : "bg-cyan-500/15 text-cyan-400"}`}>
                                        {announcement.announcement_type === "new_tournament" ? "🏆" : "🏟️"}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                                            {announcement.announcement_type === "new_tournament" ? "New Tournament" : "New Club"}
                                        </p>
                                        <p className="text-sm font-bold text-white leading-tight">{announcement.name}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setAnnouncement(null); if (announcementTimer.current) clearTimeout(announcementTimer.current); }}
                                    className="text-white/30 hover:text-white/70 transition-colors shrink-0 text-lg leading-none mt-0.5"
                                >×</button>
                            </div>

                            {/* sport + creator */}
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-white/40">
                                    {announcement.sport}
                                </span>
                                <span className="text-[10px] text-white/25">by {announcement.creator_name}</span>
                            </div>

                            {/* description */}
                            {announcement.description && (
                                <p className="mt-2 text-xs text-white/40 leading-relaxed line-clamp-2">{announcement.description}</p>
                            )}

                            {/* CTA */}
                            <Link
                                href={announcement.announcement_type === "new_tournament" ? `/tournaments/${announcement.id}` : `/clubs/${announcement.id}`}
                                onClick={() => { setAnnouncement(null); if (announcementTimer.current) clearTimeout(announcementTimer.current); }}
                                className={`mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                    announcement.announcement_type === "new_tournament"
                                        ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 border border-violet-500/20"
                                        : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/20"
                                }`}
                            >
                                {announcement.announcement_type === "new_tournament" ? "View Tournament" : "View Club"}
                                <span className="opacity-60">→</span>
                            </Link>
                        </div>

                        {/* auto-dismiss progress bar */}
                        <div className={`h-0.5 w-full ${announcement.announcement_type === "new_tournament" ? "bg-violet-500/30" : "bg-cyan-500/30"}`}>
                            <div
                                className={`h-full ${announcement.announcement_type === "new_tournament" ? "bg-violet-500" : "bg-cyan-500"}`}
                                style={{ animation: "shrinkWidth 10s linear forwards" }}
                            />
                        </div>
                    </div>

                    <style>{`
                        @keyframes slideUp {
                            from { opacity: 0; transform: translateY(16px); }
                            to   { opacity: 1; transform: translateY(0); }
                        }
                        @keyframes shrinkWidth {
                            from { width: 100%; }
                            to   { width: 0%; }
                        }
                    `}</style>
                </div>
            )}
        </>
    );
}
