import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { sessionStore } from '@/utils/mobileSessionStore';

export async function GET(
    _req: NextRequest,
    { params }: { params: { sessionId: string } }
) {
    const session = sessionStore.get(params.sessionId);
    if (!session) {
        return NextResponse.json({ status: 'expired' });
    }
    return NextResponse.json({
        status: session.status,
        fileName: session.fileName,
        fileSize: session.fileSize,
    });
}

export async function POST(
    req: NextRequest,
    { params }: { params: { sessionId: string } }
) {
    const session = sessionStore.get(params.sessionId);
    if (!session) {
        return NextResponse.json({ error: 'セッションが見つかりません。QRコードを再表示してください。' }, { status: 404 });
    }

    session.status = 'uploading';

    const formData = await req.formData();
    const file = formData.get('video') as File | null;

    if (!file) {
        return NextResponse.json({ error: '動画ファイルが見つかりません。' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFileName = `mobile_${params.sessionId}_${Date.now()}${path.extname(file.name)}`;
    const filePath = path.join(os.tmpdir(), safeFileName);

    await fs.writeFile(filePath, buffer);

    // MIMEタイプの正規化（モバイルブラウザは不正確なタイプを送ることがある）
    let mimeType = file.type;
    if (mimeType === 'video/quicktime') mimeType = 'video/mov';
    if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = path.extname(file.name).toLowerCase();
        if (ext === '.mov') mimeType = 'video/mov';
        else if (ext === '.webm') mimeType = 'video/webm';
        else if (ext === '.avi') mimeType = 'video/avi';
        else mimeType = 'video/mp4';
    }

    session.status = 'complete';
    session.filePath = filePath;
    session.fileName = file.name;
    session.fileSize = file.size;
    session.mimeType = mimeType;

    return NextResponse.json({ success: true });
}
