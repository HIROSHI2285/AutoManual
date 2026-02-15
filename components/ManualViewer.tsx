'use client';

import { useState, useRef, useEffect } from 'react';
import { ManualData } from '@/app/page';
import CopyButton from './CopyButton';
import ExportButton from './ExportButton';
import EditorToolbar from './EditorToolbar';
import InlineCanvas from './InlineCanvas';
import { ToolType, EditorState, StrokeStyle } from './EditorTypes';

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
    const [isTwoColumn, setIsTwoColumn] = useState(false); // New state for layout mode
    const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid');

    // Backup for cancellation & Original reference for InlineCanvas
    const [backupManual, setBackupManual] = useState<ManualData | null>(null);
    const originalScreenshots = useRef<{ [key: string]: string }>({});

    // Initialize from localStorage
    useEffect(() => {
        const savedColor = localStorage.getItem('am_editor_color_v2');
        const savedStroke = localStorage.getItem('am_editor_stroke_v2');
        const savedStrokeStyle = localStorage.getItem('am_editor_strokeStyle_v2');
        const savedFontSize = localStorage.getItem('am_editor_fontSize_v2');

        if (savedColor) setCurrentColor(savedColor);
        if (savedStroke) setStrokeWidth(parseInt(savedStroke));
        if (savedStrokeStyle && (savedStrokeStyle === 'solid' || savedStrokeStyle === 'dashed')) {
            setStrokeStyle(savedStrokeStyle as StrokeStyle);
        }
        if (savedFontSize) setFontSize(parseInt(savedFontSize));
    }, []);

    // Persist to localStorage
    useEffect(() => {
        if (isEditMode) {
            localStorage.setItem('am_editor_color_v2', currentColor);
            localStorage.setItem('am_editor_stroke_v2', strokeWidth.toString());
            localStorage.setItem('am_editor_strokeStyle_v2', strokeStyle);
            localStorage.setItem('am_editor_fontSize_v2', fontSize.toString());
        }
    }, [currentColor, strokeWidth, strokeStyle, fontSize, isEditMode]);

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
                    strokeStyle={strokeStyle}
                    onStrokeStyleChange={setStrokeStyle}
                    fontSize={fontSize}
                    onFontSizeChange={setFontSize}
                    stampCount={stampCount}
                />
            )}

            <div className={`manual__header sticky top-0 z-[90] py-6 -mx-8 px-8 border-b transition-all duration-500 border-transparent font-noto ${isEditMode
                ? 'bg-white/90 backdrop-blur-2xl border-purple-100/50 shadow-lg shadow-purple-500/5'
                : 'bg-white'
                }`}>
                <div className={`mx-auto flex items-center justify-between ${isEditMode ? 'max-w-none px-4' : 'max-w-7xl'}`}>
                    <div className={`flex flex-col gap-2 pr-8 ${isEditMode ? 'flex-1' : 'w-full max-w-4xl'}`}>
                        {!isEditMode ? (
                            <>
                                <h2 className="manual__title text-5xl font-black text-slate-950 tracking-tighter leading-tight drop-shadow-sm">{manual.title}</h2>
                                <p className="manual__overview text-slate-800 font-bold text-lg max-w-3xl leading-relaxed">{manual.overview}</p>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-3 mb-4 border-b border-purple-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <span className="bg-purple-600 text-white px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest shadow-sm">EDITING</span>
                                        <span className="text-purple-600/60 text-[10px] font-bold uppercase tracking-widest">タイトルと概要を編集できます</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleCancelEdit}
                                            className="h-10 px-4 rounded-lg text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95 whitespace-nowrap"
                                        >
                                            キャンセル
                                        </button>
                                        <button
                                            id="save-progress-btn"
                                            onClick={handleSaveProgress}
                                            className="h-10 px-6 rounded-lg bg-purple-600 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all active:scale-95 whitespace-nowrap"
                                        >
                                            変更を保存
                                        </button>
                                        <button
                                            onClick={handleSaveAndExit}
                                            className="h-10 px-6 rounded-lg bg-slate-950 text-white font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-black transition-all transform hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
                                        >
                                            保存して終了
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={manual.title}
                                    onChange={(e) => onUpdateManual && onUpdateManual({ ...manual, title: e.target.value })}
                                    className="manual__title text-5xl font-black text-slate-950 tracking-tighter leading-tight bg-transparent border-b-2 border-purple-200 focus:border-purple-600 focus:outline-none transition-colors w-full placeholder-slate-300"
                                    placeholder="マニュアルのタイトル"
                                />
                                <textarea
                                    value={manual.overview}
                                    onChange={(e) => onUpdateManual && onUpdateManual({ ...manual, overview: e.target.value })}
                                    className="manual__overview text-slate-800 font-bold text-lg w-full leading-relaxed bg-transparent border border-purple-200 rounded-lg p-3 focus:border-purple-600 focus:outline-none transition-colors min-h-[80px] resize-y placeholder-slate-300 mt-2"
                                    placeholder="マニュアルの概要"
                                />
                            </>
                        )}
                    </div>

                    {/* Right side actions - HIDDEN in Edit Mode */}
                    {!isEditMode && (
                        <div className="manual__actions flex items-center gap-3 shrink-0 ml-4">
                            {/* View Toggle */}
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <button
                                    onClick={() => setIsTwoColumn(false)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${!isTwoColumn ? 'bg-slate-950 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
                                >
                                    1列
                                </button>
                                <button
                                    onClick={() => setIsTwoColumn(true)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${isTwoColumn ? 'bg-slate-950 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
                                >
                                    2列
                                </button>
                            </div>
                            <div className="h-8 w-px bg-slate-200 mx-2" />

                            {onUpdateManual && (
                                <button
                                    onClick={enterEditMode}
                                    className="h-12 px-8 bg-slate-950 text-white rounded-lg font-black text-sm shadow-2xl hover:bg-slate-800 transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 border border-white/10"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    <span>編集</span>
                                </button>
                            )}
                            <div className="h-8 w-px bg-slate-200 mx-2" />
                            <CopyButton manual={manual} isTwoColumn={isTwoColumn} />
                            <ExportButton manual={manual} />
                        </div>
                    )}
                </div>
            </div>

            {/* Steps Section - ELITE RECONSTRUCTION */}
            <div className={`mx-auto px-4 ${isEditMode ? 'py-16' : 'py-12'} pb-32 ${isTwoColumn && !isEditMode
                ? 'w-full max-w-[1400px] grid grid-cols-2 gap-8'
                : 'steps max-w-4xl space-y-20'
                }`}>
                {
                    manual.steps.map((step, index) => (
                        <section key={index} className={`manual__step animate-slide-up ${isTwoColumn && !isEditMode ? 'bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full' : ''}`}>
                            <div className={`flex items-start gap-6 group ${isEditMode ? 'opacity-50 hover:opacity-100 transition-opacity mb-6' : (isTwoColumn ? 'flex-grow mb-4' : 'mb-6')}`}>
                                <div className="flex flex-col items-center gap-3">
                                    <div className="manual__step-number flex-shrink-0 w-10 h-10 bg-slate-950 text-white rounded-xl flex items-center justify-center text-lg font-black shadow-2xl shadow-slate-900/30 group-hover:scale-110 transition-transform">
                                        {step.stepNumber}
                                    </div>
                                    {isEditMode && (
                                        <button
                                            onClick={() => handleDeleteStep(index)}
                                            className="px-3 py-1 bg-rose-50 text-rose-600 rounded-md text-xs font-bold border border-rose-200 hover:bg-rose-600 hover:text-white hover:border-transparent transition-all active:scale-95 flex items-center justify-center w-full whitespace-nowrap"
                                            title={`ステップ ${step.stepNumber} を削除`}
                                        >
                                            削除
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-col gap-3 py-1 w-full">
                                    {isEditMode ? (
                                        <>
                                            <input
                                                type="text"
                                                value={step.action}
                                                onChange={(e) => {
                                                    if (!onUpdateManual) return;
                                                    const newSteps = [...manual.steps];
                                                    newSteps[index] = { ...step, action: e.target.value };
                                                    onUpdateManual({ ...manual, steps: newSteps });
                                                }}
                                                className="manual__step-title text-3xl font-black text-slate-950 leading-tight tracking-tight bg-transparent border-b-2 border-purple-200 focus:border-purple-600 focus:outline-none transition-colors w-full placeholder-slate-300"
                                                placeholder="手順のタイトル"
                                            />
                                            <textarea
                                                value={step.detail}
                                                onChange={(e) => {
                                                    if (!onUpdateManual) return;
                                                    const newSteps = [...manual.steps];
                                                    newSteps[index] = { ...step, detail: e.target.value };
                                                    onUpdateManual({ ...manual, steps: newSteps });
                                                }}
                                                className="manual__step-desc text-slate-800 font-bold text-lg leading-relaxed w-full bg-transparent border border-purple-200 rounded-lg p-3 focus:border-purple-600 focus:outline-none transition-colors min-h-[100px] resize-y placeholder-slate-300"
                                                placeholder="手順の詳細説明"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <h3 className="manual__step-title text-2xl font-black text-slate-950 leading-tight tracking-tight drop-shadow-sm">
                                                {step.action}
                                            </h3>
                                            <p className="manual__step-desc text-slate-800 font-bold text-base leading-relaxed">
                                                {step.detail}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className={`manual__image-container rounded-[16px] overflow-hidden transition-all duration-500 border-2 ${isEditMode
                                ? 'bg-white shadow-floating border-purple-600/10'
                                : 'bg-slate-50 shadow-lg border-slate-900/5 hover:border-slate-900/10 hover:shadow-xl transform hover:-translate-y-1'
                                } ${isTwoColumn && !isEditMode ? 'aspect-[4/3] flex items-center justify-center bg-slate-100' : ''}`}>
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
                                        strokeStyle={strokeStyle}
                                        onStrokeStyleChange={setStrokeStyle}
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
                                        className={`block transition-transform duration-700 group-hover:scale-[1.01] ${isTwoColumn ? 'w-full h-full object-contain' : 'w-full h-auto'}`}
                                        loading="lazy"
                                    />
                                )}
                            </div>
                        </section>
                    ))
                }
            </div >

            {/* Notes Section */}
            {
                !isEditMode && manual.notes && manual.notes.length > 0 && (
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
                )
            }
        </div >
    );
}
