import { ManualData } from '@/app/page';

/**
 * 紺色の円形ナンバリングSVG（PPTX用に最適化）
 * 現行の 0.35inch より少し大きく (0.45inch) 見えるよう設計
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const radius = 60; // 視認性を高めるため円を大きく設定
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="#1e1b4b" />
        <text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Meiryo, sans-serif" font-weight="bold" font-size="64px">${number}</text>
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

    // A4横サイズ (11.69 x 8.27 inch) を定義
    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
    pptx.layout = 'A4_LANDSCAPE';

    const NAVY = '1E1B4B';
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    // ユーザー指定によりMeiryo UIに固定
    const FONT_FACE = 'Meiryo UI';

    // 1. 表紙スライド
    const coverSlide = pptx.addSlide();
    // 上部の装飾ライン
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.1, fill: { color: NAVY } });

    coverSlide.addText('OPERATIONAL STANDARD', {
        x: 1.0, y: 2.8, w: 5, h: 0.4,
        fontSize: 16, color: NAVY, bold: true, fontFace: FONT_FACE
    });

    coverSlide.addText(manual.title, {
        x: 1.0, y: 3.3, w: '85%', h: 1.5,
        fontSize: 42, color: SLATE_900, bold: true, fontFace: FONT_FACE,
        valign: 'top', margin: 0
    });

    coverSlide.addShape(pptx.ShapeType.rect, { x: 1.0, y: 5.2, w: 2.0, h: 0.05, fill: { color: NAVY } });

    // 2. 概要スライド
    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1);

    overviewSlide.addText('■ DOCUMENT OVERVIEW', {
        x: 1.0, y: 1.5, w: 5, h: 0.4,
        fontSize: 14, color: NAVY, bold: true, fontFace: FONT_FACE
    });

    overviewSlide.addText(manual.overview, {
        x: 1.0, y: 2.0, w: 9.5, h: 2.0,
        fontSize: 12, color: SLATE_600, fontFace: FONT_FACE,
        valign: 'top', breakLine: true, lineSpacing: 24
    });

    // 3. 手順スライド
    const isTwoCol = layout === 'two-column';
    const steps = manual.steps;

    if (isTwoCol) {
        for (let i = 0; i < steps.length; i += 2) {
            const slide = pptx.addSlide();
            addHeaderFooter(slide, pptx, manual.title, Math.floor(i / 2) + 2);
            addStepToSlide(slide, pptx, steps[i], 0.6, true);
            if (steps[i + 1]) {
                addStepToSlide(slide, pptx, steps[i + 1], 6.0, true);
            }
        }
    } else {
        for (let i = 0; i < steps.length; i++) {
            const slide = pptx.addSlide();
            addHeaderFooter(slide, pptx, manual.title, i + 2);
            addStepToSlide(slide, pptx, steps[i], 1.0, false);
        }
    }

    await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}

function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';
    const FONT_FACE = 'Meiryo UI';

    slide.addText(title, {
        x: 0.8, y: 0.4, w: 9, h: 0.4,
        fontSize: 10, color: NAVY, fontFace: FONT_FACE, bold: true
    });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.8, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });

    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 7.5, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });
    slide.addText(pageNum.toString(), {
        x: 10.0, y: 7.6, w: 1, h: 0.3,
        fontSize: 10, color: NAVY, fontFace: FONT_FACE, align: 'right'
    });
}

function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    const cardWidth = isTwoCol ? 5.0 : 9.7;
    const numSize = 0.45; // 現行より少し大きめに設定

    // 1. ナンバリング (SVG形式で解像度を維持)
    slide.addImage({
        data: createStepNumberSvg(step.stepNumber),
        x: xPos, y: 1.2, w: numSize, h: numSize
    });

    // 2. アクション (タイトル) - サンプルのような大胆な太字
    slide.addText(step.action, {
        x: xPos + 0.6, y: 1.2, w: cardWidth - 0.7, h: numSize,
        fontSize: isTwoCol ? 18 : 24, color: SLATE_900, bold: true, fontFace: FONT_FACE,
        valign: 'middle'
    });

    // 3. 詳細説明 - インデント位置を揃え、可読性を向上
    slide.addText(step.detail, {
        x: xPos + 0.6, y: 1.8, w: cardWidth - 0.7, h: 0.8,
        fontSize: isTwoCol ? 11 : 13, color: SLATE_600, fontFace: FONT_FACE,
        valign: 'top', breakLine: true
    });

    // 4. 画像 - 前回の要望通り「上寄せ」配置を徹底し、画像が横伸びしないようsizingで厳重にロック。
    if (step.screenshot) {
        const imgWidth = isTwoCol ? 4.8 : 8.5;
        const imgHeight = isTwoCol ? 3.5 : 4.5;
        const imgY = isTwoCol ? 2.8 : 3.0; // 本文の下に配置
        const imgX = isTwoCol ? xPos + 0.1 : (11.69 - imgWidth) / 2;

        slide.addImage({
            data: step.screenshot,
            x: imgX, y: imgY,
            sizing: { type: 'contain', w: imgWidth, h: imgHeight }
        });
    }
}
