import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { sessionStore } from '@/utils/mobileSessionStore';

export async function GET(
    _req: NextRequest,
    { params }: { params: { sessionId: string } }
) {
    const session = sessionStore.get(params.sessionId);

    if (!session || session.status !== 'complete' || !session.filePath) {
        return NextResponse.json({ error: 'ファイルの準備ができていません。' }, { status: 404 });
    }

    let buffer: Buffer;
    try {
        buffer = await fs.readFile(session.filePath);
    } catch {
        return NextResponse.json({ error: 'ファイルの読み込みに失敗しました。' }, { status: 500 });
    }

    // クリーンアップ
    fs.unlink(session.filePath).catch(() => {});
    sessionStore.delete(params.sessionId);

    const fileName = session.fileName ?? 'video.mp4';
    const mimeType = session.mimeType ?? 'video/mp4';

    return new NextResponse(new Uint8Array(buffer), {
        headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
            'Content-Length': buffer.length.toString(),
        },
    });
}
