
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
                await new Promise(r => setTimeout(r, 500)); // 500ms間隔でポーリング（元は2000ms）

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

            // ============================================================
            // 3. 汎用解析プロンプト
            // PC操作・作業手順・点検・調理など、あらゆる動画に対応
            // ============================================================
            const prompt = `
この動画を分析して、手順マニュアルを作成してください。

## 最重要指示：全てのステップを漏れなく記録する
動画に映っている**すべての操作・動作・確認**を記録してください。
「重要でない」「当たり前」と自己判断してスキップすることを禁止します。
1〜3分の動画であれば、通常10〜25ステップ程度になります。

## 記録すべき内容（動画の種類に関わらず全て含めること）
- 手・指・工具・機器を使った操作・作業
- ボタン・スイッチ・レバー・つまみの操作
- 材料・部品・道具を手に取る・置く・セットする動作
- 画面操作（クリック・入力・スクロール・画面遷移）
- 目視確認・状態確認・計器読み取り
- 次の工程への移行（場所の移動・体勢の変更など）

## 出力形式（JSONリストのみ、前後に説明文不要）
[
  { "timestamp": "HH:MM:SS", "action": "操作説明", "box_2d": [ymin, xmin, ymax, xmax], "label": "対象物の名前", "reason": "結果・目的" }
]

## 文言のルール
1. **action**: 「〜します」の形式で統一（常体・丁寧語）
   - 良い例: 「ボルトをドライバーで締め付けます」「玉ねぎをみじん切りにします」「設定ボタンをクリックします」
   - 悪い例: 「締め付けてください」「切る」「クリックした」

2. **reason**: 操作の結果または目的を簡潔に記述。「〜したため」は使用禁止
   - 良い例: 「固定が完了します」「炒め物の準備ができます」「設定画面が開きます」
   - 悪い例: 「固定したため」「準備したため」

3. **label**: 操作対象を具体的な名前で記述
   - 良い例: 「M6ボルト」「玉ねぎ」「保存ボタン」
   - 悪い例: 「部品」「食材」「ボタン」

## タイムスタンプのルール（厳守）
1. 各ステップの動作・対象物が最もはっきり見えている瞬間を選ぶ
2. 動きのブレ・移動中・画面遷移の途中は避ける
3. actionの内容と映像が必ず一致すること
4. 秒単位で正確に指定すること

## 視覚的根拠
映像に実際に映っているものだけを根拠にすること。推測・補完禁止。
画面上のテキストや実物の名称をそのまま使用すること。

box_2d は操作対象を囲む範囲を 0-1000 の範囲で指定してください。
`;

            const generateResponse = await fetch(`${BASE_URL}/models/gemini-2.5-flash-preview-04-17:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            { file_data: { file_uri: fileUri, mime_type: mimeType } },
                            { text: prompt }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.1,
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

