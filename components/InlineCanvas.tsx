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
    // isAdjustMode is now derived from activeTool === 'adjust' (no internal state)

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
    const exportToParentRef = useRef<(options?: { isAdjustCrop?: boolean, isBaking?: boolean }) => void>(() => { });

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

        // エクスポート — debounced to prevent heavy toDataURL generation during dragging/scaling
        let exportTimer: NodeJS.Timeout;
        const exportToParent = (options?: { isAdjustCrop?: boolean, isBaking?: boolean }) => {
            clearTimeout(exportTimer);
            exportTimer = setTimeout(() => {
                if (!canvas) return;
                try {
                    const currentZoom = canvas.getZoom();
                    const multiplier = 1 / currentZoom;
                    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier });
                    const json: any = (canvas as any).toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls', 'strokeDashArray', 'stroke', 'strokeWidth', 'strokeUniform']);

                    if (options?.isAdjustCrop || options?.isBaking || activeToolRef.current === 'adjust') {
                        json.isAdjustCrop = true;
                    }

                    lastSavedUrl.current = dataUrl;
                    onUpdateRef.current?.(dataUrl, json);
                } catch (e) {
                    console.warn('[InlineCanvas] Export skipped:', (e as Error).message);
                }
            }, 300);
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

        // 状態保存 — objects only (background image is excluded to save space)
        const MAX_HISTORY = 30;
        const saveState = (c: Canvas) => {
            // Save only annotation objects, not the background image
            const objects = c.getObjects().map((obj: any) => obj.toObject(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls', 'strokeDashArray', 'stroke', 'strokeWidth', 'strokeUniform']));
            const json = JSON.stringify({ objects });
            history.current.push(json);
            // Cap history size
            if (history.current.length > MAX_HISTORY) {
                history.current = history.current.slice(-MAX_HISTORY);
            }
            redoStack.current = [];
            try {
                localStorage.setItem(`am_canvas_state_${canvasId}`, json);
            } catch (e) {
                // Quota exceeded — clear old am_ entries and retry once
                try {
                    const keysToRemove: string[] = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('am_canvas_state_') && key !== `am_canvas_state_${canvasId}`) {
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                    localStorage.setItem(`am_canvas_state_${canvasId}`, json);
                } catch {
                    // Still failed — just skip localStorage
                    console.warn('[InlineCanvas] localStorage full, skipping state persistence');
                }
            }
        };
        saveStateRef.current = () => saveState(canvas);

        // マウスダウン
        const handleMouseDown = (opt: any) => {
            // Skip in adjust mode — pan handler takes over
            if (activeToolRef.current === 'adjust') return;
            if (activeToolRef.current === 'select') return;
            // If clicking on an existing object, don't create a new one
            if (opt.target) return;
            const pointer = canvas.getPointer(opt.e);
            handleAddObject(activeToolRef.current, pointer.x, pointer.y);
        };

        // キーダウン
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeObj = canvas.getActiveObject();
            // テキスト入力中は完全にイベントをブロック（Delete誤動作防止）
            if (activeObj && (activeObj as any).isEditing) return;

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

        // Undo — restore objects only (background stays)
        const handleUndo = () => {
            if (history.current.length <= 1) return;
            isRedoing.current = true;
            const cur = history.current.pop();
            if (cur) redoStack.current.push(cur);
            const prev = history.current[history.current.length - 1];
            if (prev) {
                const data = JSON.parse(prev);
                // Build a full canvas JSON but preserve current background
                const bgJson = canvas.backgroundImage ? (canvas.backgroundImage as any).toObject() : null;
                const fullJson = { version: '6.0.0', objects: data.objects || [], backgroundImage: bgJson };
                canvas.loadFromJSON(fullJson).then(() => {
                    canvas.renderAll();
                    isRedoing.current = false;
                    exportToParent();
                }).catch(() => { isRedoing.current = false; });
            } else { isRedoing.current = false; }
        };

        // Redo — restore objects only (background stays)
        const handleRedo = () => {
            if (!redoStack.current.length) return;
            isRedoing.current = true;
            const next = redoStack.current.pop();
            if (next) {
                history.current.push(next);
                const data = JSON.parse(next);
                const bgJson = canvas.backgroundImage ? (canvas.backgroundImage as any).toObject() : null;
                const fullJson = { version: '6.0.0', objects: data.objects || [], backgroundImage: bgJson };
                canvas.loadFromJSON(fullJson).then(() => {
                    canvas.renderAll();
                    isRedoing.current = false;
                    exportToParent();
                }).catch(() => { isRedoing.current = false; });
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

            // 履歴保存 (quota-safe)
            saveState(currentCanvas);
            exportToParent();
            setTimeout(() => { isApplyingPropRef.current = false; }, 150);
        };

        // Force save
        const handleForceSave = () => {
            exportToParentRef.current({ isBaking: activeToolRef.current === 'adjust' });
        };

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

        // Scroll wheel → zoom (only in adjust mode)
        canvas.on('mouse:wheel', (opt: any) => {
            if (activeToolRef.current !== 'adjust') return;
            const e = opt.e as WheelEvent;
            e.preventDefault();
            e.stopPropagation();

            const delta = e.deltaY;
            const base = baseFitZoomRef.current;
            const currentUserZoom = canvas.getZoom() / base;
            let newUserZoom = currentUserZoom * (delta > 0 ? 0.9 : 1.1);
            newUserZoom = Math.max(0.3, Math.min(5, newUserZoom));

            const finalZoom = base * newUserZoom;
            const pointer = canvas.getPointer(opt.e, true);
            canvas.zoomToPoint(new Point(pointer.x, pointer.y), finalZoom);
            canvas.requestRenderAll();
            setUserZoom(newUserZoom);
        });

        // Left-click drag → pan (only in adjust mode)
        canvas.on('mouse:down', (opt: any) => {
            if (activeToolRef.current !== 'adjust') return;
            isPanningRef.current = true;
            lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY };
            canvas.setCursor('grabbing');
        });

        canvas.on('mouse:move', (opt: any) => {
            if (!isPanningRef.current || !lastPanPointRef.current) return;
            const dx = opt.e.clientX - lastPanPointRef.current.x;
            const dy = opt.e.clientY - lastPanPointRef.current.y;
            const vpt = [...canvas.viewportTransform!];
            vpt[4] += dx;
            vpt[5] += dy;
            canvas.setViewportTransform(vpt as any);
            lastPanPointRef.current = { x: opt.e.clientX, y: opt.e.clientY };
            canvas.requestRenderAll();
        });

        canvas.on('mouse:up', () => {
            if (isPanningRef.current) {
                isPanningRef.current = false;
                lastPanPointRef.current = null;
                if (activeToolRef.current === 'adjust') {
                    canvas.setCursor('grab');
                }
            }
        });

        // Disable context menu on canvas
        const canvasEl = canvas.getElement();
        const wrapperEl = canvasEl.parentElement;
        const preventContextMenu = (e: Event) => e.preventDefault();
        if (wrapperEl) wrapperEl.addEventListener('contextmenu', preventContextMenu);

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
                        const savedData = JSON.parse(saved);
                        // Convert to full JSON so fabric 6.x parses objects correctly
                        await canvas.loadFromJSON({ version: '6.0.0', objects: savedData.objects || [] });
                        canvas.getObjects().forEach(obj => { obj.setCoords(); });
                    } catch { }
                }
            }

            // CRITICAL FIX: Re-apply background image AFTER loading JSON
            // loadFromJSON might wipe the background if it's missing in the JSON
            canvas.backgroundImage = img;
            canvas.renderAll();

            canvas.renderAll();
            // Store initial state (objects only, to prevent background image storage)
            const objects = canvas.getObjects().map((obj: any) => obj.toObject(['selectable', 'evented', 'id', 'strokeDashArray']));
            const initialState = JSON.stringify({ objects });
            history.current = [initialState];
            lastSavedUrl.current = imageUrl;
        };

        loadContent();

        return () => {
            isMounted.current = false;
            window.removeEventListener('keydown', handleKeyDown);
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

        if (activeTool !== 'adjust') {
            exportToParentRef.current({ isBaking: true });
        }

        const isAdjust = activeTool === 'adjust';
        const isSelectMode = activeTool === 'select';
        canvas.selection = isSelectMode;
        canvas.defaultCursor = isAdjust ? 'grab' : (isSelectMode ? 'default' : 'crosshair');

        // Enter/exit adjust mode based on tool
        if (isAdjust) {
            canvas.discardActiveObject();
            canvas.forEachObject(obj => obj.set({ evented: false, selectable: false }));
        } else {
            canvas.forEachObject(obj => obj.set({ evented: true, selectable: true }));
        }
        (canvas as any)._wasAdjust = isAdjust;

        if (!isSelectMode && !isAdjust) canvas.discardActiveObject();

        const zoom = canvas.getZoom();
        // Objects should ALWAYS be selectable/evented so users can click, move, resize, delete them.
        // Only canvas.selection (rubber-band multi-select) is disabled for drawing tools.
        // In adjust mode, __enterAdjustMode handles setting objects to non-interactive.
        if (!isAdjust) {
            canvas.getObjects().forEach(obj => {
                obj.set({
                    selectable: true,
                    evented: true,
                    lockMovementX: false,
                    lockMovementY: false,
                    lockRotation: false,
                    lockScalingX: false,
                    lockScalingY: false,
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
        }

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
                exportToParentRef.current();
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

            {/* Adjust Mode indicator & controls */}
            {!compact && isCanvasReady && activeTool === 'adjust' && (
                <div className="absolute inset-0 z-20 pointer-events-none rounded-xl" style={{ border: '3px solid #3b82f6', boxShadow: '0 0 0 1px rgba(59,130,246,.3)' }}>
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-auto bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-2">
                        <span>📐 画像調整モード</span>
                        <span className="opacity-70">スクロール=ズーム / ドラッグ=移動 / 他のツールで確定</span>
                    </div>
                </div>
            )}

            {/* Floating Zoom Controls — visible in adjust mode */}
            {!compact && isCanvasReady && activeTool === 'adjust' && (
                <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 bg-slate-800/80 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-lg">
                    <span className="text-white text-xs font-mono tabular-nums px-1">
                        {Math.round(userZoom * 100)}%
                    </span>
                </div>
            )}
        </div>
    );
}
