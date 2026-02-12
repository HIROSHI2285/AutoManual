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
    onUpdate: (newImageUrl: string, newData?: any) => void;
    onStampUsed: () => void;
    onToolReset: () => void; // Callback to switch back to select mode
    initialData?: any; // Fabric.js JSON data
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
    onToolReset,
    initialData
}: InlineCanvasProps) {
    // ... existing refs ...
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isMounted = useRef(true);
    const initialLoadDone = useRef(false);
    const lastSavedUrl = useRef<string | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

    // FIX: Track Last Selected Text Object to handle focus loss (e.g. typing in toolbar input)
    const lastSelectedTextRef = useRef<fabric.Textbox | null>(null);

    // GUARD: Prevent feedback loops when updating canvas from props
    const isApplyingPropRef = useRef(false);

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

    // FIX 1: REMOVED REDUNDANT BRIDGE USE EFFECT (Lines 87-97 in original)

    // Callback for syncing toolbar from selection
    const syncToolbarFromSelection = useCallback((obj: fabric.Object) => {
        if (!obj || isUpdatingFromCanvas.current) return;

        isUpdatingFromCanvas.current = true;

        let color = '';
        let fs = 0;
        let sw = 0;

        if (obj.type === 'textbox' || obj instanceof fabric.Textbox || obj.type === 'text' || obj.type === 'i-text') {
            color = obj.fill as string;
            // Report raw fontSize only (scaleX/Y are always reset to 1 after any change).
            // Do NOT multiply by scale — that causes a feedback loop where
            // sync reports a different value → useEffect fires → sets again → sync...
            fs = (obj as fabric.Textbox).fontSize || 0;
        } else {
            color = obj.stroke as string;
            sw = obj.strokeWidth || 0;
        }

        if (color && color !== currentColorRef.current) onColorChangeRef.current(color);

        // GUARD: Only notify parent if we are NOT currently applying a prop update
        if (!isApplyingPropRef.current) {
            if (fs && Math.abs(fs - fontSizeRef.current) > 0.5) {
                console.log(`[InlineCanvas] SyncToolbar: Reporting fontSize ${Math.round(fs)} (was ${fontSizeRef.current})`);
                onFontSizeChangeRef.current(Math.round(fs));
            }
        } else {
            console.log(`[InlineCanvas] SyncToolbar: Skipped reporting fontSize ${Math.round(fs)} (Applying Props)`);
        }

        if (sw && sw !== strokeWidthRef.current) onStrokeWidthChangeRef.current(Math.round(sw));

        setTimeout(() => {
            isUpdatingFromCanvas.current = false;
        }, 50);
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
            try {
                // Use multiplier to match original resolution
                const zoom = newCanvas.getZoom();
                const multiplier = 1 / zoom;

                const dataUrl = newCanvas.toDataURL({
                    format: 'png',
                    quality: 1,
                    multiplier: multiplier
                });

                // FIXED: Export JSON data to prevent objects from disappearing on save/reload
                const json = newCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']);

                lastSavedUrl.current = dataUrl;
                if (onUpdateRef.current) onUpdateRef.current(dataUrl, json);
            } catch (e) {
                // Tainted canvas (cross-origin image) — export silently skipped
                console.warn('[InlineCanvas] Export skipped (tainted canvas):', (e as Error).message);
            }
        };

        const handleSelection = (e: any) => {
            const selected = e.selected?.[0] || e.target;
            if (selected) {
                // Update Last Selected Text Ref for fail-safe operations
                if (selected.type === 'textbox' || selected instanceof fabric.Textbox || selected.type === 'i-text' || (selected.type && selected.type.toLowerCase() === 'textbox')) {
                    lastSelectedTextRef.current = selected as fabric.Textbox;
                }
                syncToolbarFromSelection(selected);
            }
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

                        // ★ 追加：編集状態を考慮
                        const wasEditing = (textObj as any).isEditing;
                        if (wasEditing && typeof (textObj as any).exitEditing === 'function') {
                            (textObj as any).exitEditing();
                        }

                        textObj.set({
                            width: newWidth,
                            fontSize: newFontSize,
                            scaleX: 1,
                            scaleY: 1,
                            styles: {},
                            dirty: true,
                            objectCaching: false, // ★ 超重要
                        });

                        // ★ これが無いと文字は絶対に大きくならない
                        if (typeof (textObj as any).initDimensions === 'function') {
                            (textObj as any).initDimensions();
                        }

                        // Force cache clear
                        if (typeof (textObj as any)._clearCache === 'function') {
                            (textObj as any)._clearCache();
                        }

                        if (wasEditing && typeof (textObj as any).enterEditing === 'function') {
                            (textObj as any).enterEditing();
                        }
                    }
                    textObj.setCoords();
                    syncToolbarFromSelection(textObj);
                }
                // Auto-switch to select
                if (activeToolRef.current !== 'select') {
                    console.log('[InlineCanvas] Auto-switching to select mode');
                    onToolReset();
                }
            }
        };

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
                        objectCaching: false // CRITICAL: Disable caching to prevent editing glitches
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

                // CRITICAL FIX: Save state immediately after adding object
                // Without this, objects added but never moved/scaled would be lost
                // because object:modified only fires on user interaction
                const json = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
                history.current.push(json);
                redoStack.current = [];
                localStorage.setItem(`am_canvas_state_${canvasId}`, json);
                setTimeout(() => exportToParent(), 10);

                // Auto-switch to select
                if (activeToolRef.current !== 'select') {
                    console.log('[InlineCanvas] Auto-switching to select mode');
                    onToolReset();
                }
            }
        };

        const handleMouseDown = (opt: fabric.IEvent) => {
            // FIXED: Removed aggressive blur logic that was interfering with Text Editing focus.
            // We rely on handleKeyDown to distinguish between Toolbar Input and Canvas actions.

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
        newCanvas.on('text:changed', () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => exportToParent(), 500);
        });
        newCanvas.on('object:modified', () => {
            newCanvas.getObjects().forEach(o => o.setCoords());
            // Save state on modification
            if (!isRedoing.current) {
                const json = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
                history.current.push(json);
                redoStack.current = []; // Clear redo stack on new action

                // Persist to local storage
                localStorage.setItem(`am_canvas_state_${canvasId}`, json);

                // DEFER EXPORT: Prevent UI lag on modification drag end
                setTimeout(() => exportToParent(), 10);
            }
        });
        newCanvas.on('mouse:down', handleMouseDown);

        // --- HANDLERS (Defined inside effect to capture newCanvas) ---

        const handleCustomDelete = () => {
            const activeObjects = newCanvas.getActiveObjects();
            console.log(`[InlineCanvas] handleCustomDelete called. ActiveObjects: ${activeObjects.length}`);

            if (activeObjects.length) {
                newCanvas.discardActiveObject();
                activeObjects.forEach((obj) => {
                    newCanvas.remove(obj);
                });
                newCanvas.renderAll(); // Immediate visual update

                if (!isRedoing.current) {
                    const json = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
                    history.current.push(json);
                    redoStack.current = [];
                    localStorage.setItem(`am_canvas_state_${canvasId}`, json);

                    // DEFER EXPORT: Allow browser to paint the deletion first
                    setTimeout(() => exportToParent(), 10);
                }
            } else {
                // Fallback: Sometimes getActiveObjects returns empty but getActiveObject returns one?
                const activeObj = newCanvas.getActiveObject();
                if (activeObj) {
                    newCanvas.remove(activeObj);
                    newCanvas.discardActiveObject();
                    newCanvas.renderAll(); // Immediate visual update

                    if (!isRedoing.current) {
                        const json = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
                        history.current.push(json);
                        redoStack.current = [];
                        localStorage.setItem(`am_canvas_state_${canvasId}`, json);

                        // DEFER EXPORT: Allow browser to paint the deletion first
                        setTimeout(() => exportToParent(), 10);
                    }
                }
                // Silenced "No active objects" warning to prevent console spam from other canvas instances
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const activeObj = newCanvas.getActiveObject();

            // If a textbox is in editing mode, let ALL keys through to Fabric.js
            // so the user can freely type, delete, and use arrow keys.
            if (activeObj && (activeObj as any).isEditing) {
                // Only ensure focus stays on Fabric's hidden textarea
                if ((activeObj as any).hiddenTextarea) {
                    (activeObj as any).hiddenTextarea.focus();
                }
                return; // Let Fabric handle all keyboard input
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeElement = document.activeElement;
                const activeObj = newCanvas.getActiveObject();

                // Allow delete if:
                // 1. No active element (body focused)
                // 2. Active element is 'BODY'
                // 3. Active element is the canvas wrapper
                // 4. Active element is NOT an INPUT or TEXTAREA (unless it's Fabric's hidden textarea)

                const tagName = activeElement?.tagName || 'BODY';
                // CRITICAL FIX: Only block delete if user is typing in a REAL input/textarea OUTSIDE the canvas wrapper
                // Fabric.js uses hidden textarea inside the wrapper to handle input. We want to allow delete there.

                const isInsideCanvas = containerRef.current && activeElement && containerRef.current.contains(activeElement);

                // Logic: 
                // Block IF (Target is INPUT or TEXTAREA) AND (Target is NOT inside our canvas wrapper)
                // This correctly blocks sidebar inputs but allows Fabric's hidden input
                const isRealExternalInput = (tagName === 'INPUT' || tagName === 'TEXTAREA') && !isInsideCanvas;

                console.log(`[InlineCanvas] KeyDown Delete. ActiveElem: ${tagName}, InsideCanvas: ${isInsideCanvas}, Blocked: ${isRealExternalInput}`);

                if (!isRealExternalInput) {
                    e.preventDefault();
                    console.log('[InlineCanvas] Triggering Custom Delete');
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

        // DEFINITIVE FONT SIZE HANDLER — Directly operates on canvas (no React pipeline)
        // DEFINITIVE FONT SIZE HANDLER — Directly operates on canvas (no React pipeline)
        // DEFINITIVE FONT SIZE HANDLER — Directly operates on canvas (no React pipeline)
        const handleFontSizeEvent = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail || !detail.fontSize) return;
            const newFontSize = detail.fontSize;

            // USE REF TO ENSURE FRESH CANVAS INSTANCE
            const currentCanvas = fabricCanvasRef.current || newCanvas;
            if (!currentCanvas) return;

            let activeObj = currentCanvas.getActiveObject();

            // FALLBACK 1: Search manually for the object being edited.
            if (!activeObj) {
                const allObjs = currentCanvas.getObjects();
                activeObj = allObjs.find(o => (o as any).isEditing) || null;
                if (activeObj) console.log(`[InlineCanvas] am:fontsize — Found editing object via search`);
            }

            // FALLBACK 2: Last Selected Text Object (Focus Loss mitigation)
            if (!activeObj && lastSelectedTextRef.current) {
                const exists = currentCanvas.getObjects().includes(lastSelectedTextRef.current);
                if (exists) {
                    console.log(`[InlineCanvas] am:fontsize — Using Last Selected Object Fallback`);
                    activeObj = lastSelectedTextRef.current;
                }
            }

            if (!activeObj) {
                console.log(`[InlineCanvas] am:fontsize — No active object found`);
                return;
            }

            // COLLECT TARGETS: Handle Single Selection, Active Selection, or Fallback
            const targets: fabric.Textbox[] = [];

            if (activeObj.type === 'activeSelection' && (activeObj as any)._objects) {
                (activeObj as any)._objects.forEach((obj: fabric.Object) => {
                    if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text' ||
                        (obj.type && obj.type.toLowerCase() === 'textbox') ||
                        obj instanceof fabric.Textbox) {
                        targets.push(obj as fabric.Textbox);
                    }
                });
            } else {
                const isEditing = (activeObj as any).isEditing;
                const isText = isEditing ||
                    activeObj.type === 'textbox' || activeObj.type === 'i-text' || activeObj.type === 'text' ||
                    (activeObj.type && activeObj.type.toLowerCase() === 'textbox') ||
                    activeObj instanceof fabric.Textbox || activeObj instanceof fabric.IText;
                if (isText) targets.push(activeObj as fabric.Textbox);
            }

            if (targets.length === 0) {
                console.log(`[InlineCanvas] am:fontsize — No text targets found in selection`);
                return;
            }

            console.log(`[InlineCanvas] am:fontsize — APPLYING ${newFontSize} to ${targets.length} targets`);

            isApplyingPropRef.current = true;

            targets.forEach(textObj => {
                // 1. Exit Editing Mode safely
                const wasEditing = (textObj as any).isEditing;
                if (wasEditing && typeof (textObj as any).exitEditing === 'function') {
                    (textObj as any).exitEditing();
                    currentCanvas.setActiveObject(textObj); // RESTORE SELECTION to keep visual feedback
                }

                // 2. AGGRESSIVE STYLE CLEARING
                (textObj as any).styles = {};

                // 3. Set Properties
                textObj.set({
                    fontSize: newFontSize,
                    scaleX: 1,
                    scaleY: 1,
                    styles: {},
                    dirty: true,
                    objectCaching: false
                });

                // REMOVED SET TEXT HERE

                // 5. Force Dimension Recalculation
                if (typeof (textObj as any).initDimensions === 'function') {
                    (textObj as any).initDimensions();
                }

                // 6. Clear Cache
                if (typeof (textObj as any)._clearCache === 'function') {
                    (textObj as any)._clearCache();
                }

                textObj.setCoords();

                // 7. Restore Editing Mode (Delayed)
                if (wasEditing && typeof (textObj as any).enterEditing === 'function') {
                    requestAnimationFrame(() => {
                        if (!isMounted.current) return;
                        currentCanvas.setActiveObject(textObj);
                        (textObj as any).enterEditing();
                        currentCanvas.renderAll();
                    });
                }
            });

            // 8. ALWAYS Restore Selection (PowerPoint behavior) via activeObj
            if (activeObj) {
                currentCanvas.setActiveObject(activeObj);
            }

            // 9. Render Immediate
            currentCanvas.renderAll();

            // 10. Save State
            const json = JSON.stringify(currentCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
            history.current.push(json);
            redoStack.current = [];
            localStorage.setItem(`am_canvas_state_${canvasId}`, json);
            setTimeout(() => exportToParent(), 10);

            console.log(`[InlineCanvas] am:fontsize — DONE.`);

            setTimeout(() => { isApplyingPropRef.current = false; }, 150);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('am:delete', handleCustomDelete);
        window.addEventListener('am:undo', handleUndoCtx);
        window.addEventListener('am:redo', handleRedoCtx);
        window.addEventListener('am:fontsize', handleFontSizeEvent);

        // Force-save handler: called before delete to ensure all canvases export their state
        const handleForceSave = () => {
            console.log(`[InlineCanvas] am:force-save — exporting ${canvasId}`);
            exportToParent();
        };
        window.addEventListener('am:force-save', handleForceSave);


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
                    // PRIORITIZE PROPS DATA (Re-Editing)
                    if (initialData && typeof initialData === 'object') {
                        console.log('[InlineCanvas] Loading persisted JSON data...', initialData);

                        // Sanitize background from JSON to prevent double-bg
                        if (initialData.backgroundImage) delete initialData.backgroundImage;

                        newCanvas.loadFromJSON(initialData, () => {
                            newCanvas.getObjects().forEach(obj => {
                                // Re-apply critical properties that might be lost or need defaults
                                obj.set({
                                    transparentCorners: false,
                                    cornerColor: '#ffffff',
                                    cornerStrokeColor: '#9333ea',
                                    cornerStyle: 'circle',
                                    borderColor: '#9333ea',
                                    borderScaleFactor: 2 / zoomLevel,
                                    cornerSize: 12 / zoomLevel,
                                    padding: 8 / zoomLevel,
                                    hasControls: true,
                                    selectable: true,
                                    evented: true
                                });
                                if (obj.type === 'textbox') {
                                    obj.set({
                                        lockScalingY: false,
                                        editable: true,
                                        objectCaching: false // Fix "Only append" issue by forcing re-render
                                    } as any);
                                }
                                obj.setCoords();
                            });
                            newCanvas.renderAll();

                            // Reset History
                            const initialState = JSON.stringify(newCanvas.toJSON(['selectable', 'evented', 'id']));
                            history.current = [initialState];
                            initialLoadDone.current = true;
                            lastSavedUrl.current = imageUrl;
                        });
                    } else {
                        // FALLBACK: LocalStorage (Auto-Recovery)
                        const savedState = localStorage.getItem(`am_canvas_state_${canvasId}`);
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
                    }
                }, { crossOrigin: 'anonymous' });
            });
        };

        loadContent();

        // 5. Cleanup
        return () => {
            isMounted.current = false;
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('am:delete', handleCustomDelete);
            window.removeEventListener('am:undo', handleUndoCtx);
            window.removeEventListener('am:redo', handleRedoCtx);
            window.removeEventListener('am:fontsize', handleFontSizeEvent);
            window.removeEventListener('am:force-save', handleForceSave);
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

        // GUARD: If we are currently syncing FROM the canvas, skip bulk object updates
        // but ALWAYS allow font size updates on the active object (PowerPoint behavior)
        const skipBulkUpdates = isUpdatingFromCanvas.current;

        // 3. Update Properties of ALL objects (skipped during canvas-initiated sync)
        const objects = fabricCanvas.getObjects();
        const currentZoom = fabricCanvas.getZoom();
        const screenCornerSize = 12 / currentZoom;
        const screenPadding = 8 / currentZoom;
        const adaptiveStroke = strokeWidth / currentZoom;

        if (!skipBulkUpdates) {
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
        }

        // 4. Update Properties of ACTIVE objects (e.g. style changes)
        // Only if we stay in select mode and just changed a property like color
        if (isSelectMode) {
            // getActiveObjects()だけでなく、編集中のオブジェクトも取得する
            let activeObjs = fabricCanvas.getActiveObjects();

            // ★ 修正: 編集モード中のオブジェクトを fallback で取得
            if (activeObjs.length === 0) {
                const editingObj = fabricCanvas.getActiveObject();
                if (editingObj && (editingObj as any).isEditing) {
                    activeObjs = [editingObj];
                }
            }

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

                    // REMOVED REDUNDANT FONT SIZE LOGIC HERE

                }

                if ('strokeWidth' in activeObj && (activeObj as any).strokeWidth !== strokeWidthRef.current) {
                    (activeObj as any).set('strokeWidth', strokeWidthRef.current);
                    changed = true;
                }
                activeObj.setCoords();
            });

            if (changed) {
                fabricCanvas.renderAll();
                // Fire modified synchronously to ensure history is updated immediately 
                // and avoid async race conditions with syncToolbar
                fabricCanvas.fire('object:modified');
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
