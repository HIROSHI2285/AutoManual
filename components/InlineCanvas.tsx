'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, Rect, Ellipse, Path, Textbox, Circle, Group, FabricImage, FabricText, Point } from 'fabric';
import { ToolType, StrokeStyle } from '@/components/EditorTypes';

interface InlineCanvasProps {
    canvasId: string;
    imageUrl: string;
    activeTool: ToolType;
    currentColor: string;
    onColorChange: (color: string) => void;
    strokeWidth: number;
    onStrokeWidthChange: (width: number) => void;
    strokeStyle: StrokeStyle;
    onStrokeStyleChange: (style: StrokeStyle) => void;
    fontSize: number;
    onFontSizeChange: (size: number) => void;
    stampCount: number;
    onUpdate: (newImageUrl: string, newData?: any) => void;
    onStampUsed: () => void;
    onToolReset: () => void;
    initialData?: any;
    compact?: boolean;
    isPortrait?: boolean;
}

export default function InlineCanvas({
    canvasId,
    imageUrl,
    activeTool,
    currentColor,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    strokeStyle,
    onStrokeStyleChange,
    fontSize,
    onFontSizeChange,
    stampCount,
    onUpdate,
    onStampUsed,
    onToolReset,
    initialData,
    compact,
    isPortrait
}: InlineCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Fabric 6.x: Canvas 型
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const isMounted = useRef(true);
    const lastSavedUrl = useRef<string | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSelectedTextRef = useRef<Textbox | null>(null);
    const [, setTick] = useState(0);
    const [compactScale, setCompactScale] = useState(1);
    // Lazy initialization: Fabric.js Canvas is only created when this step enters the viewport
    const [isCanvasReady, setIsCanvasReady] = useState(false);

    // Zoom & Pan state
    const baseFitZoomRef = useRef(1);   // zoom set during loadContent to fit image
    const [userZoom, setUserZoom] = useState(1);   // additional user zoom on top of baseFit
    const isPanningRef = useRef(false);
    const lastPanPointRef = useRef<{ x: number; y: number } | null>(null);
    const spaceHeldRef = useRef(false);

    const activeToolRef = useRef(activeTool);
    const currentColorRef = useRef(currentColor);
    const strokeWidthRef = useRef(strokeWidth);
    const strokeStyleRef = useRef(strokeStyle);
    const fontSizeRef = useRef(fontSize);
    const stampCountRef = useRef(stampCount);
    const onUpdateRef = useRef(onUpdate);
    const onColorChangeRef = useRef(onColorChange);
    const onStrokeWidthChangeRef = useRef(onStrokeWidthChange);
    const onStrokeStyleChangeRef = useRef(onStrokeStyleChange);
    const onFontSizeChangeRef = useRef(onFontSizeChange);
    const isApplyingPropRef = useRef(false);
    const isUpdatingFromCanvas = useRef(false);

    const history = useRef<string[]>([]);
    const redoStack = useRef<string[]>([]);
    const isRedoing = useRef(false);

    // Expose internal functions to other effects
    const saveStateRef = useRef<(c?: Canvas) => void>(() => { });
    const exportToParentRef = useRef<() => void>(() => { });

    // Refs を常に最新に保つ
    useEffect(() => {
        activeToolRef.current = activeTool;
        currentColorRef.current = currentColor;
        strokeWidthRef.current = strokeWidth;
        strokeStyleRef.current = strokeStyle;
        fontSizeRef.current = fontSize;
        stampCountRef.current = stampCount;
        onUpdateRef.current = onUpdate;
        onColorChangeRef.current = onColorChange;
        onStrokeWidthChangeRef.current = onStrokeWidthChange;
        onStrokeStyleChangeRef.current = onStrokeStyleChange;
        onFontSizeChangeRef.current = onFontSizeChange;
    }, [activeTool, currentColor, strokeWidth, strokeStyle, fontSize, stampCount, onUpdate, onColorChange, onStrokeWidthChange, onStrokeStyleChange, onFontSizeChange]);

    // ── Lazy init: use IntersectionObserver to defer Fabric.js Canvas creation ──
    // Only initialize when this step scrolls into view (200px pre-load margin).
    // This avoids creating 20+ Canvas instances simultaneously on edit mode entry.
    useEffect(() => {
        if (isCanvasReady) return; // Already initialized
        const el = containerRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setIsCanvasReady(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' } // pre-load 200px before entering viewport
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [isCanvasReady]);

    // ツールバーの状態をキャンバスの選択オブジェクトに同期
    const syncToolbarFromSelection = useCallback((obj: any) => {
        if (!obj || isUpdatingFromCanvas.current) return;
        isUpdatingFromCanvas.current = true;

        const type = obj.type?.toLowerCase();
        if (type === 'textbox' || type === 'i-text' || type === 'text') {
            const t = obj as Textbox;
            if (t.fill && t.fill !== currentColorRef.current) onColorChangeRef.current(t.fill as string);
            if (!isApplyingPropRef.current && t.fontSize) {
                const fs = Math.round(t.fontSize);
                if (Math.abs(fs - fontSizeRef.current) > 0.5) onFontSizeChangeRef.current(fs);
            }
        } else {
            if (obj.stroke && obj.stroke !== currentColorRef.current) onColorChangeRef.current(obj.stroke as string);
            if (obj.strokeWidth && obj.strokeWidth !== strokeWidthRef.current) onStrokeWidthChangeRef.current(Math.round(obj.strokeWidth));

            // Sync Stroke Style
            const dash = obj.strokeDashArray;
            const currentStyle = (dash && dash.length > 0 && dash[0] !== 0) ? 'dashed' : 'solid';
            if (currentStyle !== strokeStyleRef.current) {
                onStrokeStyleChangeRef.current(currentStyle);
            }
        }

        setTimeout(() => { isUpdatingFromCanvas.current = false; }, 50);
    }, []);

    // メインの初期化 Effect
    // NOTE: gated on isCanvasReady — only runs after IntersectionObserver fires
    useEffect(() => {
        if (!isCanvasReady) return; // Wait until viewport entry
        isMounted.current = true;
        if (!canvasRef.current || !containerRef.current) return;

        // Fabric 6.x: new Canvas(el, options)
        const canvas = new Canvas(canvasRef.current, {
            selection: activeToolRef.current === 'select',
            preserveObjectStacking: true,
            backgroundColor: '#ffffff',
        });

        fabricCanvasRef.current = canvas;
        setTick(t => t + 1);

        // エクスポート — capture current zoomed/panned view as the saved image
        const exportToParent = () => {
            if (!canvas) return;
            try {
                const currentZoom = canvas.getZoom();
                const baseZoom = baseFitZoomRef.current;
                const isUserZoomed = Math.abs(currentZoom - baseZoom) > 0.001;
                const vpt = canvas.viewportTransform!;
                const hasPanned = Math.abs(vpt[4]) > 1 || Math.abs(vpt[5]) > 1;

                if (isUserZoomed || hasPanned) {
                    // User has zoomed/panned — capture what they see (the viewport)
                    const canvasEl = canvas.getElement();
                    const visW = canvasEl.width;
                    const visH = canvasEl.height;

                    // Render at native resolution (undo CSS display scaling)
                    const outputCanvas = document.createElement('canvas');
                    outputCanvas.width = visW;
                    outputCanvas.height = visH;
                    const outCtx = outputCanvas.getContext('2d');
                    if (outCtx) {
                        outCtx.drawImage(canvasEl, 0, 0);
                        const dataUrl = outputCanvas.toDataURL('image/png');
                        const json = (canvas as any).toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls', 'strokeDashArray', 'stroke', 'strokeWidth', 'strokeUniform']);
                        // Store viewport state in JSON so it can be restored
                        json.__viewportTransform = [...vpt];
                        json.__userZoom = currentZoom / baseZoom;
                        lastSavedUrl.current = dataUrl;
                        onUpdateRef.current?.(dataUrl, json);
                    }
                } else {
                    // No user zoom/pan — normal full-resolution export
                    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 / baseZoom });
                    const json = (canvas as any).toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls', 'strokeDashArray', 'stroke', 'strokeWidth', 'strokeUniform']);
                    lastSavedUrl.current = dataUrl;
                    onUpdateRef.current?.(dataUrl, json);
                }
            } catch (e) {
                console.warn('[InlineCanvas] Export skipped:', (e as Error).message);
            }
        };
        exportToParentRef.current = exportToParent;

        // 選択ハンドラ
        const handleSelection = (e: any) => {
            const obj = e.selected?.[0] || e.target;
            if (!obj) return;
            const type = obj.type?.toLowerCase();
            if (type === 'textbox' || type === 'i-text' || type === 'text') {
                lastSelectedTextRef.current = obj as Textbox;
            }
            syncToolbarFromSelection(obj);
        };

        // スケーリングハンドラ（PowerPoint風）
        const handleScaling = (e: any) => {
            const obj = e.target;
            if (!obj || obj.type?.toLowerCase() !== 'textbox') return;
            const textObj = obj as Textbox;
            const scaleX = textObj.scaleX ?? 1;
            const scaleY = textObj.scaleY ?? 1;
            const corner = e.transform?.corner;

            if (scaleX !== 1 || scaleY !== 1) {
                if (corner === 'ml' || corner === 'mr') {
                    textObj.set({ width: (textObj.width ?? 100) * scaleX, scaleX: 1, scaleY: 1 });
                } else {
                    const maxScale = Math.max(scaleX, scaleY);
                    textObj.set({
                        fontSize: (textObj.fontSize ?? 20) * maxScale,
                        width: (textObj.width ?? 100) * maxScale,
                        scaleX: 1, scaleY: 1,
                        styles: {}, dirty: true,
                    });
                    // Fabric 6.x: initDimensions → _initDimensions or layout
                    if (typeof (textObj as any).initDimensions === 'function') (textObj as any).initDimensions();
                    if (typeof (textObj as any)._clearCache === 'function') (textObj as any)._clearCache();
                }
                textObj.setCoords();
                syncToolbarFromSelection(textObj);
            }
        };

        // オブジェクト追加
        const handleAddObject = (tool: ToolType, x: number, y: number) => {
            const zoom = canvas.getZoom();
            const cornerSize = 12 / zoom;
            const pad = 8 / zoom;
            const commonProps: any = {
                left: x, top: y,
                stroke: currentColorRef.current,
                strokeWidth: strokeWidthRef.current,
                strokeDashArray: strokeStyleRef.current === 'dashed'
                    ? [strokeWidthRef.current * 4, strokeWidthRef.current * 2]
                    : undefined,
                strokeUniform: true,
                fill: 'transparent',
                cornerColor: '#ffffff',
                cornerStrokeColor: '#9333ea',
                cornerStyle: 'circle',
                transparentCorners: false,
                borderColor: '#9333ea',
                cornerSize,
                padding: pad,
                selectable: true,
                evented: true,
                objectCaching: false,
            };

            let obj: any | null = null;

            switch (tool) {
                case 'rect':
                    obj = new Rect({ ...commonProps, width: 100, height: 60 });
                    break;
                case 'ellipse':
                    obj = new Ellipse({ ...commonProps, rx: 50, ry: 30 });
                    break;
                case 'arrow': {
                    const len = 80, head = 20, w = 10;
                    obj = new Path(
                        `M 0 0 L ${len} 0 M ${len} 0 L ${len - head} ${-w} M ${len} 0 L ${len - head} ${w}`,
                        { ...commonProps, fill: 'transparent' }
                    );
                    break;
                }
                case 'text':
                    obj = new Textbox('ここにテキストを入力', {
                        ...commonProps,
                        stroke: undefined,
                        fill: currentColorRef.current,
                        fontSize: fontSizeRef.current,
                        fontFamily: 'sans-serif',
                        width: 250,
                        objectCaching: false,
                    });
                    break;
                case 'stamp': {
                    const circle = new Circle({ radius: 20, fill: currentColorRef.current, originX: 'center', originY: 'center', strokeWidth: 0 });
                    const num = new FabricText(stampCountRef.current.toString(), { fontSize: 24, fill: '#ffffff', originX: 'center', originY: 'center', fontWeight: 'bold', strokeWidth: 0 });
                    // Fabric 6.x: Group
                    obj = new Group([circle, num], { ...commonProps, originX: 'center', originY: 'center' });
                    onStampUsed();
                    break;
                }
                case 'highlight':
                    obj = new Rect({ ...commonProps, width: 200, height: 40, fill: currentColorRef.current, opacity: 0.35, rx: 4, ry: 4, strokeWidth: 0 });
                    break;
                case 'blur': {
                    const br = new Rect({ width: 120, height: 40, fill: '#cbd5e1', rx: 2, ry: 2, strokeWidth: 0 });
                    const label = new FabricText('ぼかし', { fontSize: 16, fill: '#64748b', originX: 'center', originY: 'center' });
                    obj = new Group([br, label], { ...commonProps });
                    break;
                }
            }

            if (obj) {
                canvas.add(obj);
                canvas.setActiveObject(obj);
                if (tool === 'text' && obj instanceof Textbox) {
                    (obj as any).enterEditing?.();
                    obj.selectAll();
                }
                canvas.requestRenderAll();
                saveState(canvas);
                setTimeout(() => exportToParent(), 10);
                if (activeToolRef.current !== 'select') onToolReset();
            }
        };

        // 状態保存
        const saveState = (c: Canvas) => {
            const json = JSON.stringify((c as any).toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls', 'strokeDashArray', 'stroke', 'strokeWidth', 'strokeUniform']));
            history.current.push(json);
            redoStack.current = [];
            try {
                localStorage.setItem(`am_canvas_state_${canvasId}`, json);
            } catch (e) {
                console.warn('[InlineCanvas] Failed to save state to localStorage (Quota Exceeded):', e);
            }
        };
        saveStateRef.current = () => saveState(canvas);

        // マウスダウン
        const handleMouseDown = (opt: any) => {
            if (activeToolRef.current === 'select') return;
            const target = opt.target;
            const activeObj = canvas.getActiveObject();
            if (activeObj && target === activeObj) return;
            const pointer = canvas.getPointer(opt.e);
            handleAddObject(activeToolRef.current, pointer.x, pointer.y);
        };

        // キーダウン
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeObj = canvas.getActiveObject();
            if (activeObj && (activeObj as any).isEditing) {
                if ((activeObj as any).hiddenTextarea) (activeObj as any).hiddenTextarea.focus();
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const tag = (document.activeElement?.tagName || '').toUpperCase();
                const inside = containerRef.current?.contains(document.activeElement);
                if ((tag === 'INPUT' || tag === 'TEXTAREA') && !inside) return;
                e.preventDefault();
                const objs = canvas.getActiveObjects();
                if (objs.length) {
                    canvas.discardActiveObject();
                    objs.forEach(o => canvas.remove(o));
                    canvas.renderAll();
                    saveState(canvas);
                    setTimeout(() => exportToParent(), 10);
                }
            }
        };

        // Undo
        const handleUndo = () => {
            if (history.current.length <= 1) return;
            isRedoing.current = true;
            const cur = history.current.pop();
            if (cur) redoStack.current.push(cur);
            const prev = history.current[history.current.length - 1];
            if (prev) {
                canvas.loadFromJSON(JSON.parse(prev)).then(() => {
                    canvas.renderAll();
                    isRedoing.current = false;
                    exportToParent();
                });
            } else { isRedoing.current = false; }
        };

        // Redo
        const handleRedo = () => {
            if (!redoStack.current.length) return;
            isRedoing.current = true;
            const next = redoStack.current.pop();
            if (next) {
                history.current.push(next);
                canvas.loadFromJSON(JSON.parse(next)).then(() => {
                    canvas.renderAll();
                    isRedoing.current = false;
                    exportToParent();
                });
            } else { isRedoing.current = false; }
        };

        // ============================================================
        // フォントサイズ変更ハンドラ（Fabric 6.x 対応版）
        // Fabric 6.x では FabricText / Textbox の fontSize 変更後に
        // canvas.requestRenderAll() を呼ぶだけで正しく再描画される
        // ============================================================
        const handleFontSizeEvent = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail?.fontSize) return;
            const newFontSize = Number(detail.fontSize);

            const currentCanvas = fabricCanvasRef.current;
            if (!currentCanvas) return;

            // テキストオブジェクトを取得
            let textObj: Textbox | null = null;
            const activeObj = currentCanvas.getActiveObject();

            if (activeObj) {
                const t = activeObj.type?.toLowerCase();
                if (t === 'textbox' || t === 'i-text' || t === 'text') {
                    textObj = activeObj as Textbox;
                }
            }
            if (!textObj) {
                const all = currentCanvas.getObjects();
                textObj = (all.find((o: any) => o.isEditing) as Textbox) || null;
            }
            if (!textObj && lastSelectedTextRef.current) {
                if (currentCanvas.getObjects().includes(lastSelectedTextRef.current)) {
                    textObj = lastSelectedTextRef.current;
                }
            }
            if (!textObj) {
                console.log('[InlineCanvas] am:fontsize — No text object');
                return;
            }

            console.log(`[InlineCanvas] am:fontsize — ${textObj.fontSize} → ${newFontSize}`);
            isApplyingPropRef.current = true;

            // 編集モード解除
            if ((textObj as any).isEditing) (textObj as any).exitEditing?.();

            // Fabric 6.x でのフォントサイズ変更
            textObj.set({
                fontSize: newFontSize,
                scaleX: 1,
                scaleY: 1,
                styles: {},
                dirty: true,
                objectCaching: false,
            });

            // Fabric 6.x: setDimensions は不要。requestRenderAll() だけで再描画される
            textObj.setCoords();
            currentCanvas.requestRenderAll();

            // 念押し
            requestAnimationFrame(() => {
                if (!isMounted.current) return;
                currentCanvas.requestRenderAll();
            });

            console.log(`[InlineCanvas] am:fontsize — DONE: fontSize=${textObj.fontSize}`);

            // 履歴保存
            // 背景画像を含めないようにしてサイズを削減
            const json = JSON.stringify(
                (currentCanvas as any).toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls', 'strokeDashArray', 'stroke', 'strokeWidth', 'strokeUniform'])
            );
            history.current.push(json);
            redoStack.current = [];
            try {
                localStorage.setItem(`am_canvas_state_${canvasId}`, json);
            } catch (e) {
                console.warn('[InlineCanvas] Failed to save state (FontSize) to localStorage:', e);
            }
            setTimeout(() => exportToParent(), 10);
            setTimeout(() => { isApplyingPropRef.current = false; }, 150);
        };

        // Force save
        const handleForceSave = () => exportToParent();

        // イベントバインド
        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('object:scaling', handleScaling);
        canvas.on('text:changed', () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => exportToParent(), 500);
        });
        canvas.on('object:modified', () => {
            canvas.getObjects().forEach(o => o.setCoords());
            if (!isRedoing.current) {
                saveState(canvas);
                setTimeout(() => exportToParent(), 10);
            }
        });
        canvas.on('mouse:down', handleMouseDown);

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('am:undo', handleUndo, { passive: true });
        window.addEventListener('am:redo', handleRedo, { passive: true });
        window.addEventListener('am:delete', () => {
            const objs = canvas.getActiveObjects();
            if (objs.length) {
                canvas.discardActiveObject();
                objs.forEach(o => canvas.remove(o));
                canvas.renderAll();
                saveState(canvas);
                setTimeout(() => exportToParent(), 10);
            }
        }, { passive: true });
        window.addEventListener('am:fontsize', handleFontSizeEvent, { passive: true });
        window.addEventListener('am:force-save', handleForceSave, { passive: true });

        // ────────── Zoom & Pan ──────────

        /** Apply user zoom centered on a point (in canvas CSS pixels) */
        const applyUserZoom = (newUserZoom: number, centerX?: number, centerY?: number) => {
            const base = baseFitZoomRef.current;
            const finalZoom = base * newUserZoom;
            if (centerX !== undefined && centerY !== undefined) {
                // Zoom toward cursor position
                canvas.zoomToPoint(new Point(centerX, centerY), finalZoom);
            } else {
                // Zoom toward canvas center
                const cx = (canvas.width ?? 600) / 2;
                const cy = (canvas.height ?? 400) / 2;
                canvas.zoomToPoint(new Point(cx, cy), finalZoom);
            }
            canvas.requestRenderAll();
            setUserZoom(newUserZoom);
        };

        /** Reset zoom/pan back to original fit view */
        const resetUserZoom = () => {
            const base = baseFitZoomRef.current;
            canvas.setViewportTransform([base, 0, 0, base, 0, 0]);
            canvas.requestRenderAll();
            setUserZoom(1);
        };

        // Expose zoom functions for UI buttons
        (canvas as any).__applyUserZoom = applyUserZoom;
        (canvas as any).__resetUserZoom = resetUserZoom;

        // Scroll wheel → zoom (no modifier key needed)
        canvas.on('mouse:wheel', (opt: any) => {
            const e = opt.e as WheelEvent;
            e.preventDefault();
            e.stopPropagation();

            const delta = e.deltaY;
            const currentUserZoom = canvas.getZoom() / baseFitZoomRef.current;
            let newUserZoom = currentUserZoom * (delta > 0 ? 0.9 : 1.1);
            newUserZoom = Math.max(0.5, Math.min(5, newUserZoom)); // clamp 50% – 500%

            const pointer = canvas.getPointer(e, true);
            applyUserZoom(newUserZoom, pointer.x, pointer.y);
        });

        // Right-click drag → pan (mouse-only, no keyboard needed)
        canvas.on('mouse:down', (opt: any) => {
            const e = opt.e as MouseEvent;
            // Right-click (button 2) or middle-click (button 1) to pan
            if (e.button === 2 || e.button === 1) {
                isPanningRef.current = true;
                lastPanPointRef.current = { x: e.clientX, y: e.clientY };
                canvas.selection = false;
                canvas.setCursor('grabbing');
                e.preventDefault();
            }
        });

        canvas.on('mouse:move', (opt: any) => {
            if (isPanningRef.current && lastPanPointRef.current) {
                const dx = opt.e.clientX - lastPanPointRef.current.x;
                const dy = opt.e.clientY - lastPanPointRef.current.y;
                const vpt = [...canvas.viewportTransform!];
                vpt[4] += dx;
                vpt[5] += dy;
                canvas.setViewportTransform(vpt as any);
                lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY };
                canvas.requestRenderAll();
            }
        });

        canvas.on('mouse:up', () => {
            if (isPanningRef.current) {
                isPanningRef.current = false;
                lastPanPointRef.current = null;
                canvas.selection = activeToolRef.current === 'select';
                canvas.setCursor('default');
            }
        });

        // Disable context menu on canvas to allow right-click pan
        const canvasEl = canvas.getElement();
        const wrapperEl = canvasEl.parentElement;
        const preventContextMenu = (e: Event) => e.preventDefault();
        if (wrapperEl) wrapperEl.addEventListener('contextmenu', preventContextMenu);
        canvasEl.addEventListener('contextmenu', preventContextMenu);

        // Space key hold for pan mode (keyboard alternative, still available)
        const handleSpaceDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !spaceHeldRef.current) {
                const active = canvas.getActiveObject();
                if (active && (active as any).isEditing) return;
                const tag = (document.activeElement?.tagName || '').toUpperCase();
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                e.preventDefault();
                spaceHeldRef.current = true;
                canvas.setCursor('grab');
                canvas.forEachObject(obj => { obj.set({ evented: false }); });
            }
        };

        // Also support Space+Drag pan (original mouse:down handler already covered)
        canvas.on('mouse:down', (opt: any) => {
            if (spaceHeldRef.current) {
                isPanningRef.current = true;
                lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY };
                canvas.selection = false;
                canvas.setCursor('grabbing');
                opt.e.preventDefault();
            }
        });

        const handleSpaceUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                spaceHeldRef.current = false;
                canvas.setCursor('default');
                canvas.forEachObject(obj => { obj.set({ evented: true }); });
            }
        };

        window.addEventListener('keydown', handleSpaceDown);
        window.addEventListener('keyup', handleSpaceUp);

        // コンテンツ読み込み
        const loadContent = async () => {
            if (!isMounted.current) return;

            canvas.clear();
            // Fabric 6.x: FabricImage.fromURL
            canvas.clear();
            // Fabric 6.x: FabricImage.fromURL
            const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
            if (!isMounted.current) return;

            const originalWidth = img.width ?? 800;
            const originalHeight = img.height ?? 600;

            // 2. ターゲットとなる最大幅を定義（デフォルトの800を廃止）
            const targetMaxWidth = isPortrait ? 576 : 768; // 縦:576, 横:768

            // コンテナの幅を計測
            let containerWidth = containerRef.current?.getBoundingClientRect().width;

            // 3. 幅が取得できない、または最大幅を超えている場合の補正
            // Edit Modeのサイドバーなどで幅が狭まっている場合は containerWidth を優先するが
            // 計測不能(0)や、逆に広すぎる場合は強制的に targetMaxWidth にする
            if (!containerWidth || containerWidth === 0 || containerWidth > targetMaxWidth) {
                containerWidth = targetMaxWidth;
            }

            // Always render at full-width zoom for crisp quality
            const zoomLevel = containerWidth / originalWidth;
            // Fix: Check if this specific canvas instance is still the active one
            if (!isMounted.current || fabricCanvasRef.current !== canvas) return;

            canvas.setWidth(containerWidth);
            canvas.setHeight(originalHeight * zoomLevel);
            canvas.setZoom(zoomLevel);
            baseFitZoomRef.current = zoomLevel; // Store base fit zoom for user-zoom calculations

            // For compact mode: calculate CSS scale to fit within 4:3 aspect ratio
            if (compact) {
                const maxHeight = containerWidth * 0.75;
                const canvasHeight = originalHeight * zoomLevel;
                if (canvasHeight > maxHeight) {
                    setCompactScale(maxHeight / canvasHeight);
                } else {
                    setCompactScale(1);
                }
            } else {
                setCompactScale(1);
            }

            img.set({ originX: 'left', originY: 'top', left: 0, top: 0, scaleX: 1, scaleY: 1, selectable: false, evented: false });
            canvas.backgroundImage = img;

            if (initialData && typeof initialData === 'object') {
                const data = { ...initialData };
                if (data.backgroundImage) delete data.backgroundImage;
                // Fabric 6.x: loadFromJSON は Promise を返す
                await canvas.loadFromJSON(data);
                canvas.getObjects().forEach(obj => {
                    obj.set({ selectable: true, evented: true, objectCaching: false });
                    obj.setCoords();
                });
            } else {
                const saved = localStorage.getItem(`am_canvas_state_${canvasId}`);
                if (saved && saved !== 'undefined') {
                    try {
                        await canvas.loadFromJSON(JSON.parse(saved));
                        canvas.getObjects().forEach(obj => { obj.setCoords(); });
                    } catch { }
                }
            }

            // CRITICAL FIX: Re-apply background image AFTER loading JSON
            // loadFromJSON might wipe the background if it's missing in the JSON
            canvas.backgroundImage = img;
            canvas.renderAll();

            canvas.renderAll();
            const initialState = JSON.stringify((canvas as any).toJSON(['selectable', 'evented', 'id', 'strokeDashArray']));
            history.current = [initialState];
            lastSavedUrl.current = imageUrl;
        };

        loadContent();

        return () => {
            isMounted.current = false;
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keydown', handleSpaceDown);
            window.removeEventListener('keyup', handleSpaceUp);
            window.removeEventListener('am:undo', handleUndo);
            window.removeEventListener('am:redo', handleRedo);
            window.removeEventListener('am:fontsize', handleFontSizeEvent);
            window.removeEventListener('am:force-save', handleForceSave);
            canvas.dispose();
        };
    }, [canvasId, imageUrl, compact, isCanvasReady]);

    // ツール切替・プロパティ更新 Effect
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const isSelectMode = activeTool === 'select';
        canvas.selection = isSelectMode;
        canvas.defaultCursor = isSelectMode ? 'default' : 'crosshair';

        if (!isSelectMode) canvas.discardActiveObject();

        const zoom = canvas.getZoom();
        canvas.getObjects().forEach(obj => {
            obj.set({
                selectable: isSelectMode,
                evented: isSelectMode,
                lockMovementX: !isSelectMode,
                lockMovementY: !isSelectMode,
                lockRotation: !isSelectMode,
                lockScalingX: !isSelectMode,
                lockScalingY: !isSelectMode,
                transparentCorners: false,
                borderColor: '#9333ea',
                cornerSize: 12 / zoom,
                padding: 8 / zoom,
                cornerStyle: 'circle',
                cornerColor: '#ffffff',
                cornerStrokeColor: '#9333ea',
            });
            obj.setCoords();
        });

        // カラー・strokeWidth・strokeStyle を選択中オブジェクトに適用
        if (isSelectMode && !isUpdatingFromCanvas.current) {
            let changed = false;
            canvas.getActiveObjects().forEach((obj: any) => {
                const type = obj.type?.toLowerCase();
                let objChanged = false;

                if (type === 'textbox' || type === 'i-text' || type === 'text') {
                    const t = obj as Textbox;
                    if (t.fill !== currentColor) {
                        t.set({ fill: currentColor, styles: {} });
                        objChanged = true;
                    }
                } else {
                    if (obj.stroke !== currentColor) {
                        obj.set({ stroke: currentColor });
                        objChanged = true;
                    }
                    if (obj.strokeWidth !== strokeWidth) {
                        obj.set({ strokeWidth });
                        objChanged = true;
                    }

                    // Apply Stroke Style
                    const dashArray = strokeStyle === 'dashed' ? [strokeWidth * 4, strokeWidth * 2] : undefined;
                    // Check if changed (simple check)
                    const currentDash = obj.strokeDashArray;
                    const isDashed = currentDash && currentDash.length > 0;
                    const shouldBeDashed = strokeStyle === 'dashed';

                    if (isDashed !== shouldBeDashed) {
                        obj.set({ strokeDashArray: dashArray });
                        objChanged = true;
                    } else if (shouldBeDashed) {
                        // If dashed, check if pattern matches (re-apply to be safe if width changed)
                        obj.set({ strokeDashArray: dashArray });
                        // Mark as changed to force save
                        objChanged = true;
                    }
                }

                if (objChanged) {
                    obj.setCoords();
                    changed = true;
                }
            });

            if (changed) {
                canvas.requestRenderAll();
                saveStateRef.current(canvas);
                if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = setTimeout(() => exportToParentRef.current(), 500);
            }
        } else {
            canvas.requestRenderAll();
        }
    }, [activeTool, currentColor, strokeWidth, strokeStyle, fontSize, stampCount]);

    return (
        <div
            ref={containerRef}
            className={`relative group transition-all ${compact ? 'w-full overflow-hidden' : 'w-full'}`}
            style={compact
                ? { aspectRatio: '4/3', backgroundColor: '#f1f5f9' }
                : { minHeight: '300px', backgroundColor: '#ffffff' }
            }
        >
            {/* Lightweight placeholder shown BEFORE Fabric.js Canvas is initialized */}
            {!isCanvasReady && (
                <div className="w-full flex items-center justify-center" style={{ minHeight: '300px' }}>
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt="Loading canvas..."
                            className="w-full h-auto block rounded-xl"
                            style={{ opacity: 0.7 }}
                        />
                    ) : (
                        <div className="w-full animate-pulse rounded-xl bg-slate-100" style={{ minHeight: '300px' }} />
                    )}
                </div>
            )}
            {/* Fabric.js Canvas — rendered but hidden until isCanvasReady */}
            <div
                className={`relative z-10 shadow-2xl rounded-xl overflow-hidden bg-white ring-1 ring-slate-900/5 ${compact ? '' : 'w-full'}`}
                style={{
                    ...(compact && compactScale < 1 ? {
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: `translate(-50%, -50%) scale(${compactScale})`,
                        transformOrigin: 'center center'
                    } : {}),
                    // Keep canvas in DOM (for ref access) but invisible until ready
                    display: isCanvasReady ? undefined : 'none',
                }}
            >
                <canvas ref={canvasRef} />
            </div>
            {!compact && (
                <div className="absolute inset-0 pointer-events-none z-0 opacity-10 rounded-xl overflow-hidden">
                    <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(#4f46e5 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
                </div>
            )}

            {/* Floating Zoom Controls — visible on hover (edit mode only) */}
            {!compact && isCanvasReady && (
                <div
                    className="absolute bottom-3 right-3 z-30 flex items-center gap-1 bg-slate-800/80 backdrop-blur-sm rounded-lg px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                >
                    <button
                        className="w-7 h-7 flex items-center justify-center text-white hover:bg-slate-700 rounded text-sm font-bold"
                        title="ズームアウト (Ctrl+スクロール↓)"
                        onClick={() => {
                            const c = fabricCanvasRef.current;
                            if (!c) return;
                            const cur = c.getZoom() / baseFitZoomRef.current;
                            (c as any).__applyUserZoom?.(Math.max(0.5, cur * 0.8));
                        }}
                    >
                        −
                    </button>
                    <button
                        className="min-w-[40px] h-7 flex items-center justify-center text-white hover:bg-slate-700 rounded text-xs font-mono tabular-nums"
                        title="ズームリセット"
                        onClick={() => {
                            const c = fabricCanvasRef.current;
                            if (!c) return;
                            (c as any).__resetUserZoom?.();
                        }}
                    >
                        {Math.round(userZoom * 100)}%
                    </button>
                    <button
                        className="w-7 h-7 flex items-center justify-center text-white hover:bg-slate-700 rounded text-sm font-bold"
                        title="ズームイン (Ctrl+スクロール↑)"
                        onClick={() => {
                            const c = fabricCanvasRef.current;
                            if (!c) return;
                            const cur = c.getZoom() / baseFitZoomRef.current;
                            (c as any).__applyUserZoom?.(Math.min(5, cur * 1.25));
                        }}
                    >
                        +
                    </button>
                </div>
            )}
        </div>
    );
}
