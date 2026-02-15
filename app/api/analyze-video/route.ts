
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export const config = {
    api: {
        bodyParser: false,
    },
    maxDuration: 600, // 10 minutes timeout
};

const API_KEY = process.env.GEMINI_API_KEY || '';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files';


// Helper for debug logging
async function log(message: string) {
    const logPath = path.join(process.cwd(), 'debug_server.log');
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
        await fs.appendFile(logPath, logMessage);
    } catch (e) {
        console.error('Failed to write log:', e);
    }
    console.log(message);
}

export async function POST(request: NextRequest) {
    let tempFilePath = ''; // Declare tempFilePath here so it's accessible in the outer catch block
    try {
        await log('POST /api/analyze-video started');

        if (!API_KEY) {
            await log('Error: GEMINI_API_KEY is not set');
            return NextResponse.json({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 });
        }

        const formData = await request.formData();
        const file = formData.get('video') as File | null;

        if (!file) {
            await log('Error: No video file in request');
            return NextResponse.json({ error: 'No video file found.' }, { status: 400 });
        }

        await log(`Received file: ${file.name}, size: ${file.size}`);

        const buffer = Buffer.from(await file.arrayBuffer());
        tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${file.name}`);
        await fs.writeFile(tempFilePath, buffer);
        await log(`Saved temp file to: ${tempFilePath}`);

        // Gemini supported MIME types
        // video/mp4, video/mpeg, video/mov, video/avi, video/x-flv, video/mpg, video/webm, video/wmv, video/3gpp
        let mimeType = file.type;
        const ext = path.extname(file.name).toLowerCase();

        // Normalize tricky MIME types
        if (mimeType === 'video/quicktime') {
            mimeType = 'video/mov';
        } else if (!mimeType || mimeType === 'application/octet-stream') {
            // Fallback based on extension
            if (ext === '.mov') mimeType = 'video/mov';
            else if (ext === '.webm') mimeType = 'video/webm';
            else if (ext === '.avi') mimeType = 'video/avi';
            else if (ext === '.wmv') mimeType = 'video/wmv';
            else if (ext === '.flv') mimeType = 'video/x-flv';
            else mimeType = 'video/mp4'; // Default to mp4
        }

        await log(`Normalized MIME type: ${file.type} -> ${mimeType}`);

        try {
            // 1. Upload File (Initial Resumable Request or Simple Upload)
            // For simplicity with typically small files (< 200MB verified in this context), 
            // we will use the Media Upload (multipart/related or simple raw).
            // Actually, for "upload/v1beta/files", the simplest is to send JSON metadata + raw data, 
            // but standard fetch makes multipart hard.
            // Let's use the standard "upload, get URI" flow which usually requires two steps if using resumable, 
            // or one step if strictly following the guide.
            //
            // Valid approach: POST to /upload/v1beta/files?key=KEY
            // Headers: X-Goog-Upload-Protocol: raw, X-Goog-Upload-File-Name: ..., Content-Type: ...
            // Body: Raw binary

            await log('Uploading to Gemini via REST API...');

            // Sanitize filename for headers (must be ASCII)
            const safeFileName = `upload_${Date.now()}${ext}`;

            const uploadResponse = await fetch(`${UPLOAD_URL}?key=${API_KEY}`, {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'raw',
                    'X-Goog-Upload-Command': 'start, upload, finalize',
                    'X-Goog-Upload-Header-Content-Length': file.size.toString(),
                    'X-Goog-Upload-File-Name': safeFileName, // Use ASCII name
                    'Content-Type': mimeType,
                },
                body: buffer
            });

            if (!uploadResponse.ok) {
                const errText = await uploadResponse.text();
                await log(`Upload failed: ${uploadResponse.status} ${errText}`);
                throw new Error(`Upload failed: ${uploadResponse.status} ${errText}`);
            }

            const uploadData = await uploadResponse.json();
            const fileUri = uploadData.file.uri;
            const fileName = uploadData.file.name; // "files/..."

            await log(`Uploaded: ${fileUri} (${fileName})`);

            // 2. Poll for Active State
            let fileState = uploadData.file.state;

            while (fileState === 'PROCESSING') {
                await log('Processing video...');
                await new Promise(r => setTimeout(r, 500));

                const statusResponse = await fetch(`${BASE_URL}/${fileName}?key=${API_KEY}`);
                if (!statusResponse.ok) throw new Error('Failed to check status');

                const statusData = await statusResponse.json();
                fileState = statusData.state;
            }

            if (fileState === 'FAILED') {
                await log('Video processing failed on Gemini side');
                throw new Error('Video processing failed on Gemini side.');
            }

            await log('Video Ready. Generating content...');

            // 3. Generate Content
            const prompt = `
このPC画面の収録動画を分析してください。
ユーザーが意味のある操作（クリック、入力、スクロール停止など）や、重要なシステム反応（処理完了の確認、エラー表示、画面遷移の待ち時間など）を特定してください。

以下の形式のJSONリストで返してください：
[
  { "timestamp": "HH:MM:SS", "action": "操作説明", "box_2d": [ymin, xmin, ymax, xmax], "label": "UI要素名", "reason": "挙動・結果" }
]

## 文言のルール（厳守）
1. **action (操作)**: 「〜します」の形式で統一すること（常体・丁寧語）。
   - 良い例: 「設定ボタンをクリックします」「テキストを入力します」「画面を下にスクロールします」
   - 悪い例: 「設定ボタンをクリックしてください」「テキストを入力する」「〜をクリックした」

2. **reason (挙動・結果)**: 操作の結果どうなるか、または何のための操作かを簡潔に記述すること。「〜したため」という表現は使用禁止。
   - 良い例: 「詳細画面が表示されます」「設定を保存します」「次のステップへ進みます」
   - 悪い例: 「詳細画面を表示したため」「設定を保存したため」


## タイムスタンプ選定ルール（最重要）
以下のルールを厳守してください。これに違反すると、スクリーンショットと説明文が一致しなくなります。

1. **操作の直前**の、画面が完全に静止している瞬間のタイムスタンプを選んでください。
   - 操作対象のボタン・テキスト・アイコンが**画面上にはっきりと見えている**フレームを選ぶこと。
2. **絶対に避けるタイミング**:
   - 画面遷移アニメーションの途中
   - ページ読み込み中（スピナーやブランク画面）
   - 操作した後で画面が切り替わった後
3. **action の内容と画面が一致すること**: 例えば「設定ボタンをクリックします」と書いた場合、そのタイムスタンプのフレームに設定ボタンが映っていなければなりません。
4. **タイムスタンプの精度**: 秒単位で指定してください。1秒のずれでも別の画面が映ることがあるため、可能な限り正確に。

## 視覚的根拠
- 画面上に実際に表示されているテキストやアイコンに基づいて説明を作成してください。
- 推測や記憶ではなく、そのタイムスタンプのフレームに映っている要素だけを参照すること。

box_2d は 0-1000 の範囲に正規化してください。
`;

            const generateResponse = await fetch(`${BASE_URL}/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            { file_data: { file_uri: fileUri, mime_type: mimeType } }, // Snake_case for REST
                            { text: prompt }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.1, // Lower temperature for more factual results
                    }
                })
            });

            if (!generateResponse.ok) {
                const errText = await generateResponse.text();
                await log(`Generation failed: ${generateResponse.status} ${errText}`);
                throw new Error(`Generation failed: ${generateResponse.status} ${errText}`);
            }

            const generateData = await generateResponse.json();
            const responseText = generateData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

            await log(`Response received: ${responseText.substring(0, 100)}...`);

            // Clean up
            await fetch(`${BASE_URL}/${fileName}?key=${API_KEY}`, { method: 'DELETE' });
            try { await fs.unlink(tempFilePath); } catch { await log(`Warning: Failed to delete temp file ${tempFilePath}`); }

            let steps = [];
            try {
                steps = JSON.parse(responseText);
            } catch (e) {
                await log(`JSON Parse warning: ${e}`);
                // Try to clean markdown
                const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                steps = JSON.parse(cleanText);
            }

            await log('POST /api/analyze-video completed successfully');
            return NextResponse.json({ steps });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : '';
            await log(`Unexpected error in API logic: ${errorMessage}\nStack: ${errorStack}`);

            try { if (tempFilePath) await fs.unlink(tempFilePath); } catch { await log(`Warning: Failed to delete temp file ${tempFilePath} in inner catch`); } // Ensure cleanup even on inner error

            return NextResponse.json(
                { error: 'Internal Server Error', details: errorMessage, stack: errorStack },
                { status: 500 }
            );
        }
    } catch (error) { // Renamed 'e' to 'error' for consistency with the provided snippet
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        await log(`Server Error (outer catch): ${errorMessage}\nStack: ${errorStack}`);

        // Attempt to clean up temp file if it was created before the outer catch
        try { if (tempFilePath) await fs.unlink(tempFilePath); } catch { await log(`Warning: Failed to delete temp file ${tempFilePath} in outer catch`); }

        return NextResponse.json(
            { error: 'Server Error', details: errorMessage, stack: errorStack },
            { status: 500 }
        );
    }
}

