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
}

export interface ManualData {
    title: string;
    overview: string;
    steps: ManualStep[];
    notes?: string[];
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
            localStorage.setItem('am_current_manual', JSON.stringify(manual));
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
    }, [videoPreviewUrl]);

    const handleGenerate = async () => {
        if (!videoFile) return;

        setIsLoading(true);
        setError(null);
        setLoadingStage('Stage 1: 動画からタイムスタンプ抽出中...');

        try {
            const formData = new FormData();
            formData.append('video', videoFile);

            // STAGE 1: Get timestamps and actions from video
            const response = await fetch('/api/generate-manual', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'マニュアル生成に失敗しました');
            }

            const data: ManualData = await response.json();
            console.log('✅ Stage 1 complete:', data.steps.length, 'steps found');

            // STAGE 2: Extract frames only (No auto-detection)
            setLoadingStage(`Stage 2: スクリーンショット生成中 (0/${data.steps.length})`);

            const finalSteps = [];

            for (let i = 0; i < data.steps.length; i++) {
                const step = data.steps[i];

                if (!step.timestamp) {
                    finalSteps.push(step);
                    continue;
                }

                try {
                    // Extract frame at timestamp
                    const frameData = await extractFrameAtTimestamp(videoFile, step.timestamp);

                    finalSteps.push({
                        ...step,
                        screenshot: frameData
                    });

                    // Update progress
                    setLoadingStage(`Stage 2: スクリーンショット生成中 (${i + 1}/${data.steps.length})`);

                } catch (error) {
                    console.error(`Error processing step ${step.stepNumber}:`, error);
                    finalSteps.push(step);
                }
            }

            console.log('✅ Stage 2 complete');

            setManual({
                ...data,
                steps: finalSteps,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました');
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
                <section className="hero">
                    <h2 className="hero__title">
                        <span className="hero__title-gradient">手順書を、自動で美しく。</span>
                    </h2>
                    <p className="hero__subtitle">AI動画マニュアル作成アシスタント</p>
                    <p className="hero__description font-noto">
                        動画をアップロードするだけで、AIが手順を自動構成。<br />
                        「モダン・パープル」なインターフェースで、誰でもプロ級の手順書が完成します。
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
