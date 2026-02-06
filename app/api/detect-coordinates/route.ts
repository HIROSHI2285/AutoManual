import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const STAGE2_PROMPT = `
この画像内で、ユーザーが操作した箇所（クリックした場所、入力フィールドなど）を検出してください。

**The box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000.**

出力形式（JSON）:
{
  "box_2d": [ymin, xmin, ymax, xmax],
  "label": "UI要素名（例: ボタン、リンク、入力フィールド）"
}
`;

export async function POST(request: NextRequest) {
    try {
        // Check API key
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY が設定されていません。' },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { imageData, action } = body;

        if (!imageData) {
            return NextResponse.json(
                { error: '画像データが見つかりません' },
                { status: 400 }
            );
        }

        console.log('Stage 2: Detecting coordinates for action:', action);

        // Extract keyword from action for text-based detection
        // Examples: "スポーツナビをクリック" -> "スポーツナビ"
        //           "yahoo.co.jpと入力" -> "yahoo" (or address bar)
        const extractKeyword = (actionText: string): string => {
            // Remove common action verbs and particles
            const cleaned = actionText
                .replace(/をクリック(する|します)?/g, '')
                .replace(/を選択(する|します)?/g, '')
                .replace(/を押(す|します)?/g, '')
                .replace(/をタップ(する|します)?/g, '')
                .replace(/に入力(する|します)?/g, '')
                .replace(/にアクセス(する|します)?/g, '')
                .replace(/を開(く|きます)?/g, '')
                .replace(/のリンク/g, '')
                .replace(/ボタン$/g, '')
                .trim();

            // Extract quoted text if present
            const quotedMatch = cleaned.match(/[「『"'](.*?)[」』"']/);
            if (quotedMatch) return quotedMatch[1];

            // Return the cleaned text or original action
            return cleaned || actionText;
        };

        const keyword = action ? extractKeyword(action) : '';
        console.log('🔑 Extracted keyword:', keyword);

        // Create text-based prompt (find element containing specific text)
        const prompt = action
            ? `Find the UI element in this image that contains or displays: "${keyword}"

This element is the target for the action: "${action}"

Return the bounding box in box_2d format: [ymin, xmin, ymax, xmax]
Coordinates MUST be normalized to 0-1000 scale.

CRITICAL INSTRUCTIONS:
1. Find the clickable element that contains "${keyword}" text
2. Include a small padding around the element (about 5-10 units on each side)
3. The box should be slightly LARGER than the text itself to include the full clickable area
4. If it's a button or link, include the entire button/link area, not just the text
5. ymin = top edge, ymax = bottom edge, xmin = left edge, xmax = right edge

Output as JSON:
{
  "box_2d": [ymin, xmin, ymax, xmax],
  "label": "detected element text"
}
`
            : STAGE2_PROMPT;

        // Retry logic for rate limiting
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Exponential backoff: 2s, 4s, 8s
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`⏳ Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                // Send image to Gemini for coordinate detection
                const apiResponse = await genAI.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [{
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType: 'image/png', data: imageData } },
                            { text: prompt }
                        ]
                    }],
                    config: { responseMimeType: 'application/json' }
                });

                const responseText = apiResponse.text || '';
                console.log('📦 Raw Gemini response:', responseText.substring(0, 500));

                // Parse JSON response - Gemini returns an array of detected elements
                let coordData;
                // Parse the response
                const parsed = JSON.parse(responseText);
                console.log('📦 Parsed response type:', Array.isArray(parsed) ? 'array' : typeof parsed);
                console.log('📦 Parsed response:', JSON.stringify(parsed, null, 2).substring(0, 500));

                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Array format - take first element
                    const firstElement = parsed[0];
                    console.log('📦 First element keys:', Object.keys(firstElement));

                    // Handle various possible property names
                    const box = firstElement.box_2d || firstElement.box || firstElement.bounding_box || firstElement.boundingBox;
                    const label = firstElement.label || firstElement.name || firstElement.text || 'Unknown';

                    if (box) {
                        coordData = { box_2d: box, label: label };
                        console.log('✅ Extracted box_2d:', box, 'Label:', label);
                    } else {
                        console.error('❌ No box property found in:', firstElement);
                        throw new Error('No bounding box in response');
                    }
                } else if (typeof parsed === 'object' && parsed !== null) {
                    // Single object format
                    const box = parsed.box_2d || parsed.box || parsed.bounding_box || parsed.boundingBox;
                    const label = parsed.label || parsed.name || parsed.text || 'Unknown';

                    if (box) {
                        coordData = { box_2d: box, label: label };
                        console.log('✅ Extracted box_2d:', box, 'Label:', label);
                    } else {
                        console.error('❌ No box property found in:', parsed);
                        throw new Error('No bounding box in response');
                    }
                } else {
                    throw new Error('Invalid response format');
                }

                return NextResponse.json(coordData);

            } catch (error) {
                lastError = error as Error;

                // Check if it's a rate limit error (429)
                const errorMessage = error instanceof Error ? error.message : String(error);
                const is429 = errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED');

                if (is429 && attempt < maxRetries - 1) {
                    console.log(`⚠️ Rate limit hit, will retry...`);
                    continue; // Retry
                }

                // For non-429 errors or last attempt, log and return error
                console.error('❌ Coordinate detection error:', error);
                if (error instanceof Error) {
                    console.error('Error message:', error.message);
                }

                // Only return error on last attempt
                if (attempt === maxRetries - 1) {
                    return NextResponse.json(
                        { error: '座標検出中にエラーが発生しました: ' + errorMessage },
                        { status: 500 }
                    );
                }
            }
        }

        // Should not reach here, but just in case
        return NextResponse.json(
            { error: '座標検出に失敗しました' },
            { status: 500 }
        );

    } catch (error) {
        console.error('❌ Request handling error:', error);
        return NextResponse.json(
            { error: 'リクエスト処理中にエラーが発生しました' },
            { status: 500 }
        );
    }
}
