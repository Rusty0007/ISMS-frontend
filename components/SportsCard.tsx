"use client";

import Link from "next/link";

interface SportsCardProps {
    sport: string;
    sportLabel: string;
    sportIcon: string;
    format: "singles" | "doubles" | "mixed_doubles";
    rating: number;
    skillLevel: string;
    status: "RATED" | "CALIBRATING";
    wins: number;
    losses: number;
    totalMatches: number;
    isMatchmakingEligible?: boolean;
    isLeaderboardEligible?: boolean;
    matchmakingTarget?: number;
    leaderboardTarget?: number;
    performanceRating?: number;
    performanceConfidence?: number;
    performanceReliable?: boolean;
    performanceCoveragePct?: number;
    isQueued?: boolean;
    colorClass: string; // e.g., "cyan", "emerald", "orange", "purple"
}

export default function SportsCard({
    sport,
    sportLabel,
    sportIcon,
    format,
    rating,
    skillLevel,
    status,
    wins,
    losses,
    totalMatches,
    isMatchmakingEligible = false,
    isLeaderboardEligible = false,
    matchmakingTarget = 10,
    leaderboardTarget = 20,
    performanceRating = 50,
    performanceConfidence = 0,
    performanceReliable = false,
    performanceCoveragePct = 0,
    isQueued = false,
    colorClass = "cyan"
}: SportsCardProps) {
    
    // Color mapping for Tailwind classes
    const colors: Record<string, { border: string, text: string, bg: string, glow: string, button: string }> = {
        cyan: {
            border: "border-cyan-500/20",
            text: "text-cyan-400",
            bg: "bg-cyan-500/5",
            glow: "shadow-[0_0_15px_rgba(6,182,212,0.15)]",
            button: "bg-cyan-500 text-black hover:bg-cyan-400"
        },
        emerald: {
            border: "border-emerald-500/20",
            text: "text-emerald-400",
            bg: "bg-emerald-500/5",
            glow: "shadow-[0_0_15px_rgba(16,185,129,0.15)]",
            button: "bg-emerald-500 text-black hover:bg-emerald-400"
        },
        orange: {
            border: "border-orange-500/20",
            text: "text-orange-400",
            bg: "bg-orange-500/5",
            glow: "shadow-[0_0_15px_rgba(245,158,11,0.15)]",
            button: "bg-orange-500 text-black hover:bg-orange-400"
        },
        purple: {
            border: "border-purple-500/20",
            text: "text-purple-400",
            bg: "bg-purple-500/5",
            glow: "shadow-[0_0_15px_rgba(168,85,247,0.15)]",
            button: "bg-purple-500 text-black hover:bg-purple-400"
        },
        blue: {
            border: "border-blue-500/20",
            text: "text-blue-400",
            bg: "bg-blue-500/5",
            glow: "shadow-[0_0_15px_rgba(59,130,246,0.15)]",
            button: "bg-blue-600 text-white hover:bg-blue-500"
        }
    };

    const activeColor = colors[colorClass] || colors.cyan;
    const isLeaderboardReady = status === "RATED" || isLeaderboardEligible;
    const isCalibrating = !isLeaderboardReady;
    const isMlReady = isMatchmakingEligible && !isLeaderboardReady;
    const badgeStyle = isLeaderboardReady
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
        : isMlReady
          ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
          : "border-amber-500/20 bg-amber-500/10 text-amber-400";
    const dotStyle = isLeaderboardReady
        ? "bg-emerald-400 animate-pulse"
        : isMlReady
          ? "bg-cyan-400 animate-pulse"
          : "bg-amber-400";
    const badgeLabel = isLeaderboardReady ? "Rated" : isMlReady ? "ML Ready" : "Calibrating";
    const mlRemaining = Math.max(0, matchmakingTarget - totalMatches);
    const hasPerformanceSignal = performanceReliable || performanceConfidence > 0 || performanceCoveragePct > 0;
    const performanceLabel = hasPerformanceSignal ? `Impact ${Math.round(performanceRating)}` : "Impact tracking";
    const performanceMeta = hasPerformanceSignal
        ? `${Math.round(performanceConfidence)}% confidence`
        : "Referee-tagged points needed";

    return (
        <div className={`group relative flex flex-col bg-[#0a111a]/80 backdrop-blur-xl border ${activeColor.border} rounded-[2rem] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 ${activeColor.glow}`}>
            
            {/* Header: Sport & Format */}
            <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{sportIcon}</span>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90 italic">{sportLabel}</h3>
                    </div>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1 ml-7">{format.replace('_', ' ')}</p>
                </div>
                
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${badgeStyle}`}>
                    <div className={`w-1 h-1 rounded-full ${dotStyle}`} />
                    <span className="text-[7px] font-black uppercase tracking-widest">{badgeLabel}</span>
                </div>
            </div>

            {/* Central Rating Display */}
            <div className="relative py-4 flex flex-col items-center justify-center">
                {isCalibrating && (
                    <div className="absolute inset-0 flex flex-col justify-center opacity-10 pointer-events-none">
                        <div className="h-px w-full bg-white animate-scanline" />
                    </div>
                )}
                
                <div className="flex items-baseline gap-1">
                    <span className={`text-5xl font-black italic tracking-tighter ${activeColor.text}`}>{Math.round(rating)}</span>
                    <span className="text-[10px] font-black text-slate-600 italic uppercase">SR</span>
                </div>
                <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] mt-2">{skillLevel}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[7px] font-black uppercase tracking-[0.18em] text-slate-500">
                    <span className="rounded-full border border-white/5 bg-white/[0.03] px-2 py-1 text-white/70">{performanceLabel}</span>
                    <span className="text-slate-600">{performanceMeta}</span>
                </div>
                {isCalibrating && (
                    <p className="mt-2 text-[8px] font-black text-slate-500 uppercase tracking-[0.18em]">
                        {isMlReady ? `Leaderboard ${Math.min(totalMatches, leaderboardTarget)}/${leaderboardTarget}` : `${mlRemaining} matches to ML`}
                    </p>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
                <div className="text-center">
                    <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-1">Wins</p>
                    <p className="text-xs font-black text-white italic">{wins}</p>
                </div>
                <div className="text-center border-x border-white/5">
                    <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-1">Losses</p>
                    <p className="text-xs font-black text-white italic">{losses}</p>
                </div>
                <div className="text-center">
                    <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-1">Total</p>
                    <p className="text-xs font-black text-white italic">{totalMatches}</p>
                </div>
            </div>

            {/* Action Button */}
            <div className="mt-6">
                <Link 
                    href={`/matches/queue?sport=${sport}&format=${format}`}
                    className={`block w-full text-center py-3 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${
                        isQueued 
                        ? "bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse" 
                        : activeColor.button
                    }`}
                >
                    {isQueued ? "Deployment Active" : "Find Match"}
                </Link>
            </div>

            {/* Subtle Corner Accents */}
            <div className={`absolute top-0 left-0 w-4 h-4 border-t border-l ${activeColor.border} rounded-tl-[2rem] opacity-50`} />
            <div className={`absolute bottom-0 right-0 w-4 h-4 border-b border-r ${activeColor.border} rounded-br-[2rem] opacity-50`} />
        </div>
    );
}
