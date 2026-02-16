'use client';

import { useState, useCallback, useEffect } from 'react';
import VideoUploader from '@/components/VideoUploader';
import ManualViewer from '@/components/ManualViewer';
import { extractFrameAtTimestamp, smartCropFrame } from '@/utils/videoProcessor';

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






export default function Home() {
    // 複数ファイル対応：配列で管理
    const [videoFiles, setVideoFiles] = useState<File[]>([]);
    const [videoPreviewUrls, setVideoPreviewUrls] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState<string>('動画を分析中...');
    const [manual, setManual] = useState<ManualData | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Persistence: Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('am_current_manual');
        if (saved) {
            try { setManual(JSON.parse(saved)); }
            catch (e) { console.error('Failed to load manual from localStorage'); }
        }
    }, []);

    // Persistence: Save to localStorage whenever manual changes
    useEffect(() => {
        if (manual) {
            try { localStorage.setItem('am_current_manual', JSON.stringify(manual)); }
            catch (e) { console.warn('Failed to save manual to localStorage (Quota Exceeded):', e); }
        }
    }, [manual]);

    // 複数ファイルを追加（既存リストに追記）
    const handleVideosSelect = useCallback((files: File[]) => {
        setVideoFiles(prev => [...prev, ...files]);
        setVideoPreviewUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
        setManual(null);
        setError(null);
    }, []);

    // 指定インデックスのファイルを削除
    const handleRemoveVideo = useCallback((index: number) => {
        setVideoFiles(prev => prev.filter((_, i) => i !== index));
        setVideoPreviewUrls(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    }, []);

    const handleReset = useCallback(() => {
        videoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
        setVideoFiles([]);
        setVideoPreviewUrls([]);
        setManual(null);
        setError(null);
        setIsLoading(false);
        localStorage.removeItem('am_current_manual');
        localStorage.removeItem('am_manual_data');
        localStorage.removeItem('am_editor_color_v2');
        localStorage.removeItem('am_editor_stroke_v2');
        localStorage.removeItem('am_editor_fontSize_v2');
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('am_canvas_state_')) localStorage.removeItem(key);
        });
    }, [videoPreviewUrls]);

    // 1本の動画を解析してステップ配列を返す
    const analyzeOneVideo = async (file: File): Promise<any[]> => {
        const formData = new FormData();
        formData.append('video', file);
        const response = await fetch('/api/analyze-video', { method: 'POST', body: formData });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `「${file.name}」の解析に失敗しました。`);
        }
        const data = await response.json();
        return data.steps;
    };

    const handleGenerate = async () => {
        if (videoFiles.length === 0) return;
        setIsLoading(true);
        setError(null);

        try {
            // Stage 1: 全動画を順番に解析してステップを収集
            let allSteps: any[] = [];
            for (let vi = 0; vi < videoFiles.length; vi++) {
                setLoadingStage(`Stage 1: 動画 ${vi + 1}/${videoFiles.length} をAIが解析中...`);
                const steps = await analyzeOneVideo(videoFiles[vi]);
                allSteps = [...allSteps, ...steps.map((s: any) => ({ ...s, _videoIndex: vi }))];
            }
            console.log(`✅ AI Analysis complete: ${allSteps.length} steps total`);

            // Stage 2: 全ステップのフレームを抽出
            const finalSteps: ManualStep[] = [];
            for (let i = 0; i < allSteps.length; i++) {
                const step = allSteps[i];
                if (!step.timestamp) continue;

                setLoadingStage(`Stage 2: 重要な瞬間を高画質で切り出し中 (${i + 1}/${allSteps.length})`);
                try {
                    const sourceFile = videoFiles[step._videoIndex];
                    const frameData = await extractFrameAtTimestamp(sourceFile, step.timestamp);

                    let displayFrame = frameData;
                    if (step.box_2d && step.box_2d.length === 4) {
                        try { displayFrame = await smartCropFrame(frameData, step.box_2d); }
                        catch { displayFrame = frameData; }
                    }

                    finalSteps.push({
                        stepNumber: finalSteps.length + 1,
                        action: step.action,
                        detail: step.reason || step.action,
                        timestamp: step.timestamp,
                        box_2d: step.box_2d,
                        label: step.label,
                        screenshot: displayFrame,
                        originalUrl: frameData,
                    });
                } catch (err) {
                    console.error(`Step ${i + 1} frame extraction failed:`, err);
                }
            }
            console.log('✅ Stage 2 complete');

            const baseName = videoFiles[0].name.replace(/\.[^/.]+$/, '');
            const title = videoFiles.length === 1
                ? `${baseName} マニュアル`
                : `${baseName} 他 マニュアル`;

            setManual({ title, overview: '', steps: finalSteps, notes: [] });

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
                                onClick={() => { localStorage.removeItem('am_current_manual'); handleReset(); }}
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

                {/* Upload Section */}
                {(!manual || videoFiles.length > 0) && (
                    <VideoUploader
                        onVideosSelect={handleVideosSelect}
                        videoFiles={videoFiles}
                        videoPreviewUrls={videoPreviewUrls}
                        onRemoveVideo={handleRemoveVideo}
                    />
                )}

                {/* Generate Button */}
                {videoFiles.length > 0 && !isLoading && !manual && (
                    <div className="generate-section">
                        <button className="btn btn--primary" onClick={handleGenerate}>
                            {videoFiles.length === 1
                                ? 'マニュアルを生成'
                                : `${videoFiles.length}本の動画からマニュアルを生成`}
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
                        videoFile={videoFiles[0] || undefined}
                        onUpdateManual={setManual}
                    />
                )}
            </div>
        </main>
    );
}
