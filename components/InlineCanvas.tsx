'use client';

import { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { ToolType } from './EditorTypes';

interface InlineCanvasProps {
    canvasId: string; // Unique ID for persistence
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
    canvasId,
    imageUrl,
    activeTool,
    currentColor,
    strokeWidth,
    fontSize,
    stampCount,
    onUpdate,
    onStampUsed
}: InlineCanvasProps) {
    // ... existing refs ...
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isMounted = useRef(true);
    const initialLoadDone = useRef(false);
    const lastSavedUrl = useRef<string | null>(null);
    const [internalId, setInternalId] = useState(0); // Renamed to avoid confusion

    // ... prop refs ...
    const activeToolRef = useRef(activeTool);
    const currentColorRef = useRef(currentColor);
    const strokeWidthRef = useRef(strokeWidth);
    const fontSizeRef = useRef(fontSize);
    const stampCountRef = useRef(stampCount);

    useEffect(() => {
        activeToolRef.current = activeTool;
        currentColorRef.current = currentColor;
        strokeWidthRef.current = strokeWidth;
        fontSizeRef.current = fontSize;
        stampCountRef.current = stampCount;
    }, [activeTool, currentColor, strokeWidth, fontSize, stampCount]);

    // Initialize Canvas
    useEffect(() => {
        isMounted.current = true;
        if (!canvasRef.current || !containerRef.current) return;

        console.log(`[InlineCanvas] Initializing Fabric Canvas for ${canvasId}`);

        const newCanvas = new fabric.Canvas(canvasRef.current, {
            selection: activeTool === 'select',
            preserveObjectStacking: true,
            interactive: true,
            backgroundColor: '#ffffff',
            enableRetinaScaling: true,
            imageSmoothingEnabled: true
        });

        fabricCanvasRef.current = newCanvas;
        setInternalId(id => id + 1);

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
            try { newCanvas.dispose(); } catch (e) { }
            fabricCanvasRef.current = null;
        };
    }, []);

    const onUpdateRef = useRef(onUpdate);
    useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

    // Load Logic (Image + Persisted State)
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // SKIP if simply re-rendering with same image (avoid wipe)
        // BUT if we just initialized (initialLoadDone is false), we MUST load.
        if (lastSavedUrl.current === imageUrl && initialLoadDone.current) {
            return;
        }

        console.log(`[InlineCanvas] Loading content for ${canvasId}`);
        if (!canvas.getElement()) return; // Early exit if element missing

        canvas.clear();
        canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
        initialLoadDone.current = false;

        // 1. Load Background Image
        const loadBackground = () => new Promise<void>((resolve) => {
            fabric.Image.fromURL(imageUrl, (img) => {
                if (!isMounted.current || !canvas.getElement()) return resolve();
                if (!img) return resolve();

                try {
                    let containerWidth = containerRef.current?.getBoundingClientRect().width || 800;
                    if (containerWidth === 0) containerWidth = 800;
                    const originalWidth = img.width || 800;
                    const originalHeight = img.height || 600;

                    canvas.setDimensions({ width: originalWidth, height: originalHeight }, { cssOnly: false });

                    const displayScale = containerWidth / originalWidth;
                    const cssWidth = containerWidth;
                    const cssHeight = originalHeight * displayScale;

                    if (canvas.getElement().parentElement) {
                        canvas.getElement().parentElement!.style.width = `${cssWidth}px`;
                        canvas.getElement().parentElement!.style.height = `${cssHeight}px`;
                    }
                    canvas.getElement().style.width = `${cssWidth}px`;
                    canvas.getElement().style.height = `${cssHeight}px`;

                    img.set({
                        originX: 'left', originY: 'top', left: 0, top: 0,
                        scaleX: 1, scaleY: 1,
                        selectable: false, evented: false
                    });
                    canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
                    resolve();
                } catch (e) { resolve(); }
            }, { crossOrigin: 'anonymous' });
        });

        // 2. Load Persisted Objects
        const loadObjects = () => new Promise<void>((resolve) => {
            const savedState = localStorage.getItem(`am_canvas_state_${canvasId}`);
            if (savedState) {
                console.log(`[InlineCanvas] Restoring saved state for ${canvasId}`);
                canvas.loadFromJSON(savedState, () => {
                    // Re-apply critical properties after hydration
                    canvas.getObjects().forEach(obj => {
                        obj.set({
                            transparentCorners: false,
                            cornerColor: '#9333ea',
                            cornerStyle: 'circle',
                            borderColor: '#9333ea',
                            borderScaleFactor: 2,
                            cornerSize: 12,
                            padding: 8
                        });
                    });
                    resolve();
                });
            } else {
                resolve();
            }
        });

        // Execute Sequence
        loadBackground().then(() => loadObjects()).then(() => {
            if (!isMounted.current || !canvas.getElement()) return; // Added check
            initialLoadDone.current = true;
            lastSavedUrl.current = imageUrl;
            // Only render if needed
            if ((canvas as any).contextContainer) {
                canvas.requestRenderAll();
            }
        });

        // Save Handler
        const handleSave = () => {
            if (isMounted.current && canvas === fabricCanvasRef.current && initialLoadDone.current) {
                try {
                    // 1. Persist State (Objects only, no bg)
                    // We exclude background since we load it separately from URL
                    const json = canvas.toJSON(['selectable', 'evented', 'id']); // Include extra props if needed
                    // Manually remove background image from JSON to save space/complexity ? 
                    // No, `toJSON` includes it. But we want to restore objects.
                    // If we restore whole JSON, it overwrites background.
                    // That's fine, provided the background URL is valid.
                    // BUT `imageUrl` prop changes.
                    // Better to save OBJECTS only? 
                    // fabric.Canvas.toJSON includes 'objects'.
                    localStorage.setItem(`am_canvas_state_${canvasId}`, JSON.stringify(json));
                    console.log(`[InlineCanvas] Stat saved for ${canvasId}`);

                    // 2. Export Image
                    let multiplier = 1;
                    const bgImage = canvas.backgroundImage;
                    if (bgImage && bgImage instanceof fabric.Image) {
                        bgImage.set({ originX: 'left', originY: 'top', left: 0, top: 0 });
                        multiplier = 1 / (bgImage.scaleX || 1);
                    }
                    const dataUrl = canvas.toDataURL({
                        format: 'png', quality: 1.0, multiplier: multiplier, enableRetinaScaling: true
                    });

                    lastSavedUrl.current = dataUrl;
                    onUpdateRef.current(dataUrl);
                } catch (e) { }
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
    }, [imageUrl, canvasId]); // Re-run if ID changes

    // ... (rest of the component logic for tool switching and mouse events) ...


    // --- TOOL SWITCHING & OBJECT PROPERTY UPDATES ---
    useEffect(() => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;
        if (!fabricCanvas.getElement()) return;

        const isSelectMode = activeTool === 'select';
        console.log(`[InlineCanvas] Tool switched: ${activeTool} (Select Mode: ${isSelectMode})`);

        // 1. Set Canvas Modes
        fabricCanvas.selection = isSelectMode;
        fabricCanvas.defaultCursor = isSelectMode ? 'default' : 'crosshair';

        // 2. Clear selection if switching TO a drawing tool
        if (!isSelectMode) {
            fabricCanvas.discardActiveObject();
        }

        // 3. Update Properties of ALL objects
        const objects = fabricCanvas.getObjects();
        console.log(`[InlineCanvas] Updating ${objects.length} objects`);

        objects.forEach((obj) => {
            // Force selectable/evented based on tool
            obj.set({
                selectable: isSelectMode,
                evented: isSelectMode,
                // Also lock movement to be safe
                lockMovementX: !isSelectMode,
                lockMovementY: !isSelectMode,
                lockRotation: !isSelectMode,
                lockScalingX: !isSelectMode,
                lockScalingY: !isSelectMode,

                // Ensure UI looks good
                transparentCorners: false,
                cornerColor: '#9333ea',
                cornerStyle: 'circle',
                borderColor: '#9333ea',
                borderScaleFactor: 2,
                cornerSize: 12,
                padding: 8
            });
            obj.setCoords(); // CRITICAL
        });

        // 4. Update Properties of ACTIVE objects (e.g. style changes)
        // Only if we stay in select mode and just changed a property like color
        if (isSelectMode) {
            const activeObjs = fabricCanvas.getActiveObjects();
            let changed = false;

            activeObjs.forEach(activeObj => {
                if ('stroke' in activeObj && activeObj.stroke !== currentColor) {
                    activeObj.set('stroke', currentColor);
                    changed = true;
                }

                if (activeObj.type === 'text' || activeObj.type === 'i-text' || activeObj instanceof fabric.IText) {
                    const textObj = activeObj as fabric.IText;
                    if (textObj.fill !== currentColor) {
                        textObj.set('fill', currentColor);
                        if (textObj.text) textObj.setSelectionStyles({ fill: currentColor }, 0, textObj.text.length);
                        changed = true;
                    }
                    if (textObj.fontSize !== fontSize) {
                        textObj.set('fontSize', fontSize);
                        if (textObj.text) textObj.setSelectionStyles({ fontSize: fontSize }, 0, textObj.text.length);
                        changed = true;
                    }
                } else if (activeObj instanceof fabric.Group) {
                    // Simple group color assumption
                    activeObj.getObjects().forEach(o => {
                        if (o instanceof fabric.Circle) o.set('fill', currentColor);
                    });
                    changed = true;
                }

                if ('strokeWidth' in activeObj && (activeObj as any).strokeWidth !== strokeWidth) {
                    (activeObj as any).set('strokeWidth', strokeWidth);
                    changed = true;
                }
                activeObj.setCoords();
            });

            if (changed) {
                fabricCanvas.requestRenderAll();
                // Trigger save
            }
        }

        fabricCanvas.requestRenderAll();
        // Recalculate offset to ensure pointer events map correctly
        fabricCanvas.calcOffset();

    }, [activeTool, currentColor, strokeWidth, fontSize, stampCount]);

    // --- MOUSE EVENT BINDING ---
    useEffect(() => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas) return;

        const handleMouseDown = (opt: fabric.IEvent) => {
            const currentActiveTool = activeToolRef.current;
            if (currentActiveTool === 'select') return;

            // Prevent creation if clicking on an active object
            // Use precise target detection
            const target = opt.target;
            const activeObj = fabricCanvas.getActiveObject();

            // If we are clicking on the currently active object (allowing for transform), ignore draw
            if (activeObj && target === activeObj) {
                console.log('[InlineCanvas] Clicked active object, ignoring draw');
                return;
            }

            // Should also check if we clicked on ANY object if we want to be safe
            // But if objects are not evented (because tool != select), target will be null.
            // So this primarily catches the scenario where we Just Added an object (so it is active)
            // and we click it again.

            const pointer = fabricCanvas.getPointer(opt.e);
            handleAddObject(currentActiveTool, pointer.x, pointer.y);
        };

        console.log('[InlineCanvas] Binding mouse events');
        fabricCanvas.on('mouse:down', handleMouseDown);

        return () => {
            fabricCanvas.off('mouse:down', handleMouseDown);
        };
    }, [canvasId]);

    const handleAddObject = (tool: ToolType, x: number, y: number) => {
        const fabricCanvas = fabricCanvasRef.current;
        if (!fabricCanvas || !fabricCanvas.getElement()) return;

        console.log(`[InlineCanvas] Adding Object: ${tool} at ${x},${y}`);

        let obj: fabric.Object | null = null;
        const commonProps: Partial<fabric.IObjectOptions> = {
            left: x,
            top: y,
            stroke: currentColorRef.current,
            strokeWidth: strokeWidthRef.current,
            strokeUniform: false,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            fill: 'transparent',
            cornerColor: '#9333ea',
            cornerStyle: 'circle',
            transparentCorners: false,
            borderColor: '#9333ea',
            cornerSize: 12,
            padding: 8,
            // When created, it is active, so make it selectable?
            // Actually, better to keep it consistent with the TOOL.
            // If tool is rect, we probably want to manipulate it immediately (resize).
            // But if we do, we might trigger "Blocked drawing" on next click.
            selectable: true,
            evented: true
        };

        const curColor = currentColorRef.current;
        const curStroke = strokeWidthRef.current;
        const curFontSize = fontSizeRef.current;

        switch (tool) {
            case 'rect':
                obj = new fabric.Rect({ ...commonProps, width: 100, height: 60, stroke: curColor, strokeWidth: curStroke });
                break;
            case 'ellipse':
                obj = new fabric.Ellipse({ ...commonProps, rx: 50, ry: 30, stroke: curColor, strokeWidth: curStroke });
                break;
            case 'arrow':
                const arrowScale = curStroke / 3;
                obj = new fabric.Path(`M 0 0 L 80 0 M 80 0 L ${80 - 20 * arrowScale} ${-10 * arrowScale} M 80 0 L ${80 - 20 * arrowScale} ${10 * arrowScale}`, { ...commonProps, stroke: curColor, strokeWidth: curStroke, fill: 'transparent', objectCaching: false });
                break;
            case 'text':
                obj = new fabric.IText('テキスト', { ...commonProps, stroke: undefined, fill: curColor, fontSize: curFontSize, fontFamily: 'var(--font-jakarta), sans-serif' });
                break;
            case 'stamp':
                const circle = new fabric.Circle({ radius: 16, fill: curColor, originX: 'center', originY: 'center', strokeWidth: 0, left: 0, top: 0 });
                const num = new fabric.Text(stampCountRef.current.toString(), { fontSize: 20, fill: '#ffffff', originX: 'center', originY: 'center', fontFamily: 'Arial, sans-serif', fontWeight: 'bold', strokeWidth: 0, left: 0, top: 0 });
                obj = new fabric.Group([circle, num], { ...commonProps, originX: 'center', originY: 'center' });
                onStampUsed();
                break;
            case 'highlight':
                obj = new fabric.Rect({ ...commonProps, width: 150, height: 20, fill: curColor, opacity: 0.35, rx: 4, ry: 4, strokeWidth: 0 });
                break;
            case 'blur':
                obj = new fabric.Rect({ ...commonProps, width: 120, height: 40, fill: '#cbd5e1', rx: 2, ry: 2, strokeWidth: 0 });
                const blurLabel = new fabric.Text('ぼかし', { fontSize: 12, fill: '#64748b', originX: 'center', originY: 'center', fontFamily: 'var(--font-noto), sans-serif' });
                obj = new fabric.Group([obj, blurLabel], { ...commonProps });
                break;
        }

        if (obj) {
            fabricCanvas.add(obj);
            fabricCanvas.setActiveObject(obj);
            if (tool === 'text' && obj instanceof fabric.IText) {
                obj.enterEditing();
                obj.selectAll();
            }
            fabricCanvas.requestRenderAll();
        }
    };

    return (
        <div
            ref={containerRef}
            className="w-full relative group transition-all"
            style={{ minHeight: '300px', backgroundColor: '#ffffff' }}
        >
            <div className="relative z-10 w-full shadow-2xl rounded-xl overflow-hidden bg-white ring-1 ring-slate-900/5 transition-all duration-300 group-hover:ring-indigo-500/30">
                <canvas ref={canvasRef} />
            </div>

            <div className="absolute inset-0 pointer-events-none z-0 opacity-10 rounded-xl overflow-hidden">
                <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(#4f46e5 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }}></div>
            </div>
        </div>
    );
}
