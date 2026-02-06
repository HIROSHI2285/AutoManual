'use client';

import { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { ToolType } from './EditorTypes';

interface InlineCanvasProps {
    imageUrl: string;
    activeTool: ToolType;
    currentColor: string;
    strokeWidth: number;
    fontSize: number;
    stampCount: number;
    onUpdate: (newImageUrl: string) => void;
    onStampUsed: () => void;
}

export default function InlineCanvas({
    imageUrl,
    activeTool,
    currentColor,
    strokeWidth,
    fontSize,
    stampCount,
    onUpdate,
    onStampUsed
}: InlineCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isMounted = useRef(true);
    const initialLoadDone = useRef(false);
    const lastSavedUrl = useRef<string | null>(null);
    const [canvasId, setCanvasId] = useState(0);

    // Initialize Canvas ONCE on mount
    useEffect(() => {
        isMounted.current = true;
        if (!canvasRef.current || !containerRef.current) return;

        // Create canvas instance
        const newCanvas = new fabric.Canvas(canvasRef.current, {
            selection: activeTool === 'select',
            preserveObjectStacking: true,
            interactive: true,
            backgroundColor: '#ffffff',
            enableRetinaScaling: true, // ENSURE High DPI Support
            imageSmoothingEnabled: true
        });

        fabricCanvasRef.current = newCanvas;
        setCanvasId(id => id + 1);

        // Keyboard Delete
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace')) {
                const activeObj = newCanvas.getActiveObject();
                if (activeObj) {
                    if (activeObj instanceof fabric.IText && (activeObj as fabric.IText).isEditing) return;
                    newCanvas.remove(activeObj);
                    newCanvas.discardActiveObject();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            isMounted.current = false;
            window.removeEventListener('keydown', handleKeyDown);
            try {
                // Final cleanup on unmount - make it silent
                const wrapper = newCanvas.getElement().parentElement;
                if (wrapper && wrapper.parentElement) {
                    newCanvas.dispose();
                }
            } catch (e) {
                // Silently ignore disposal errors on unmount
            }
            fabricCanvasRef.current = null;
        };
    }, []); // Empty dependencies!

    // Keep reference to latest onUpdate to avoid stale closures in effects
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    // Handle image updates and load logic
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // Guard against redundant loads
        if (lastSavedUrl.current === imageUrl && initialLoadDone.current) {
            return;
        }

        // Clear existing objects before loading new image (instead of disposing)
        canvas.clear();
        canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
        initialLoadDone.current = false;

        // Load image and setup
        fabric.Image.fromURL(imageUrl, (img) => {
            if (!isMounted.current || canvas !== fabricCanvasRef.current || !canvas.getElement()) return;
            if (!img) return;

            try {
                // Determine dimensions based on container exactly
                let containerWidth = containerRef.current?.getBoundingClientRect().width || 800;
                if (containerWidth === 0) containerWidth = 800;

                const scale = (img.width ? containerWidth / img.width : 1);
                img.scale(scale);

                const targetWidth = Math.round((img.width || 0) * scale);
                const targetHeight = Math.round((img.height || 0) * scale);

                // Set dimensions exactly to container size to avoid CSS stretching
                canvas.setDimensions({
                    width: targetWidth,
                    height: targetHeight
                }, { cssOnly: false });

                img.set({ originX: 'left', originY: 'top', left: 0, top: 0 });
                canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));

                initialLoadDone.current = true;
                lastSavedUrl.current = imageUrl;
            } catch (error) {
                // Silent load error
            }
        }, { crossOrigin: 'anonymous' });

        // Autosave trigger
        const handleSave = () => {
            if (isMounted.current && canvas === fabricCanvasRef.current && canvas.getElement() && initialLoadDone.current) {
                try {
                    // ROBUST EXPORT LOGIC:
                    // The canvas is displayed responsively (scaled down).
                    // The background image is scaled by `bgImage.scaleX` to fit this smaller canvas.
                    // We want to export at the ORIGINAL resolution of the background image.
                    // Multiplier = 1 / scaleX restores the 100% scale.

                    let multiplier = 1;
                    const bgImage = canvas.backgroundImage;

                    if (bgImage && bgImage instanceof fabric.Image) {
                        // Force alignment to top-left to prevent shifts
                        bgImage.set({ originX: 'left', originY: 'top', left: 0, top: 0 });
                        const scaleX = bgImage.scaleX || 1;
                        multiplier = 1 / scaleX;
                    }

                    const dataUrl = canvas.toDataURL({
                        format: 'png',
                        quality: 1.0,
                        multiplier: multiplier,
                        enableRetinaScaling: true
                    });

                    lastSavedUrl.current = dataUrl;
                    onUpdateRef.current(dataUrl);
                } catch (e) {
                    // Silent fail
                }
            }
        };

        canvas.on('object:added', handleSave);
        canvas.on('object:modified', handleSave);
        canvas.on('object:removed', handleSave);
        canvas.on('text:editing:entered', handleSave);
        canvas.on('text:editing:exited', handleSave);
        canvas.on('text:changed', handleSave);

        return () => {
            canvas.off('object:added', handleSave);
            canvas.off('object:modified', handleSave);
            canvas.off('object:removed', handleSave);
            canvas.off('text:editing:entered', handleSave);
            canvas.off('text:editing:exited', handleSave);
            canvas.off('text:changed', handleSave);
        };
    }, [imageUrl]);

    // Update Canvas Properties when props change
    useEffect(() => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;
        if (!fabricCanvas.getElement()) return; // Safety check

        fabricCanvas.selection = activeTool === 'select';
        fabricCanvas.preserveObjectStacking = true; // IMPORTANT for keeping z-index stable

        // Apply properties to active object (not just in select mode)
        const activeObj = fabricCanvas.getActiveObject() || fabricCanvas.getObjects().find(o => (o as any)._lastIsActive);
        if (activeObj) {
            let changed = false;

            // Apply color
            if ('stroke' in activeObj && activeObj.stroke !== currentColor) {
                // For shapes/stamps
                activeObj.set('stroke', currentColor);
                changed = true;
            }

            // Fill logic (Specific to Text and Groups)
            if (activeObj.type === 'text' || activeObj.type === 'i-text' || activeObj instanceof fabric.IText) {
                const textObj = activeObj as fabric.IText;
                if (textObj.fill !== currentColor) {
                    textObj.set('fill', currentColor);
                    textObj.setSelectionStyles({ fill: currentColor }, 0, (textObj.text || '').length);
                    changed = true;
                }
            } else if (activeObj.type === 'group') {
                // Handle stamps (Circle + Text group)
                const group = activeObj as fabric.Group;
                group.getObjects().forEach(obj => {
                    if (obj instanceof fabric.Circle) obj.set('fill', currentColor);
                    if (obj instanceof fabric.Text) obj.set('fill', '#ffffff'); // Keep stamp text white
                });
                changed = true;
            }

            // Apply stroke width
            if ('strokeWidth' in activeObj && (activeObj as any).strokeWidth !== strokeWidth) {
                (activeObj as any).set('strokeWidth', strokeWidth);
                changed = true;
            }

            // Apply font size (Crucial Fix for IText)
            if (activeObj.type === 'text' || activeObj.type === 'i-text' || activeObj instanceof fabric.IText) {
                const textObj = activeObj as fabric.IText;
                if (textObj.fontSize !== fontSize) {
                    textObj.set('fontSize', fontSize);
                    // Force update for all characters to override any internal styles
                    textObj.setSelectionStyles({ fontSize: fontSize }, 0, (textObj.text || '').length);
                    changed = true;
                }
            }

            if (changed) {
                if ('setCoords' in activeObj) (activeObj as any).setCoords();
                fabricCanvas.renderAll();
                // Persist changes immediately (Throttle for performance)
                if (fabricCanvas === fabricCanvasRef.current) {
                    let multiplier = 1;
                    const bgImage = fabricCanvas.backgroundImage;
                    if (bgImage && bgImage instanceof fabric.Image && bgImage.width && bgImage.scaleX) {
                        multiplier = 1 / (bgImage.scaleX || 1);
                    }
                    const dataUrl = fabricCanvas.toDataURL({ format: 'png', quality: 1.0, multiplier: multiplier });
                    lastSavedUrl.current = dataUrl;
                    onUpdate(dataUrl);
                }
            }
        }

        fabricCanvas.requestRenderAll();

        // Update Object selectivity and track active state
        fabricCanvas.forEachObject((obj) => {
            const isActive = fabricCanvas.getActiveObject() === obj;
            // Tag object so we can find it even if it blurs due to toolbar click
            if (isActive) (obj as any)._lastIsActive = true;
            else delete (obj as any)._lastIsActive;

            obj.selectable = activeTool === 'select' || isActive;
            obj.evented = activeTool === 'select' || isActive;
        });

        // Add selection listeners to track active object
        const handleSelection = (e: any) => {
            fabricCanvas.getObjects().forEach(o => delete (o as any)._lastIsActive);
            if (e.target) (e.target as any)._lastIsActive = true;
        };

        fabricCanvas.on('selection:created', handleSelection);
        fabricCanvas.on('selection:updated', handleSelection);
        fabricCanvas.on('selection:cleared', () => {
            fabricCanvas.getObjects().forEach(o => delete (o as any)._lastIsActive);
        });

        // Bind Mouse Events for Tools
        const handleMouseDown = (opt: fabric.IEvent) => {
            if (activeTool === 'select') return;
            const pointer = fabricCanvas.getPointer(opt.e);
            handleAddObject(activeTool, pointer.x, pointer.y);
        };

        // We need to remove old listeners before adding new ones
        fabricCanvas.off('mouse:down');
        fabricCanvas.on('mouse:down', handleMouseDown);

        return () => {
            fabricCanvas.off('mouse:down', handleMouseDown);
        };

    }, [canvasId, activeTool, currentColor, strokeWidth, fontSize, stampCount]);

    const handleAddObject = (tool: ToolType, x: number, y: number) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas || !fabricCanvas.getElement()) return;

        let obj: fabric.Object | null = null;
        const commonProps: Partial<fabric.IObjectOptions> = {
            left: x,
            top: y,
            stroke: currentColor,
            strokeWidth: strokeWidth,
            strokeUniform: false, // CHANGED: Uniform stroke causes resize drift on export/import baking.
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            fill: 'transparent',
            cornerColor: '#9333ea', // Purple-600
            cornerStyle: 'circle' as 'circle',
            transparentCorners: false,
            borderColor: '#9333ea',
            cornerSize: 12, // Larger handles
            padding: 8
        };

        switch (tool) {
            case 'rect':
                obj = new fabric.Rect({ ...commonProps, width: 100, height: 60 });
                break;
            case 'ellipse':
                obj = new fabric.Ellipse({ ...commonProps, rx: 50, ry: 30 });
                break;
            case 'arrow':
                // Adjust arrow scale based on strokeWidth
                const arrowScale = strokeWidth / 3;
                obj = new fabric.Path(`M 0 0 L 80 0 M 80 0 L ${80 - 20 * arrowScale} ${-10 * arrowScale} M 80 0 L ${80 - 20 * arrowScale} ${10 * arrowScale}`, { ...commonProps, fill: 'transparent', objectCaching: false });
                break;
            case 'text':
                obj = new fabric.IText('テキスト', { ...commonProps, stroke: undefined, fill: currentColor, fontSize: fontSize, fontFamily: 'var(--font-jakarta), sans-serif' });
                break;
            case 'stamp':
                const circle = new fabric.Circle({ radius: 16, fill: currentColor, originX: 'center', originY: 'center', strokeWidth: 0, left: 0, top: 0 });
                const num = new fabric.Text(stampCount.toString(), { fontSize: 20, fill: '#ffffff', originX: 'center', originY: 'center', fontFamily: 'var(--font-jakarta), sans-serif', fontWeight: 'bold', strokeWidth: 0, left: 0, top: 1 });
                obj = new fabric.Group([circle, num], { ...commonProps, originX: 'center', originY: 'center' });
                onStampUsed();
                break;
            case 'highlight':
                obj = new fabric.Rect({ left: x, top: y, width: 150, height: 20, fill: currentColor, opacity: 0.35, rx: 4, ry: 4, strokeWidth: 0 });
                break;
            case 'blur':
                obj = new fabric.Rect({ left: x, top: y, width: 120, height: 40, fill: '#cbd5e1', rx: 2, ry: 2, strokeWidth: 0 });
                const blurLabel = new fabric.Text('ぼかし', { fontSize: 12, fill: '#64748b', originX: 'center', originY: 'center', fontFamily: 'var(--font-noto), sans-serif' });
                obj = new fabric.Group([obj, blurLabel], { left: x, top: y });
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

    // Handlers are now inside effects for better scope control
    // Keyboard Delete has been moved to the mount effect


    return (
        <div
            ref={containerRef}
            className="w-full relative group transition-all"
            style={{ minHeight: '300px', backgroundColor: '#ffffff' }}
        >
            {/* Canvas Artboard */}
            <div className="relative z-10 w-full shadow-2xl rounded-xl overflow-hidden bg-white ring-1 ring-slate-900/5 transition-all duration-300 group-hover:ring-indigo-500/30">
                <canvas ref={canvasRef} />
            </div>

            {/* Editing Grid Overlay (Subtle) */}
            <div className="absolute inset-0 pointer-events-none z-0 opacity-10 rounded-xl overflow-hidden">
                <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(#4f46e5 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
            </div>
        </div>
    );
}
