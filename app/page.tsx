'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import VideoUploader from '@/components/VideoUploader';
import ManualViewer from '@/components/ManualViewer';
import { extractFrameAtTimestamp, smartCropFrame } from '@/utils/videoProcessor';

// Hoisted RegExp (js-hoist-regexp: compiled once at module level)
const RE_FILE_EXT = /\.[^/.]+$/;

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
// 動画圧縮関数 (現在は精度優先のため未使用だが、将来のために保持)
// ============================================================
async function compressVideoForAnalysis(
    file: File,
    onProgress?: (percent: number) => void
): Promise<File> {
    return new Promise((resolve) => {
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
            const targetWidth = 854;
            const targetHeight = Math.round(video.videoHeight * (targetWidth / video.videoWidth));

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d')!;

            const stream = (canvas as any).captureStream(10);
            const chunks: Blob[] = [];

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
                videoBitsPerSecond: 500_000,
            });

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                URL.revokeObjectURL(objectUrl);
                const blob = new Blob(chunks, { type: mimeType });

                if (blob.size >= file.size) {
                    console.log(`[compress] Compressed(${blob.size}) >= Original(${file.size}), using original`);
                    resolve(file);
                    return;
                }

                console.log(`[compress] ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(blob.size / 1024 / 1024).toFixed(1)}MB (${Math.round(blob.size / file.size * 100)}%)`);
                resolve(new File([blob], file.name.replace(RE_FILE_EXT, '.webm'), { type: mimeType }));
            };

            recorder.start(100);

            const duration = video.duration;
            let lastProgress = 0;

            const drawFrame = () => {
                if (video.ended || video.paused) {
                    recorder.stop();
                    return;
                }
                ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

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
    // Multi-file support
    const [videoFiles, setVideoFiles] = useState<File[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState<string>('動画を分析中...');
    const [progress, setProgress] = useState(0);
    const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Simulated progress helper: logarithmic curve — fast at start, slows as it approaches target
    const startSimulatedProgress = useCallback((from: number, to: number, durationMs: number) => {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        const startTime = Date.now();
        progressTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const ratio = Math.min(elapsed / durationMs, 1);
            // Logarithmic ease-out: fast start, very slow finish
            // At 50% time elapsed → ~70% progress; at 90% time → ~90% progress
            const eased = 1 - Math.pow(1 - ratio, 3);
            const current = from + (to - from) * eased * 0.95; // never fully reach target
            setProgress(Math.round(Math.min(current, to - 1)));
        }, 300);
    }, []);

    const stopSimulatedProgress = useCallback(() => {
        if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
        }
    }, []);
    const [manual, setManual] = useState<ManualData | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 永続化: 初回のみlocalStorageから復元
    useEffect(() => {
        const saved = localStorage.getItem('am_current_manual');
        if (saved) {
            try {
                setManual(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to load manual from localStorage');
            }
        }
    }, []);

    // 永続化: manualが更新されるたびに保存
    useEffect(() => {
        if (manual) {
            try {
                localStorage.setItem('am_current_manual', JSON.stringify(manual));
            } catch (e) {
                console.warn('Failed to save manual to localStorage (Quota Exceeded):', e);
            }
        }
    }, [manual]);

    const handleVideosSelect = useCallback((files: File[]) => {
        // Add new files to existing ones
        setVideoFiles(prev => [...prev, ...files]);
        setManual(null);
        setError(null);
    }, []);

    const handleRemoveVideo = useCallback((index: number) => {
        setVideoFiles(prev => prev.filter((_, i) => i !== index));
        setManual(null);
    }, []);

    // リセット（データクリア）
    const handleResetData = useCallback(() => {
        if (confirm("入力データを完全に消去してリセットしますか？")) {
            setVideoFiles([]);
            setManual(null);
            localStorage.removeItem('am_current_manual');
            window.location.reload();
        }
    }, []);

    const handleGenerate = async () => {
        if (videoFiles.length === 0) return;

        setIsLoading(true);
        setError(null);
        setProgress(0);

        const finalSteps: ManualStep[] = [];
        let totalProgress = 0;

        try {
            // Process each video sequentially
            for (let videoIndex = 0; videoIndex < videoFiles.length; videoIndex++) {
                const videoFile = videoFiles[videoIndex];
                const videoNum = videoIndex + 1;
                const totalVideos = videoFiles.length;

                // STAGE 1: Agentic Analysis
                setLoadingStage(`[${videoNum}/${totalVideos}] 動画「${videoFile.name}」を解析中... (AI分析)`);

                // Simulated progress: each video's AI analysis covers (85 / totalVideos)% of the bar
                const videoProgressStart = Math.round((videoIndex / totalVideos) * 85);
                const videoProgressEnd = Math.round(((videoIndex + 1) / totalVideos) * 85);
                startSimulatedProgress(videoProgressStart, videoProgressEnd, 180000); // simulate over ~3min

                // Compression disabled for accuracy as per user request
                // const compressedFile = await compressVideoForAnalysis(videoFile);

                const formData = new FormData();
                formData.append('video', videoFile);

                const response = await fetch('/api/analyze-video', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `動画「${videoFile.name}」の解析に失敗しました。`);
                }

                const data = await response.json();
                const aiSteps = data.steps;

                console.log(`✅ [Video ${videoNum}] Analysis complete:`, aiSteps.length, 'steps');

                // Stop simulated progress, jump to the video's analysis end point
                stopSimulatedProgress();
                setProgress(videoProgressEnd);

                // STAGE 2: Extract Frames
                setLoadingStage(`[${videoNum}/${totalVideos}] 動画「${videoFile.name}」から画像を切り出し中...`);

                for (let i = 0; i < aiSteps.length; i++) {
                    const step = aiSteps[i];
                    if (!step.timestamp) continue;

                    try {
                        // Extract high-res frame
                        const frameData = await extractFrameAtTimestamp(videoFile, step.timestamp);

                        // Smart Automatic Zoom
                        let displayFrame = frameData;
                        if (step.box_2d && step.box_2d.length === 4) {
                            try {
                                displayFrame = await smartCropFrame(frameData, step.box_2d);
                            } catch (cropErr) {
                                console.warn(`SmartCrop failed for step ${i + 1} of video ${videoNum}, using original:`, cropErr);
                                displayFrame = frameData;
                            }
                        }

                        // Calculate global step number
                        const globalStepNumber = finalSteps.length + 1;

                        finalSteps.push({
                            stepNumber: globalStepNumber,
                            action: step.action,
                            detail: step.reason || step.action,
                            timestamp: step.timestamp,
                            box_2d: step.box_2d,
                            label: step.label,
                            screenshot: displayFrame,
                            originalUrl: frameData,
                            uid: Math.random().toString(36).substr(2, 9) // Ensure unique ID
                        });

                        // Detailed progress update (85% → 100% range)
                        const extractionProgress = 85 + Math.round(((videoIndex + (i + 1) / aiSteps.length) / totalVideos) * 15);
                        setProgress(Math.min(extractionProgress, 99));
                        setLoadingStage(`[${videoNum}/${totalVideos}] 画像切り出し中... (${i + 1}/${aiSteps.length})`);

                    } catch (error) {
                        console.error(`Error processing step ${i + 1} of video ${videoNum}:`, error);
                    }
                }
            }

            console.log('✅ All videos processed. Total steps:', finalSteps.length);

            // Initialize Manual Data
            const title = videoFiles.length === 1
                ? videoFiles[0].name.replace(RE_FILE_EXT, "") + " マニュアル"
                : "統合マニュアル (" + videoFiles.length + "本)";

            const newManual: ManualData = {
                title: title,
                overview: '自動生成されたマニュアルです。編集ボタンから内容を修正できます。',
                steps: finalSteps,
                notes: []
            };

            setProgress(100);
            setManual(newManual);

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
        } finally {
            stopSimulatedProgress();
            setIsLoading(false);
            setProgress(0);
        }
    };

    return (
        <main className="main">
            <div className="container">
                {/* Header */}
                <header className="header">
                    {/* onClick={handleReset} を削除し、意図しない全削除を防止 */}
                    <div className="header__brand cursor-pointer">
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
                                    // ユーザーが明示的にボタンを押した時のみ localStorage を削除
                                    if (confirm("入力したマニュアルデータを完全に消去しますか？")) {
                                        localStorage.removeItem('am_current_manual');
                                        handleResetData();
                                        window.location.reload(); // 確実に初期状態に戻す
                                    }
                                }}
                                className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                データをクリア
                            </button>
                        )}
                        <span className="header__version bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold text-[10px]">v4.4 MULTI</span>
                    </div>
                </header>

                {/* Hero */}
                <section className="hero py-20 text-center">
                    <div className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full bg-purple-50 border border-purple-100 shadow-sm animate-fade-in-up">
                        <span className="flex h-2 w-2 rounded-full bg-purple-600"></span>
                        <span className="text-sm font-bold text-purple-700 tracking-wide">AutoManual V4.4</span>
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
                {(!manual || videoFiles.length > 0) && (
                    <VideoUploader
                        onVideosSelect={handleVideosSelect}
                        videoFiles={videoFiles}
                        onRemoveVideo={handleRemoveVideo}
                    />
                )}

                {/* Generate Button */}
                {videoFiles.length > 0 && !isLoading && !manual && (
                    <div className="generate-section">
                        <button
                            className="btn btn--primary"
                            onClick={handleGenerate}
                        >
                            {videoFiles.length > 1
                                ? `${videoFiles.length}本の動画からマニュアルを生成`
                                : 'マニュアルを生成'}
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {isLoading && (
                    <div className="loading">
                        <div className="w-full max-w-md mx-auto mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-bold text-slate-600">{loadingStage}</p>
                                <span className="text-sm font-black text-purple-600 tabular-nums">{progress}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner">
                                <div
                                    className="bg-gradient-to-r from-purple-600 to-violet-500 h-full rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
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
                        videoFile={videoFiles[0] || undefined}
                        onUpdateManual={setManual}
                    />
                )}
            </div>
        </main>
    );
}
