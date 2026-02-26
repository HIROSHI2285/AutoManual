/**
 * Video processing utilities for extracting frames and generating annotated screenshots
 * Text is NOT burned into images - only red bounding boxes are drawn
 * This allows text to remain editable when copied to Word
 */

export interface VideoFrame {
    timestamp: string;
    imageData: string; // base64
}

/**
 * Extract frame from video at specific timestamp
 * 抽出時の画質を最高設定(1.0)に変更
 */
export async function extractFrameAtTimestamp(
    videoFile: File,
    timestampStr: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
        }

        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const url = URL.createObjectURL(videoFile);
        video.src = url;

        // Parse timestamp (format: "0:05" or "1:23" or "00:01:23")
        const parseTimestamp = (ts: string): number => {
            const parts = ts.split(':').map(Number);
            if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
            return 0;
        };

        // Add small forward offset (0.5s) to shift past exact second boundary
        // This helps capture the correct frame when keyframes don't align with integer seconds
        const targetTime = parseTimestamp(timestampStr) + 0.5;

        /** Capture the currently displayed video frame to canvas */
        const captureFrame = () => {
            try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/png');
                URL.revokeObjectURL(url);
                resolve(imageData);
            } catch (error) {
                URL.revokeObjectURL(url);
                reject(error);
            }
        };

        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            video.currentTime = Math.min(targetTime, video.duration - 0.1);
        });

        video.addEventListener('seeked', () => {
            // Wait a short time after seeked fires to let the decoder fully settle
            // on the correct frame. requestVideoFrameCallback is NOT used here
            // because it requires the video to be playing, which we don't do.
            setTimeout(captureFrame, 100);
        });

        video.addEventListener('error', () => {
            URL.revokeObjectURL(url);
            reject(new Error('Video loading failed'));
        });
    });
}

/**
 * スマートクロップ：最高品質の補間と無劣化出力を適用
 */
export function smartCropFrame(
    imageData: string,
    box_2d: number[] // [ymin, xmin, ymax, xmax] in 0-1000 scale
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const [ymin, xmin, ymax, xmax] = box_2d;

            // box_2d の面積比（0〜1）
            const boxAreaRatio = ((xmax - xmin) / 1000) * ((ymax - ymin) / 1000);

            // ズーム倍率を面積比から決定（ユーザーFBにより再緩和：指寄りすぎ問題を解消）
            let zoomFactor: number;
            if (boxAreaRatio < 0.08) {
                zoomFactor = 1.4; // 小さい要素：1.6倍→1.4倍に緩和
            } else if (boxAreaRatio < 0.25) {
                zoomFactor = 1.2; // 中程度の要素：1.3倍→1.2倍に緩和
            } else {
                zoomFactor = 1.0; // 広い範囲はそのまま
            }

            // ズーム不要な場合は元画像をそのまま返す
            if (zoomFactor === 1.0) {
                resolve(imageData);
                return;
            }

            const imgW = img.width;
            const imgH = img.height;

            // box_2d の中心座標（ピクセル）
            const centerX = ((xmin + xmax) / 2 / 1000) * imgW;
            const centerY = ((ymin + ymax) / 2 / 1000) * imgH;

            // クロップ領域のサイズ（元画像のサイズ / zoomFactor）
            const cropW = imgW / zoomFactor;
            const cropH = imgH / zoomFactor;

            // クロップ領域の左上座標（画像の端をはみ出さないようにクランプ）
            const cropX = Math.max(0, Math.min(centerX - cropW / 2, imgW - cropW));
            const cropY = Math.max(0, Math.min(centerY - cropH / 2, imgH - cropH));

            const canvas = document.createElement('canvas');
            canvas.width = imgW;
            canvas.height = imgH;

            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(imageData); return; }

            // --- 画質向上のための追加設定 ---
            // 補完品質を「高」に設定することでボヤけを抑制
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(
                img,
                cropX, cropY, cropW, cropH,
                0, 0, imgW, imgH
            );

            // クロップ後の保存もロスレス品質のPNG形式に統一
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = imageData;
    });
}

/**
 * Draw ONLY bounding box on image (no text - keeps text editable)
 */
export function drawBoundingBox(
    imageData: string,
    boundingBox: number[] // [ymin, xmin, ymax, xmax] in 0-1000 scale
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
        }

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Format: [ymin, xmin, ymax, xmax] in 0-1000 scale (Gemini native)
            const [ymin, xmin, ymax, xmax] = boundingBox;

            // Debug: Log coordinates for troubleshooting
            console.log('=== BOUNDING BOX DEBUG ===');
            console.log('Image dimensions:', img.width, 'x', img.height);
            console.log('Raw boundingBox (0-1000):', boundingBox);

            // Convert from 0-1000 scale to pixels
            const rawBoxX = (xmin / 1000) * img.width;
            const rawBoxY = (ymin / 1000) * img.height;
            const rawBoxW = ((xmax - xmin) / 1000) * img.width;
            const rawBoxH = ((ymax - ymin) / 1000) * img.height;

            // Add padding (e.g. 10px) to make the box slightly larger than the element
            const padding = 10;
            const boxX = Math.max(0, rawBoxX - padding);
            const boxY = Math.max(0, rawBoxY - padding);
            const boxW = Math.min(img.width - boxX, rawBoxW + (padding * 2));
            const boxH = Math.min(img.height - boxY, rawBoxH + (padding * 2));

            console.log('Calculated pixels (with padding):', { boxX: Math.round(boxX), boxY: Math.round(boxY), boxW: Math.round(boxW), boxH: Math.round(boxH) });
            console.log('=== END DEBUG ===');

            // Draw thin red bounding box
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = Math.max(3, img.width / 400); // Slightly thicker line for visibility
            ctx.setLineDash([]);
            ctx.strokeRect(boxX, boxY, boxW, boxH);

            // Transparent center (removed fillRect)

            // Minimal corner markers (optional, kept them smaller or removed)
            // Removed corner markers for a cleaner look as requested 


            // 最終的なアノテーション画像もロスレス品質のPNG形式で書き出し
            resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = () => {
            reject(new Error('Image loading failed'));
        };

        img.src = imageData;
    });
}

/**
 * Stage 2: Detect coordinates from a static image using Gemini API
 * Sends the image to Gemini and gets precise box_2d coordinates
 * @param imageDataUrl - Base64 data URL of the image
 * @param action - Optional action description to help Gemini find the correct element
 */
export async function detectCoordinatesFromImage(
    imageDataUrl: string,
    action?: string
): Promise<{ box_2d: number[]; label: string } | null> {
    try {
        // Extract base64 data from data URL
        const base64Data = imageDataUrl.split(',')[1];

        const response = await fetch('/api/detect-coordinates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageData: base64Data, action }),
        });

        if (!response.ok) {
            console.error('Failed to detect coordinates:', response.statusText);
            return null;
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error detecting coordinates:', error);
        return null;
    }
}

/**
 * Process all steps: extract frames and draw bounding boxes only
 * Text labels are kept as HTML for editability
 */
export async function processVideoSteps(
    videoFile: File,
    steps: Array<{
        stepNumber: number;
        action: string;
        timestamp?: string;
        box_2d?: number[]; // [y_min, x_min, y_max, x_max] in 0-1000 (Gemini native)
    }>
): Promise<Map<number, string>> {
    const screenshots = new Map<number, string>();

    for (const step of steps) {
        if (!step.timestamp) continue;

        try {
            // Extract frame at timestamp
            const frameData = await extractFrameAtTimestamp(videoFile, step.timestamp);

            // Draw bounding box only (no text burned in)
            if (step.box_2d) {
                const annotatedImage = await drawBoundingBox(frameData, step.box_2d);
                screenshots.set(step.stepNumber, annotatedImage);
            } else {
                // Just use the frame without annotation
                screenshots.set(step.stepNumber, frameData);
            }
        } catch (error) {
            console.error(`Failed to process step ${step.stepNumber}:`, error);
        }
    }

    return screenshots;
}
