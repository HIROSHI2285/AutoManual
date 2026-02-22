import { ManualData } from '@/app/page';

/**
 * 画像のサイズ（幅・高さ）をBase64から取得してアスペクト比を判定する
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
 * ナンバリング用SVGロゴ生成
 * PDF版と同様の「x=50%, y=50%, dominant-baseline=central」を採用。
 * 垂直方向の微細なズレを防ぐため dy=".1em" で調整し、ど真ん中に固定。
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const radius = 58;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="64" cy="64" r="${radius}" fill="#1E1B4B" />
        <text x="50%" y="50%" dy=".1em" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="65px">${number}</text>
    </svg>`;
    const base64 = typeof btoa !== 'undefined'
        ? btoa(unescape(encodeURIComponent(svg)))
        : Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
}

/**
 * パワーポイントの生成とダウンロード
 */
export async function generateAndDownloadPptx(manual: ManualData, layout: 'single' | 'two-column' = 'single', safeTitle: string): Promise<void> {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();

    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
    pptx.layout = 'A4_LANDSCAPE';

    const NAVY = '1E1B4B';
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    // 1. 表紙スライド
    const coverSlide = pptx.addSlide();
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.30, fill: { color: NAVY } });
    // @ts-ignore
    coverSlide.addText('OPERATIONAL STANDARD', { x: 1.0, y: 2.8, w: 6, h: 0.4, fontSize: 16, color: NAVY, bold: false, fontFace: FONT_FACE, tracking: 2 });
    coverSlide.addText(manual.title, { x: 1.0, y: 3.3, w: '85%', h: 1.5, fontSize: 42, color: SLATE_900, bold: false, fontFace: FONT_FACE, valign: 'top', margin: 0 });
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.97, w: '100%', h: 0.30, fill: { color: NAVY } });

    // 2. 概要・手順スライド
    const isTwoCol = layout === 'two-column';
    const steps = manual.steps;

    // 概要
    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1);
    overviewSlide.addShape(pptx.ShapeType.rect, { x: 1.0, y: 1.3, w: 9.7, h: 5.2, fill: { color: 'F8FAFC' }, line: { color: '1E1B4B', width: 0.1, pt: 3 } });
    overviewSlide.addText('■ DOCUMENT OVERVIEW', { x: 1.2, y: 1.5, w: 5, h: 0.4, fontSize: 11, color: NAVY, bold: true, fontFace: FONT_FACE });
    overviewSlide.addText(manual.overview, { x: 1.2, y: 2.0, w: 9.3, h: 4.2, fontSize: 11, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true, lineSpacing: 22 });

    // 手順ループ
    for (let i = 0; i < steps.length; (isTwoCol ? i += 2 : i++)) {
        const slide = pptx.addSlide();
        const pageNum = (isTwoCol ? Math.floor(i / 2) + 2 : i + 2);
        addHeaderFooter(slide, pptx, manual.title, pageNum);

        await addStepToSlide(slide, pptx, steps[i], (isTwoCol ? 0.7 : 1.2), isTwoCol);
        if (isTwoCol && steps[i + 1]) {
            await addStepToSlide(slide, pptx, steps[i + 1], 6.1, true);
        }
    }

    await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}

function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';
    const FONT_FACE = 'Meiryo UI';
    slide.addText(title, { x: 0.8, y: 0.35, w: 9, h: 0.4, fontSize: 12, color: NAVY, fontFace: FONT_FACE, bold: false });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.75, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 7.8, w: 10.1, h: 0, line: { color: NAVY, width: 0.6 } });
    slide.addText(pageNum.toString(), { x: 10.0, y: 7.9, w: 0.9, h: 0.2, fontSize: 12, color: NAVY, fontFace: FONT_FACE, align: 'right' });
}

async function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    const cardWidth = isTwoCol ? 4.9 : 9.3;
    const numSize = 0.50;

    // 1. ナンバリング (センター出し修正版)
    slide.addImage({ data: createStepNumberSvg(step.stepNumber), x: xPos, y: 1.25, w: numSize, h: numSize });

    // 2. 見出し
    slide.addText(step.action, { x: xPos + 0.65, y: 1.25, w: cardWidth - 0.7, h: numSize, fontSize: isTwoCol ? 18 : 24, color: SLATE_900, bold: true, fontFace: FONT_FACE, valign: 'middle' });

    // 3. 詳細
    slide.addText(step.detail, { x: xPos + 0.65, y: 1.9, w: cardWidth - 0.7, h: 0.8, fontSize: isTwoCol ? 11 : 14, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true });

    // 4. 画像 (アスペクト比を維持して縦伸びを防止)
    if (step.screenshot) {
        const dims = await getImageDimensions(step.screenshot);
        const imgAspect = dims.width / dims.height;

        let maxW, maxH, imgY;

        if (isTwoCol) {
            // 2カラム：現状維持
            maxW = 4.8;
            maxH = 3.3;
            imgY = 3.1;
        } else {
            // 1カラム
            const isLandscape = dims.width > dims.height;
            // 横画像なら 8.5 (テキスト幅 9.3 より少し内側)
            // 縦画像なら 5.5 に制限
            maxW = isLandscape ? 8.5 : 5.5;
            maxH = 4.5;
            imgY = 2.8;
        }

        // 枠内に収まるようにサイズを計算
        let finalW = maxW;
        let finalH = finalW / imgAspect;

        if (finalH > maxH) {
            finalH = maxH;
            finalW = finalH * imgAspect;
        }

        // 中央揃えのためのX座標計算
        const imgX = isTwoCol ? xPos + (4.9 - finalW) / 2 : (11.69 - finalW) / 2;

        slide.addImage({
            data: step.screenshot,
            x: imgX,
            y: imgY,
            w: finalW,
            h: finalH
        });
    }
}
