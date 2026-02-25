'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ManualData } from '@/app/page';
import CopyButton from './CopyButton';
import ExportButton from './ExportButton';
import EditorToolbar from './EditorToolbar';
import InlineCanvas from './InlineCanvas';
import ManualStepItem from './ManualStepItem';
import { ToolType, EditorState, StrokeStyle } from './EditorTypes';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface ManualViewerProps {
    manual: ManualData;
    videoFile?: File;
    onUpdateManual?: (manual: ManualData) => void;
}

export default function ManualViewer({ manual, videoFile, onUpdateManual }: ManualViewerProps) {
    // Editor State (Lazy initialized from localStorage — rerender-lazy-init)
    const [isEditMode, setIsEditMode] = useState(false);
    const [isReorderMode, setIsReorderMode] = useState(false);
    const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null);
    const [activeTool, setActiveTool] = useState<ToolType>('select');
    const [currentColor, setCurrentColor] = useState(() => {
        if (typeof window === 'undefined') return '#ef4444';
        return localStorage.getItem('am_editor_color_v2') || '#ef4444';
    });
    const [strokeWidth, setStrokeWidth] = useState(() => {
        if (typeof window === 'undefined') return 1;
        const saved = localStorage.getItem('am_editor_stroke_v2');
        return saved ? parseInt(saved) : 1;
    });
    const [fontSize, setFontSize] = useState(() => {
        if (typeof window === 'undefined') return 24;
        const saved = localStorage.getItem('am_editor_fontSize_v2');
        return saved ? parseInt(saved) : 24;
    });
    const [stampCount, setStampCount] = useState(1);
    const [isTwoColumn, setIsTwoColumn] = useState(false);
    const savedTwoColumnRef = useRef(false); // Remember column state before editing
    const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>(() => {
        if (typeof window === 'undefined') return 'solid';
        const saved = localStorage.getItem('am_editor_strokeStyle_v2');
        return (saved === 'solid' || saved === 'dashed') ? saved : 'solid';
    });


    // Backup for cancellation & Original reference for InlineCanvas
    const [backupManual, setBackupManual] = useState<ManualData | null>(null);
    const originalScreenshots = useRef<{ [key: string]: string }>({});

    // Persist to localStorage
    useEffect(() => {
        if (isEditMode) {
            localStorage.setItem('am_editor_color_v2', currentColor);
            localStorage.setItem('am_editor_stroke_v2', strokeWidth.toString());
            localStorage.setItem('am_editor_strokeStyle_v2', strokeStyle);
            localStorage.setItem('am_editor_fontSize_v2', fontSize.toString());
        }
    }, [currentColor, strokeWidth, strokeStyle, fontSize, isEditMode]);

    // Determine orientation for all steps
    const [orientations, setOrientations] = useState<Record<string, boolean>>({});
    useEffect(() => {
        manual.steps.forEach((step, index) => {
            const src = (step.originalUrl && !step.originalUrl.startsWith('blob:')) ? step.originalUrl : (step.screenshot || '');
            if (!src) return;
            const img = new Image();
            img.onload = () => {
                // Determine if portrait (or square) based on dimensions
                // User requirement: Square images should be treated as portrait (576px)
                // Landscape: width > height
                // Portrait/Square: width <= height
                const isP = img.naturalHeight >= img.naturalWidth;
                setOrientations(prev => {
                    const key = step.uid || index;
                    if (prev[key] === isP) return prev;
                    return { ...prev, [key]: isP };
                });
            };
            img.src = src;
        });
    }, [manual.steps]);

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
        // Auto-switch to single-column for editing
        savedTwoColumnRef.current = isTwoColumn;
        setIsTwoColumn(false);
    };

    const handleCancelEdit = () => {
        if (backupManual && onUpdateManual) {
            onUpdateManual(backupManual);
        }
        setIsEditMode(false);
        setIsReorderMode(false);
        setSelectedSwapIndex(null);
        setBackupManual(null);
        setIsTwoColumn(savedTwoColumnRef.current); // Restore column state
    };

    const handleSaveAndExit = () => {
        setIsEditMode(false);
        setIsReorderMode(false);
        setSelectedSwapIndex(null);
        setBackupManual(null);
        setIsTwoColumn(savedTwoColumnRef.current); // Restore column state
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

    const handleCanvasUpdate = useCallback((index: number, newImageUrl: string, newData?: any) => {
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
    }, [manual, onUpdateManual]);

    const handleDeleteStep = useCallback((index: number) => {
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
    }, [manual, onUpdateManual]);

    const handleDragEnd = useCallback((result: DropResult) => {
        if (!result.destination || !onUpdateManual) return;
        if (result.source.index === result.destination.index) return;

        // Force all canvases to save before reordering
        window.dispatchEvent(new CustomEvent('am:force-save'));

        const reordered = Array.from(manual.steps);
        const [removed] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, removed);

        // Renumber steps
        const renumbered = reordered.map((step, i) => ({ ...step, stepNumber: i + 1 }));
        onUpdateManual({ ...manual, steps: renumbered });
    }, [manual, onUpdateManual]);

    const handleSwapClick = useCallback((clickedIndex: number) => {
        if (!onUpdateManual) return;
        if (selectedSwapIndex === null) {
            // First click: select this card
            setSelectedSwapIndex(clickedIndex);
        } else if (selectedSwapIndex === clickedIndex) {
            // Clicked same card: deselect
            setSelectedSwapIndex(null);
        } else {
            // Second click on different card: swap
            const newSteps = [...manual.steps];
            const temp = newSteps[selectedSwapIndex];
            newSteps[selectedSwapIndex] = newSteps[clickedIndex];
            newSteps[clickedIndex] = temp;
            // Renumber
            const renumbered = newSteps.map((step, i) => ({ ...step, stepNumber: i + 1 }));
            onUpdateManual({ ...manual, steps: renumbered });
            setSelectedSwapIndex(null);
        }
    }, [manual, onUpdateManual, selectedSwapIndex]);

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
                                        <span className={`${isReorderMode ? 'bg-amber-500' : 'bg-purple-600'} text-white px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest shadow-sm`}>{isReorderMode ? 'REORDER' : 'EDITING'}</span>
                                        <span className="text-purple-600/60 text-[10px] font-bold uppercase tracking-widest">{isReorderMode ? 'クリックで手順を並び替え' : 'タイトルと概要を編集できます'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setIsReorderMode(!isReorderMode)}
                                            className={`h-10 px-4 rounded-lg font-bold text-xs uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap flex items-center gap-2 ${isReorderMode ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'}`}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" /><circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" /><circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" /></svg>
                                            {isReorderMode ? '編集に戻る' : '並び替え'}
                                        </button>
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

                    {/* Right side actions */}
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

            {/* Steps Section */}
            {isEditMode && isReorderMode ? (
                /* Reorder Mode: Click-to-swap thumbnail cards */
                <div className="mx-auto px-4 py-8 pb-32 max-w-5xl">
                    {/* Instruction */}
                    <div className="mb-6 text-center">
                        <p className={`text-sm font-bold transition-colors ${selectedSwapIndex !== null ? 'text-purple-600' : 'text-slate-400'}`}>
                            {selectedSwapIndex !== null
                                ? `ステップ ${manual.steps[selectedSwapIndex]?.stepNumber} を選択中 — 入れ替え先をクリック（もう一度クリックで解除）`
                                : '入れ替えたいステップをクリックしてください'
                            }
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {manual.steps.map((step, index) => {
                            const isSelected = selectedSwapIndex === index;
                            const isTarget = selectedSwapIndex !== null && selectedSwapIndex !== index;
                            return (
                                <div
                                    key={step.uid || `step-${index}`}
                                    onClick={() => handleSwapClick(index)}
                                    className={`group cursor-pointer rounded-xl border-2 bg-white overflow-hidden transition-all select-none ${isSelected
                                        ? 'border-purple-500 ring-4 ring-purple-200 shadow-xl shadow-purple-500/20 scale-[1.03]'
                                        : isTarget
                                            ? 'border-amber-300 hover:border-amber-400 hover:shadow-lg hover:scale-[1.02]'
                                            : 'border-slate-200 hover:border-purple-300 hover:shadow-lg hover:scale-[1.02]'
                                        }`}
                                >
                                    {/* Thumbnail */}
                                    <div className="aspect-video bg-slate-100 overflow-hidden relative">
                                        {step.screenshot ? (
                                            <img
                                                src={step.screenshot}
                                                alt={step.action}
                                                className="w-full h-full object-contain"
                                                draggable={false}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            </div>
                                        )}
                                        {/* Step number badge */}
                                        <div className={`absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shadow-lg transition-colors ${isSelected ? 'bg-purple-600 text-white' : 'bg-slate-950 text-white'
                                            }`}>
                                            {step.stepNumber}
                                        </div>
                                        {/* Selected overlay */}
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-purple-600/10 flex items-center justify-center">
                                                <div className="bg-white/95 rounded-full px-3 py-1.5 shadow-lg text-purple-700 text-xs font-black">
                                                    選択中
                                                </div>
                                            </div>
                                        )}
                                        {/* Target hint overlay */}
                                        {isTarget && (
                                            <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/10 transition-colors flex items-center justify-center">
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 rounded-full px-3 py-1.5 shadow-lg text-amber-600 text-xs font-black">
                                                    ここに入替
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Title + Delete */}
                                    <div className="p-3 flex items-start justify-between gap-2">
                                        <p className="text-sm font-bold text-slate-800 line-clamp-2 leading-snug flex-1">{step.action}</p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteStep(index);
                                            }}
                                            className="flex-shrink-0 w-7 h-7 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-200 hover:border-transparent transition-all active:scale-90 flex items-center justify-center"
                                            title={`ステップ ${step.stepNumber} を削除`}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : isEditMode ? (
                /* Normal Edit Mode: Full InlineCanvas */
                <div className="mx-auto px-4 pb-32 steps max-w-4xl space-y-20 py-16">
                    {manual.steps.map((step, index) => (
                        <section key={step.uid || `step-${index}`} className="manual__step animate-slide-up">
                            <div className="flex items-start gap-6 group mb-6">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="manual__step-number flex-shrink-0 w-10 h-10 bg-slate-950 text-white rounded-xl flex items-center justify-center text-lg font-black shadow-2xl shadow-slate-900/30 group-hover:scale-110 transition-transform">
                                        {step.stepNumber}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteStep(index)}
                                        className="px-3 py-1 bg-rose-50 text-rose-600 rounded-md text-xs font-bold border border-rose-200 hover:bg-rose-600 hover:text-white hover:border-transparent transition-all active:scale-95 flex items-center justify-center w-full whitespace-nowrap"
                                        title={`ステップ ${step.stepNumber} を削除`}
                                    >
                                        削除
                                    </button>
                                </div>
                                <div className="flex flex-col gap-3 py-1 w-full">
                                    <input
                                        type="text"
                                        value={step.action}
                                        onChange={(e) => {
                                            if (!onUpdateManual) return;
                                            const newSteps = [...manual.steps];
                                            newSteps[index] = { ...step, action: e.target.value };
                                            onUpdateManual({ ...manual, steps: newSteps });
                                        }}
                                        className="manual__step-title font-black text-slate-950 leading-tight tracking-tight bg-transparent border-b-2 border-purple-200 focus:border-purple-600 focus:outline-none transition-colors w-full placeholder-slate-300 text-3xl"
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
                                        className="manual__step-desc text-slate-800 font-bold leading-relaxed w-full bg-transparent border border-purple-200 rounded-lg p-3 focus:border-purple-600 focus:outline-none transition-colors resize-y placeholder-slate-300 text-lg min-h-[100px]"
                                        placeholder="手順の詳細説明"
                                    />
                                </div>
                            </div>

                            <div className={`manual__image-container rounded-[16px] overflow-hidden transition-all duration-500 border-2 bg-white shadow-floating border-purple-600/10 mx-auto ${orientations[step.uid || index] ? 'max-w-[576px]' : 'max-w-[768px]'}`}>
                                <InlineCanvas
                                    canvasId={`step-${step.uid || index}`}
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
                                    isPortrait={orientations[step.uid || index]}
                                />
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                /* View Mode: No drag & drop - Uses React.memo'd ManualStepItem for perf */
                <div className={`mx-auto px-4 py-12 pb-32 ${isTwoColumn
                    ? 'w-full max-w-[1400px] grid grid-cols-2 gap-8'
                    : 'steps max-w-4xl space-y-20'
                    }`}>
                    {manual.steps.map((step, index) => (
                        <ManualStepItem
                            key={step.uid || index}
                            step={step}
                            isPortrait={orientations[step.uid || index] ?? false}
                            isTwoColumn={isTwoColumn}
                        />
                    ))}
                </div>
            )}

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
