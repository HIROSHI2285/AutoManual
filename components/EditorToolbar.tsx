'use client';

import React from 'react';
import { ToolType, EDITOR_COLORS, StrokeStyle } from './EditorTypes';

interface EditorToolbarProps {
    activeTool: ToolType;
    onToolChange: (tool: ToolType) => void;
    currentColor: string;
    onColorChange: (color: string) => void;
    strokeWidth: number;
    onStrokeWidthChange: (width: number) => void;
    strokeStyle: StrokeStyle;
    onStrokeStyleChange: (style: StrokeStyle) => void;
    fontSize: number;
    onFontSizeChange: (size: number) => void;
    stampCount: number;
}

const FONT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 104, 112, 120, 144, 200, 300, 400, 500];

export default function EditorToolbar({
    activeTool,
    onToolChange,
    currentColor,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    strokeStyle,
    onStrokeStyleChange,
    fontSize,
    onFontSizeChange,
    stampCount
}: EditorToolbarProps) {

    return (
        <div
            className="fixed left-0 top-0 bottom-0 w-[72px] bg-white/80 backdrop-blur-xl flex flex-col items-center py-6 gap-2 z-[100] border-r border-slate-200/60 shadow-[20px_0_40px_-15px_rgba(0,0,0,0.03)] animate-slide-in-left overflow-y-auto hide-scrollbar sm:flex hidden"
        >
            {/* Logo area with premium feel */}
            <div className="mb-8 w-full flex justify-center">
                <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30 ring-1 ring-white/20">
                    <span className="text-white font-black text-lg">A</span>
                </div>
            </div>

            <div className="flex flex-col gap-1 w-full px-2">
                <ToolButton
                    active={activeTool === 'select'}
                    onClick={() => onToolChange('select')}
                    icon={<CursorIcon />}
                    title="Select"
                    hotkey="V"
                />

                <Separator />

                <ToolButton
                    active={activeTool === 'rect'}
                    onClick={() => onToolChange('rect')}
                    icon={<RectIcon />}
                    title="Rectangle"
                    hotkey="R"
                />
                <ToolButton
                    active={activeTool === 'ellipse'}
                    onClick={() => onToolChange('ellipse')}
                    icon={<CircleIcon />}
                    title="Ellipse"
                    hotkey="O"
                />
                <ToolButton
                    active={activeTool === 'arrow'}
                    onClick={() => onToolChange('arrow')}
                    icon={<ArrowIcon />}
                    title="Arrow"
                    hotkey="A"
                />

                <Separator />

                <ToolButton
                    active={activeTool === 'text'}
                    onClick={() => onToolChange('text')}
                    icon={<TextIcon />}
                    title="Text"
                    hotkey="T"
                />
                <ToolButton
                    active={activeTool === 'stamp'}
                    onClick={() => onToolChange('stamp')}
                    icon={<StampIcon number={stampCount} />}
                    title="Stamp"
                    hotkey="S"
                />

                <Separator />

                <ToolButton
                    active={activeTool === 'highlight'}
                    onClick={() => { onToolChange('highlight'); if (currentColor === '#ef4444') onColorChange('#f59e0b'); }}
                    icon={<HighlighterIcon />}
                    title="Highlight"
                    hotkey="H"
                />
                <ToolButton
                    active={activeTool === 'blur'}
                    onClick={() => onToolChange('blur')}
                    icon={<BlurIcon />}
                    title="Blur"
                    hotkey="B"
                />

                <Separator />

                <ToolButton
                    active={activeTool === 'adjust'}
                    onClick={() => onToolChange('adjust')}
                    icon={<AdjustIcon />}
                    title="Zoom / Pan"
                    hotkey="Z"
                />

                <Separator />

                {/* Immediate Actions */}
                <button
                    onClick={() => {
                        window.dispatchEvent(new Event('am:undo'));
                    }}
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all duration-200 group relative active:scale-95 mb-1"
                >
                    <div className="w-6 h-6 transition-transform duration-300 group-hover:-rotate-45">
                        <UndoIcon />
                    </div>
                    <div className="absolute left-full ml-4 px-3 py-2 bg-slate-950 text-white text-[11px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all invisible group-hover:visible translate-x-[-8px] group-hover:translate-x-0 whitespace-nowrap z-50 shadow-2xl border border-white/10">
                        Undo (Ctrl+Z)
                    </div>
                </button>

                <button
                    onClick={() => {
                        window.dispatchEvent(new Event('am:redo'));
                    }}
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-all duration-200 group relative active:scale-95 mb-1"
                >
                    <div className="w-6 h-6 transition-transform duration-300 group-hover:rotate-45">
                        <RedoIcon />
                    </div>
                    <div className="absolute left-full ml-4 px-3 py-2 bg-slate-950 text-white text-[11px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all invisible group-hover:visible translate-x-[-8px] group-hover:translate-x-0 whitespace-nowrap z-50 shadow-2xl border border-white/10">
                        Redo (Ctrl+Y)
                    </div>
                </button>

                <button
                    onClick={() => {
                        window.dispatchEvent(new Event('am:delete'));
                    }}
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all duration-200 group relative active:scale-95"
                >
                    <div className="w-6 h-6 transition-transform duration-300 group-hover:scale-110">
                        <TrashIcon />
                    </div>
                    <div className="absolute left-full ml-4 px-3 py-2 bg-slate-950 text-white text-[11px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all invisible group-hover:visible translate-x-[-8px] group-hover:translate-x-0 whitespace-nowrap z-50 shadow-2xl border border-white/10">
                        Delete Selected
                    </div>
                </button>
            </div>

            {/* Properties Section - ELITE PRECISION */}
            <div className="mt-auto mb-2 flex flex-col gap-4 items-center w-full px-2 py-6 bg-slate-950 border-t border-white/10">

                {/* Numeric Width */}
                <div className="flex flex-col items-center gap-1.5 w-full">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">太さ</span>
                    <QuantityStepper
                        value={strokeWidth}
                        onChange={onStrokeWidthChange}
                        min={1}
                        max={100}
                        step={1}
                    />
                </div>

                {/* Numeric Font Size */}
                <div className="flex flex-col items-center gap-1.5 w-full">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">サイズ</span>
                    <QuantityStepper
                        value={fontSize}
                        onChange={(newSize) => {
                            onFontSizeChange(newSize);
                            // Direct event dispatch to canvas — bypasses React pipeline
                            window.dispatchEvent(new CustomEvent('am:fontsize', { detail: { fontSize: newSize } }));
                        }}
                        min={8}
                        max={500}
                        step={2}
                    />
                </div>

                {/* Stroke Style Toggle */}
                <div className="flex gap-1 w-full justify-center px-1 py-1">
                    <button
                        onClick={() => onStrokeStyleChange('solid')}
                        className={`flex-1 h-7 rounded-sm flex items-center justify-center transition-all border ${strokeStyle === 'solid'
                            ? 'bg-purple-600 border-purple-500 text-white shadow-md'
                            : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-white'
                            }`}
                        title="Solid Line"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="4" y1="12" x2="20" y2="12" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onStrokeStyleChange('dashed')}
                        className={`flex-1 h-7 rounded-sm flex items-center justify-center transition-all border ${strokeStyle === 'dashed'
                            ? 'bg-purple-600 border-purple-500 text-white shadow-md'
                            : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800 hover:text-white'
                            }`}
                        title="Dashed Line"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="4" y1="12" x2="20" y2="12" strokeDasharray="4 4" />
                        </svg>
                    </button>
                </div>

                {/* Color Spectrum */}
                <div className="grid grid-cols-2 gap-2 p-2 bg-slate-900 rounded-xl border border-slate-800 shadow-inner">
                    {EDITOR_COLORS.map((c) => (
                        <button
                            key={c.value}
                            onClick={() => onColorChange(c.value)}
                            className={`w-4 h-4 rounded-full transition-all duration-300 ${currentColor === c.value
                                ? 'ring-2 ring-offset-2 ring-purple-500 ring-offset-slate-950 scale-125 shadow-lg'
                                : 'hover:scale-110 opacity-70 hover:opacity-100'
                                }`}
                            style={{ backgroundColor: c.value }}
                            title={c.label}
                        />
                    ))}
                </div>

                {/* Apply Visual Only Feedback */}
                <button
                    onClick={() => {
                        const target = document.getElementById('save-settings-btn');
                        if (target) {
                            const original = target.innerHTML;
                            target.innerHTML = 'OK';
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Apply' }));
                        }
                    }}
                    id="save-settings-btn"
                    className="w-full h-8 mt-2 bg-purple-600 text-[10px] text-white font-black uppercase tracking-widest rounded-lg shadow-2xl hover:bg-purple-500 active:scale-95 transition-all border border-white/10"
                >
                    適用
                </button>
            </div>
        </div>
    );
}

// --- Internal Helper Components ---

function Separator() {
    return <div className="h-px bg-slate-100/60 my-1.5 mx-3" />;
}

interface ToolBtnProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    title: string;
    hotkey?: string;
}

function ToolButton({ active, onClick, icon, title, hotkey }: ToolBtnProps) {
    return (
        <button
            className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 group relative ${active
                ? 'bg-purple-600 text-white shadow-2xl scale-105 border border-white/20'
                : 'text-slate-500 hover:bg-slate-50 hover:text-purple-600'
                }`}
            onClick={onClick}
        >
            <div className={`w-6 h-6 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                {icon}
            </div>

            {/* Premium Tooltip - ELITE STYLE */}
            <div className="absolute left-full ml-4 px-3 py-2 bg-slate-950 text-white text-[11px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all invisible group-hover:visible translate-x-[-8px] group-hover:translate-x-0 whitespace-nowrap z-50 shadow-2xl border border-white/10 flex items-center gap-3">
                <span>{title}</span>
                {hotkey && <span className="opacity-50 font-mono bg-white/20 px-1.5 rounded text-[10px]">{hotkey}</span>}
            </div>
        </button>
    );
}

// --- Premium Custom Icons (Fine-tuned SVG Paths) ---

const CursorIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        <path d="M13 13l6 6" />
    </svg>
);

const RectIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="16" height="12" x="4" y="6" rx="2" />
    </svg>
);

const CircleIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
    </svg>
);

const ArrowIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
);

const UndoIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
    </svg>
);

const RedoIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 7v6h-6" />
        <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l6 5.7" />
    </svg>
);

const TextIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
);

const StampIcon = ({ number }: { number: number }) => (
    <div className="relative w-full h-full flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0 opacity-40">
            <path d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
        </svg>
        <span className="text-[10px] font-black leading-none">{number}</span>
    </div>
);

const HighlighterIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l-6 6v3h9l3-3" />
        <path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4" />
    </svg>
);

const AdjustIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 11V6a2 2 0 00-4 0v5" />
        <path d="M14 10V4a2 2 0 00-4 0v6" />
        <path d="M10 10.5V6a2 2 0 00-4 0v8a6 6 0 0012 0v-4a2 2 0 00-4 0" />
    </svg>
);

const BlurIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 13.5l18-3M4 17l16-5M7 7l10 10M11 4l2 16" opacity="0.6" />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
);

// --- Quantity Stepper Component (Refined UX) ---

interface QuantityStepperProps {
    value: number;
    onChange: (val: number) => void;
    min: number;
    max: number;
    step?: number;
}

function QuantityStepper({ value, onChange, min, max, step = 1, steps }: QuantityStepperProps & { steps?: number[] }) {
    const handleDecrease = () => {
        if (steps) {
            const currentIdx = steps.findIndex(s => s >= value);
            const nextVal = currentIdx > 0 ? steps[currentIdx - 1] : steps[0];
            onChange(nextVal);
        } else {
            if (value > min) onChange(value - step);
        }
    };

    const handleIncrease = () => {
        if (steps) {
            const currentIdx = steps.findIndex(s => s > value);
            const nextVal = currentIdx !== -1 ? steps[currentIdx] : steps[steps.length - 1];
            onChange(nextVal);
        } else {
            if (value < max) onChange(value + step);
        }
    };

    return (
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-inner w-[68px]">
            <button
                onClick={handleDecrease}
                onMouseDown={(e) => e.preventDefault()} // Keep focus on canvas
                disabled={value <= min}
                className="w-5 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors active:bg-purple-600/30"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M20 12H4" /></svg>
            </button>
            <div className="flex-1 h-10 flex items-center justify-center text-xs font-black text-white relative">
                <input
                    type="number"
                    value={value}
                    min={min}
                    max={max}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) onChange(Math.max(min, Math.min(max, val)));
                    }}
                    className="w-full h-full bg-transparent text-center outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none font-jakarta"
                />
            </div>
            <button
                onClick={handleIncrease}
                onMouseDown={(e) => e.preventDefault()} // Keep focus on canvas
                disabled={value >= max}
                className="w-5 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors active:bg-purple-600/30"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
            </button>
        </div>
    );
}
