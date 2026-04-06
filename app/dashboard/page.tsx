"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";
import {
    clearPendingOfflineMatchNotice,
    dispatchOfflineQueuedAction,
    listOfflineQueueKeys,
    OFFLINE_QUEUE_PREFIX,
    readOfflineQueue,
    readPendingOfflineMatchNotice,
    type PendingOfflineMatchNotice,
    writeOfflineQueue,
} from "@/lib/offline-match";
import NavBar from "@/components/NavBar";

const SPORTS_META: Record<string, { label: string; emoji: string; color: string; bg: string; border: string; glow: string }> = {
    pickleball:   { label: "Pickleball",   emoji: "🏓", color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    glow: "shadow-blue-500/10"    },
    badminton:    { label: "Badminton",    emoji: "🏸", color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20",  glow: "shadow-purple-500/10"  },
    lawn_tennis:  { label: "Lawn Tennis",  emoji: "🎾", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", glow: "shadow-emerald-500/10" },
    table_tennis: { label: "Table Tennis", emoji: "🏓", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  glow: "shadow-orange-500/10"  },
};

function UserAvatar({ first_name, last_name, username, avatar_url, size = "md" }: { first_name?: string; last_name?: string; username: string; avatar_url?: string | null; size?: "sm" | "md" | "lg" }) {
    const initials = (first_name?.[0] || username[0] || "?").toUpperCase() + (last_name?.[0] || "").toUpperCase();
    const sizes = {
        sm: "w-8 h-8 text-xs",
        md: "w-12 h-12 text-sm",
        lg: "w-16 h-16 text-xl",
    };
    if (avatar_url) {
        return (
            <img
                src={avatar_url}
                alt={username}
                loading="eager"
                className={`${sizes[size]} rounded-full object-cover shadow-lg shadow-blue-900/20 border border-white/10`}
            />
        );
    }
    return (
        <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/20 border border-white/10`}>
            {initials}
        </div>
    );
}

interface Profile {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
}

interface FriendSummary {
    friendship_id: string;
    since: string;
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    is_online: boolean;
}

interface Rating {
    sport: string;
    match_format: string,
    rating: number;
    rating_deviation: number;
    matches_played: number;
    wins: number;
    losses: number;
}

interface Sport {
    sport: string;
    registered_at: string;
}

interface AdminClub {
    id: string;
    name: string;
    sport: string | null;
}

interface CompLevel {
    sport:          string;
    match_format:   string;
    rating:         number;
    recent_matches: number;
    current_level:  { name: string; min_rating: number; max_rating: number | null; is_top_level: boolean; min_matches: number; active: boolean; recent_matches: number } | null;
    next_level:     { name: string; min_rating: number; rating_needed: number } | null;
}

const COMP_LEVEL_ICONS: Record<string, string> = {
    "Barangay":       "🌴",
    "City/Municipal": "🏙️",
    "Provincial":     "🌿",
    "Regional":       "👑",
    "National":       "🌐",
};

const COMP_LEVEL_COLORS: Record<string, { color: string; bg: string; border: string }> = {
    "Barangay":       { color: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    "City/Municipal": { color: "text-blue-300",   bg: "bg-blue-500/10",   border: "border-blue-500/20"  },
    "Provincial":     { color: "text-green-300",  bg: "bg-green-500/10",  border: "border-green-500/20" },
    "Regional":       { color: "text-yellow-300", bg: "bg-yellow-500/10", border: "border-yellow-500/20"},
    "National":       { color: "text-slate-200",  bg: "bg-slate-500/10",  border: "border-slate-500/20" },
};

const OFFLINE_SYNC_NOTICE_MS = 5000;
const MIN_MATCHES_FOR_AUTO_INSIGHT = 3;

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function DashboardPage() {
    const router = useRouter();
    const [profile,        setProfile]        = useState<Profile | null>(null);
    const [sports,         setSports]         = useState<Sport[]>([]);
    const [ratings,        setRatings]        = useState<Rating[]>([]);
    const [adminClubs,     setAdminClubs]     = useState<AdminClub[]>([]);
    const [compLevels,     setCompLevels]     = useState<CompLevel[]>([]);
    const [refOngoing,          setRefOngoing]          = useState(0);
    const [refInviteCount,      setRefInviteCount]      = useState(0);
    const [insight,             setInsight]             = useState<string | null>(null);
    const [insightDate,         setInsightDate]         = useState<string | null>(null);
    const [insightLoading,      setInsightLoading]      = useState(false);
    const [insightError,        setInsightError]        = useState("");
    const [completedMatchCount, setCompletedMatchCount] = useState(0);
    const [friends,             setFriends]             = useState<FriendSummary[]>([]);
    const [friendCount,         setFriendCount]         = useState(0);
    const [friendRequests,      setFriendRequests]      = useState(0);
    const [pendingMatchCount,   setPendingMatchCount]   = useState(0);
    const [tournamentInvites,   setTournamentInvites]   = useState(0);
    const [pendingClubRequests, setPendingClubRequests] = useState(0);
    const [loading,             setLoading]             = useState(true);
    const [sessionReplaced, setSessionReplaced] = useState(false);
    const [offlineMatchNotice, setOfflineMatchNotice] = useState<PendingOfflineMatchNotice | null>(null);
    const [offlineNoticeState, setOfflineNoticeState] = useState<"pending" | "syncing" | "synced">("pending");
    const autoInsightAttemptedRef = useRef(false);
    const offlineSyncingRef = useRef(false);
    const offlineNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Show a one-time notice if this login replaced another active session
    useEffect(() => {
        if (sessionStorage.getItem("session_replaced") === "1") {
            sessionStorage.removeItem("session_replaced");
            setSessionReplaced(true);
            // Auto-dismiss after 8 seconds
            setTimeout(() => setSessionReplaced(false), 8000);
        }
    }, []);

    const clearOfflineNoticeTimer = useCallback(() => {
        if (offlineNoticeTimerRef.current) {
            clearTimeout(offlineNoticeTimerRef.current);
            offlineNoticeTimerRef.current = null;
        }
    }, []);

    const applyInsight = useCallback((nextInsight: { insight_text: string; generated_at: string }) => {
        setInsight(nextInsight.insight_text);
        setInsightDate(nextInsight.generated_at);
        setInsightError("");
    }, []);

    const generateInsight = useCallback(async () => {
        const token = getAccessToken();
        if (!token || insightLoading) return false;

        setInsightLoading(true);
        setInsightError("");

        try {
            const res = await fetch("/api/insights/generate", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                setInsightError(data?.detail || data?.error || "Failed to generate AI insight.");
                return false;
            }

            if (data?.insight_text && data?.generated_at) {
                applyInsight(data);
                return true;
            }

            setInsightError("AI insight was generated, but no insight text was returned.");
            return false;
        } catch {
            setInsightError("Could not generate AI insight right now.");
            return false;
        } finally {
            setInsightLoading(false);
        }
    }, [applyInsight, insightLoading]);

    const syncOfflineMatchQueues = useCallback(async () => {
        const token = getAccessToken();
        if (!token || offlineSyncingRef.current) return;
        if (typeof window === "undefined") return;

        const queueKeys = listOfflineQueueKeys(localStorage);
        if (!queueKeys.length) {
            clearPendingOfflineMatchNotice(sessionStorage);
            setOfflineMatchNotice(null);
            return;
        }

        offlineSyncingRef.current = true;
        setOfflineNoticeState("syncing");

        let allSynced = true;

        for (const key of queueKeys) {
            const matchId = key.slice(OFFLINE_QUEUE_PREFIX.length);
            let queue = readOfflineQueue(localStorage, matchId);

            if (!queue.length) {
                writeOfflineQueue(localStorage, matchId, []);
                continue;
            }

            for (const action of [...queue]) {
                try {
                    const res = await dispatchOfflineQueuedAction(matchId, action, token);
                    if (res.ok || (res.status >= 400 && res.status < 500)) {
                        queue = queue.filter(item => item.qid !== action.qid);
                        writeOfflineQueue(localStorage, matchId, queue);
                    } else {
                        allSynced = false;
                        break;
                    }
                } catch {
                    allSynced = false;
                    break;
                }
            }

            if (!allSynced) break;
        }

        offlineSyncingRef.current = false;

        if (allSynced) {
            clearPendingOfflineMatchNotice(sessionStorage);
            clearOfflineNoticeTimer();
            setOfflineNoticeState("synced");
            offlineNoticeTimerRef.current = setTimeout(() => {
                setOfflineMatchNotice(null);
                offlineNoticeTimerRef.current = null;
            }, OFFLINE_SYNC_NOTICE_MS);
        } else {
            setOfflineNoticeState("pending");
        }
    }, [clearOfflineNoticeTimer]);

    useEffect(() => {
        const notice = readPendingOfflineMatchNotice(sessionStorage);
        if (notice) {
            setOfflineMatchNotice(notice);
            setOfflineNoticeState(navigator.onLine ? "syncing" : "pending");
            if (navigator.onLine) syncOfflineMatchQueues();
        } else if (navigator.onLine && listOfflineQueueKeys(localStorage).length > 0) {
            syncOfflineMatchQueues();
        }

        function handleOnline() {
            const nextNotice = readPendingOfflineMatchNotice(sessionStorage);
            if (nextNotice) setOfflineMatchNotice(nextNotice);
            if (nextNotice || listOfflineQueueKeys(localStorage).length > 0) {
                syncOfflineMatchQueues();
            }
        }

        function handleOffline() {
            const nextNotice = readPendingOfflineMatchNotice(sessionStorage);
            if (nextNotice) {
                clearOfflineNoticeTimer();
                setOfflineMatchNotice(nextNotice);
                setOfflineNoticeState("pending");
            }
        }

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
            clearOfflineNoticeTimer();
        };
    }, [clearOfflineNoticeTimer, syncOfflineMatchQueues]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }

        Promise.all([
            fetch("/api/players/me",                       { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/clubs/mine",                       { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/referee/my-matches",               { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/referee/my-invites",               { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/insights/me",                      { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/friends",                          { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/friends/requests",                 { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/leaderboard/competitive/me",       { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/matches?limit=100",                { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/tournaments/my-invitations",       { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/clubs/pending-requests",           { headers: { Authorization: `Bearer ${token}` } }),
        ])
        .then(async ([meRes, clubsRes, refMatchRes, refInviteRes, insightRes, friendsRes, friendReqRes, compRes, matchesRes, tournInviteRes, clubReqRes]) => {
            if (isUnauthorized(meRes.status)) {
                clearAuthSession(); router.replace("/login"); return;
            }
            if (meRes.ok) {
                const data = await meRes.json();
                setProfile(data.profile);
                setSports(data.sports);
                setRatings(data.ratings);
            }
            if (clubsRes.ok) {
                const data = await clubsRes.json();
                setAdminClubs(data.admin ?? []);
            }
            if (refMatchRes.ok) {
                const data = await refMatchRes.json();
                setRefOngoing((data.ongoing ?? []).length);
            }
            if (refInviteRes.ok) {
                const data = await refInviteRes.json();
                setRefInviteCount(data.count ?? 0);
            }
            if (insightRes.ok) {
                const data = await insightRes.json();
                if (data.insight) {
                    applyInsight(data.insight);
                }
            }
            if (friendsRes.ok) {
                const data = await friendsRes.json();
                setFriends(data.friends ?? []);
                setFriendCount(data.count ?? 0);
            }
            if (friendReqRes.ok) {
                const data = await friendReqRes.json();
                setFriendRequests(data.count ?? 0);
            }
            if (compRes.ok) {
                const data = await compRes.json();
                setCompLevels(data.competitive_levels ?? []);
            }
            if (matchesRes.ok) {
                const data = await matchesRes.json();
                const completed = (data.matches ?? []).filter(
                    (m: { status: string }) => m.status === "completed"
                );
                const pending = (data.matches ?? []).filter(
                    (m: { status: string }) => m.status === "pending_approval" || m.status === "pending"
                );
                setCompletedMatchCount(completed.length);
                setPendingMatchCount(pending.length);
            }
            if (tournInviteRes.ok) {
                const data = await tournInviteRes.json();
                setTournamentInvites(data.count ?? (data.invitations ?? []).length);
            }
            if (clubReqRes.ok) {
                const data = await clubReqRes.json();
                setPendingClubRequests(data.count ?? (data.requests ?? []).length);
            }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, [applyInsight, router]);

    useEffect(() => {
        const knownMatchCount = Math.max(
            completedMatchCount,
            ratings.reduce((sum, rating) => sum + rating.matches_played, 0),
        );
        if (loading || insight || insightLoading || autoInsightAttemptedRef.current) return;
        if (knownMatchCount < MIN_MATCHES_FOR_AUTO_INSIGHT) return;

        autoInsightAttemptedRef.current = true;
        void generateInsight();
    }, [completedMatchCount, generateInsight, insight, insightLoading, loading, ratings]);

    async function handleLogout() {
        const token = getAccessToken();
        // Tell the backend to clear the Redis session key first, then wipe local state.
        // Fire-and-forget: even if the network call fails, we still clear locally.
        if (token) {
            fetch("/api/auth/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
        }
        clearAuthSession();
        router.replace("/login");
    }

// AFTER — shows navbar and skeleton cards immediately
    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 text-white">
                <nav className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
                    <Image src="/logo.png" alt="iSMS" width={120} height={40} priority className="h-10 w-auto" />
                    <div className="h-4 w-48 bg-zinc-800/50 rounded animate-pulse" />
                </nav>
                <main className="max-w-7xl mx-auto px-6 py-10 flex flex-col gap-8">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full animate-pulse" />
                        <div className="h-10 w-64 bg-zinc-800/50 rounded-lg animate-pulse" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="h-28 bg-zinc-900 border border-white/5 rounded-2xl animate-pulse" />
                        ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                             {[1,2].map(i => (
                                <div key={i} className="h-64 bg-zinc-900 border border-white/5 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                        <div className="flex flex-col gap-4">
                             {[1,2,3].map(i => (
                                <div key={i} className="h-32 bg-zinc-900 border border-white/5 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        );
    }
    
    
    const totalMatches = ratings.reduce((sum, r) => sum + r.matches_played, 0);
    const totalWins    = ratings.reduce((sum, r) => sum + r.wins, 0);
    const totalLosses  = ratings.reduce((sum, r) => sum + r.losses, 0);
    const winRate      = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
    const insightMatchCount = Math.max(completedMatchCount, totalMatches);
    const matchesNeededForInsight = Math.max(MIN_MATCHES_FOR_AUTO_INSIGHT - insightMatchCount, 0);
    const displayInsightBase = insight ? insight.trim().replace(/^[\"'“”‘’]+|[\"'“”‘’]+$/g, "") : null;
    const usernamePattern = profile?.username ? escapeRegExp(profile.username) : null;
    const displayInsight = displayInsightBase && usernamePattern
        ? displayInsightBase
            .replace(new RegExp(`^@?${usernamePattern}\\s+demonstrates\\b`, "i"), "You demonstrate")
            .replace(new RegExp(`^@?${usernamePattern}\\s+has\\b`, "i"), "You have")
            .replace(new RegExp(`^@?${usernamePattern}\\s+have\\b`, "i"), "You have")
            .replace(new RegExp(`^@?${usernamePattern}\\s+are\\b`, "i"), "You are")
            .replace(new RegExp(`^@?${usernamePattern}\\s+need(?:s)?\\b`, "i"), "You need")
            .replace(new RegExp(`^@?${usernamePattern}\\s+should\\b`, "i"), "You should")
            .replace(new RegExp(`^@?${usernamePattern}\\s+can\\b`, "i"), "You can")
        : displayInsightBase;
    const onlineFriends = friends.filter((friend) => friend.is_online);
    const onlinePreview = onlineFriends.slice(0, 3);

    return (
        <div className="min-h-screen bg-zinc-950 text-white selection:bg-blue-500/30">
            {/* Background effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)
                        `,
                        backgroundSize: "40px 40px",
                    }}
                />
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
            </div>

            {/* Navbar */}
            <NavBar navLinks={<>
                <Link
                    href="/matches/queue"
                    className="text-sm bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                >
                    ⚡ Find Match
                </Link>
                <ProfileMenu username={profile?.username} avatarUrl={profile?.avatar_url} firstName={profile?.first_name} lastName={profile?.last_name} onLogout={handleLogout} />
            </>} />

            {/* Session-replaced notice */}
            {sessionReplaced && (
                <div className="relative z-20 max-w-7xl mx-auto px-6 pt-6">
                    <div className="flex items-start gap-4 px-5 py-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-md text-sm">
                        <span className="text-xl leading-none shrink-0">🔒</span>
                        <div className="flex-1">
                            <p className="font-bold text-yellow-200 uppercase tracking-wider text-[10px]">Security Notice</p>
                            <p className="text-yellow-100/80 mt-1">
                                Your previous session on another device was ended for security.
                            </p>
                        </div>
                        <button onClick={() => setSessionReplaced(false)} className="text-yellow-500/50 hover:text-yellow-200 transition-colors">✕</button>
                    </div>
                </div>
            )}

            {offlineMatchNotice && (
                <div className="fixed inset-x-0 top-20 z-30 px-4 pointer-events-none">
                    <div className={`mx-auto w-full max-w-md rounded-3xl border shadow-2xl backdrop-blur-md px-5 py-4 pointer-events-auto ${
                        offlineNoticeState === "pending"
                            ? "border-orange-500/30 bg-zinc-950/95"
                            : offlineNoticeState === "syncing"
                                ? "border-blue-500/30 bg-zinc-950/95"
                                : "border-emerald-500/30 bg-zinc-950/95"
                    }`}>
                        <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                                offlineNoticeState === "pending"
                                    ? "bg-orange-500/15 text-orange-300"
                                    : offlineNoticeState === "syncing"
                                        ? "bg-blue-500/15 text-blue-300"
                                        : "bg-emerald-500/15 text-emerald-300"
                            }`}>
                                {offlineNoticeState === "pending" ? "📶" : offlineNoticeState === "syncing" ? "↻" : "✓"}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={`text-sm font-black leading-tight ${
                                    offlineNoticeState === "pending"
                                        ? "text-orange-300"
                                        : offlineNoticeState === "syncing"
                                            ? "text-blue-300"
                                            : "text-emerald-300"
                                }`}>
                                    {offlineNoticeState === "pending"
                                        ? "Last Match Saved Offline"
                                        : offlineNoticeState === "syncing"
                                            ? "Back to Online"
                                            : "Last Match Synced"}
                                </p>
                                <p className="mt-1 text-sm text-zinc-300">
                                    {offlineNoticeState === "pending"
                                        ? offlineMatchNotice.message
                                        : offlineNoticeState === "syncing"
                                            ? "Wait for a moment while we sync your saved match to the server."
                                            : "Your last offline match is now saved online."}
                                </p>
                                <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                                    {offlineMatchNotice.sport.replace("_", " ")} match
                                </p>
                            </div>
                        </div>

                        {offlineNoticeState === "syncing" && (
                            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/5">
                                <div className="h-full w-3/5 rounded-full bg-blue-500/70 animate-pulse" />
                            </div>
                        )}

                        {offlineNoticeState === "synced" && (
                            <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-white/5">
                                <div
                                    className="h-full rounded-full bg-emerald-500/70"
                                    style={{ animation: `shrink ${OFFLINE_SYNC_NOTICE_MS}ms linear forwards` }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-10 pb-32 flex flex-col gap-10">

                {/* Welcome header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="flex items-center gap-5">
                        <UserAvatar
                            first_name={profile?.first_name}
                            last_name={profile?.last_name}
                            username={profile?.username || "Player"}
                            avatar_url={profile?.avatar_url}
                            size="lg"
                        />
                        <div className="min-w-0">
                            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight truncate">
                                Welcome, <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">{profile?.first_name || profile?.username}</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-zinc-500 text-sm font-medium truncate">@{profile?.username}</span>
                                <span className="w-1 h-1 bg-zinc-700 rounded-full shrink-0" />
                                <span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">Player</span>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 lg:flex lg:items-center gap-3">
                        <Link
                            href="/matches/queue"
                            className="flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 font-black px-6 py-4 rounded-2xl transition-all shadow-xl active:scale-[0.98] text-sm"
                        >
                            ⚡ Play Now
                        </Link>
                        <Link
                            href="/matches/new"
                            className="flex items-center justify-center bg-zinc-900 border border-white/10 hover:border-white/20 text-white font-black px-6 py-4 rounded-2xl transition-all active:scale-[0.98] text-sm"
                        >
                            🤝 Friendly
                        </Link>
                    </div>
                </div>

                {/* Referee invite alert */}
                {refInviteCount > 0 && (
                    <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/10 border border-yellow-500/20 rounded-2xl p-5 flex items-center justify-between gap-6 backdrop-blur-sm group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">🔔</div>
                            <div>
                                <p className="text-sm font-black text-yellow-400 uppercase tracking-wider">Action Required</p>
                                <p className="text-yellow-100/70 text-sm">You have {refInviteCount} pending referee invite{refInviteCount > 1 ? "s" : ""} waiting for response.</p>
                            </div>
                        </div>
                        <Link href="/referee/invites" className="bg-yellow-500 text-black text-xs font-black px-5 py-2.5 rounded-xl hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-900/20 flex-shrink-0">
                            RESPOND →
                        </Link>
                    </div>
                )}

                {/* Stats Section */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Matches Played", value: totalMatches, color: "text-white", icon: "📊" },
                        { label: "Total Wins", value: totalWins, color: "text-emerald-400", icon: "🎯", border: "border-emerald-500/20" },
                        { label: "Total Losses", value: totalLosses, color: "text-rose-400", icon: "🏳️", border: "border-rose-500/20" },
                        { label: "Win Rate", value: `${winRate}%`, color: "text-blue-400", icon: "📈", border: "border-blue-500/20" },
                    ].map((stat, i) => (
                        <div key={i} className={`bg-zinc-900/50 backdrop-blur-sm border ${stat.border || "border-white/5"} rounded-2xl p-6 flex flex-col gap-1 group hover:bg-zinc-900 transition-colors`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">{stat.label}</span>
                                <span className="opacity-50 group-hover:opacity-100 transition-opacity">{stat.icon}</span>
                            </div>
                            <span className={`text-4xl font-black ${stat.color}`}>{stat.value}</span>
                        </div>
                    ))}
                </div>

                {/* ── Quick Access ── */}
                <section>
                    <h2 className="text-xs font-black tracking-[0.4em] text-zinc-500 uppercase flex items-center gap-3 mb-4">
                        <span className="w-8 h-px bg-zinc-800" />
                        Quick Access
                    </h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
                        {[
                            { href: "/matches",      icon: "📋", label: "Matches",     badge: pendingMatchCount,   badgeColor: "bg-orange-500 text-white" },
                            { href: "/clubs",        icon: "🏢", label: "Clubs",       badge: pendingClubRequests, badgeColor: "bg-violet-500 text-white" },
                            { href: "/tournaments",  icon: "🏆", label: "Tournaments", badge: tournamentInvites,   badgeColor: "bg-cyan-500 text-zinc-950" },
                            { href: "/leaderboard",  icon: "📊", label: "Rankings",    badge: 0,                   badgeColor: "" },
                            { href: "/friends",      icon: "👥", label: "Friends",     badge: friendRequests,      badgeColor: "bg-blue-500 text-white" },
                            { href: "/referee",      icon: "🟡", label: "Referee",     badge: refInviteCount,      badgeColor: "bg-yellow-500 text-zinc-950" },
                            { href: "/rotation",     icon: "🔄", label: "Rotation",    badge: 0,                   badgeColor: "" },
                            { href: "/courts",       icon: "🏟️", label: "Courts",      badge: 0,                   badgeColor: "" },
                        ].map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="relative flex flex-col items-center gap-2 bg-zinc-900/50 hover:bg-zinc-800/60 border border-white/5 hover:border-white/10 rounded-2xl py-5 sm:py-4 px-2 transition-all group active:scale-95"
                            >
                                {item.badge > 0 && (
                                    <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 ${item.badgeColor} text-[10px] font-black rounded-full flex items-center justify-center shadow-lg shadow-black/50 leading-none z-10`}>
                                        {item.badge > 99 ? "99+" : item.badge}
                                    </span>
                                )}
                                <span className="text-3xl sm:text-2xl group-hover:scale-110 transition-transform">{item.icon}</span>
                                <span className="text-[10px] sm:text-[11px] font-black text-zinc-500 group-hover:text-zinc-300 transition-colors tracking-widest leading-none text-center uppercase">{item.label}</span>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* ── Book a Session ── */}
                <section>
                    <h2 className="text-xs font-black tracking-[0.4em] text-zinc-500 uppercase flex items-center gap-3 mb-4">
                        <span className="w-8 h-px bg-zinc-800" />
                        Book a Session
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Link
                            href="/clubs?mode=open-play"
                            className="group bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 rounded-3xl p-6 flex items-center gap-5 transition-all hover:shadow-xl hover:shadow-emerald-900/20 active:scale-[0.98]"
                        >
                            <div className="w-14 h-14 bg-emerald-500/15 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shrink-0">
                                🤝
                            </div>
                            <div>
                                <p className="font-black text-lg text-white leading-tight">Join Open Play</p>
                                <p className="text-emerald-400/70 text-xs mt-1">Find group sessions at nearby clubs</p>
                            </div>
                        </Link>
                        <Link
                            href="/clubs?mode=court-rental"
                            className="group bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/20 hover:border-cyan-500/40 rounded-3xl p-6 flex items-center gap-5 transition-all hover:shadow-xl hover:shadow-cyan-900/20 active:scale-[0.98]"
                        >
                            <div className="w-14 h-14 bg-cyan-500/15 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform shrink-0">
                                🏟️
                            </div>
                            <div>
                                <p className="font-black text-lg text-white leading-tight">Rent a Court</p>
                                <p className="text-cyan-400/70 text-xs mt-1">Book a private court by the hour</p>
                            </div>
                        </Link>
                    </div>
                </section>

                {/* ── Main Layout Grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LEFT — Your Sports */}
                    <div className="lg:col-span-2 flex flex-col gap-10">

                        <section>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xs font-black tracking-[0.4em] text-zinc-500 uppercase flex items-center gap-3">
                                    <span className="w-8 h-px bg-zinc-800" />
                                    Your Sports
                                </h2>
                                <Link href="/matches" className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest border-b border-blue-500/0 hover:border-blue-500/50 transition-all">Match History →</Link>
                            </div>
                            
                            {sports.length === 0 ? (
                                <div className="bg-zinc-900/50 border border-white/5 rounded-3xl p-12 text-center flex flex-col items-center gap-4">
                                    <div className="text-4xl opacity-20">🏐</div>
                                    <p className="text-zinc-500 font-medium">No sports registered yet.</p>
                                    <Link href="/profile" className="text-xs font-bold text-blue-400 hover:underline">Setup your sports in Profile →</Link>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {sports.map(({ sport }) => {
                                        const meta = SPORTS_META[sport];
                                        const bestRating = Math.max(...["singles","doubles"].map(
                                            fmt => ratings.find(r => r.sport === sport && r.match_format === fmt)?.rating ?? 1500
                                        ));

                                        return (
                                            <div key={sport} className={`bg-zinc-900/40 border-t-2 ${meta.border.replace("border-", "border-t-")} border-l border-r border-b border-white/5 rounded-2xl overflow-hidden group hover:bg-zinc-900/60 transition-all hover:shadow-2xl ${meta.glow}`}>
                                                <div className="p-6 flex flex-col gap-6">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-12 h-12 ${meta.bg} rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
                                                                {meta.emoji}
                                                            </div>
                                                            <div>
                                                                <span className={`font-black text-lg ${meta.color}`}>{meta.label}</span>
                                                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Best: {bestRating}</p>
                                                            </div>
                                                        </div>
                                                        <Link href={`/matches/queue?sport=${sport}`} className="bg-white/5 hover:bg-white/10 text-white text-[10px] sm:text-[11px] font-black px-5 py-2.5 sm:px-4 sm:py-2 rounded-xl transition-all active:scale-95 border border-white/5">
                                                            QUEUE →
                                                        </Link>
                                                    </div>

                                                    <div className="space-y-4">
                                                        {["singles", "doubles"].map(fmt => {
                                                            const fmtRating = ratings.find(r => r.sport === sport && r.match_format === fmt);
                                                            const fmtWinRate = fmtRating && fmtRating.matches_played > 0
                                                                ? Math.round((fmtRating.wins / fmtRating.matches_played) * 100)
                                                                : 0;
                                                            return (
                                                                <div key={fmt} className="bg-black/20 rounded-xl p-3 flex flex-col gap-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{fmt}</span>
                                                                        <span className="text-sm font-black">{fmtRating?.rating ?? 1500}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                                            <div 
                                                                                className={`h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000`} 
                                                                                style={{ width: `${fmtWinRate}%` }} 
                                                                            />
                                                                        </div>
                                                                        <span className="text-[10px] font-bold text-zinc-500 w-8 text-right">{fmtWinRate}%</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-[10px] font-bold">
                                                                        <span className="text-emerald-500">{fmtRating?.wins ?? 0}W</span>
                                                                        <span className="text-zinc-700">•</span>
                                                                        <span className="text-rose-500">{fmtRating?.losses ?? 0}L</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        <section>
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xs font-black tracking-[0.4em] text-zinc-500 uppercase flex items-center gap-3">
                                    <span className="w-8 h-px bg-zinc-800" />
                                    AI Insights
                                </h2>
                                <GenerateInsightButton
                                    loading={insightLoading}
                                    error={insightError}
                                    onGenerate={generateInsight}
                                />
                            </div>
                            
                            {insight ? (
                                <div className="bg-gradient-to-br from-zinc-900 to-black border border-blue-500/20 rounded-3xl p-8 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <div className="text-8xl">🤖</div>
                                    </div>
                                    <div className="relative z-10 flex flex-col gap-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl">🧠</div>
                                            <div>
                                                <span className="text-xs font-black text-blue-400 tracking-[0.2em] uppercase">AI Performance Coach</span>
                                                {insightDate && (
                                                    <p className="text-[10px] text-zinc-600 font-bold uppercase mt-0.5">Reported on {new Date(insightDate).toLocaleDateString()}</p>
                                                )}
                                                {insightLoading && (
                                                    <p className="text-[10px] text-blue-400 font-bold uppercase mt-1 tracking-widest">Generating...</p>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-zinc-300 text-lg leading-relaxed font-medium">
                                            {displayInsight}
                                        </p>
                                        <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                                            <div className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Strategy</div>
                                            <div className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Consistency</div>
                                        </div>
                                    </div>
                                </div>
                            ) : insightLoading ? (
                                <div className="bg-zinc-900/40 border border-blue-500/10 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                                    <p className="text-sm text-zinc-300 font-medium">Generating your AI performance insight from your recent matches.</p>
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">This can take a few seconds.</p>
                                </div>
                            ) : insightError ? (
                                <div className="bg-zinc-900/40 border border-red-500/20 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                                    <p className="text-sm text-red-300 font-medium">We could not generate your AI insight automatically.</p>
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{insightError}</p>
                                </div>
                            ) : insightMatchCount >= MIN_MATCHES_FOR_AUTO_INSIGHT ? (
                                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                                    <p className="text-sm text-zinc-300 font-medium">Your match data is ready for AI coaching.</p>
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">If your report is still missing, tap Generate to refresh it now.</p>
                                </div>
                            ) : (
                                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                                    <p className="text-sm text-zinc-500 font-medium">Your coach is waiting for more match data.</p>
                                    <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest">
                                        Complete {matchesNeededForInsight} more match{matchesNeededForInsight === 1 ? "" : "es"} to unlock insights.
                                    </p>
                                </div>
                            )}
                        </section>

                    </div>

                    {/* RIGHT — Sidebar */}
                    <div className="flex flex-col gap-10">

                        {/* My Clubs */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase">My Clubs</h3>
                                <Link href="/clubs" className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">All →</Link>
                            </div>
                            
                            {adminClubs.length === 0 ? (
                                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 text-center flex flex-col gap-4">
                                    <p className="text-xs text-zinc-500 font-medium">No active clubs.</p>
                                    <Link href="/clubs/create" className="bg-white/5 hover:bg-white/10 text-white text-[10px] font-black py-2.5 rounded-xl transition-all">
                                        + CREATE CLUB
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {adminClubs.map(club => (
                                        <div key={club.id} className="bg-zinc-900/40 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between group hover:bg-zinc-900 transition-all">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-xl shrink-0">🏢</div>
                                                <div className="min-w-0">
                                                    <Link href={`/clubs/${club.id}`} className="text-sm font-bold text-white hover:text-emerald-400 transition-colors truncate block">
                                                        {club.name}
                                                    </Link>
                                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{club.sport?.replace("_", " ") ?? "Multi-sport"}</p>
                                                </div>
                                            </div>
                                            <Link href={`/clubs/${club.id}/admin`} className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black text-[10px] font-black px-3 py-1.5 rounded-lg transition-all flex-shrink-0">
                                                ADMIN
                                            </Link>
                                        </div>
                                    ))}
                                    <Link href="/clubs/create" className="block text-[10px] text-zinc-600 hover:text-zinc-400 text-center font-black tracking-[0.2em] transition-colors py-2">
                                        + CREATE NEW CLUB
                                    </Link>
                                </div>
                            )}
                        </section>

                        {/* Friends & Social */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase">Social</h3>
                                <Link href="/friends" className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Network →</Link>
                            </div>
                            <div className="space-y-3">
                                <Link href="/friends" className="bg-zinc-900/40 border border-white/5 hover:border-blue-500/20 rounded-2xl p-4 flex items-center gap-4 transition-all group">
                                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">👥</div>
                                    <div className="min-w-0 flex-1">
                                        <span className="font-black text-sm block">{friendCount} Friend{friendCount === 1 ? "" : "s"}</span>
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                                            {onlineFriends.length > 0 ? `${onlineFriends.length} online now` : "Manage Circle"}
                                        </span>
                                        {onlinePreview.length > 0 && (
                                            <div className="mt-3 flex items-center gap-2 min-w-0">
                                                <div className="flex -space-x-2 shrink-0">
                                                    {onlinePreview.map((friend) => (
                                                        <div key={friend.id} className="relative">
                                                            <UserAvatar
                                                                first_name={friend.first_name}
                                                                last_name={friend.last_name}
                                                                username={friend.username}
                                                                avatar_url={friend.avatar_url}
                                                                size="sm"
                                                            />
                                                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 bg-emerald-500" />
                                                        </div>
                                                    ))}
                                                </div>
                                                <span className="truncate text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                                    {onlinePreview.map((friend) => friend.first_name || friend.username).join(", ")}
                                                    {onlineFriends.length > onlinePreview.length ? ` +${onlineFriends.length - onlinePreview.length}` : ""}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </Link>
                                <Link href="/friends/nearby" className="bg-zinc-900/40 border border-white/5 hover:border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4 transition-all group">
                                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">📍</div>
                                    <div>
                                        <span className="font-black text-sm text-emerald-400 block">Nearby Players</span>
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Active now at club</span>
                                    </div>
                                </Link>
                                {friendRequests > 0 && (
                                    <Link href="/friends" className="bg-blue-600 border border-blue-400/50 rounded-2xl p-4 flex items-center justify-between transition-all hover:bg-blue-500 shadow-lg shadow-blue-900/20 animate-pulse">
                                        <span className="text-sm font-black text-white">{friendRequests} PENDING REQUESTS</span>
                                        <span className="text-lg">👋</span>
                                    </Link>
                                )}
                            </div>
                        </section>

                        {/* Competition */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase">Competition</h3>
                            </div>
                            
                            <div className="space-y-3">
                                {compLevels.filter(cl => cl.current_level).slice(0, 2).map(cl => {
                                    const lvl = cl.current_level!;
                                    const cfg = COMP_LEVEL_COLORS[lvl.name] ?? COMP_LEVEL_COLORS["Barangay"];
                                    const icon = COMP_LEVEL_ICONS[lvl.name] ?? "🎯";
                                    return (
                                        <Link key={`${cl.sport}-${cl.match_format}`} href="/leaderboard"
                                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${cfg.bg} ${cfg.border} hover:scale-[1.02] active:scale-95`}>
                                            <div className="w-10 h-10 bg-black/20 rounded-xl flex items-center justify-center text-xl shrink-0">{icon}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-black ${cfg.color} leading-none`}>{lvl.name}</div>
                                                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                                                    {cl.sport.replace("_", " ")}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-lg font-black text-white">{cl.rating.toFixed(0)}</div>
                                            </div>
                                        </Link>
                                    );
                                })}
                                <div className="grid grid-cols-2 gap-3">
                                    <Link href="/leaderboard" className="bg-zinc-900/40 border border-white/5 hover:border-yellow-500/20 rounded-2xl p-4 flex flex-col gap-3 transition-all group">
                                        <div className="text-2xl group-hover:scale-110 transition-transform">🏆</div>
                                        <span className="font-black text-[10px] text-yellow-400 tracking-widest uppercase">Rankings</span>
                                    </Link>
                                    <Link href="/tournaments" className="bg-zinc-900/40 border border-white/5 hover:border-violet-500/20 rounded-2xl p-4 flex flex-col gap-3 transition-all group">
                                        <div className="text-2xl group-hover:scale-110 transition-transform">🥇</div>
                                        <span className="font-black text-[10px] text-violet-400 tracking-widest uppercase">Events</span>
                                    </Link>
                                </div>
                            </div>
                        </section>

                        {/* Referee Duties */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase">Officiating</h3>
                                <Link href="/referee" className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Duty →</Link>
                            </div>
                            
                            {refOngoing === 0 && refInviteCount === 0 ? (
                                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between opacity-60">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">No active duties</p>
                                    <div className="w-2 h-2 rounded-full bg-zinc-800" />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {refInviteCount > 0 && (
                                        <Link href="/referee/invites" className="bg-zinc-900/40 border border-yellow-500/20 hover:bg-yellow-500/5 rounded-2xl p-4 flex items-center gap-4 transition-all">
                                            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                                            <div>
                                                <span className="font-black text-sm text-yellow-400 block">{refInviteCount} Invites</span>
                                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Pending response</span>
                                            </div>
                                        </Link>
                                    )}
                                    {refOngoing > 0 && (
                                        <Link href="/referee" className="bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-2xl p-4 flex items-center gap-4 transition-all">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                            <div>
                                                <span className="font-black text-sm text-emerald-400 block">{refOngoing} Live Match</span>
                                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Currently officiating</span>
                                            </div>
                                        </Link>
                                    )}
                                </div>
                            )}
                        </section>

                    </div>
                </div>

            </main>
        </div>
    );
}

// ── Profile avatar + dropdown ──────────────────────────────────────────────────

function ProfileMenu({ username, avatarUrl, firstName, lastName, onLogout }: {
    username?: string;
    avatarUrl?: string | null;
    firstName?: string;
    lastName?: string;
    onLogout: () => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const initials = ((firstName?.[0] ?? username?.[0] ?? "?") + (lastName?.[0] ?? "")).toUpperCase();

    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 group"
            >
                {avatarUrl ? (
                    <img src={avatarUrl} alt={username} loading="eager" className="w-8 h-8 rounded-full object-cover border border-white/10" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-black text-white border border-white/10">
                        {initials}
                    </div>
                )}
                <span className="hidden sm:block text-sm text-zinc-400 group-hover:text-white transition-colors">@{username}</span>
                <svg className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-sm text-zinc-300">
                        <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        My Profile
                    </Link>
                    <Link href="/matches" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-sm text-zinc-300">
                        <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        Match History
                    </Link>
                    <div className="border-t border-white/5" />
                    <button onClick={() => { setOpen(false); onLogout(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-sm text-red-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
}

function GenerateInsightButton({
    loading,
    error,
    onGenerate,
}: {
    loading: boolean;
    error: string;
    onGenerate: () => Promise<boolean>;
}) {
    return (
        <button
            onClick={() => { void onGenerate(); }}
            disabled={loading}
            className={`text-xs hover:underline disabled:opacity-50 ${error ? "text-red-400" : "text-blue-400"}`}
        >
            {loading ? "Generating..." : error ? "Retry Generate ->" : "Generate ->"}
        </button>
    );
}
