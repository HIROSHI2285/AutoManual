
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import * as https from 'https';
import { URL } from 'url';

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
このPC画面の収録動画を分析し、マニュアル作成に必要な**主要な操作ステップのみ**を抽出してください。

**【重要：抽出内容の削減と最適化】**
- ユーザーにとって意味のある主要なアクション（例：特定のボタンの確実なクリック、フォームへの入力完了、重要な画面遷移など）だけをステップとして記録してください。
- 以下の**些細な操作は絶対に抽出しないでください（統合または無視）**：
  - 単なるマウスの移動やホバー（カーソルを合わせただけ）状態
  - 入力フォームをクリックしただけの状態（文字入力完了時のみ抽出）
  - 目的のない短いスクロールや迷い動作
  - ローディング中やアニメーションなどの待機プロセス
- 連続した関連する操作は、可能な限り1つのステップに説明をまとめてください。（抽出するステップ数の目安は、動画の長さや操作の複雑さに応じて適切に可変させて構いません。ただし無駄に細分化せず、意味のある単位で厳選してください。）
- これにより、冗長な画像切り出しを防ぎ、処理時間を大幅に短縮します。

動画全体を通して、時系列順に**精選された手順ステップ**のみを含む配列(リスト)として出力してください。

以下の形式のJSONリストで返してください：
[
  { "timestamp": "MM:SS", "action": "操作説明", "box_2d": [ymin, xmin, ymax, xmax], "label": "UI要素名", "reason": "挙動・結果" },
  { "timestamp": "MM:SS", "action": "次の操作", "box_2d": [ymin, xmin, ymax, xmax], "label": "UI要素名", "reason": "挙動・結果" }
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

1. **タイムスタンプの精度**: 必ず **MM:SS** (分:秒) の形式で指定してください。（例: 00:05, 01:23）。「時」や「ミリ秒」を含めた HH:MM:SS や MM:SS:MS には絶対にしないでください。
2. **操作の直前**の、画面が完全に静止している瞬間のタイムスタンプを選んでください。
   - 操作対象のボタン・テキスト・アイコンが**画面上にはっきりと見えている**フレームを選ぶこと。
3. **絶対に避けるタイミング**:
   - 画面遷移アニメーションの途中
   - ページ読み込み中（スピナーやブランク画面）
   - 操作した後で画面が切り替わった後
4. **action の内容と画面が一致すること**: 例えば「設定ボタンをクリックします」と書いた場合、そのタイムスタンプのフレームに設定ボタンが映っていなければなりません。

## 視覚的根拠
- 画面上に実際に表示されているテキストやアイコンに基づいて説明を作成してください。
- 推測や記憶ではなく、そのタイムスタンプのフレームに映っている要素だけを参照すること。

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

            await log(`Successfully parsed ${steps?.length || 0} steps from Gemini response.`);
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

