"use client";

import { useEffect } from "react";
import { isTokenExpiringSoon, refreshAccessToken } from "./auth";

/**
 * Proactively refresh the JWT when it's within `thresholdMs` of expiry.
 * Call this in any long-lived page (referee, open play, match lobby).
 * Checks every `intervalMs` (default: 5 min).
 */
export function useTokenRefresh(
    intervalMs = 5 * 60 * 1000,
    thresholdMs = 30 * 60 * 1000,
) {
    useEffect(() => {
        const check = async () => {
            if (isTokenExpiringSoon(thresholdMs)) {
                await refreshAccessToken();
            }
        };
        // Check immediately on mount, then on each interval
        check();
        const id = setInterval(check, intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, thresholdMs]);
}
