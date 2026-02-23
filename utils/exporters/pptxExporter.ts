import { ManualData } from '@/app/page';

/**
 * 画像のサイズを取得しアスペクト比を計算する
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
 * ナンバリング画像をCanvasで生成（現状の「OK」な状態を完全維持）
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

export async function generateAndDownloadPptx(manual: ManualData, layout: 'single' | 'two-column' = 'single', safeTitle: string): Promise<void> {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();

    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
    pptx.layout = 'A4_LANDSCAPE';

    const NAVY = '1E1B4B';
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    // 1. 表紙
    const coverSlide = pptx.addSlide();
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.30, fill: { color: NAVY } });
    // @ts-ignore
    coverSlide.addText('OPERATIONAL STANDARD', { x: 1.0, y: 2.8, w: 6, h: 0.4, fontSize: 16, color: NAVY, bold: false, fontFace: FONT_FACE, tracking: 2 });
    coverSlide.addText(manual.title, { x: 1.0, y: 3.3, w: '85%', h: 1.5, fontSize: 42, color: SLATE_900, bold: false, fontFace: FONT_FACE, valign: 'top', margin: 0 });
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.97, w: '100%', h: 0.30, fill: { color: NAVY } });

    // 2. 概要・手順
    const isTwoCol = layout === 'two-column';
    const steps = manual.steps;

    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1);
    overviewSlide.addShape(pptx.ShapeType.rect, { x: 1.0, y: 1.3, w: 9.7, h: 5.2, fill: { color: 'F8FAFC' }, line: { color: '1E1B4B', width: 0.1, pt: 3 } });
    overviewSlide.addText('■ DOCUMENT OVERVIEW', { x: 1.2, y: 1.5, w: 5, h: 0.4, fontSize: 11, color: NAVY, bold: true, fontFace: FONT_FACE });
    overviewSlide.addText(manual.overview, { x: 1.2, y: 2.0, w: 9.3, h: 4.2, fontSize: 11, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true, lineSpacing: 22 });

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

    // 1. ナンバリング（現状維持）
    slide.addImage({ data: createStepNumberImage(step.stepNumber), x: xPos, y: 1.25, w: 0.45, h: 0.45 });

    // 2. テキスト整列
    slide.addText(step.action, { x: xPos + 0.65, y: 1.25, w: cardWidth - 0.7, h: 0.45, fontSize: isTwoCol ? 18 : 24, color: SLATE_900, bold: true, fontFace: FONT_FACE, valign: 'middle' });
    slide.addText(step.detail, { x: xPos + 0.65, y: 1.9, w: cardWidth - 0.7, h: 0.8, fontSize: isTwoCol ? 11 : 14, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true });

    // 3. 画像配置（ズームされた縦4：横3の比率を優先）
    if (step.screenshot) {
        const dims = await getImageDimensions(step.screenshot);
        const aspect = dims.width > 0 ? dims.width / dims.height : 0.75;
        const isLandscape = dims.width >= dims.height;

        let finalW, finalH, imgY;

        if (isTwoCol) {
            // 2カラム：横画像設定（4.8 x 3.3）をベースに比率を維持
            finalW = 4.8;
            finalH = finalW / aspect;
            if (finalH > 3.3) {
                finalH = 3.3;
                finalW = finalH * aspect;
            }
            imgY = 3.1;
        } else {
            // 1カラム
            if (isLandscape) {
                // 横画像：OKをいただいた 8.5 x 4.0 を維持
                finalW = 8.5;
                finalH = 4.0;
                imgY = 2.6;
            } else {
                // 縦画像：ご指定の「縦4：横3」を再現
                // 高さを 4.5 程度に確保し、幅をその 3/4 (約3.37) に設定
                finalH = 4.5;
                finalW = finalH * (3 / 4);

                // 元の画像がさらに細長い場合は比率を尊重
                if (finalW / finalH > aspect) {
                    finalW = finalH * aspect;
                }
                imgY = 2.6;
            }
        }

        // 中央揃えのX座標を計算
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
