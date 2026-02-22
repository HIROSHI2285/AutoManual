import { ManualData } from '@/app/page';

/**
 * 画像のサイズ（幅・高さ）をBase64から取得する
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
 * ナンバリング用SVGロゴ生成（PDF版準拠）
 * 幾何学的な中央(50%)に配置し、PPTのレンダリング特性に合わせた補正を適用
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="64" cy="64" r="58" fill="#1E1B4B" />
        <text x="50%" y="52%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="70px">${number}</text>
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

    // 手順ループ（非同期処理のため for...of を使用）
    let stepCount = 0;
    if (isTwoCol) {
        for (let i = 0; i < steps.length; i += 2) {
            const slide = pptx.addSlide();
            addHeaderFooter(slide, pptx, manual.title, Math.floor(i / 2) + 2);
            await addStepToSlide(slide, pptx, steps[i], 0.7, true);
            if (steps[i + 1]) await addStepToSlide(slide, pptx, steps[i + 1], 6.1, true);
        }
    } else {
        for (const step of steps) {
            const slide = pptx.addSlide();
            addHeaderFooter(slide, pptx, manual.title, stepCount + 2);
            await addStepToSlide(slide, pptx, step, 0.8, false);
            stepCount++;
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
    const cardWidth = isTwoCol ? 4.9 : 10.1;
    const numSize = 0.50;

    // 1. ナンバリング
    slide.addImage({ data: createStepNumberSvg(step.stepNumber), x: xPos, y: 1.25, w: numSize, h: numSize });

    // 2. 見出し
    slide.addText(step.action, { x: xPos + 0.65, y: 1.25, w: cardWidth - 0.7, h: numSize, fontSize: isTwoCol ? 18 : 24, color: SLATE_900, bold: true, fontFace: FONT_FACE, valign: 'middle' });

    // 3. 詳細
    slide.addText(step.detail, { x: xPos + 0.65, y: 1.9, w: cardWidth - 0.7, h: 0.8, fontSize: isTwoCol ? 11 : 14, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true });

    // 4. 画像（縦横比に応じて調整）
    if (step.screenshot) {
        const dimensions = await getImageDimensions(step.screenshot);
        const isLandscape = dimensions.width > dimensions.height;

        let imgWidth, imgHeight, imgY, imgX;

        if (isTwoCol) {
            imgWidth = 4.8;
            imgHeight = 3.5;
            imgY = 3.1; // 2カラム時の画像位置をさらに下へ
            imgX = xPos + 0.05;
        } else {
            // シングルカラム
            if (isLandscape) {
                // 横長画像はPDFのように横幅いっぱいに
                imgWidth = 10.0;
                imgHeight = 4.5;
                imgY = 2.8;
                imgX = (11.69 - imgWidth) / 2;
            } else {
                // 縦長画像はこれまでのバランスを維持
                imgWidth = 8.5;
                imgHeight = 4.5;
                imgY = 2.8;
                imgX = (11.69 - imgWidth) / 2;
            }
        }

        slide.addImage({
            data: step.screenshot,
            x: imgX,
            y: imgY,
            sizing: { type: 'contain', w: imgWidth, h: imgHeight }
        });
    }
}
