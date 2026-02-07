import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Stage 1: Analyze video for timestamps and actions (no coordinates)
const STAGE1_PROMPT = `
あなたは動画分析の専門家です。この動画（PC操作、料理、機器の組み立て、作業手順など）を分析し、各主要なステップのタイムスタンプと内容を抽出してください。

**重要**:
1. 座標は不要です。
2. **出力する全てのテキスト（タイトル、概要、アクション、詳細）は必ず「日本語」で記述してください。**

出力形式（JSON）:
{
  "title": "マニュアルのタイトル（日本語）",
  "overview": "作業の概要（日本語）",
  "steps": [
    {
      "stepNumber": 1,
      "action": "アクションの要約（日本語。例: 「野菜を切る」「ボタンをクリック」）",
      "detail": "詳細な説明（日本語）",
      "timestamp": "0:15"
    }
  ],
  "notes": ["安全上の注意やコツ（日本語）"]
}
`;

// Stage 2: Analyze static image for precise coordinates
const STAGE2_PROMPT = `
この画像内で、アクションの焦点となっている箇所を検出してください。
- PC操作の場合：クリックした場所、入力欄、選択したメニュー
- 実作業の場合：手が触れている場所、道具を使っている場所、注目すべき物体

**The box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000.**

出力形式（JSON）:
{
  "box_2d": [ymin, xmin, ymax, xmax],
  "label": "対象物（日本語で。例: OKボタン、包丁、ネジ、ハンドル）"
}
`;

// Helper function: Extract frame at specific timestamp
async function extractFrameAtTimestamp(videoFile: File, timestamp: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
        }

        // Convert timestamp "0:15" to seconds
        const parts = timestamp.split(':').map(Number);
        const seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];

        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            video.currentTime = seconds;
        };

        video.onseeked = () => {
            ctx.drawImage(video, 0, 0);
            const frameData = canvas.toDataURL('image/png');
            const base64Data = frameData.split(',')[1];
            resolve(base64Data);
        };

        video.onerror = reject;
        video.src = URL.createObjectURL(videoFile);
    });
}

export async function POST(request: NextRequest) {
    try {
        // Check API key
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY が設定されていません。.env.local ファイルを確認してください。' },
                { status: 500 }
            );
        }

        // Get form data
        const formData = await request.formData();
        const videoFile = formData.get('video') as File | null;

        if (!videoFile) {
            return NextResponse.json(
                { error: '動画ファイルが見つかりません' },
                { status: 400 }
            );
        }

        // Validate file type
        const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/3gpp', 'video/mpeg'];
        if (!validTypes.includes(videoFile.type)) {
            return NextResponse.json(
                { error: '対応していない動画形式です。MP4, MOV, AVI, WebM, 3GP形式をお試しください。' },
                { status: 400 }
            );
        }

        // Convert file to base64
        const arrayBuffer = await videoFile.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');

        // Determine MIME type
        let mimeType = videoFile.type;
        if (mimeType === 'video/quicktime') {
            mimeType = 'video/mp4'; // Gemini expects mp4 for MOV files
        }

        console.log('=== STAGE 1: Analyzing video for timestamps ===');

        // STAGE 1: Get timestamps and actions from video
        let stage1Response;
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Exponential backoff: 2s, 4s, 8s -> 5s, 10s, 20s (increased for video processing)
                    const delay = Math.pow(2, attempt) * 2500;
                    console.log(`⏳ Stage 1 Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                stage1Response = await genAI.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: base64Data,
                                    },
                                },
                                {
                                    text: STAGE1_PROMPT,
                                },
                            ],
                        },
                    ],
                    config: {
                        responseMimeType: 'application/json',
                    },
                });

                // If successful, break the loop
                break;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const is429 = errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED');

                if (is429 && attempt < maxRetries - 1) {
                    console.log(`⚠️ Stage 1 Rate limit hit, will retry...`);
                    continue;
                }

                // If not 429 or last attempt, throw to be caught by outer catch
                throw error;
            }
        }

        if (!stage1Response) {
            throw new Error('Failed to get response from Gemini after retries');
        }

        const stage1Text = stage1Response.text || '';
        let manualData;

        try {
            const jsonMatch = stage1Text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                manualData = JSON.parse(jsonMatch[0]);
                console.log('Stage 1 complete:', manualData.steps.length, 'steps found');
            } else {
                throw new Error('JSON not found in Stage 1 response');
            }
        } catch (parseError) {
            console.error('Failed to parse Stage 1 response:', stage1Text);
            return NextResponse.json(
                { error: 'Stage 1: タイムスタンプの抽出に失敗しました。' },
                { status: 500 }
            );
        }

        // Validate Stage 1 response
        if (!manualData.title || !manualData.steps || !Array.isArray(manualData.steps)) {
            return NextResponse.json(
                { error: '手順書の生成に失敗しました。動画の内容を確認してもう一度お試しください。' },
                { status: 500 }
            );
        }

        console.log('=== STAGE 2: Extracting frames and detecting coordinates ===');
        console.log('⚠️ Stage 2 coordination detection will be handled client-side');

        return NextResponse.json(manualData);

    } catch (error) {
        console.error('API Error:', error);

        // Handle specific errors
        if (error instanceof Error) {
            if (error.message.includes('RESOURCE_EXHAUSTED')) {
                return NextResponse.json(
                    { error: 'APIの利用制限に達しました。しばらく待ってからお試しください。' },
                    { status: 429 }
                );
            }
            if (error.message.includes('INVALID_ARGUMENT')) {
                return NextResponse.json(
                    { error: '動画ファイルの処理に失敗しました。別の形式の動画をお試しください。' },
                    { status: 400 }
                );
            }
        }

        return NextResponse.json(
            { error: 'マニュアル生成中にエラーが発生しました。もう一度お試しください。' },
            { status: 500 }
        );
    }
}

// Increase body size limit for video uploads

