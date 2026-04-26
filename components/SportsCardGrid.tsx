"use client";

import SportsCard from "./SportsCard";

interface Rating {
    sport: string;
    match_format: string;
    rating: number;
    skill_level: string;
    matches_played: number;
    wins: number;
    losses: number;
    rating_status: string;
    is_matchmaking_eligible?: boolean;
    is_leaderboard_eligible?: boolean;
    matchmaking_target?: number;
    leaderboard_target?: number;
    performance_rating?: number;
    performance_confidence?: number;
    performance_reliable?: boolean;
    performance_coverage_pct?: number;
}

interface SportsCardGridProps {
    ratings: Rating[];
    queueStatus?: {
        in_queue: boolean;
        sport: string | null;
        match_format: string | null;
    } | null;
}

const SPORTS_META: Record<string, { label: string; icon: string; color: string }> = {
    pickleball:   { label: "Pickleball",   icon: "🏓", color: "blue" },
    badminton:    { label: "Badminton",    icon: "🏸", color: "purple" },
    lawn_tennis:  { label: "Lawn Tennis",  icon: "🎾", color: "emerald" },
    table_tennis: { label: "Table Tennis", icon: "🏓", color: "orange" },
};

export default function SportsCardGrid({ ratings, queueStatus }: SportsCardGridProps) {
    if (!ratings || ratings.length === 0) {
        return (
            <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[3rem]">
                <p className="text-slate-500 font-black uppercase tracking-widest text-xs">No active disciplines found</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {ratings.map((r) => {
                const meta = SPORTS_META[r.sport] || { label: r.sport, icon: "🎯", color: "cyan" };
                const isQueued = queueStatus?.in_queue && 
                                queueStatus.sport === r.sport && 
                                queueStatus.match_format === r.match_format;

                return (
                    <SportsCard
                        key={`${r.sport}-${r.match_format}`}
                        sport={r.sport}
                        sportLabel={meta.label}
                        sportIcon={meta.icon}
                        format={r.match_format as "singles" | "doubles" | "mixed_doubles"}
                        rating={r.rating}
                        skillLevel={r.skill_level}
                        status={r.rating_status as "RATED" | "CALIBRATING"}
                        wins={r.wins}
                        losses={r.losses}
                        totalMatches={r.matches_played}
                        isMatchmakingEligible={Boolean(r.is_matchmaking_eligible)}
                        isLeaderboardEligible={Boolean(r.is_leaderboard_eligible)}
                        matchmakingTarget={r.matchmaking_target ?? 10}
                        leaderboardTarget={r.leaderboard_target ?? 20}
                        performanceRating={r.performance_rating ?? 50}
                        performanceConfidence={r.performance_confidence ?? 0}
                        performanceReliable={Boolean(r.performance_reliable)}
                        performanceCoveragePct={r.performance_coverage_pct ?? 0}
                        isQueued={isQueued}
                        colorClass={meta.color}
                    />
                );
            })}
        </div>
    );
}
