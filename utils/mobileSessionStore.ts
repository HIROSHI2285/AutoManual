import { promises as fs } from 'fs';

export interface Session {
    status: 'waiting' | 'uploading' | 'complete' | 'expired';
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    createdAt: number;
}

declare global {
    var _mobileSessionStore: Map<string, Session> | undefined;
}

// globalThis を使って HMR をまたいでストアを保持する
export const sessionStore: Map<string, Session> =
    globalThis._mobileSessionStore ??
    (globalThis._mobileSessionStore = new Map<string, Session>());

const FIFTEEN_MIN = 15 * 60 * 1000;

export function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [id, session] of Array.from(sessionStore.entries())) {
        if (now - session.createdAt > FIFTEEN_MIN) {
            if (session.filePath) {
                fs.unlink(session.filePath).catch(() => {});
            }
            sessionStore.delete(id);
        }
    }
}
