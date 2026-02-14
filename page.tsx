'use client';

import { useState, useCallback, useEffect } from 'react';
import VideoUploader from '@/components/VideoUploader';
import ManualViewer from '@/components/ManualViewer';
import { extractFrameAtTimestamp } from '@/utils/videoProcessor';

export interface ManualStep {
    stepNumber: number;
    action: string;
    detail: string;
    timestamp?: string;
    box_2d?: number[]; // [y_min, x_min, y_max, x_max] in 0-1000 scale (Gemini native)
    label?: string; // UI element label
    screenshot?: string; // base64 image data
    originalUrl?: string; // Original screenshot without annotations (for clean editing)
    canvasData?: any; // Fabric.js JSON data - For re-editability
    uid?: string; // Stable unique ID - survives deletion/renumbering
}

export interface ManualData {
    title: string;
    overview: string;
    steps: ManualStep[];
    notes?: string[];
}



// ============================================================
// 動画圧縮関数
// MediaRecorder API を使ってブラウザ上で動画を再エンコードする。
// 解析用途なので解像度を落とすだけで十分（スクリーンショットは元動画から取得）。
// ============================================================
async function compressVideoForAnalysis(
    file: File,
    onProgress?: (percent: number) => void
): Promise<File> {
    return new Promise((resolve) => {
        // MediaRecorder が使えない環境では元ファイルをそのまま返す
        if (typeof MediaRecorder === 'undefined') {
            console.warn('[compress] MediaRecorder not available, using original file');
            resolve(file);
            return;
        }

        const video = document.createElement('video');
        const objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;
        video.muted = true;
        video.playsInline = true;

        video.onloadedmetadata = () => {
            // 目標解像度：幅 854px（SD画質）
            const targetWidth = 854;
            const targetHeight = Math.round(video.videoHeight * (targetWidth / video.videoWidth));

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d')!;

            // MediaRecorder でキャプチャストリームを録画
            const stream = (canvas as any).captureStream(5); // 5fps で十分
            const chunks: Blob[] = [];

            // 対応コーデックを選定
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : MediaRecorder.isTypeSupported('video/webm')
                    ? 'video/webm'
                    : '';

            if (!mimeType) {
                console.warn('[compress] No supported codec, using original file');
                URL.revokeObjectURL(objectUrl);
                resolve(file);
                return;
            }

            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 500_000, // 500kbps（解析用なので低ビットレートで十分）
            });

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                URL.revokeObjectURL(objectUrl);
                const blob = new Blob(chunks, { type: mimeType });

                // 圧縮後が元より大きい場合は元ファイルを使う（ごく短い動画など）
                if (blob.size >= file.size) {
                    console.log(`[compress] Compressed(${blob.size}) >= Original(${file.size}), using original`);
                    resolve(file);
                    return;
                }

                console.log(`[compress] ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(blob.size / 1024 / 1024).toFixed(1)}MB (${Math.round(blob.size / file.size * 100)}%)`);
                resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.webm'), { type: mimeType }));
            };

            // 動画を再生しながらキャンバスに描画して録画
            recorder.start(100); // 100ms ごとにチャンクを生成

            const duration = video.duration;
            let lastProgress = 0;

            const drawFrame = () => {
                if (video.ended || video.paused) {
                    recorder.stop();
                    return;
                }
                ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

                // 進捗を通知
                const progress = Math.round((video.currentTime / duration) * 100);
                if (progress !== lastProgress) {
                    lastProgress = progress;
                    onProgress?.(progress);
                }

                requestAnimationFrame(drawFrame);
            };

            video.onended = () => recorder.stop();
            video.play().then(() => requestAnimationFrame(drawFrame));
        };

        video.onerror = () => {
            console.warn('[compress] Video load error, using original file');
            URL.revokeObjectURL(objectUrl);
            resolve(file);
        };
    });
}

export default function Home() {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState<string>('動画を分析中...');
    const [manual, setManual] = useState<ManualData | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Persistence: Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('am_current_manual');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setManual(parsed);
            } catch (e) {
                console.error('Failed to load manual from localStorage');
            }
        }
    }, []);

    // Persistence: Save to localStorage whenever manual changes
    useEffect(() => {
        if (manual) {
            try {
                localStorage.setItem('am_current_manual', JSON.stringify(manual));
            } catch (e) {
                console.warn('Failed to save manual to localStorage (Quota Exceeded):', e);
            }
        }
    }, [manual]);

    const handleVideoSelect = useCallback((file: File) => {
        setVideoFile(file);
        setVideoPreviewUrl(URL.createObjectURL(file));
        setManual(null);
        setError(null);
    }, []);

    const handleRemoveVideo = useCallback(() => {
        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
        }
        setVideoFile(null);
        setVideoPreviewUrl(null);
        setManual(null);
    }, [videoPreviewUrl]);

    const handleReset = useCallback(() => {
        if (videoPreviewUrl) {
            URL.revokeObjectURL(videoPreviewUrl);
        }
        setVideoFile(null);
        setVideoPreviewUrl(null);
        setManual(null);
        setError(null);
        setIsLoading(false);
        // FORCE RESET: Clear all persistence
        localStorage.removeItem('am_current_manual');
        localStorage.removeItem('am_manual_data');
        localStorage.removeItem('am_editor_color_v2');
        localStorage.removeItem('am_editor_stroke_v2');
        localStorage.removeItem('am_editor_fontSize_v2');

        // Clear all canvas states
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('am_canvas_state_')) {
                localStorage.removeItem(key);
            }
        });
    }, [videoPreviewUrl]);

    const handleGenerate = async () => {
        if (!videoFile) return;

        setIsLoading(true);
        setError(null);
        setLoadingStage('準備中: 動画を圧縮しています...');

        try {
            // ── 圧縮処理 ──────────────────────────────────────────
            // 解析用に動画を圧縮する（解像度を落としてファイルサイズを削減）
            // スクリーンショットは元動画から取得するため画質は影響しない
            const compressedFile = await compressVideoForAnalysis(videoFile, (progress) => {
                setLoadingStage(`準備中: 動画を圧縮しています... ${progress}%`);
            });
            // ──────────────────────────────────────────────────────

            setLoadingStage('Stage 1: AIが動画全体を解析中... (これには少し時間がかかります)');

            const formData = new FormData();
            // 圧縮に成功した場合は圧縮版を、失敗した場合は元ファイルを送る
            formData.append('video', compressedFile);

            // STAGE 1: Agentic Analysis (Send video to Gemini)
            const response = await fetch('/api/analyze-video', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Server Error Details:', errorData); // Log full error object
                throw new Error(errorData.error || '動画の解析に失敗しました。ファイルサイズが大きすぎる可能性があります。');
            }

            const data = await response.json();
            const aiSteps = data.steps;

            console.log('✅ AI Analysis complete:', aiSteps.length, 'key steps found');

            // STAGE 2: Extract High-Res Frames at identified timestamps
            setLoadingStage(`Stage 2: 重要な瞬間を高画質で切り出し中 (0/${aiSteps.length})`);

            const finalSteps: ManualStep[] = [];

            for (let i = 0; i < aiSteps.length; i++) {
                const step = aiSteps[i];

                if (!step.timestamp) {
                    continue;
                }

                try {
                    // Extract frame at precise timestamp identified by AI
                    const frameData = await extractFrameAtTimestamp(videoFile, step.timestamp);

                    finalSteps.push({
                        stepNumber: i + 1,
                        action: step.action,
                        detail: step.reason || step.action,
                        timestamp: step.timestamp,
                        box_2d: step.box_2d, // AI detected box
                        label: step.label,
                        screenshot: frameData,
                        originalUrl: frameData
                    });

                    // Update progress
                    setLoadingStage(`Stage 2: 重要な瞬間を高画質で切り出し中 (${i + 1}/${aiSteps.length})`);

                } catch (error) {
                    console.error(`Error processing step ${i + 1}:`, error);
                    // Skip if frame extraction fails
                }
            }

            console.log('✅ Stage 2 complete');

            // Initialize Manual Data
            const newManual: ManualData = {
                title: videoFile.name.replace(/\.[^/.]+$/, "") + " マニュアル",
                overview: "AIが動画から自動生成したマニュアルです。",
                steps: finalSteps,
                notes: []
            };

            setManual(newManual);

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="main">
            <div className="container">
                {/* Header */}
                <header className="header">
                    <div className="header__brand" onClick={handleReset}>
                        <div className="header__icon text-purple-600">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                <polyline points="2 17 12 22 22 17" />
                                <polyline points="2 12 12 17 22 12" />
                            </svg>
                        </div>
                        <h1 className="header__title">
                            AutoManual <span className="header__title-sub text-purple-600 font-black">Studio</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {manual && (
                            <button
                                onClick={() => {
                                    localStorage.removeItem('am_current_manual');
                                    handleReset();
                                }}
                                className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                データをクリア
                            </button>
                        )}
                        <span className="header__version bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold text-[10px]">v4.1 PRO</span>
                    </div>
                </header>

                {/* Hero */}
                <section className="hero py-20 text-center">
                    <div className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full bg-purple-50 border border-purple-100 shadow-sm animate-fade-in-up">
                        <span className="flex h-2 w-2 rounded-full bg-purple-600"></span>
                        <span className="text-sm font-bold text-purple-700 tracking-wide">AutoManual V4.3</span>
                    </div>

                    <h2 className="hero__title leading-tight mb-8">
                        <span className="block text-4xl md:text-7xl font-black text-slate-900 mb-2 tracking-tight">あなたの動画が、</span>
                        <span className="block text-5xl md:text-8xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 drop-shadow-sm pb-2">
                            美しい手順書に。
                        </span>
                    </h2>

                    <p className="hero__description font-noto text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed font-medium">
                        デザインの知識は必要ありません。<br className="hidden md:block" />
                        動画を選ぶだけで、AIがレイアウトまで美しくスタイリング。<br className="hidden md:block" />
                        <span className="text-slate-800 font-bold">「直感的な操作」</span>で、あなたのアイデアを自由にカタチに。
                    </p>
                </section>

                {/* Upload Section (Only show if no manual or explicitly requested) */}
                {(!manual || videoFile) && (
                    <VideoUploader
                        onVideoSelect={handleVideoSelect}
                        videoFile={videoFile}
                        videoPreviewUrl={videoPreviewUrl}
                        onRemoveVideo={handleRemoveVideo}
                    />
                )}

                {/* Generate Button */}
                {videoFile && !isLoading && !manual && (
                    <div className="generate-section">
                        <button
                            className="btn btn--primary"
                            onClick={handleGenerate}
                        >
                            マニュアルを生成
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {isLoading && (
                    <div className="loading">
                        <div className="loading__spinner"></div>
                        <p className="loading__text">{loadingStage}</p>
                        <p className="loading__subtext">少々お待ちください。</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="toast toast--error">
                        <span>{error}</span>
                    </div>
                )}

                {/* Manual Result */}
                {manual && (
                    <ManualViewer
                        manual={manual}
                        videoFile={videoFile || undefined}
                        onUpdateManual={setManual}
                    />
                )}
            </div>
        </main>
    );
}
