'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
// Fabric 6.x: named imports（fabric 5.x の `import { fabric } from 'fabric'` は使えない）
import * as fabric from 'fabric';
import { ToolType } from './EditorTypes';

interface InlineCanvasProps {
    canvasId: string;
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
    onToolReset: () => void;
    initialData?: any;
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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Fabric 6.x: Canvas 型
    const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
    const isMounted = useRef(true);
    const lastSavedUrl = useRef<string | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSelectedTextRef = useRef<fabric.Textbox | null>(null);
    const [, setTick] = useState(0);

    const activeToolRef = useRef(activeTool);
    const currentColorRef = useRef(currentColor);
    const strokeWidthRef = useRef(strokeWidth);
    const fontSizeRef = useRef(fontSize);
    const stampCountRef = useRef(stampCount);
    const onUpdateRef = useRef(onUpdate);
    const onColorChangeRef = useRef(onColorChange);
    const onStrokeWidthChangeRef = useRef(onStrokeWidthChange);
    const onFontSizeChangeRef = useRef(onFontSizeChange);
    const isApplyingPropRef = useRef(false);
    const isUpdatingFromCanvas = useRef(false);

    const history = useRef<string[]>([]);
    const redoStack = useRef<string[]>([]);
    const isRedoing = useRef(false);

    // Refs を常に最新に保つ
    useEffect(() => {
        activeToolRef.current = activeTool;
        currentColorRef.current = currentColor;
        strokeWidthRef.current = strokeWidth;
        fontSizeRef.current = fontSize;
        stampCountRef.current = stampCount;
        onUpdateRef.current = onUpdate;
        onColorChangeRef.current = onColorChange;
        onStrokeWidthChangeRef.current = onStrokeWidthChange;
        onFontSizeChangeRef.current = onFontSizeChange;
    }, [activeTool, currentColor, strokeWidth, fontSize, stampCount, onUpdate, onColorChange, onStrokeWidthChange, onFontSizeChange]);

    // ツールバーの状態をキャンバスの選択オブジェクトに同期
    const syncToolbarFromSelection = useCallback((obj: fabric.FabricObject) => {
        if (!obj || isUpdatingFromCanvas.current) return;
        isUpdatingFromCanvas.current = true;

        const type = obj.type?.toLowerCase();
        if (type === 'textbox' || type === 'i-text' || type === 'text') {
            const t = obj as fabric.Textbox;
            if (t.fill && t.fill !== currentColorRef.current) onColorChangeRef.current(t.fill as string);
            if (!isApplyingPropRef.current && t.fontSize) {
                const fs = Math.round(t.fontSize);
                if (Math.abs(fs - fontSizeRef.current) > 0.5) onFontSizeChangeRef.current(fs);
            }
        } else {
            if (obj.stroke && obj.stroke !== currentColorRef.current) onColorChangeRef.current(obj.stroke as string);
            if (obj.strokeWidth && obj.strokeWidth !== strokeWidthRef.current) onStrokeWidthChangeRef.current(Math.round(obj.strokeWidth));
        }

        setTimeout(() => { isUpdatingFromCanvas.current = false; }, 50);
    }, []);

    // メインの初期化 Effect
    useEffect(() => {
        isMounted.current = true;
        if (!canvasRef.current || !containerRef.current) return;

        // Fabric 6.x: new fabric.Canvas(el, options)
        const canvas = new fabric.Canvas(canvasRef.current, {
            selection: activeToolRef.current === 'select',
            preserveObjectStacking: true,
            backgroundColor: '#ffffff',
        });

        fabricCanvasRef.current = canvas;
        setTick(t => t + 1);

        // エクスポート
        const exportToParent = () => {
            if (!canvas) return;
            try {
                const zoom = canvas.getZoom();
                const dataUrl = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 / zoom });
                // Fabric 6.x: toObject → toJSON
                const json = canvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']);
                lastSavedUrl.current = dataUrl;
                onUpdateRef.current?.(dataUrl, json);
            } catch (e) {
                console.warn('[InlineCanvas] Export skipped:', (e as Error).message);
            }
        };

        // 選択ハンドラ
        const handleSelection = (e: any) => {
            const obj = e.selected?.[0] || e.target;
            if (!obj) return;
            const type = obj.type?.toLowerCase();
            if (type === 'textbox' || type === 'i-text' || type === 'text') {
                lastSelectedTextRef.current = obj as fabric.Textbox;
            }
            syncToolbarFromSelection(obj);
        };

        // スケーリングハンドラ（PowerPoint風）
        const handleScaling = (e: any) => {
            const obj = e.target;
            if (!obj || obj.type?.toLowerCase() !== 'textbox') return;
            const textObj = obj as fabric.Textbox;
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

            let obj: fabric.FabricObject | null = null;

            switch (tool) {
                case 'rect':
                    obj = new fabric.Rect({ ...commonProps, width: 100, height: 60 });
                    break;
                case 'ellipse':
                    obj = new fabric.Ellipse({ ...commonProps, rx: 50, ry: 30 });
                    break;
                case 'arrow': {
                    const len = 80, head = 20, w = 10;
                    obj = new fabric.Path(
                        `M 0 0 L ${len} 0 M ${len} 0 L ${len - head} ${-w} M ${len} 0 L ${len - head} ${w}`,
                        { ...commonProps, fill: 'transparent' }
                    );
                    break;
                }
                case 'text':
                    obj = new fabric.Textbox('ここにテキストを入力', {
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
                    const circle = new fabric.Circle({ radius: 20, fill: currentColorRef.current, originX: 'center', originY: 'center', strokeWidth: 0 });
                    const num = new fabric.FabricText(stampCountRef.current.toString(), { fontSize: 24, fill: '#ffffff', originX: 'center', originY: 'center', fontWeight: 'bold', strokeWidth: 0 });
                    // Fabric 6.x: Group
                    obj = new fabric.Group([circle, num], { ...commonProps, originX: 'center', originY: 'center' });
                    onStampUsed();
                    break;
                }
                case 'highlight':
                    obj = new fabric.Rect({ ...commonProps, width: 200, height: 40, fill: currentColorRef.current, opacity: 0.35, rx: 4, ry: 4, strokeWidth: 0 });
                    break;
                case 'blur': {
                    const br = new fabric.Rect({ width: 120, height: 40, fill: '#cbd5e1', rx: 2, ry: 2, strokeWidth: 0 });
                    const label = new fabric.FabricText('ぼかし', { fontSize: 16, fill: '#64748b', originX: 'center', originY: 'center' });
                    obj = new fabric.Group([br, label], { ...commonProps });
                    break;
                }
            }

            if (obj) {
                canvas.add(obj);
                canvas.setActiveObject(obj);
                if (tool === 'text' && obj instanceof fabric.Textbox) {
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
        const saveState = (c: fabric.Canvas) => {
            const json = JSON.stringify(c.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls']));
            history.current.push(json);
            redoStack.current = [];
            localStorage.setItem(`am_canvas_state_${canvasId}`, json);
        };

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
            let textObj: fabric.Textbox | null = null;
            const activeObj = currentCanvas.getActiveObject();

            if (activeObj) {
                const t = activeObj.type?.toLowerCase();
                if (t === 'textbox' || t === 'i-text' || t === 'text') {
                    textObj = activeObj as fabric.Textbox;
                }
            }
            if (!textObj) {
                const all = currentCanvas.getObjects();
                textObj = (all.find((o: any) => o.isEditing) as fabric.Textbox) || null;
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
            const json = JSON.stringify(
                currentCanvas.toJSON(['selectable', 'evented', 'id', 'lockScalingY', 'hasControls'])
            );
            history.current.push(json);
            redoStack.current = [];
            localStorage.setItem(`am_canvas_state_${canvasId}`, json);
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
        window.addEventListener('am:undo', handleUndo);
        window.addEventListener('am:redo', handleRedo);
        window.addEventListener('am:delete', () => {
            const objs = canvas.getActiveObjects();
            if (objs.length) {
                canvas.discardActiveObject();
                objs.forEach(o => canvas.remove(o));
                canvas.renderAll();
                saveState(canvas);
                setTimeout(() => exportToParent(), 10);
            }
        });
        window.addEventListener('am:fontsize', handleFontSizeEvent);
        window.addEventListener('am:force-save', handleForceSave);

        // コンテンツ読み込み
        const loadContent = async () => {
            if (!isMounted.current) return;

            canvas.clear();
            // Fabric 6.x: FabricImage.fromURL
            const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
            if (!isMounted.current) return;

            const originalWidth = img.width ?? 800;
            const originalHeight = img.height ?? 600;

            let containerWidth = containerRef.current?.getBoundingClientRect().width || 800;
            if (containerWidth === 0) containerWidth = 800;
            const zoomLevel = containerWidth / originalWidth;
            // Fix: Check if this specific canvas instance is still the active one
            if (!isMounted.current || fabricCanvasRef.current !== canvas) return;

            canvas.setWidth(containerWidth);
            canvas.setHeight(originalHeight * zoomLevel);
            canvas.setZoom(zoomLevel);

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
            const initialState = JSON.stringify(canvas.toJSON(['selectable', 'evented', 'id']));
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
    }, [canvasId, imageUrl]);

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

        // カラー・strokeWidth を選択中オブジェクトに適用
        if (isSelectMode) {
            canvas.getActiveObjects().forEach(obj => {
                const type = obj.type?.toLowerCase();
                if (type === 'textbox' || type === 'i-text' || type === 'text') {
                    const t = obj as fabric.Textbox;
                    if (t.fill !== currentColor) t.set({ fill: currentColor, styles: {} });
                } else {
                    if (obj.stroke !== currentColor) obj.set({ stroke: currentColor });
                    if (obj.strokeWidth !== strokeWidth) obj.set({ strokeWidth });
                }
                obj.setCoords();
            });
        }

        canvas.requestRenderAll();
    }, [activeTool, currentColor, strokeWidth, fontSize, stampCount]);

    return (
        <div
            ref={containerRef}
            className="w-full relative group transition-all"
            style={{ minHeight: '300px', backgroundColor: '#ffffff' }}
        >
            <div className="relative z-10 w-full shadow-2xl rounded-xl overflow-hidden bg-white ring-1 ring-slate-900/5">
                <canvas ref={canvasRef} />
            </div>
            <div className="absolute inset-0 pointer-events-none z-0 opacity-10 rounded-xl overflow-hidden">
                <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(#4f46e5 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
            </div>
        </div>
    );
}
