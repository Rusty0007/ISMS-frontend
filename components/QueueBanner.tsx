"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAccessToken } from "@/lib/auth";

const SPORT_EMOJI: Record<string, string> = {
    badminton:    "🏸",
    pickleball:   "🏓",
    lawn_tennis:  "🎾",
    table_tennis: "🏓",
};

interface QueueInfo {
    in_queue:      boolean;
    sport?:        string;
    match_format?: string;
    status?:       string;   // "pending" | "assembling"
    players_joined?: number;
    queued_at?:    string;
}

function useElapsed(queuedAt: string | null | undefined) {
    const [seconds, setSeconds] = useState(0);
    const ref = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!queuedAt) { setSeconds(0); return; }
        const base = new Date(queuedAt).getTime();
        function tick() { setSeconds(Math.floor((Date.now() - base) / 1000)); }
        tick();
        ref.current = setInterval(tick, 1000);
        return () => { if (ref.current) clearInterval(ref.current); };
    }, [queuedAt]);

    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

export default function QueueBanner() {
    const router = useRouter();
    const [info, setInfo]           = useState<QueueInfo | null>(null);
    const [leaving, setLeaving]     = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const elapsed = useElapsed(info?.in_queue ? info.queued_at : null);

    async function fetchQueueStatus() {
        const token = getAccessToken();
        if (!token) return;
        try {
            const res = await fetch("/api/matches/queue/me", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setInfo(await res.json());
        } catch { /* silent */ }
    }

    useEffect(() => {
        void fetchQueueStatus();
        pollRef.current = setInterval(fetchQueueStatus, 8000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleLeave() {
        if (!info?.sport || !info.match_format) return;
        setLeaving(true);
        try {
            const token = getAccessToken();
            if (!token) return;
            await fetch(
                `/api/matches/queue/leave?sport=${info.sport}&match_format=${info.match_format}`,
                { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
            );
            setInfo({ in_queue: false });
        } catch { /* best effort */ }
        finally { setLeaving(false); }
    }

    if (!info?.in_queue) return null;

    const emoji  = SPORT_EMOJI[info.sport ?? ""] ?? "🏅";
    const sport  = (info.sport ?? "").replace("_", " ");
    const format = (info.match_format ?? "").replace("_", " ");
    const isAssembling = info.status === "assembling";

    return (
        <div className="relative z-20 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
                {/* Pulsing dot */}
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                </span>

                <span className="text-sm font-semibold text-amber-300 truncate">
                    {emoji}&nbsp;
                    {isAssembling
                        ? `Assembling ${sport} ${format} — ${info.players_joined ?? 1}/4 players`
                        : `In Queue — ${sport} ${format}`
                    }
                </span>

                {/* Running timer */}
                <span className="text-xs font-mono text-amber-400/70 shrink-0">{elapsed}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <Link
                    href="/matches/queue"
                    className="text-xs text-amber-400 font-semibold hover:text-amber-300 transition-colors hidden sm:block"
                >
                    View →
                </Link>
                <button
                    onClick={handleLeave}
                    disabled={leaving}
                    className="text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-semibold px-3 py-1 rounded-full transition-colors disabled:opacity-50"
                >
                    {leaving ? "Leaving…" : "Leave Queue"}
                </button>
            </div>
        </div>
    );
}
