
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as https from 'https';
import { URL } from 'url';

export const maxDuration = 600; // 10 minutes timeout

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
            // 1. Upload File using Resumable Upload Protocol (v1beta)
            // This is more robust for large files than the simple upload.
            await log('Starting Resumable Upload to Gemini...');

            const safeFileName = `upload_${Date.now()}${ext}`;
            const numBytes = buffer.length;

            // Step 1: Initiate upload session
            const initialHeaders = {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': numBytes.toString(),
                'X-Goog-Upload-Header-Content-Type': mimeType,
                'Content-Type': 'application/json',
            };

            const initResponse = await fetch(`${UPLOAD_URL}?key=${API_KEY}`, {
                method: 'POST',
                headers: initialHeaders,
                body: JSON.stringify({ file: { display_name: safeFileName } }),
            });

            if (!initResponse.ok) {
                const errText = await initResponse.text();
                await log(`Resumable upload init failed: ${initResponse.status} ${errText}`);
                throw new Error(`Resumable upload init failed: ${initResponse.status} ${errText}`);
            }

            const uploadUrl = initResponse.headers.get('x-goog-upload-url');
            if (!uploadUrl) {
                await log('Error: No x-goog-upload-url header in response');
                throw new Error('No upload URL received from Gemini');
            }

            await log(`Upload session initiated. URL obtained.`);

            // Step 2: Upload the actual bytes
            const uploadHeaders = {
                'Content-Length': numBytes.toString(),
                'X-Goog-Upload-Offset': '0',
                'X-Goog-Upload-Command': 'upload, finalize',
            };

            const uploadData = await new Promise<any>((resolve, reject) => {
                const urlObj = new URL(uploadUrl);
                const options = {
                    method: 'POST',
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    headers: uploadHeaders,
                    timeout: 0, // No timeout to prevent 5-minute undici fetch failures
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            try {
                                resolve(JSON.parse(data));
                            } catch (e) {
                                reject(new Error('Failed to parse upload response'));
                            }
                        } else {
                            reject(new Error(`File content upload failed: ${res.statusCode} ${data}`));
                        }
                    });
                });

                req.on('error', (e) => reject(e));
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Upload request timed out'));
                });

                req.write(buffer);
                req.end();
            });

            const fileUri = uploadData.file.uri;
            const fileName = uploadData.file.name; // "files/..."


            await log(`Uploaded: ${fileUri} (${fileName})`);

            // 2. Poll for Active State
            let fileState = uploadData.file.state;

            while (fileState === 'PROCESSING') {
                await log('Processing video...');
                await new Promise(r => setTimeout(r, 2000)); // Increased from 500ms to 2000ms to avoid rate limits

                // Disable default Next.js route caching to firmly prevent infinite loops
                const statusResponse = await fetch(`${BASE_URL}/${fileName}?key=${API_KEY}`, { cache: 'no-store' });
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
あなたはプロフェッショナルなマニュアル作成エンジニアです。
提供された動画を分析し、以下の厳格なルールで手順書を生成してください。

### 【CORE: OCR最優先・具体的要素名】
画面上のボタン、メニュー、ラベル、入力フィールド、ウィンドウタイトル等に記載されている「テキスト」を正確に読み取り、actionに最優先で反映させてください。
- ❌ 「ボタンをクリックします」などの抽象的な表現は禁止。
- ✅ 「『保存して次へ』ボタンをクリックします」「『検索』フィールドに値を入力します」のように、UI上の具体的な名称を必ず含めてください。
- 画面のタイトルバーやタブの名称から、現在のコンテキスト（例：「顧客情報編集画面」「基本設定メニュー」など）を特定し、reasonやlabelに含めて補完してください。

### 手順の種類
以下の2種類のステップを適切に抽出してください：

**① 操作ステップ（操作する直前の画面）**
- 読者が「次に何をすべきか」を理解するためのステップ。
- 画像は**操作対象（ボタン、メニュー、入力欄など）が画面に表示されている状態**を選ぶ。
- action例：「『送信』ボタンをクリックします」

**② 結果確認ステップ（変化後の画面）**
- 読者が「操作の結果、画面がこう変わった」と確認するためのステップ。
- 画像は**画面遷移・ダイアログ表示・設定変更などの結果が安定して表示された状態**を選ぶ。
- 画面が大きく変わる操作（遷移・保存完了・ダイアログ表示など）には必ず結果確認ステップを含めてください。
- action例：「設定完了のメッセージが表示されます」

### 抽出・出力仕様
- **action**: 操作内容（具体的名称を含め、20文字程度）。「〜します」「〜されます」形式で統一。
- **reason**: 操作の結果・目的。具体的コンテキスト（画面名など）を補完。
- **detail**: 補足、OCRで読み取った画面要素の解説。
- **密度目安**: 動画の5〜10秒に1ステップ程度。情報の重複を避け、1つの操作に対して1つの代表的なフレームを厳選してください。

以下の形式のJSONリストで返してください：
[
  { "timestamp": "MM:SS", "action": "操作・作業の説明", "box_2d": [ymin, xmin, ymax, xmax], "label": "対象要素の名前", "reason": "挙動・結果・理由" }
]

## タイムスタンプ選定ルール（最重要）
1. **操作ステップ** → 操作直前の、対象が見えている瞬間。
2. **結果確認ステップ** → 変化が完全に完了し安定した瞬間。アニメ途中は禁止。
3. **絶対に禁止：** アニメーション途中、スピナー、ボケたフレーム。
4. **【必須】各ステップのtimestampは必ず異なる値にし、動画全体に分散させること。**
5. ステップ間のtimestampは最低2.5秒以上の間隔を空けてください。
6. 同じ画面状態や微妙なアニメーション違いで複数のステップを作らないでください。

box_2d は 0-1000 の範囲に正規化してください。
`;




            const generateResponse = await fetch(`${BASE_URL}/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
                method: 'POST',
                cache: 'no-store', // explicitly disable caching for generation
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
                await log(`Generation failed: ${generateResponse.status} ${errText} `);
                throw new Error(`Generation failed: ${generateResponse.status} ${errText} `);
            }

            const generateData = await generateResponse.json();
            const responseText = generateData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

            await log(`Response received: ${responseText.substring(0, 100)}...`);

            // Clean up
            await fetch(`${BASE_URL}/${fileName}?key=${API_KEY}`, { method: 'DELETE' });
            try { await fs.unlink(tempFilePath); } catch { await log(`Warning: Failed to delete temp file ${tempFilePath}`); }

            let steps: any[] = [];
            try {
                steps = JSON.parse(responseText);
            } catch (e) {
                await log(`JSON Parse warning: ${e}`);
                // Try to clean markdown
                const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                steps = JSON.parse(cleanText);
            }

            // Deduplicate by timestamp: remove steps whose timestamp is within 4s of a prior step
            // This guards against Gemini assigning the same/near-same timestamp to multiple steps,
            // which would cause identical screenshots to appear in the manual.
            const tsToSeconds = (ts: string): number => {
                const parts = ts.split(':').map(Number);
                return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
            };
            const MIN_GAP_SECONDS = 2.0;
            const seen: number[] = [];
            const deduped = steps.filter((step: any) => {
                const sec = tsToSeconds(step.timestamp || '00:00');
                const tooClose = seen.some(s => Math.abs(s - sec) < MIN_GAP_SECONDS);
                if (tooClose) {
                    log(`[dedup] Dropping duplicate timestamp step: ${step.timestamp} — "${step.action?.slice(0, 40)}"`);
                    return false;
                }
                seen.push(sec);
                return true;
            });

            await log(`Successfully parsed ${steps?.length || 0} steps; after dedup: ${deduped.length}`);
            await log('POST /api/analyze-video completed successfully');
            return NextResponse.json({ steps: deduped });

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

