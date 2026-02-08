'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { ToolType } from './EditorTypes';

interface InlineCanvasProps {
    canvasId: string; // Unique ID for persistence
    imageUrl: string;
    activeTool: ToolType;
    currentColor: string;
    onColorChange: (color: string) => void;
    strokeWidth: number;
    onStrokeWidthChange: (width: number) => void;
    fontSize: number;
    onFontSizeChange: (size: number) => void;
    stampCount: number;
    onUpdate: (newImageUrl: string) => void;
    onStampUsed: () => void;
    onToolReset: () => void; // Callback to switch back to select mode
}

export default function InlineCanvas({
    canvasId,
    imageUrl,
    activeTool,
    currentColor,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    fontSize,
    onFontSizeChange,
    stampCount,
    onUpdate,
    onStampUsed,
    onToolReset
}: InlineCanvasProps) {
    // ... existing refs ...
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isMounted = useRef(true);
    const initialLoadDone = useRef(false);
    const lastSavedUrl = useRef<string | null>(null);
    const [internalId, setInternalId] = useState(0); // Renamed to avoid confusion

    // Prop Refs for Async Access
    const activeToolRef = useRef(activeTool);
    const currentColorRef = useRef(currentColor);
    const strokeWidthRef = useRef(strokeWidth);
    const fontSizeRef = useRef(fontSize);
    const stampCountRef = useRef(stampCount);
    const onUpdateRef = useRef(onUpdate);
    const onColorChangeRef = useRef(onColorChange);
    const onStrokeWidthChangeRef = useRef(onStrokeWidthChange);
    const onFontSizeChangeRef = useRef(onFontSizeChange);

    // Undo History
    const history = useRef<string[]>([]);
    const redoStack = useRef<string[]>([]);
    const isRedoing = useRef(false);

    // UX Protection: Prevent "Selection -> Toolbar -> Selection" feedback loops
    const isUpdatingFromCanvas = useRef(false);

    useEffect(() => {
        activeToolRef.current = activeTool;
        currentColorRef.current = currentColor;
        strokeWidthRef.current = strokeWidth;
        fontSizeRef.current = fontSize;
        stampCountRef.current = stampCount;
        onUpdateRef.current = onUpdate; // Update ref for onUpdate
        onColorChangeRef.current = onColorChange;
        onStrokeWidthChangeRef.current = onStrokeWidthChange;
        onFontSizeChangeRef.current = onFontSizeChange;
    }, [activeTool, currentColor, strokeWidth, fontSize, stampCount, onUpdate, onColorChange, onStrokeWidthChange, onFontSizeChange]);

    // Callback for syncing toolbar from selection
    const syncToolbarFromSelection = useCallback((obj: fabric.Object) => {
        if (!obj || isUpdatingFromCanvas.current) return;

        isUpdatingFromCanvas.current = true;

        let color = '';
        let fs = 0;
        let sw = 0;

        if (obj.type === 'textbox' || obj instanceof fabric.Textbox || obj.type === 'text' || obj.type === 'i-text') {
            color = obj.fill as string;
            // PowerPoint-like: Sync VISUAL font size (fontSize * scale)
            // This is critical because our update logic resets scale to 1.
            // If we don't sync this, "40px * 2 (Visual 80)" shows as "40".
            // User changing 40 -> 80 would do nothing (80 * 1 = Visual 80).
            const scale = (obj as fabric.Textbox).scaleY || 1;
            fs = ((obj as fabric.Textbox).fontSize || 0) * scale;
        } else {
            color = obj.stroke as string;
            sw = obj.strokeWidth || 0;
        }

        if (color && color !== currentColorRef.current) onColorChangeRef.current(color);
        if (fs && fs !== fontSizeRef.current) onFontSizeChangeRef.current(Math.round(fs));
        if (sw && sw !== strokeWidthRef.current) onStrokeWidthChangeRef.current(Math.round(sw));

        setTimeout(() => {
            isUpdatingFromCanvas.current = false;
        }, 100);
    }, []); // No dependencies as it uses refs for props

    // Initialize Canvas
    // --- MAIN INITIALIZATION EFFECT ---
    useEffect(() => {
        isMounted.current = true;
        if (!canvasRef.current || !containerRef.current) return;

        console.log(`[InlineCanvas] Initializing Fabric Canvas for ${canvasId}`);

        // 1. Initialize Canvas
        const newCanvas = new fabric.Canvas(canvasRef.current, {
            selection: activeToolRef.current === 'select',
            preserveObjectStacking: true,
            interactive: true,
            backgroundColor: '#ffffff',
            enableRetinaScaling: true,
            imageSmoothingEnabled: true
        });

        fabricCanvasRef.current = newCanvas;
        setInternalId(id => id + 1);

        // 2. Define Handlers INSIDE Effect to capture 'newCanvas' instance
        //    (or use refs, but inside here is cleaner for 'newCanvas' usage)

        // Helper to export canvas and notify parent (Defined early for usage in handlers)
        const exportToParent = () => {
            if (!newCanvas) return;
            // Use multiplier to match original resolution
            const zoom = newCanvas.getZoom();
            const multiplier = 1 / zoom;

            const dataUrl = newCanvas.toDataURL({
                format: 'png',
                quality: 1,
                multiplier: multiplier
            });

            lastSavedUrl.current = dataUrl;
            if (onUpdateRef.current) onUpdateRef.current(dataUrl);
        };

        const handleSelection = (e: any) => {
            const selected = e.selected?.[0] || e.target;
            if (selected) syncToolbarFromSelection(selected);
        };

        const handleScaling = (e: any) => {
            const obj = e.target;
            if (!obj) return;

            // POWERPOINT BEHAVIOR: Corner drag changes font size/width to match scale
            if (obj.type === 'textbox' || obj instanceof fabric.Textbox) {
                const textObj = obj as fabric.Textbox;
                const scaleX = textObj.scaleX || 1;
                const scaleY = textObj.scaleY || 1;
                const corner = (e as any).transform?.corner;

                if (scaleX !== 1 || scaleY !== 1) {
                    if (corner === 'ml' || corner === 'mr') {
                        // Side handles -> Width changes only
                        const newWidth = textObj.width! * scaleX;
                        textObj.set({
                            width: Math.max(1, newWidth),
                            scaleX: 1,
                            scaleY: 1
                        });
                    } else {
                        // Corner handles -> Font size scaling
                        const maxScale = Math.max(scaleX, scaleY);
                        const newFontSize = textObj.fontSize! * maxScale;
                        const newWidth = textObj.width! * maxScale;

                        textObj.set({
                            width: newWidth,
                            fontSize: newFontSize,
                            scaleX: 1,
                            scaleY: 1,
                            styles: {}
                        });
                    }
                    textObj.setCoords();
                    syncToolbarFromSelection(textObj);
                }
            }
            // Auto-switch to select
            if (activeToolRef.current !== 'select') {
                console.log('[InlineCanvas] Auto-switching to select mode');
                onToolReset();
            }
        }

        const handleAddObject = (tool: ToolType, x: number, y: number) => {
            console.log(`[InlineCanvas] Adding Object: ${tool} at ${x},${y}`);

            let obj: fabric.Object | null = null;

            const currentZoom = newCanvas.getZoom();
            const adaptiveCornerSize = 12 / currentZoom;
            const adaptivePadding = 8 / currentZoom;
            const adaptiveStroke = strokeWidthRef.current;
            const adaptiveFontSize = fontSizeRef.current;

            const commonProps: any = {
                left: x,
                top: y,
                stroke: currentColorRef.current,
                strokeWidth: adaptiveStroke,
                strokeUniform: true, // IMPORTANT: Maintain visual stroke regardless of scaling
                strokeLineCap: 'round',
                strokeLineJoin: 'round',
                fill: 'transparent',
                cornerColor: '#ffffff',
                cornerStrokeColor: '#9333ea',
                cornerStyle: 'circle',
                transparentCorners: false,
                borderColor: '#9333ea',
                cornerSize: adaptiveCornerSize,
                touchCornerSize: 36 / currentZoom,
                padding: adaptivePadding,
                selectable: true,
                evented: true
            };

            const curColor = currentColorRef.current;

            switch (tool) {
                case 'rect':
                    obj = new fabric.Rect({ ...commonProps, width: 100, height: 60, stroke: curColor });
                    break;
                case 'ellipse':
                    obj = new fabric.Ellipse({ ...commonProps, rx: 50, ry: 30, stroke: curColor });
                    break;
                case 'arrow':
                    const arrowLen = 80;
                    const arrowHead = 20;
                    const arrowW = 10;
                    obj = new fabric.Path(`M 0 0 L ${arrowLen} 0 M ${arrowLen} 0 L ${arrowLen - arrowHead} ${-arrowW} M ${arrowLen} 0 L ${arrowLen - arrowHead} ${arrowW}`, {
                        ...commonProps,
                        stroke: curColor,
                        fill: 'transparent',
                        objectCaching: false
                    });
                    break;
                case 'text':
                    // Initial Text Creation - Default to current FontSize ref
                    obj = new fabric.Textbox('ここにテキストを入力', {
                        ...commonProps,
                        stroke: undefined,
                        fill: curColor,
                        fontSize: adaptiveFontSize,
                        fontFamily: 'var(--font-jakarta), sans-serif',
                        width: 250,
                        splitByGrapheme: true
                    });
                    break;
                case 'stamp':
                    const radius = 20;
                    const circle = new fabric.Circle({ radius: radius, fill: curColor, originX: 'center', originY: 'center', strokeWidth: 0, left: 0, top: 0 });
                    const num = new fabric.Text(stampCountRef.current.toString(), { fontSize: 24, fill: '#ffffff', originX: 'center', originY: 'center', fontFamily: 'Arial, sans-serif', fontWeight: 'bold', strokeWidth: 0, left: 0, top: 0 });
                    obj = new fabric.Group([circle, num], { ...commonProps, originX: 'center', originY: 'center' });
                    onStampUsed();
                    break;
                case 'highlight':
                    obj = new fabric.Rect({ ...commonProps, width: 200, height: 40, fill: curColor, opacity: 0.35, rx: 4, ry: 4, strokeWidth: 0 });
                    break;
                case 'blur':
                    const br = new fabric.Rect({ ...commonProps, width: 120, height: 40, fill: '#cbd5e1', rx: 2, ry: 2, strokeWidth: 0 });
                    const blurLabel = new fabric.Text('ぼかし', { fontSize: 16, fill: '#64748b', originX: 'center', originY: 'center', fontFamily: 'var(--font-noto), sans-serif' });
                    obj = new fabric.Group([br, blurLabel], { ...commonProps });
                    break;
            }

            if (obj) {
                newCanvas.add(obj);
                newCanvas.setActiveObject(obj);
                if (tool === 'text' && obj instanceof fabric.IText) {
                    obj.enterEditing();
                    obj.selectAll();
                }
                newCanvas.requestRenderAll();

                // Auto-switch to select
                if (activeToolRef.current !== 'select') {
                    console.log('[InlineCanvas] Auto-switching to select mode');
                    onToolReset();
                }
            }
        };

        const handleMouseDown = (opt: fabric.IEvent) => {
            // CRITICAL FIX: Force blur on any inputs when interacting with canvas
            // This ensures "Delete" key works (otherwise input keeps focus and traps the key)
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }

            const currentActiveTool = activeToolRef.current;
            if (currentActiveTool === 'select') return;

            const target = opt.target;
            const activeObj = newCanvas.getActiveObject();

            if (activeObj && target === activeObj) return;

            const pointer = newCanvas.getPointer(opt.e);
            handleAddObject(currentActiveTool, pointer.x, pointer.y);
        };

        // 3. Bind Events
        newCanvas.on('selection:created', handleSelection);
        newCanvas.on('selection:updated', handleSelection);
        newCanvas.on('object:scaling', handleScaling);
        newCanvas.on('object:modified', () => {
            newCanvas.getObjects().forEach(o => o.setCoords());
            // Save state on modification
            if (!isRedoing.current) {
                const json = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
                history.current.push(json);
                redoStack.current = []; // Clear redo stack on new action

                exportToParent(); // Export!

                // Persist to local storage
                localStorage.setItem(`am_canvas_state_${canvasId}`, json);
            }
        });
        newCanvas.on('mouse:down', handleMouseDown);

        // --- HANDLERS (Defined inside effect to capture newCanvas) ---

        const handleCustomDelete = () => {
            const activeObjects = newCanvas.getActiveObjects();
            if (activeObjects.length) {
                newCanvas.discardActiveObject();
                activeObjects.forEach((obj) => {
                    newCanvas.remove(obj);
                });
                newCanvas.requestRenderAll();

                if (!isRedoing.current) {
                    const json = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
                    history.current.push(json);
                    redoStack.current = [];
                    localStorage.setItem(`am_canvas_state_${canvasId}`, json);
                    exportToParent(); // Export!
                }
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeObj = newCanvas.getActiveObject();
                // If editing text (typing inside), let default behavior happen (delete character)
                if (activeObj && (activeObj as any).isEditing) return;

                const activeElement = document.activeElement;
                // Only block if the user is typing in a real INPUT field (Toolbar)
                // Fabric.js uses a hidden TEXTAREA for handling keyboard events.
                // If we block all TEXTAREAs, we block Fabric's key handling when it has focus (even if not editing).
                // But valid deletion should work if we are not editing.
                const isRealInput = activeElement instanceof HTMLInputElement;

                if (!isRealInput) {
                    handleCustomDelete();
                }
            }
        };

        const handleUndoCtx = () => {
            if (history.current.length > 1) {
                isRedoing.current = true;
                const current = history.current.pop();
                if (current) redoStack.current.push(current);

                const prev = history.current[history.current.length - 1];
                if (prev) {
                    newCanvas.loadFromJSON(JSON.parse(prev), () => {
                        // Re-apply visual properties
                        const currentZoom = newCanvas.getZoom();
                        newCanvas.getObjects().forEach(obj => {
                            obj.set({
                                transparentCorners: false,
                                cornerColor: '#ffffff',
                                cornerStrokeColor: '#9333ea',
                                cornerStyle: 'circle',
                                borderColor: '#9333ea',
                                borderScaleFactor: 2 / currentZoom,
                                cornerSize: 12 / currentZoom,
                                padding: 8 / currentZoom
                            });
                            if (obj.type === 'textbox') obj.set({ lockScalingY: false, hasControls: true });
                            obj.setCoords();
                        });
                        newCanvas.renderAll();
                        isRedoing.current = false;
                        exportToParent(); // Export!
                    });
                } else {
                    isRedoing.current = false;
                }
            }
        };

        const handleRedoCtx = () => {
            if (redoStack.current.length > 0) {
                isRedoing.current = true;
                const next = redoStack.current.pop();
                if (next) {
                    history.current.push(next);
                    newCanvas.loadFromJSON(JSON.parse(next), () => {
                        const currentZoom = newCanvas.getZoom();
                        newCanvas.getObjects().forEach(obj => {
                            obj.set({
                                transparentCorners: false,
                                cornerColor: '#ffffff',
                                cornerStrokeColor: '#9333ea',
                                cornerStyle: 'circle',
                                borderColor: '#9333ea',
                                borderScaleFactor: 2 / currentZoom,
                                cornerSize: 12 / currentZoom,
                                padding: 8 / currentZoom
                            });
                            if (obj.type === 'textbox') obj.set({ lockScalingY: false, hasControls: true });
                            obj.setCoords();
                        });
                        newCanvas.renderAll();
                        isRedoing.current = false;
                        exportToParent(); // Export!
                    });
                } else {
                    isRedoing.current = false;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('am:delete', handleCustomDelete);
        window.addEventListener('am:undo', handleUndoCtx);
        window.addEventListener('am:redo', handleRedoCtx);


        // 4. Load Initial Content
        const loadContent = () => {
            if (!isMounted.current || !newCanvas.getElement()) return;

            console.log(`[InlineCanvas] Loading content for ${canvasId}`);
            newCanvas.clear();
            newCanvas.setBackgroundColor('#ffffff', () => { });
            initialLoadDone.current = false;

            fabric.Image.fromURL(imageUrl, (img) => {
                if (!isMounted.current || !newCanvas.getElement()) return;
                if (!img) return;

                const originalWidth = img.width || 800;
                const originalHeight = img.height || 600;

                newCanvas.setWidth(originalWidth);
                newCanvas.setHeight(originalHeight);

                let containerWidth = containerRef.current?.getBoundingClientRect().width || 800;
                if (containerWidth === 0) containerWidth = 800;
                const zoomLevel = containerWidth / originalWidth;

                newCanvas.setDimensions({
                    width: containerWidth,
                    height: originalHeight * zoomLevel
                }, { backstoreOnly: false });

                newCanvas.setZoom(zoomLevel);

                // Background Setup
                img.set({
                    originX: 'left', originY: 'top', left: 0, top: 0,
                    scaleX: 1, scaleY: 1,
                    selectable: false, evented: false
                });

                newCanvas.setBackgroundImage(img, () => {
                    const savedState = localStorage.getItem(`am_canvas_state_${canvasId}`);
                    // Only restore state if it exists
                    if (savedState && savedState !== 'undefined' && savedState !== 'null' && savedState !== '{}') {
                        try {
                            const json = JSON.parse(savedState);
                            if (json.objects) {
                                fabric.util.enlivenObjects(json.objects, (enlivened: fabric.Object[]) => {
                                    enlivened.forEach((obj) => {
                                        newCanvas.add(obj);
                                        // Re-apply custom properties
                                        obj.set({
                                            transparentCorners: false,
                                            cornerColor: '#ffffff',
                                            cornerStrokeColor: '#9333ea',
                                            cornerStyle: 'circle',
                                            borderColor: '#9333ea',
                                            borderScaleFactor: 2 / zoomLevel,
                                            cornerSize: 12 / zoomLevel,
                                            padding: 8 / zoomLevel
                                        });
                                        if (obj.type === 'textbox') obj.set({ lockScalingY: false, hasControls: true });
                                        obj.setCoords();
                                    });
                                    newCanvas.renderAll();
                                    // Initial history push
                                    const initialState = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id']));
                                    history.current = [initialState];
                                    initialLoadDone.current = true;
                                    lastSavedUrl.current = imageUrl;
                                }, 'fabric');
                            }
                        } catch (e) {
                            console.error('Failed to restore', e);
                            initialLoadDone.current = true;
                        }
                    } else {
                        // No saved state, just init history
                        const initialState = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id']));
                        history.current = [initialState];
                        initialLoadDone.current = true;
                        lastSavedUrl.current = imageUrl;
                    }
                });
            }, { crossOrigin: 'anonymous' });
        };

        loadContent();

        // 5. Cleanup
        return () => {
            isMounted.current = false;
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('am:delete', handleCustomDelete);
            window.removeEventListener('am:undo', handleUndoCtx);
            window.removeEventListener('am:redo', handleRedoCtx);
            newCanvas.dispose();
        };
    }, [canvasId, imageUrl]); // Re-init if ID or base Image changes

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

        // GUARD: If we are currently syncing FROM the canvas, don't push back to it
        if (isUpdatingFromCanvas.current) return;

        // 3. Update Properties of ALL objects
        const objects = fabricCanvas.getObjects();
        const currentZoom = fabricCanvas.getZoom();
        const screenCornerSize = 12 / currentZoom;
        const screenPadding = 8 / currentZoom;
        const adaptiveStroke = strokeWidth / currentZoom;

        objects.forEach((obj) => {
            const shouldLock = !isSelectMode;

            // Textbox specific controls (8-point)
            if (obj.type === 'textbox') {
                obj.set({
                    lockScalingY: false, // Allow vertical stretch for Powerpoint feel
                    hasControls: true
                });
            }

            obj.set({
                selectable: isSelectMode,
                evented: isSelectMode,
                lockMovementX: shouldLock,
                lockMovementY: shouldLock,
                lockRotation: shouldLock,
                lockScalingX: shouldLock,
                lockScalingY: shouldLock,

                transparentCorners: false,
                borderColor: '#9333ea',
                borderScaleFactor: 2 / currentZoom,
                cornerSize: screenCornerSize,
                padding: screenPadding,
                cornerStyle: 'circle',
                cornerColor: '#ffffff', // PPT style: white circle with border
                cornerStrokeColor: '#9333ea'
            });
            // Hit area expansion (if supported by version, else fallback)
            (obj as any).touchCornerSize = 36 / currentZoom;

            obj.setCoords();
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

                if (activeObj.type === 'text' || activeObj.type === 'i-text' || activeObj.type === 'textbox' || activeObj instanceof fabric.IText || activeObj instanceof fabric.Textbox) {
                    const textObj = activeObj as fabric.Textbox;
                    if (textObj.fill !== currentColor) {
                        textObj.set('fill', currentColor);
                        if (textObj.text) {
                            textObj.setSelectionStyles({ fill: currentColor }); // Apply to selection if any
                            // Also aggressively apply to ALL textStyles to override individual colors
                            if (textObj.styles) {
                                textObj.styles = {};
                            }
                        }
                        changed = true;
                    }

                    // --- ROBUST FONT SIZE SCALING (PowerPoint Style) ---
                    // UNCONDITIONAL UPDATE: If this code runs, it means the user updated the toolbar.
                    // We enforce this value to ensure Visual Size == Prop Size.

                    const currentScaleY = textObj.scaleY || 1;
                    const visualFontSize = (textObj.fontSize || 0) * currentScaleY;

                    // Calculate Ratio (New / Old) to scale width proportionally
                    // This ensures the "Text Box" grows with the text, preventing aggressive wrapping.
                    const scaleFactor = visualFontSize > 0 ? (fontSize / visualFontSize) : 1;

                    const currentScaleX = textObj.scaleX || 1;
                    const currentWidth = textObj.width || 0;
                    const visualWidth = currentWidth * currentScaleX;

                    // New width should be scaled proportionally
                    const newWidth = visualWidth * scaleFactor;

                    // 1. Bake the Scale (Reset to 1, apply NEW scaled dimensions)
                    textObj.set({
                        fontSize: fontSize, // Apply target font size
                        scaleX: 1,
                        scaleY: 1,
                        width: newWidth,    // Apply scaled width
                        styles: {}          // Wipe character styles
                    });

                    // 2. Clear Internal Caches
                    if (textObj instanceof fabric.Textbox) {
                        textObj.cleanStyle('fontSize');
                        if (typeof (textObj as any).initDimensions === 'function') {
                            (textObj as any).initDimensions();
                        }
                    }

                    // 3. Force Update
                    textObj.setCoords();
                    textObj.dirty = true;
                    changed = true;

                    requestAnimationFrame(() => {
                        fabricCanvas.requestRenderAll();
                    });
                }

                if ('strokeWidth' in activeObj && (activeObj as any).strokeWidth !== strokeWidthRef.current) {
                    (activeObj as any).set('strokeWidth', strokeWidthRef.current);
                    changed = true;
                }
                activeObj.setCoords();
            });

            if (changed) {
                fabricCanvas.requestRenderAll();
                setTimeout(() => {
                    fabricCanvas.fire('object:modified');
                }, 50);
            }
        }

        fabricCanvas.requestRenderAll();
        // Recalculate offset to ensure pointer events map correctly
        fabricCanvas.calcOffset();

    }, [activeTool, currentColor, strokeWidth, fontSize, stampCount]);

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
