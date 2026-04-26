export const TOURNAMENT_FORMAT_META = {
    single_elimination: {
        label: "Single Elimination",
        shortLabel: "Single Elim.",
        description: "Straight knockout. One loss and you're out.",
    },
    double_elimination: {
        label: "Double Elimination",
        shortLabel: "Double Elim.",
        description: "Knockout with a second life. Two losses eliminate you.",
    },
    round_robin: {
        label: "Single-Group Round Robin",
        shortLabel: "Round Robin",
        description: "One group only. Everyone plays everyone.",
    },
    group_stage_knockout: {
        label: "Pool Play + Knockout",
        shortLabel: "Pools + KO",
        description: "Multiple pools first, then top finishers advance to a knockout bracket.",
    },
    swiss: {
        label: "Swiss",
        shortLabel: "Swiss",
        description: "Players keep pairing against similar records each round.",
    },
    pool_play: {
        label: "Pool Play Only",
        shortLabel: "Pool Play",
        description: "Multiple small pools. Everyone plays inside their pool, with no knockout stage.",
    },
} as const;

export const TOURNAMENT_FORMAT_OPTIONS = Object.entries(TOURNAMENT_FORMAT_META).map(([value, meta]) => ({
    value,
    label: meta.label,
    description: meta.description,
}));

export function getTournamentFormatLabel(format: string, variant: "long" | "short" = "long"): string {
    const meta = TOURNAMENT_FORMAT_META[format as keyof typeof TOURNAMENT_FORMAT_META];
    if (!meta) return format.replace(/_/g, " ");
    return variant === "short" ? meta.shortLabel : meta.label;
}

export function getTournamentFormatDescription(format: string): string {
    const meta = TOURNAMENT_FORMAT_META[format as keyof typeof TOURNAMENT_FORMAT_META];
    return meta?.description ?? "";
}
