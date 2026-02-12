'use client';

import { useState, useRef, useEffect } from 'react';
import { ManualData } from '@/app/page';
import CopyButton from './CopyButton';
import ExportButton from './ExportButton';
import EditorToolbar from './EditorToolbar';
import InlineCanvas from './InlineCanvas';
import { ToolType, EditorState } from './EditorTypes';

interface ManualViewerProps {
    manual: ManualData;
    videoFile?: File;
    onUpdateManual?: (manual: ManualData) => void;
}

export default function ManualViewer({ manual, videoFile, onUpdateManual }: ManualViewerProps) {
    // Editor State (Initialized from localStorage if available)
    const [isEditMode, setIsEditMode] = useState(false);
    const [activeTool, setActiveTool] = useState<ToolType>('select');
    const [currentColor, setCurrentColor] = useState('#ef4444'); // Default Red
    const [strokeWidth, setStrokeWidth] = useState(1); // Default thin line
    const [fontSize, setFontSize] = useState(24); // Default font size (must be in FONT_SIZE_STEPS)
    const [stampCount, setStampCount] = useState(1);

    // Backup for cancellation & Original reference for InlineCanvas
    const [backupManual, setBackupManual] = useState<ManualData | null>(null);
    const originalScreenshots = useRef<{ [key: string]: string }>({});

    // Initialize from localStorage
    useEffect(() => {
        const savedColor = localStorage.getItem('am_editor_color_v2');
        const savedStroke = localStorage.getItem('am_editor_stroke_v2');
        const savedFontSize = localStorage.getItem('am_editor_fontSize_v2');

        if (savedColor) setCurrentColor(savedColor);
        if (savedStroke) setStrokeWidth(parseInt(savedStroke));
        if (savedFontSize) setFontSize(parseInt(savedFontSize));
    }, []);

    // Persist to localStorage
    useEffect(() => {
        if (isEditMode) {
            localStorage.setItem('am_editor_color_v2', currentColor);
            localStorage.setItem('am_editor_stroke_v2', strokeWidth.toString());
            localStorage.setItem('am_editor_fontSize_v2', fontSize.toString());
        }
    }, [currentColor, strokeWidth, fontSize, isEditMode]);

    const enterEditMode = () => {
        // Generate stable UIDs for any step that doesn't have one
        const stepsWithUids = manual.steps.map(step => ({
            ...step,
            uid: step.uid || Math.random().toString(36).substr(2, 9)
        }));
        const needsUpdate = stepsWithUids.some((s, i) => s.uid !== manual.steps[i].uid);
        if (needsUpdate && onUpdateManual) {
            onUpdateManual({ ...manual, steps: stepsWithUids });
        }

        setBackupManual(JSON.parse(JSON.stringify(manual))); // Deep clone

        // MIGRATION: Ensure all steps have an originalUrl for clean editing
        // This prevents the "Ghosting" issue where text gets burnt into the image
        let migrationNeeded = false;
        const migratedSteps = manual.steps.map(step => {
            if (!step.originalUrl && step.screenshot) {
                migrationNeeded = true;
                return { ...step, originalUrl: step.screenshot };
            }
            return step;
        });

        if (migrationNeeded && onUpdateManual) {
            console.log('[ManualViewer] Migrating steps to include originalUrl');
            onUpdateManual({ ...manual, steps: migratedSteps });
            // Update local backup too to match
            setBackupManual(JSON.parse(JSON.stringify({ ...manual, steps: migratedSteps })));
        }

        setIsEditMode(true);
        setStampCount(1); // Reset stamp count on entry
    };

    const handleCancelEdit = () => {
        if (backupManual && onUpdateManual) {
            onUpdateManual(backupManual);
        }
        setIsEditMode(false);
        setBackupManual(null);
    };

    const handleSaveAndExit = () => {
        setIsEditMode(false);
        setBackupManual(null);
    };

    const handleSaveProgress = () => {
        // Since handleCanvasUpdate already triggers onUpdateManual, 
        // this is mostly for peace of mind and showing feedback.
        const target = document.getElementById('save-progress-btn');
        if (target) {
            const original = target.innerHTML;
            target.innerHTML = 'Saved!';
            target.classList.add('bg-emerald-500');
            target.classList.remove('bg-indigo-600');
            setTimeout(() => {
                target.innerHTML = original;
                target.classList.remove('bg-emerald-500');
                target.classList.add('bg-indigo-600');
            }, 1000);
        }
    };

    const handleCanvasUpdate = (index: number, newImageUrl: string, newData?: any) => {
        if (!onUpdateManual) return;

        const updatedSteps = manual.steps.map((step, i) => {
            if (i === index) {
                return {
                    ...step,
                    screenshot: newImageUrl,
                    canvasData: newData || step.canvasData
                };
            }
            return step;
        });

        onUpdateManual({
            ...manual,
            steps: updatedSteps
        });
    };

    const handleDeleteStep = (index: number) => {
        if (!onUpdateManual) return;
        if (manual.steps.length <= 1) {
            alert('最後のステップは削除できません。');
            return;
        }

        const stepLabel = `ステップ ${manual.steps[index].stepNumber}: ${manual.steps[index].action}`;
        if (!confirm(`「${stepLabel}」を削除しますか？\nこの操作は取り消せません。`)) {
            return;
        }

        // Force all canvases to save their current state BEFORE we trigger a re-render
        window.dispatchEvent(new CustomEvent('am:force-save'));

        // Clean up localStorage canvas state for deleted step
        const deletedStep = manual.steps[index];
        if (deletedStep.uid) {
            localStorage.removeItem(`am_canvas_state_step-${deletedStep.uid}`);
        }
        // Also try old-style key
        localStorage.removeItem(`am_canvas_state_step-${deletedStep.stepNumber}-${index}`);

        // Remove the step and renumber
        const newSteps = manual.steps
            .filter((_, i) => i !== index)
            .map((step, i) => ({
                ...step,
                stepNumber: i + 1
            }));

        // Reset stamp count
        setStampCount(1);

        onUpdateManual({
            ...manual,
            steps: newSteps
        });
    };

    return (
        <div className={`manual min-h-screen transition-all duration-700 ease-in-out ${isEditMode ? 'bg-[#f8fafc] pl-[80px] max-w-none' : 'bg-white'}`}>

            {/* Editor Toolbar (Only in Edit Mode) */}
            {isEditMode && (
                <EditorToolbar
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    currentColor={currentColor}
                    onColorChange={setCurrentColor}
                    strokeWidth={strokeWidth}
                    onStrokeWidthChange={setStrokeWidth}
                    fontSize={fontSize}
                    onFontSizeChange={setFontSize}
                    stampCount={stampCount}
                />
            )}

            <div className={`manual__header sticky top-0 z-[90] py-6 -mx-8 px-8 border-b transition-all duration-500 border-transparent font-noto ${isEditMode
                ? 'bg-white/90 backdrop-blur-2xl border-purple-100/50 shadow-lg shadow-purple-500/5'
                : 'bg-white'
                }`}>
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    {!isEditMode ? (
                        <div className="flex flex-col gap-2 pr-8">
                            <h2 className="manual__title text-5xl font-black text-slate-950 tracking-tighter leading-tight drop-shadow-sm">{manual.title}</h2>
                            <p className="manual__overview text-slate-800 font-bold text-lg max-w-3xl leading-relaxed">{manual.overview}</p>
                        </div>
                    ) : (
                        <div className="flex items-center gap-6 animate-fade-in">
                            <div className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs uppercase font-black tracking-widest shadow-xl shadow-purple-900/10 border border-white/20">
                                マニュアル編集
                            </div>
                            <div className="flex flex-col">
                                <p className="text-slate-950 text-base font-black uppercase tracking-tight">スクリーンショット編集中</p>
                                <p className="text-purple-600/60 text-[10px] font-bold uppercase tracking-widest px-1">全ページの変更を保持します</p>
                            </div>
                        </div>
                    )}

                    <div className="manual__actions flex items-center gap-3">
                        {!isEditMode ? (
                            <>
                                {onUpdateManual && (
                                    <button
                                        onClick={enterEditMode}
                                        className="h-12 px-8 bg-slate-950 text-white rounded-lg font-black text-sm shadow-2xl hover:bg-slate-800 transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 border border-white/10"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        <span>マニュアルを編集</span>
                                    </button>
                                )}
                                <div className="h-8 w-px bg-slate-200 mx-2" />
                                <CopyButton manual={manual} />
                                <ExportButton manual={manual} />
                            </>
                        ) : (
                            <div className="flex items-center gap-3 animate-fade-in">
                                <button
                                    onClick={handleCancelEdit}
                                    className="h-12 px-6 rounded-lg text-slate-950 font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
                                >
                                    キャンセル
                                </button>
                                <button
                                    id="save-progress-btn"
                                    onClick={handleSaveProgress}
                                    className="h-12 px-8 rounded-xl bg-purple-600 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-purple-200 hover:bg-purple-700 transition-all active:scale-95 border border-white/10"
                                >
                                    変更を保存
                                </button>
                                <button
                                    onClick={handleSaveAndExit}
                                    className="h-12 px-10 rounded-xl bg-slate-950 text-white font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-black transition-all transform hover:-translate-y-0.5 active:scale-95 border border-white/20"
                                >
                                    保存して終了
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Steps Section - ELITE RECONSTRUCTION */}
            <div className={`steps max-w-4xl mx-auto px-4 ${isEditMode ? 'py-16' : 'py-12'} space-y-20 pb-32`}>
                {manual.steps.map((step, index) => (
                    <section key={index} className="manual__step animate-slide-up">
                        <div className={`flex items-start gap-8 mb-10 group ${isEditMode ? 'opacity-50 hover:opacity-100 transition-opacity' : ''}`}>
                            <div className="flex flex-col items-center gap-2">
                                <div className="manual__step-number flex-shrink-0 w-10 h-10 bg-slate-950 text-white rounded-xl flex items-center justify-center text-lg font-black shadow-2xl shadow-slate-900/30 group-hover:scale-110 transition-transform">
                                    {step.stepNumber}
                                </div>
                                {isEditMode && (
                                    <button
                                        onClick={() => handleDeleteStep(index)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-90 border border-transparent hover:border-rose-200"
                                        title={`ステップ ${step.stepNumber} を削除`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col gap-3 py-1">
                                <h3 className="manual__step-title text-3xl font-black text-slate-950 leading-tight tracking-tight drop-shadow-sm">
                                    {step.action}
                                </h3>
                                <p className="manual__step-desc text-slate-800 font-bold text-lg leading-relaxed max-w-2xl">
                                    {step.detail}
                                </p>
                            </div>
                        </div>

                        <div className={`manual__image-container rounded-[24px] overflow-hidden transition-all duration-500 border-2 ${isEditMode
                            ? 'bg-white shadow-floating border-purple-600/10'
                            : 'bg-slate-50 shadow-2xl border-slate-900/5 hover:border-slate-900/10 hover:shadow-floating transform hover:-translate-y-1'
                            }`}>
                            {isEditMode ? (
                                <InlineCanvas
                                    canvasId={`step-${step.uid || index}`} // Stable ID using uid
                                    // CRITICAL FIX: Avoid expired Blob URLs from localStorage. Prefer Base64 screenshot if originalUrl is blob.
                                    imageUrl={(step.originalUrl && !step.originalUrl.startsWith('blob:')) ? step.originalUrl : (step.screenshot || '')}
                                    activeTool={activeTool}
                                    currentColor={currentColor}
                                    onColorChange={setCurrentColor}
                                    strokeWidth={strokeWidth}
                                    onStrokeWidthChange={setStrokeWidth}
                                    fontSize={fontSize}
                                    onFontSizeChange={setFontSize}
                                    stampCount={stampCount}
                                    onUpdate={(newUrl, newData) => handleCanvasUpdate(index, newUrl, newData)}
                                    onStampUsed={() => setStampCount(prev => prev + 1)}
                                    onToolReset={() => setActiveTool('select')}
                                    initialData={step.canvasData}
                                />
                            ) : (
                                <img
                                    src={step.screenshot}
                                    alt={`Step ${step.stepNumber}: ${step.action}`}
                                    className="w-full h-auto object-contain block transition-transform duration-700 group-hover:scale-[1.01]"
                                    loading="lazy"
                                />
                            )}
                        </div>
                    </section>
                ))}
            </div>

            {/* Notes Section */}
            {!isEditMode && manual.notes && manual.notes.length > 0 && (
                <div className="max-w-4xl mx-auto px-4 pb-24">
                    <div className="bg-amber-50/50 border border-amber-100 p-8 rounded-[32px]">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h4 className="text-lg font-black text-amber-900 uppercase tracking-wider">Attention & Notes</h4>
                        </div>
                        <ul className="grid gap-3">
                            {manual.notes.map((note, index) => (
                                <li key={index} className="flex items-start gap-3 text-amber-800/80 font-medium">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                                    <span>{note}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
