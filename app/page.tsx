'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import VideoUploader from '@/components/VideoUploader';
import ManualViewer from '@/components/ManualViewer';
import { db } from '@/utils/db';
import { extractFrameAtTimestamp, smartCropFrame } from '@/utils/videoProcessor';
import { createProxyVideo } from '@/utils/videoDownsampler';

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
    videoIndex?: number; // Tracks which video this step belongs to
    layout?: 'single' | 'two-column'; // Video-specific layout preference
}

export interface ManualData {
    title: string;
    overview: string;
    steps: ManualStep[];
    notes?: string[];
}


// ============================================================
export default function Home() {
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
            // 進行を一定ペース（リニア）に変更し、前半早すぎ・後半遅すぎを解消
            const current = from + (to - from) * ratio * 0.95; // never fully reach target
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

    // 永続化: 初回のみDexieから復元
    useEffect(() => {
        const loadData = async () => {
            try {
                const saved = await db.manuals.get('current');
                if (saved && saved.data) {
                    setManual(saved.data);
                }
            } catch (e) {
                console.error('Failed to load manual from Dexie', e);
            }
        };
        loadData();
    }, []);

    // 永続化: manualが更新されるたびにDexieに保存
    useEffect(() => {
        if (manual) {
            db.manuals.put({ id: 'current', data: manual }).catch(e => {
                console.warn('Failed to save manual to Dexie:', e);
            });
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
    const handleResetData = useCallback(async () => {
        if (confirm("入力データを完全に消去してリセットしますか？")) {
            setVideoFiles([]);
            setManual(null);
            await db.manuals.delete('current');
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

                // STAGE 1: Dual-Video Strategy (Proxy Generation)
                setLoadingStage(`[${videoNum}/${totalVideos}] 動画「${videoFile.name}」の軽量AI送信用データを作成中... (画質維持の高速化)`);
                const proxyFile = await createProxyVideo(videoFile, (p) => {
                    // Proxy generation consumes the first 10% of the progress bar
                    const baseProgress = Math.round((videoIndex / totalVideos) * 90);
                    setProgress(baseProgress + Math.round(p * 10));
                });

                setLoadingStage(`[${videoNum}/${totalVideos}] 動画「${videoFile.name}」をAI解析中... (API通信)`);

                // Simulated progress: AI analysis covers the remaining 10% to 90% range
                const videoProgressStart = Math.round((videoIndex / totalVideos) * 90) + 10;
                const videoProgressEnd = Math.round(((videoIndex + 1) / totalVideos) * 90);
                startSimulatedProgress(videoProgressStart, videoProgressEnd, 45000); // simulate over ~45sec

                const formData = new FormData();
                formData.append('video', proxyFile); // Send lightweight proxy!

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

                // STAGE 2: Parallel Extract Frames using high-res Original videoFile
                setLoadingStage(`[${videoNum}/${totalVideos}] オリジナル高画質動画から画像を切り出し中... (並列処理)`);

                const validSteps = aiSteps.filter((s: any) => s.timestamp);
                const concurrentLimit = 4; // Process in batches of 4
                let completedScreenshots = 0;

                for (let i = 0; i < validSteps.length; i += concurrentLimit) {
                    const batch = validSteps.slice(i, i + concurrentLimit);

                    await Promise.all(batch.map(async (step: any, batchIndex: number) => {
                        try {
                            // Extract high-res frame from original file! (Zero quality loss)
                            const frameData = await extractFrameAtTimestamp(videoFile, step.timestamp);

                            // Smart Automatic Zoom is disabled to ensure consistency with Edit Mode
                            // The user requested that the full uncropped image (seen in Edit) is used everywhere
                            let displayFrame = frameData;

                            // Calculate step number based on the current video's original sorted array index
                            const originalIndex = i + batchIndex;
                            const videoStepNumber = originalIndex + 1;

                            step.processedData = {
                                stepNumber: videoStepNumber,
                                action: step.action,
                                detail: step.reason || step.action,
                                timestamp: step.timestamp,
                                box_2d: step.box_2d,
                                label: step.label,
                                screenshot: displayFrame,
                                originalUrl: frameData,
                                uid: Math.random().toString(36).substring(2, 11),
                                videoIndex: videoIndex,
                                layout: 'single'
                            };

                        } catch (err) {
                            console.error(`Frame extraction failed for timestamp ${step.timestamp}:`, err);
                        } finally {
                            completedScreenshots++;
                            const extractionProgress = 90 + Math.round((completedScreenshots / validSteps.length) * 10);
                            setProgress(Math.min(extractionProgress, 99));
                            setLoadingStage(`[${videoNum}/${totalVideos}] 高画質画像切り出し中... (${completedScreenshots}/${validSteps.length})`);
                        }
                    }));
                }

                // Push all successfully processed steps in correct sequence
                for (const step of validSteps) {
                    if (step.processedData) {
                        finalSteps.push(step.processedData);
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
                        onUpdateManual={(updater) => {
                            // Bridge functional-setState pattern from ManualViewer to setManual
                            setManual(prev =>
                                prev === null
                                    ? null
                                    : typeof updater === 'function'
                                        ? updater(prev)
                                        : updater
                            );
                        }}
                    />
                )}
            </div>
        </main>
    );
}
