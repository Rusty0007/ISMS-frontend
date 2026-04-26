"use client";

export type OfflineQueuedActionType = "point" | "serve_change" | "violation" | "undo" | "complete";

export interface OfflineQueuedAction {
    qid: string;
    type: OfflineQueuedActionType;
    payload: Record<string, unknown>;
    localTeam?: "team1" | "team2";
    localSet?: number;
}

export interface PendingOfflineMatchNotice {
    matchId: string;
    sport: string;
    winnerTeam: "team1" | "team2";
    savedAt: string;
    message: string;
}

export const OFFLINE_QUEUE_PREFIX = "isms_offline_";
export const OFFLINE_SNAPSHOT_PREFIX = "isms_referee_snapshot_";
export const OFFLINE_MATCH_NOTICE_KEY = "isms_pending_offline_match_notice";

export function getOfflineQueueKey(matchId: string) {
    return `${OFFLINE_QUEUE_PREFIX}${matchId}`;
}

export function getRefereeSnapshotKey(matchId: string) {
    return `${OFFLINE_SNAPSHOT_PREFIX}${matchId}`;
}

export function listOfflineQueueKeys(storage: Storage) {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith(OFFLINE_QUEUE_PREFIX)) keys.push(key);
    }
    return keys;
}

export function readOfflineQueue(storage: Storage, matchId: string): OfflineQueuedAction[] {
    try {
        const raw = storage.getItem(getOfflineQueueKey(matchId));
        return raw ? JSON.parse(raw) as OfflineQueuedAction[] : [];
    } catch {
        return [];
    }
}

export function writeOfflineQueue(storage: Storage, matchId: string, queue: OfflineQueuedAction[]) {
    try {
        if (queue.length) storage.setItem(getOfflineQueueKey(matchId), JSON.stringify(queue));
        else storage.removeItem(getOfflineQueueKey(matchId));
    } catch {}
}

export function readRefereeSnapshot<T>(storage: Storage, matchId: string): T | null {
    try {
        const raw = storage.getItem(getRefereeSnapshotKey(matchId));
        return raw ? JSON.parse(raw) as T : null;
    } catch {
        return null;
    }
}

export function writeRefereeSnapshot<T>(storage: Storage, matchId: string, snapshot: T) {
    try {
        storage.setItem(getRefereeSnapshotKey(matchId), JSON.stringify(snapshot));
    } catch {}
}

export function readPendingOfflineMatchNotice(storage: Storage): PendingOfflineMatchNotice | null {
    try {
        const raw = storage.getItem(OFFLINE_MATCH_NOTICE_KEY);
        return raw ? JSON.parse(raw) as PendingOfflineMatchNotice : null;
    } catch {
        return null;
    }
}

export function writePendingOfflineMatchNotice(storage: Storage, notice: PendingOfflineMatchNotice) {
    try {
        storage.setItem(OFFLINE_MATCH_NOTICE_KEY, JSON.stringify(notice));
    } catch {}
}

export function clearPendingOfflineMatchNotice(storage: Storage) {
    try {
        storage.removeItem(OFFLINE_MATCH_NOTICE_KEY);
    } catch {}
}

/**
 * Send the entire offline queue to the server in a single batch request.
 * More reliable than individual calls when reconnecting after an outage.
 * Returns the server's results array.
 */
export async function batchSyncOfflineQueue(
    matchId: string,
    queue: OfflineQueuedAction[],
    token: string,
): Promise<{ qid: string; status: string; reason?: string }[]> {
    const res = await fetch(`/api/matches/${matchId}/offline-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            actions: queue.map(a => ({ qid: a.qid, type: a.type, payload: a.payload })),
        }),
    });
    if (!res.ok) {
        throw new Error(`Batch sync failed: ${res.status}`);
    }
    const data = await res.json();
    return data.results ?? [];
}

export async function dispatchOfflineQueuedAction(matchId: string, action: OfflineQueuedAction, token: string) {
    if (action.type === "point") {
        return fetch(`/api/matches/${matchId}/point`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(action.payload),
        });
    }

    if (action.type === "serve_change") {
        return fetch(`/api/matches/${matchId}/serve-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(action.payload),
        });
    }

    if (action.type === "violation") {
        return fetch(`/api/matches/${matchId}/violation`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(action.payload),
        });
    }

    if (action.type === "complete") {
        return fetch(`/api/matches/${matchId}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(action.payload),
        });
    }

    return fetch(`/api/matches/${matchId}/undo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });
}
