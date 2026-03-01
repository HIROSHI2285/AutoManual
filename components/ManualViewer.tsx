'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ManualData, ManualStep } from '@/app/page';
import CopyButton from './CopyButton';
import ExportButton from './ExportButton';
import EditorToolbar from './EditorToolbar';
import ManualStepItem from './ManualStepItem';
import EditStepRow from './EditStepRow';
import { ToolType, EditorState, StrokeStyle } from './EditorTypes';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

// 再ナンバリング用ヘルパー関数を追加
const renumberStepsByVideo = (steps: ManualStep[]) => {
    let currentVid = -1;
    let currentNum = 0;
    return steps.map(s => {
        if (s.videoIndex !== currentVid) {
            currentVid = s.videoIndex || 0; // Use 0 if undefined for older data compatibility
            currentNum = 1;
        } else {
            currentNum++;
        }
        return { ...s, stepNumber: currentNum };
    });
};

interface ManualViewerProps {
    manual: ManualData;
    videoFile?: File;
    // Accept both direct value and functional updater (rerender-functional-setstate)
    onUpdateManual?: (updater: ManualData | ((prev: ManualData) => ManualData)) => void;
}

export default function ManualViewer({ manual, videoFile, onUpdateManual }: ManualViewerProps) {
    // Editor State (Lazy initialized from localStorage — rerender-lazy-init)
    const [isEditMode, setIsEditMode] = useState(false);
    const [isReorderMode, setIsReorderMode] = useState(false);
    const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null);
    const [checkedForDelete, setCheckedForDelete] = useState<Set<string>>(new Set()); // uid set
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
    const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>(() => {
        if (typeof window === 'undefined') return 'solid';
        const saved = localStorage.getItem('am_editor_strokeStyle_v2');
        return (saved === 'solid' || saved === 'dashed') ? saved : 'solid';
    });

    // Local draft for header text fields (blur-flush pattern — prevents per-keystroke re-renders)
    const [draftTitle, setDraftTitle] = useState(manual.title);
    const [draftOverview, setDraftOverview] = useState(manual.overview);
    // Sync drafts when manual changes externally (e.g. cancel edit)
    useEffect(() => { setDraftTitle(manual.title); }, [manual.title]);
    useEffect(() => { setDraftOverview(manual.overview); }, [manual.overview]);

    // 動画ごとにステップをグループ化
    const videoGroups = useMemo(() => {
        const groups: Record<number, ManualStep[]> = {};
        manual.steps.forEach(step => {
            const idx = step.videoIndex ?? 0;
            if (!groups[idx]) groups[idx] = [];
            groups[idx].push(step);
        });
        return groups;
    }, [manual.steps]);

    // 動画単位でレイアウトを更新する関数
    const updateLayoutForVideo = useCallback((vIdx: number, layout: 'single' | 'two-column') => {
        if (!onUpdateManual) return;
        onUpdateManual(prev => ({
            ...prev,
            steps: prev.steps.map(s => ((s.videoIndex ?? 0) === vIdx ? { ...s, layout } : s))
        }));
    }, [onUpdateManual]);

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
    };

    const handleCancelEdit = () => {
        const scrollY = window.scrollY;
        if (backupManual && onUpdateManual) {
            onUpdateManual(backupManual);
        }
        setIsEditMode(false);
        setIsReorderMode(false);
        setSelectedSwapIndex(null);
        setBackupManual(null);
        // Restore scroll position after layout re-render
        requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY, behavior: 'instant' });
        });
    };

    const handleSaveAndExit = () => {
        // 1. 現在の画面中央に最も近いステップのUIDを特定する
        const stepElements = document.querySelectorAll('[data-step-id]');
        let targetUid: string | null = null;
        const viewportCenter = window.innerHeight / 2;
        let closestDist = Infinity;

        stepElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
            if (dist < closestDist) {
                closestDist = dist;
                targetUid = el.getAttribute('data-step-id');
            }
        });

        // キャンバスの保存を強制
        window.dispatchEvent(new CustomEvent('am:force-save'));

        setTimeout(() => {
            setIsEditMode(false);
            setIsReorderMode(false);
            setSelectedSwapIndex(null);
            setBackupManual(null);

            // 2. レイアウト変更後にその要素までスクロール
            setTimeout(() => {
                if (targetUid) {
                    const targetEl = document.querySelector(`[data-step-id="${targetUid}"]`);
                    if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'auto', block: 'center' });
                    }
                }
            }, 100); // レイアウト確定のための微小なバッファ
        }, 300);
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

    // rerender-functional-setstate: functional updater removes 'manual' from dep array
    const handleCanvasUpdate = useCallback((index: number, newImageUrl: string, newData?: any) => {
        if (!onUpdateManual) return;
        onUpdateManual(prev => ({
            ...prev,
            steps: prev.steps.map((step, i) => {
                if (i !== index) return step;

                const update: any = { ...step, screenshot: newImageUrl, canvasData: newData || step.canvasData };

                // Only overwrite originalUrl if the canvas explicitly indicates a cropped/baked image (Adjust mode)
                // Otherwise, preserve the clean original background to prevent "ghosting" of annotations.
                if (newData?.isAdjustCrop) {
                    update.originalUrl = newImageUrl;
                }

                return update;
            })
        }));
    }, [onUpdateManual]);

    const handleDeleteStep = useCallback((index: number) => {
        if (!onUpdateManual) return;
        // Read current manual via functional update to avoid stale closure
        onUpdateManual(prev => {
            if (prev.steps.length <= 1) {
                alert('最後のステップは削除できません。');
                return prev;
            }

            const stepLabel = `ステップ ${prev.steps[index].stepNumber}: ${prev.steps[index].action}`;
            if (!confirm(`「${stepLabel}」を削除しますか？\nこの操作は取り消せません。`)) {
                return prev;
            }

            // Clean up localStorage canvas state for this step
            const deletedStep = prev.steps[index];
            if (deletedStep.uid) {
                localStorage.removeItem(`am_canvas_state_step-${deletedStep.uid}`);
            }
            localStorage.removeItem(`am_canvas_state_step-${deletedStep.stepNumber}-${index}`);

            const newSteps = prev.steps.filter((_, i) => i !== index);

            setStampCount(1);
            return { ...prev, steps: renumberStepsByVideo(newSteps) };
        });
    }, [onUpdateManual]);

    // rerender-functional-setstate: removed 'manual' from deps for stable callback
    const handleDragEnd = useCallback((result: DropResult) => {
        if (!result.destination || !onUpdateManual) return;
        if (result.source.index === result.destination.index) return;

        // Force all canvases to save before reordering
        window.dispatchEvent(new CustomEvent('am:force-save'));

        onUpdateManual(prev => {
            const reordered = Array.from(prev.steps);
            const [removed] = reordered.splice(result.source.index, 1);
            reordered.splice(result.destination!.index, 0, removed);
            return { ...prev, steps: renumberStepsByVideo(reordered) };
        });
    }, [onUpdateManual]);

    // rerender-functional-setstate: removed 'manual' and 'selectedSwapIndex' from deps
    const handleSwapClick = useCallback((clickedIndex: number) => {
        if (!onUpdateManual) return;
        setSelectedSwapIndex(prev => {
            if (prev === null) {
                // First click: select this card
                return clickedIndex;
            } else if (prev === clickedIndex) {
                // Clicked same card: deselect
                return null;
            } else {
                // Second click on different card: swap
                onUpdateManual(cur => {
                    const newSteps = [...cur.steps];
                    const temp = newSteps[prev];
                    newSteps[prev] = newSteps[clickedIndex];
                    newSteps[clickedIndex] = temp;
                    return { ...cur, steps: renumberStepsByVideo(newSteps) };
                });
                return null;
            }
        });
    }, [onUpdateManual]);

    // Flush step text edits to parent — called on blur from EditStepRow (not on every keystroke)
    const handleTextBlur = useCallback((index: number, action: string, detail: string) => {
        if (!onUpdateManual) return;
        onUpdateManual(prev => {
            const existing = prev.steps[index];
            if (existing.action === action && existing.detail === detail) return prev;
            const newSteps = [...prev.steps];
            newSteps[index] = { ...existing, action, detail };
            return { ...prev, steps: newSteps };
        });
    }, [onUpdateManual]);

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
                                            {isReorderMode ? '編集に戻る' : '並び替え・削除'}
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
                                    value={draftTitle}
                                    onChange={(e) => setDraftTitle(e.target.value)}
                                    onBlur={() => onUpdateManual && onUpdateManual(prev => prev.title === draftTitle ? prev : { ...prev, title: draftTitle })}
                                    className="manual__title text-5xl font-black text-slate-950 tracking-tighter leading-tight bg-transparent border-b-2 border-purple-200 focus:border-purple-600 focus:outline-none transition-colors w-full placeholder-slate-300"
                                    placeholder="マニュアルのタイトル"
                                />
                                <textarea
                                    value={draftOverview}
                                    onChange={(e) => setDraftOverview(e.target.value)}
                                    onBlur={() => onUpdateManual && onUpdateManual(prev => prev.overview === draftOverview ? prev : { ...prev, overview: draftOverview })}
                                    className="manual__overview text-slate-800 font-bold text-lg w-full leading-relaxed bg-transparent border border-purple-200 rounded-lg p-3 focus:border-purple-600 focus:outline-none transition-colors min-h-[80px] resize-y placeholder-slate-300 mt-2"
                                    placeholder="マニュアルの概要"
                                />
                            </>
                        )}
                    </div>

                    {/* Right side actions */}
                    {!isEditMode && (
                        <div className="manual__actions flex items-center gap-3 shrink-0 ml-4">


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
                            <CopyButton manual={manual} isTwoColumn={false} />
                            <ExportButton manual={manual} />
                        </div>
                    )}

                </div>
            </div>

            {/* Steps Section */}
            {isEditMode && isReorderMode ? (
                /* Reorder Mode: Click-to-swap thumbnail cards + multi-select delete */
                <div className="mx-auto px-4 py-8 pb-32 max-w-5xl">
                    {/* Instruction + Bulk Delete Controls */}
                    <div className="mb-6 flex flex-col items-center gap-3">
                        <p className={`text-sm font-bold transition-colors ${selectedSwapIndex !== null ? 'text-purple-600' : 'text-slate-400'}`}>
                            {selectedSwapIndex !== null
                                ? `ステップ ${manual.steps[selectedSwapIndex]?.stepNumber} を選択中 — 入れ替え先をクリック（もう一度クリックで解除）`
                                : '入れ替えたいステップをクリック / チェックを入れて一括削除'
                            }
                        </p>
                        {/* Bulk action bar */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => {
                                    if (checkedForDelete.size === manual.steps.length) {
                                        setCheckedForDelete(new Set());
                                    } else {
                                        setCheckedForDelete(new Set(manual.steps.map(s => s.uid || '')));
                                    }
                                }}
                                className="h-8 px-3 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 transition-all"
                            >
                                {checkedForDelete.size === manual.steps.length ? '全選択解除' : '全選択'}
                            </button>
                            {checkedForDelete.size > 0 && (
                                <button
                                    onClick={() => {
                                        if (!onUpdateManual) return;
                                        const count = checkedForDelete.size;
                                        const remaining = manual.steps.length - count;
                                        if (remaining < 1) {
                                            alert('すべてのステップを削除することはできません。最低1つは残してください。');
                                            return;
                                        }
                                        if (!confirm(`${count}件のステップを削除しますか？\nこの操作は取り消せません。`)) return;
                                        // Clean up localStorage for deleted steps
                                        manual.steps.forEach((step, i) => {
                                            const uid = step.uid || '';
                                            if (checkedForDelete.has(uid)) {
                                                if (step.uid) localStorage.removeItem(`am_canvas_state_step-${step.uid}`);
                                                localStorage.removeItem(`am_canvas_state_step-${step.stepNumber}-${i}`);
                                            }
                                        });
                                        onUpdateManual(prev => {
                                            const filtered = prev.steps.filter(s => !checkedForDelete.has(s.uid || ''));
                                            return {
                                                ...prev,
                                                steps: renumberStepsByVideo(filtered)
                                            }
                                        });
                                        setCheckedForDelete(new Set());
                                        setSelectedSwapIndex(null);
                                    }}
                                    className="h-8 px-4 rounded-lg bg-rose-600 text-white text-xs font-bold shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95 flex items-center gap-1.5"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    {checkedForDelete.size}件を削除
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {manual.steps.map((step, index) => {
                            const isSelected = selectedSwapIndex === index;
                            const isTarget = selectedSwapIndex !== null && selectedSwapIndex !== index;
                            const isChecked = checkedForDelete.has(step.uid || '');
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
                                    {/* Title + Checkbox */}
                                    <div className="p-3 flex items-start justify-between gap-2">
                                        <p className="text-sm font-bold text-slate-800 line-clamp-2 leading-snug flex-1">{step.action}</p>
                                        <label
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex-shrink-0 flex items-center cursor-pointer"
                                            title={`ステップ ${step.stepNumber} を削除対象に追加`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {
                                                    setCheckedForDelete(prev => {
                                                        const next = new Set(prev);
                                                        const uid = step.uid || '';
                                                        if (next.has(uid)) next.delete(uid);
                                                        else next.add(uid);
                                                        return next;
                                                    });
                                                }}
                                                className="w-5 h-5 rounded border-2 border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                                            />
                                        </label>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : isEditMode ? (
                /* Normal Edit Mode: Uses EditStepRow (local draft state, blur-flush) */
                <div className="mx-auto px-4 pb-32 max-w-5xl divide-y divide-slate-100">
                    {manual.steps.map((step, index) => (
                        <div key={step.uid || `step-${index}`} data-step-id={step.uid}>
                            <EditStepRow
                                step={step}
                                index={index}
                                isPortrait={orientations[step.uid || index] ?? false}
                                activeTool={activeTool}
                                currentColor={currentColor}
                                strokeWidth={strokeWidth}
                                strokeStyle={strokeStyle}
                                fontSize={fontSize}
                                stampCount={stampCount}
                                onColorChange={setCurrentColor}
                                onStrokeWidthChange={setStrokeWidth}
                                onStrokeStyleChange={setStrokeStyle}
                                onFontSizeChange={setFontSize}
                                onStampUsed={() => setStampCount(prev => prev + 1)}
                                onToolReset={() => setActiveTool('select')}
                                onCanvasUpdate={handleCanvasUpdate}
                                onDeleteStep={handleDeleteStep}
                                onTextBlur={handleTextBlur}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                /* View Mode: No drag & drop - Grouped by Video with individual Layout Toggles */
                <div className="mx-auto px-4 py-8 pb-32 max-w-[1400px]">
                    {Object.keys(videoGroups).map(vIdxKey => {
                        const vIdx = parseInt(vIdxKey);
                        const steps = videoGroups[vIdx];
                        const firstStep = steps[0];
                        const currentLayout = firstStep?.layout || 'single';
                        const isTwoCol = currentLayout === 'two-column';

                        return (
                            <section key={vIdx} className={`video-section pt-10 pb-16 ${vIdx > 0 ? 'border-t border-slate-200 mt-4' : ''}`}>
                                {/* Per-Video Header Options */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 px-2">
                                    <div className="flex items-center gap-3">
                                        <div className="flex bg-indigo-50 border border-indigo-100 items-center justify-center w-8 h-8 rounded-lg shadow-sm">
                                            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-sm font-black text-slate-500 tracking-wider">
                                            動画セクション {vIdx + 1}
                                        </h3>
                                    </div>
                                    <div className="flex bg-slate-100/80 backdrop-blur-sm p-1 rounded-xl border border-slate-200 shadow-inner max-w-fit">
                                        <button
                                            onClick={() => updateLayoutForVideo(vIdx, 'single')}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!isTwoCol ? 'bg-white text-indigo-900 shadow-md ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                                        >
                                            1列（縦並び）
                                        </button>
                                        <button
                                            onClick={() => updateLayoutForVideo(vIdx, 'two-column')}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isTwoCol ? 'bg-white text-indigo-900 shadow-md ring-1 ring-slate-900/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                                        >
                                            2列（左右並び）
                                        </button>
                                    </div>
                                </div>

                                <div className={isTwoCol ? 'grid grid-cols-2 gap-8' : 'space-y-20 max-w-4xl mx-auto'}>
                                    {steps.map((step, index) => (
                                        <div key={step.uid || index} data-step-id={step.uid}>
                                            <ManualStepItem
                                                step={step}
                                                isPortrait={orientations[step.uid || index] ?? false}
                                                isTwoColumn={isTwoCol}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        );
                    })}
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
