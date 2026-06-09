import { NextResponse } from 'next/server';
import os from 'os';
import { sessionStore, cleanupExpiredSessions } from '@/utils/mobileSessionStore';

function getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    const candidates: string[] = [];

    for (const iface of Object.values(interfaces)) {
        if (!iface) continue;
        for (const alias of iface) {
            if (alias.family !== 'IPv4' || alias.internal) continue;
            candidates.push(alias.address);
        }
    }

    // 192.168.x.x（家庭用WiFi/有線LAN）を最優先
    const home = candidates.find(ip => ip.startsWith('192.168.'));
    if (home) return home;

    // 10.x.x.x（企業LAN等）を次に優先
    const corp = candidates.find(ip => ip.startsWith('10.'));
    if (corp) return corp;

    // 172.16〜31.x.x（RFC1918プライベート範囲）のみ許可
    const rfc172 = candidates.find(ip => {
        const second = parseInt(ip.split('.')[1], 10);
        return ip.startsWith('172.') && second >= 16 && second <= 31;
    });
    if (rfc172) return rfc172;

    return candidates[0] ?? 'localhost';
}

export async function POST() {
    cleanupExpiredSessions();

    const sessionId = crypto.randomUUID();
    const localIp = getLocalIp();

    sessionStore.set(sessionId, {
        status: 'waiting',
        createdAt: Date.now(),
    });

    return NextResponse.json({ sessionId, localIp });
}
