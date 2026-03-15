import { ManualData } from '@/app/page';

/**
 * 画像のサイズを取得してアスペクト比を判定する
 */
function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = base64;
    });
}

/**
 * ナンバリング画像をCanvasで生成（OKをいただいた状態を完全維持）
 */
function createStepNumberImage(number: number): string {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#1E1B4B';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), size / 2, size / 2 + 4);

    return canvas.toDataURL('image/png');
}

export async function generateAndDownloadPptx(manual: ManualData, safeTitle: string): Promise<void> {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();

    // 縦2行レイアウトが1つでもあれば、ファイル全体をA4縦に設定
    const isPortraitFile = manual.steps.some(s => s.layout === 'two-row-vertical');

    // スライドサイズをポートレート/ランドスケープで切り替え
    const SLIDE_W = isPortraitFile ? 8.27 : 11.69;
    const SLIDE_H = isPortraitFile ? 11.69 : 8.27;

    if (isPortraitFile) {
        pptx.defineLayout({ name: 'A4_PORTRAIT', width: SLIDE_W, height: SLIDE_H });
        pptx.layout = 'A4_PORTRAIT';
    } else {
        pptx.defineLayout({ name: 'A4_LANDSCAPE', width: SLIDE_W, height: SLIDE_H });
        pptx.layout = 'A4_LANDSCAPE';
    }

    const NAVY = '1E1B4B';
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    // 1. 表紙
    const coverSlide = pptx.addSlide();
    if (isPortraitFile) {
        coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.30, fill: { color: NAVY } });
        // @ts-ignore
        coverSlide.addText('OPERATIONAL STANDARD', { x: 1.0, y: 3.5, w: 6, h: 0.4, fontSize: 16, color: NAVY, bold: false, fontFace: FONT_FACE, tracking: 2 });
        coverSlide.addText(manual.title, { x: 1.0, y: 4.0, w: '85%', h: 2.0, fontSize: 36, color: SLATE_900, bold: false, fontFace: FONT_FACE, valign: 'top', margin: 0 });
        coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 11.39, w: '100%', h: 0.30, fill: { color: NAVY } });
    } else {
        coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.30, fill: { color: NAVY } });
        // @ts-ignore
        coverSlide.addText('OPERATIONAL STANDARD', { x: 1.0, y: 2.8, w: 6, h: 0.4, fontSize: 16, color: NAVY, bold: false, fontFace: FONT_FACE, tracking: 2 });
        coverSlide.addText(manual.title, { x: 1.0, y: 3.3, w: '85%', h: 1.5, fontSize: 42, color: SLATE_900, bold: false, fontFace: FONT_FACE, valign: 'top', margin: 0 });
        coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.97, w: '100%', h: 0.30, fill: { color: NAVY } });
    }

    // 2. 概要スライド
    const steps = manual.steps;
    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1, isPortraitFile);
    if (isPortraitFile) {
        // 高さを元の約3分の1（8.0 -> 2.8）に縮小
        overviewSlide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.3, w: 6.7, h: 2.8, fill: { color: 'F8FAFC' }, line: { color: '1E1B4B', width: 0.1, pt: 3 } });
        overviewSlide.addText('■ DOCUMENT OVERVIEW', { x: 1.0, y: 1.5, w: 5, h: 0.4, fontSize: 11, color: NAVY, bold: true, fontFace: FONT_FACE });
        overviewSlide.addText(manual.overview, { x: 1.0, y: 2.0, w: 6.3, h: 2.0, fontSize: 11, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true, lineSpacing: 22 });
    } else {
        overviewSlide.addShape(pptx.ShapeType.rect, { x: 1.0, y: 1.3, w: 9.7, h: 2.6, fill: { color: 'F8FAFC' }, line: { color: '1E1B4B', width: 0.1, pt: 3 } });
        overviewSlide.addText('■ DOCUMENT OVERVIEW', { x: 1.2, y: 1.5, w: 5, h: 0.4, fontSize: 11, color: NAVY, bold: true, fontFace: FONT_FACE });
        overviewSlide.addText(manual.overview, { x: 1.2, y: 2.0, w: 9.3, h: 1.8, fontSize: 11, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true, lineSpacing: 22 });
    }

    let currentVideoIndex = 0;
    let slide: any = null;
    let itemsOnSlide = 0;
    let pageNum = 1;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const isTwoCol = step.layout === 'two-column';
        const isTwoRowV = step.layout === 'two-row-vertical';

        const isNewVideo = i > 0 && step.videoIndex !== currentVideoIndex;
        if (isNewVideo) {
            currentVideoIndex = step.videoIndex || 0;
        }

        const maxItems = (isTwoCol || isTwoRowV) ? 2 : 1;
        if (!slide || itemsOnSlide >= maxItems || isNewVideo) {
            slide = pptx.addSlide();
            pageNum++;
            addHeaderFooter(slide, pptx, manual.title, pageNum, isPortraitFile);
            itemsOnSlide = 0;
        }

        let xPos: number;
        let yOffset: number = 0;

        if (isTwoRowV) {
            xPos = 1.0;
            // A4縦のコンテンツエリア: ヘッダー後(0.65) 〜 フッター前(SLIDE_H-0.5)
            // 中間点から下半分のステップを開始する
            const contentStart = 0.65;
            const contentEnd = SLIDE_H - 0.5;
            const midY = contentStart + (contentEnd - contentStart) / 2;
            // step2の baseY = midY - 0.3. baseY = 0.85 + yOffset なので:
            // 1行目と2行目の間隔を狭くするため、基準点を上に引き上げる（+0.3から-0.3へ変更）
            yOffset = itemsOnSlide === 1 ? midY - 0.3 - 0.85 : 0;
        } else if (isTwoCol) {
            xPos = itemsOnSlide === 1 ? 6.1 : 0.7;
        } else {
            xPos = 0.7;
        }

        await addStepToSlide(slide, pptx, step, xPos, isTwoCol, isTwoRowV, yOffset, SLIDE_W, SLIDE_H);
        itemsOnSlide++;
    }

    await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}

function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number, isPortrait: boolean) {
    const NAVY = '1E1B4B';
    const FONT_FACE = 'Meiryo UI';
    if (isPortrait) {
        const W = 8.27;
        const H = 11.69;
        slide.addText(title, { x: 0.5, y: 0.25, w: W - 1.0, h: 0.4, fontSize: 12, color: NAVY, fontFace: FONT_FACE, bold: false });
        slide.addShape(pptx.ShapeType.line, { x: 0.5, y: 0.65, w: W - 1.0, h: 0, line: { color: NAVY, width: 0.5 } });
        slide.addShape(pptx.ShapeType.line, { x: 0.5, y: H - 0.5, w: W - 1.0, h: 0, line: { color: NAVY, width: 0.6 } });
        slide.addText(pageNum.toString(), { x: W - 1.0, y: H - 0.35, w: 0.5, h: 0.2, fontSize: 12, color: NAVY, fontFace: FONT_FACE, align: 'right' });
    } else {
        slide.addText(title, { x: 0.8, y: 0.35, w: 9, h: 0.4, fontSize: 12, color: NAVY, fontFace: FONT_FACE, bold: false });
        slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.75, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });
        slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 7.8, w: 10.1, h: 0, line: { color: NAVY, width: 0.6 } });
        slide.addText(pageNum.toString(), { x: 10.0, y: 7.9, w: 0.9, h: 0.2, fontSize: 12, color: NAVY, fontFace: FONT_FACE, align: 'right' });
    }
}

async function addStepToSlide(
    slide: any, pptx: any, step: any,
    xPos: number, isTwoCol: boolean, isTwoRowV: boolean,
    yOffset: number, slideW: number, slideH: number
) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';
    const cardWidth = 4.9;

    // 縦2行は上下それぞれの領域の起点Y、既存レイアウトはヘッダー固定Y
    const baseY = isTwoRowV ? (0.85 + yOffset) : 1.25;

    // 1. ナンバリング
    const numSize = isTwoRowV ? 0.35 : 0.45;
    // 縦2行の場合、数字が少し小さくなるので、テキストとのバランスを取るためにY座標を少し下げる
    const numY = isTwoRowV ? baseY + 0.05 : baseY;
    slide.addImage({ data: createStepNumberImage(step.stepNumber), x: xPos, y: numY, w: numSize, h: numSize });

    // 2. テキスト
    const textX = isTwoRowV ? xPos + 0.55 : xPos + 0.65;
    let textW: number;
    let actionFontSize: number;
    let detailFontSize: number;

    if (isTwoRowV) {
        textW = slideW - xPos - 0.65 - 1.0; // 左右に十分な余白を設定
        actionFontSize = 18;
        detailFontSize = 12;
    } else if (isTwoCol) {
        textW = cardWidth - 0.7;
        actionFontSize = 18;
        detailFontSize = 11;
    } else {
        textW = 9.3 - 0.7;
        actionFontSize = 24;
        detailFontSize = 14;
    }

    slide.addText(step.action, { x: textX, y: baseY, w: textW, h: 0.45, fontSize: actionFontSize, color: SLATE_900, bold: true, fontFace: FONT_FACE, valign: 'middle' });
    slide.addText(step.detail, { x: textX, y: baseY + 0.65, w: textW, h: 0.65, fontSize: detailFontSize, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true });

    // 3. 画像配置
    if (step.screenshot) {
        const dims = await getImageDimensions(step.screenshot);
        const isLandscape = dims.width >= dims.height;

        let finalW: number, finalH: number, imgY: number;

        if (isTwoRowV) {
            // 縦2行：縦の半分のスペースに収める
            const contentStart = 0.65;
            const contentEnd = slideH - 0.5;
            const halfH = (contentEnd - contentStart) / 2; // ~5.27in
            // 画像を上に詰める分、高さいっぱいに使えるようキャップを緩和 (Max 3.4in)
            const maxImgH = Math.min(halfH - 1.2, 3.4); 
            // 最大幅もさらに広げる（両端合わせて1.0インチ、左右0.5インチの余白）
            const maxImgW = slideW - 1.0;

            if (isLandscape) {
                finalW = maxImgW;
                finalH = Math.min(finalW / (dims.width / (dims.height || 1)), maxImgH);
                finalW = finalH * (dims.width / (dims.height || 1));
                if (finalW > maxImgW) { finalW = maxImgW; finalH = finalW / (dims.width / (dims.height || 1)); }
            } else {
                finalH = maxImgH;
                finalW = finalH * (3 / 4);
                if (finalW > maxImgW) {
                    finalW = maxImgW;
                    finalH = finalW / (3 / 4);
                }
            }
            // 画像の位置を少し上へ（1.5 -> 1.2）
            imgY = baseY + 1.2;
        } else if (isTwoCol) {
            if (isLandscape) {
                finalW = 4.8;
                finalH = 3.3;
            } else {
                finalH = 4.2;
                finalW = finalH * (3 / 4);
            }
            imgY = 3.1;
        } else {
            if (isLandscape) {
                finalW = 8.5;
                finalH = 4.0;
            } else {
                finalH = 4.8;
                finalW = finalH * (3 / 4);
            }
            imgY = 2.6;
        }

        const baseImgX = isTwoRowV
            ? (slideW - finalW) / 2
            : isTwoCol ? xPos + (cardWidth - finalW) / 2
            : (slideW - finalW) / 2;
        const imgX = (isTwoCol && baseImgX < xPos) ? xPos + 0.05 : baseImgX;

        slide.addImage({
            data: step.screenshot,
            x: imgX,
            y: imgY,
            w: finalW,
            h: finalH
        });
    }
}
