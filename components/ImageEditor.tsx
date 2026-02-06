'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';

interface ImageEditorProps {
    imageUrl: string;
    onSave: (newImageUrl: string) => void;
    onCancel: () => void;
}

type ToolType = 'select' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'stamp' | 'highlight' | 'blur';

const COLORS = [
    { value: '#ef4444', label: 'Red' },    // red-500
    { value: '#3b82f6', label: 'Blue' },   // blue-500
    { value: '#10b981', label: 'Green' },  // green-500
    { value: '#f59e0b', label: 'Amber' },  // amber-500
    { value: '#000000', label: 'Black' },
    { value: '#ffffff', label: 'White' },
];

export default function ImageEditor({ imageUrl, onSave, onCancel }: ImageEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
    const [activeTool, setActiveTool] = useState<ToolType>('select');
    const [currentColor, setCurrentColor] = useState<string>('#ef4444');
    const [stampCount, setStampCount] = useState<number>(1);
    const isMounted = useRef(true);

    // Initialize Canvas
    useEffect(() => {
        isMounted.current = true;

        if (!canvasRef.current || !containerRef.current) return;

        // Create canvas instance
        const newCanvas = new fabric.Canvas(canvasRef.current, {
            selection: true,
            preserveObjectStacking: true,
            interactive: true,
            backgroundColor: '#ffffff'
        });

        // Set initial size to something reasonable
        newCanvas.setWidth(800);
        newCanvas.setHeight(600);

        setFabricCanvas(newCanvas);

        // Load image
        fabric.Image.fromURL(imageUrl, (img) => {
            // Safety check: verify component is mounted and canvas exists and has an element
            if (!isMounted.current || !newCanvas || !newCanvas.getElement()) return;
            if (!img) return;

            try {
                // Determine dimensions
                const maxWidth = window.innerWidth * 0.8;
                const maxHeight = window.innerHeight * 0.8;

                let scale = 1;
                if (img.width && img.height) {
                    const scaleX = maxWidth / img.width;
                    const scaleY = maxHeight / img.height;
                    scale = Math.min(scaleX, scaleY, 1); // Fit to screen

                    img.scale(scale);

                    const targetWidth = (img.width || 0) * scale;
                    const targetHeight = (img.height || 0) * scale;

                    newCanvas.setWidth(targetWidth);
                    newCanvas.setHeight(targetHeight);
                    newCanvas.setBackgroundImage(img, newCanvas.renderAll.bind(newCanvas));
                }
            } catch (error) {
                console.error("Error initializing canvas image:", error);
            }
        }, { crossOrigin: 'anonymous' });

        return () => {
            isMounted.current = false;
            try {
                newCanvas.dispose();
            } catch (e) {
                // Ignore dispose errors
            }
        };
    }, [imageUrl]);

    // Update active tool capabilities
    useEffect(() => {
        if (!fabricCanvas) return;

        // Reset behaviors
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = activeTool === 'select';

        // Update selection capability
        fabricCanvas.forEachObject((obj) => {
            obj.selectable = activeTool === 'select';
            obj.evented = activeTool === 'select';
        });

        fabricCanvas.renderAll();

        // Bind events
        const handleMouseDown = (opt: fabric.IEvent) => {
            if (activeTool === 'select') return;

            const pointer = fabricCanvas.getPointer(opt.e);
            handleAddObject(activeTool, pointer.x, pointer.y);

            // Switch back to select for immediate manipulation (Illustrator behavior)
            setActiveTool('select');
        };

        fabricCanvas.on('mouse:down', handleMouseDown);

        return () => {
            fabricCanvas.off('mouse:down', handleMouseDown);
        };
    }, [fabricCanvas, activeTool, currentColor, stampCount]);

    const handleAddObject = (tool: ToolType, x: number, y: number) => {
        if (!fabricCanvas) return;

        let obj: fabric.Object | null = null;
        const commonProps = {
            left: x,
            top: y,
            stroke: currentColor,
            strokeWidth: 3,
            fill: 'transparent',
            cornerColor: '#3b82f6',
            cornerStyle: 'circle' as 'circle',
            transparentCorners: false,
            borderColor: '#3b82f6',
            cornerSize: 10,
            padding: 5
        };

        switch (tool) {
            case 'rect':
                obj = new fabric.Rect({
                    ...commonProps,
                    width: 100,
                    height: 60,
                });
                break;
            case 'ellipse':
                obj = new fabric.Ellipse({
                    ...commonProps,
                    rx: 50,
                    ry: 30,
                });
                break;
            case 'arrow':
                // Arrow using path
                obj = new fabric.Path('M 0 0 L 80 0 M 80 0 L 60 -10 M 80 0 L 60 10', {
                    ...commonProps,
                    strokeWidth: 4,
                    fill: 'transparent',
                    objectCaching: false
                });
                break;
            case 'text':
                obj = new fabric.IText('テキスト入力', {
                    ...commonProps,
                    stroke: undefined, // Text usually doesn't need stroke
                    fill: currentColor,
                    fontSize: 24,
                    fontFamily: 'Meiryo UI, sans-serif',
                });
                break;
            case 'stamp':
                const circle = new fabric.Circle({
                    radius: 16,
                    fill: currentColor,
                    originX: 'center',
                    originY: 'center',
                    strokeWidth: 0
                });

                const num = new fabric.Text(stampCount.toString(), {
                    fontSize: 20,
                    fill: '#ffffff',
                    originX: 'center',
                    originY: 'center',
                    fontFamily: 'Arial',
                    fontWeight: 'bold',
                    strokeWidth: 0
                });

                obj = new fabric.Group([circle, num], {
                    left: x,
                    top: y,
                    cornerColor: '#3b82f6',
                    cornerStyle: 'circle' as 'circle',
                    transparentCorners: false,
                    borderColor: '#3b82f6',
                    cornerSize: 10,
                    padding: 5
                });

                setStampCount(prev => prev + 1);
                break;
            case 'highlight':
                obj = new fabric.Rect({
                    left: x, top: y,
                    width: 150, height: 20,
                    fill: currentColor, // Usually yellow
                    opacity: 0.35,
                    rx: 4, ry: 4,
                    cornerColor: '#3b82f6',
                    cornerStyle: 'circle' as 'circle',
                    transparentCorners: false,
                    strokeWidth: 0
                });
                break;
            case 'blur':
                // Privacy blur placeholder (gray box)
                obj = new fabric.Rect({
                    left: x, top: y,
                    width: 120, height: 40,
                    fill: '#cbd5e1', // Slate-300
                    rx: 2, ry: 2,
                    cornerColor: '#3b82f6',
                    cornerStyle: 'circle' as 'circle',
                    transparentCorners: false,
                    strokeWidth: 0
                });
                // Add a text label "BLUR" mostly transparent
                const blurLabel = new fabric.Text('ぼかし', {
                    fontSize: 12, fill: '#64748b', originX: 'center', originY: 'center'
                });
                obj = new fabric.Group([obj, blurLabel], {
                    left: x, top: y
                });
                break;
        }

        if (obj) {
            fabricCanvas.add(obj);
            fabricCanvas.setActiveObject(obj);
            if (tool === 'text' && obj instanceof fabric.IText) {
                obj.enterEditing();
                obj.selectAll();
            }
        }
    };

    const handleDelete = useCallback(() => {
        if (!fabricCanvas) return;
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            fabricCanvas.remove(activeObj);
            fabricCanvas.discardActiveObject();
            fabricCanvas.requestRenderAll();
        }
    }, [fabricCanvas]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Check if we are editing text, if so don't delete object
                if (fabricCanvas?.getActiveObject() instanceof fabric.IText && (fabricCanvas.getActiveObject() as fabric.IText).isEditing) {
                    return;
                }
                handleDelete();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDelete, fabricCanvas]);

    const handleSaveImage = () => {
        if (!fabricCanvas) return;
        const dataUrl = fabricCanvas.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 1 // Export at canvas resolution (which matches scaled image). 
            // If we want original resolution, we'd need to calculate multiplier.
            // But scaled visually is usually enough for the manual.
        });
        onSave(dataUrl);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 animate-fade-in">
            {/* Illustrator-like Layout */}
            <div className="bg-[#f3f4f6] rounded-lg shadow-2xl overflow-hidden w-full max-w-[1400px] h-[90vh] flex flex-col border border-gray-300">

                {/* Top Menu Bar */}
                <div className="bg-[#2d2d2d] text-white px-4 py-2 flex justify-between items-center z-20 shadow-md h-12">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#ef4444] rounded text-xs font-bold px-1.5 py-0.5">Ai</div>
                        <span className="text-sm font-medium text-gray-300">画像編集エディター</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            className="px-4 py-1.5 rounded text-gray-300 text-xs hover:bg-[#444] transition-colors"
                        >
                            キャンセル
                        </button>
                        <button
                            onClick={handleSaveImage}
                            className="px-4 py-1.5 rounded bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-lg transition-all"
                        >
                            保存して適用
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden relative">

                    {/* Left Toolbar (Illustrator style) */}
                    <div className="w-12 bg-[#4a4a4a] flex flex-col items-center py-2 gap-1 z-10 shadow-xl border-r border-[#333]">
                        <ToolButton
                            active={activeTool === 'select'}
                            onClick={() => setActiveTool('select')}
                            icon={<CursorIcon />}
                            title="選択ツール (V)"
                        />
                        <div className="w-8 h-px bg-[#555] my-1" />

                        <ToolButton
                            active={activeTool === 'rect'}
                            onClick={() => setActiveTool('rect')}
                            icon={<RectIcon />}
                            title="長方形ツール (M)"
                        />
                        <ToolButton
                            active={activeTool === 'ellipse'}
                            onClick={() => setActiveTool('ellipse')}
                            icon={<CircleIcon />}
                            title="楕円形ツール (L)"
                        />
                        <ToolButton
                            active={activeTool === 'arrow'}
                            onClick={() => setActiveTool('arrow')}
                            icon={<ArrowIcon />}
                            title="矢印ツール"
                        />
                        <div className="w-8 h-px bg-[#555] my-1" />

                        <ToolButton
                            active={activeTool === 'text'}
                            onClick={() => setActiveTool('text')}
                            icon={<TextIcon />}
                            title="文字ツール (T)"
                        />
                        <ToolButton
                            active={activeTool === 'stamp'}
                            onClick={() => setActiveTool('stamp')}
                            icon={<StampIcon number={stampCount} />}
                            title="番号スタンプ"
                        />
                        <div className="w-8 h-px bg-[#555] my-1" />

                        <ToolButton
                            active={activeTool === 'highlight'}
                            onClick={() => { setActiveTool('highlight'); if (currentColor === '#ef4444') setCurrentColor('#f59e0b'); }}
                            icon={<HighlighterIcon />}
                            title="ハイライト"
                        />
                        <ToolButton
                            active={activeTool === 'blur'}
                            onClick={() => setActiveTool('blur')}
                            icon={<BlurIcon />}
                            title="ぼかし"
                        />
                    </div>

                    {/* Canvas Area (Artboard) */}
                    <div ref={containerRef} className="flex-1 bg-[#3a3a3a] flex items-center justify-center p-8 overflow-auto relative">
                        <div className="relative shadow-xl">
                            {/* Canvas wrapper */}
                            <canvas ref={canvasRef} />
                        </div>

                        {/* Floating Panels (Properties) */}
                        <div className="absolute top-4 right-4 flex flex-col gap-2">
                            {/* Color Panel */}
                            <div className="bg-[#4a4a4a] p-3 rounded shadow-xl border border-[#555] w-48">
                                <span className="text-[10px] text-gray-400 font-bold uppercase mb-2 block tracking-wider">Fill / Stroke</span>
                                <div className="grid grid-cols-6 gap-1">
                                    {COLORS.map((c) => (
                                        <button
                                            key={c.value}
                                            onClick={() => setCurrentColor(c.value)}
                                            className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${currentColor === c.value
                                                    ? 'border-white scale-110'
                                                    : 'border-transparent hover:border-gray-400'
                                                }`}
                                            title={c.label}
                                        >
                                            <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: c.value }} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Actions Panel */}
                            <div className="bg-[#4a4a4a] p-2 rounded shadow-xl border border-[#555] flex justify-end">
                                <button
                                    onClick={handleDelete}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-red-900/50 rounded transition-colors"
                                    title="削除 (Delete)"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Sub Components ---

interface ToolBtnProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    title: string;
}

function ToolButton({ active, onClick, icon, title }: ToolBtnProps) {
    return (
        <button
            onClick={onClick}
            className={`w-8 h-8 rounded flex items-center justify-center transition-all duration-100 ${active
                    ? 'bg-[#333] text-white shadow-inner border border-[#222]'
                    : 'text-gray-400 hover:bg-[#444] hover:text-white'
                }`}
            title={title}
        >
            <div className="w-5 h-5">{icon}</div>
        </button>
    );
}

// --- Icons (SVG) ---

const CursorIcon = () => (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
        <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2.9-3.2-7.4-4.4 4.6V2z" />
    </svg>
);

const RectIcon = () => (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
        <rect x="2" y="4" width="20" height="16" />
        <rect x="4" y="6" width="16" height="12" fill="#4a4a4a" />
    </svg>
);

const CircleIcon = () => (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="7" fill="#4a4a4a" />
    </svg>
);

const ArrowIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
);

// T icon
const TextIcon = () => (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
        <path d="M5 4v3h5.5v12h3V7H19V4z" />
    </svg>
);

const StampIcon = ({ number }: { number: number }) => (
    <div className="relative w-full h-full flex items-center justify-center font-bold">
        <div className="w-5 h-5 border-2 border-current rounded-full flex items-center justify-center text-[10px]">
            {number}
        </div>
    </div>
);

const HighlighterIcon = () => (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        <path d="M3 22h6v-2H3v2z" />
    </svg>
);

const BlurIcon = () => (
    <svg fill="currentColor" viewBox="0 0 24 24" stroke="none">
        <circle cx="12" cy="12" r="8" fillOpacity="0.5" />
        <circle cx="8" cy="8" r="4" fillOpacity="0.5" />
    </svg>
);

const TrashIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);
