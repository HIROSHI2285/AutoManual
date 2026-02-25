'use client';

/**
 * EditStepRow — memoized row component for edit mode.
 *
 * Performance rationale (rerender-functional-setstate / local draft pattern):
 *   Previously, every keystroke in the title/detail textarea called `onUpdateManual`,
 *   which triggered a full parent re-render (and re-render of *all* steps, all
 *   InlineCanvas props, etc.).
 *
 *   Fix: keep text edits in local `draft` state, flush to parent only on blur.
 *   This reduces parent re-renders from O(keystrokes) → O(blur events).
 */
import { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { ManualStep } from '@/app/page';
import InlineCanvas from './InlineCanvas';
import { ToolType, StrokeStyle } from './EditorTypes';

interface EditStepRowProps {
    step: ManualStep;
    index: number;
    isPortrait: boolean;
    activeTool: ToolType;
    currentColor: string;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    fontSize: number;
    stampCount: number;
    onColorChange: (c: string) => void;
    onStrokeWidthChange: (w: number) => void;
    onStrokeStyleChange: (s: StrokeStyle) => void;
    onFontSizeChange: (s: number) => void;
    onStampUsed: () => void;
    onToolReset: () => void;
    onCanvasUpdate: (index: number, newUrl: string, newData?: any) => void;
    onDeleteStep: (index: number) => void;
    // Flush text edits to parent (called on blur — not on every keystroke)
    onTextBlur: (index: number, action: string, detail: string) => void;
}

const EditStepRow = memo(function EditStepRow({
    step,
    index,
    isPortrait,
    activeTool,
    currentColor,
    strokeWidth,
    strokeStyle,
    fontSize,
    stampCount,
    onColorChange,
    onStrokeWidthChange,
    onStrokeStyleChange,
    onFontSizeChange,
    onStampUsed,
    onToolReset,
    onCanvasUpdate,
    onDeleteStep,
    onTextBlur,
}: EditStepRowProps) {
    // Local draft — decoupled from parent state so typing doesn't trigger re-renders
    const [draftAction, setDraftAction] = useState(step.action);
    const [draftDetail, setDraftDetail] = useState(step.detail ?? '');

    // Sync if parent pushes a new step (e.g. after undo or external update)
    // Use a ref to avoid resetting while actively editing
    const isEditingRef = useRef(false);
    useEffect(() => {
        if (!isEditingRef.current) {
            setDraftAction(step.action);
            setDraftDetail(step.detail ?? '');
        }
    }, [step.action, step.detail]);

    const handleBlur = useCallback(() => {
        isEditingRef.current = false;
        onTextBlur(index, draftAction, draftDetail);
    }, [index, draftAction, draftDetail, onTextBlur]);

    const handleCanvasUpdate = useCallback(
        (newUrl: string, newData?: any) => onCanvasUpdate(index, newUrl, newData),
        [index, onCanvasUpdate]
    );

    const handleDelete = useCallback(() => onDeleteStep(index), [index, onDeleteStep]);

    return (
        <section className="relative mx-auto max-w-5xl px-4 py-10 border-b border-slate-100 last:border-none">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-white font-black text-sm shadow-lg flex-shrink-0">
                    {step.stepNumber}
                </div>
                <button
                    onClick={handleDelete}
                    className="px-3 py-1 bg-rose-50 text-rose-600 rounded-md text-xs font-bold border border-rose-200 hover:bg-rose-600 hover:text-white hover:border-transparent transition-all active:scale-95 flex items-center justify-center whitespace-nowrap"
                    title={`ステップ ${step.stepNumber} を削除`}
                >
                    削除
                </button>
            </div>
            <div className="flex flex-col gap-3 py-1 w-full">
                <input
                    type="text"
                    value={draftAction}
                    onFocus={() => { isEditingRef.current = true; }}
                    onChange={(e) => setDraftAction(e.target.value)}
                    onBlur={handleBlur}
                    className="manual__step-title font-black text-slate-950 leading-tight tracking-tight bg-transparent border-b-2 border-purple-200 focus:border-purple-600 focus:outline-none transition-colors w-full placeholder-slate-300 text-3xl"
                    placeholder="手順のタイトル"
                />
                <textarea
                    value={draftDetail}
                    onFocus={() => { isEditingRef.current = true; }}
                    onChange={(e) => setDraftDetail(e.target.value)}
                    onBlur={handleBlur}
                    className="manual__step-desc text-slate-800 font-bold leading-relaxed w-full bg-transparent border border-purple-200 rounded-lg p-3 focus:border-purple-600 focus:outline-none transition-colors resize-y placeholder-slate-300 text-lg min-h-[100px]"
                    placeholder="手順の詳細説明"
                />
            </div>

            <div className={`manual__image-container rounded-[16px] overflow-hidden transition-all duration-500 border-2 bg-white shadow-floating border-purple-600/10 mx-auto ${isPortrait ? 'max-w-[576px]' : 'max-w-[768px]'}`}>
                <InlineCanvas
                    canvasId={`step-${step.uid || index}`}
                    imageUrl={(step.originalUrl && !step.originalUrl.startsWith('blob:')) ? step.originalUrl : (step.screenshot || '')}
                    activeTool={activeTool}
                    currentColor={currentColor}
                    onColorChange={onColorChange}
                    strokeWidth={strokeWidth}
                    onStrokeWidthChange={onStrokeWidthChange}
                    strokeStyle={strokeStyle}
                    onStrokeStyleChange={onStrokeStyleChange}
                    fontSize={fontSize}
                    onFontSizeChange={onFontSizeChange}
                    stampCount={stampCount}
                    onUpdate={handleCanvasUpdate}
                    onStampUsed={onStampUsed}
                    onToolReset={onToolReset}
                    initialData={step.canvasData}
                    isPortrait={isPortrait}
                />
            </div>
        </section>
    );
});

export default EditStepRow;
