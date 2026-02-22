import { ManualData } from '@/app/page';

/**
 * ナンバリング用SVGロゴ生成
 * PDF版で成功しているロジックをベースに、PPTのレンダリング特性に合わせて
 * 数字専用フォント(Verdana)と座標微調整を加え、完璧な中央配置を実現します。
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#1E1B4B" />
        <text x="50%" y="50%" dy=".05em" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="Verdana, sans-serif" font-weight="900" font-size="70px">${number}</text>
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

    // 1. 表紙スライド (上下ライン幅・太さ維持)
    const coverSlide = pptx.addSlide();
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.30, fill: { color: NAVY } });

    // tracking プロパティは TypeScript エラーになるため削除
    coverSlide.addText('OPERATIONAL STANDARD', { x: 1.0, y: 2.8, w: 6, h: 0.4, fontSize: 16, color: NAVY, bold: false, fontFace: FONT_FACE });
    coverSlide.addText(manual.title, { x: 1.0, y: 3.3, w: '85%', h: 1.5, fontSize: 42, color: SLATE_900, bold: false, fontFace: FONT_FACE, valign: 'top', margin: 0 });

    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.97, w: '100%', h: 0.30, fill: { color: NAVY } });

    // 2. 概要・手順スライド
    const isTwoCol = layout === 'two-column';
    const steps = manual.steps;

    // 概要
    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1);
    overviewSlide.addText('■ DOCUMENT OVERVIEW', { x: 1.0, y: 1.3, w: 5, h: 0.4, fontSize: 14, color: NAVY, bold: false, fontFace: FONT_FACE });
    overviewSlide.addText(manual.overview, { x: 1.0, y: 1.8, w: 9.7, h: 4.5, fontSize: 12, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true, lineSpacing: 24 });

    // 手順
    if (isTwoCol) {
        for (let i = 0; i < steps.length; i += 2) {
            const slide = pptx.addSlide();
            addHeaderFooter(slide, pptx, manual.title, Math.floor(i / 2) + 2);
            addStepToSlide(slide, pptx, steps[i], 0.7, true);
            if (steps[i + 1]) addStepToSlide(slide, pptx, steps[i + 1], 6.1, true);
        }
    } else {
        for (let i = 0; i < steps.length; i++) {
            const slide = pptx.addSlide();
            addHeaderFooter(slide, pptx, manual.title, i + 2);
            addStepToSlide(slide, pptx, steps[i], 1.2, false);
        }
    }

    await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}

function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';
    const FONT_FACE = 'Meiryo UI';

    // ヘッダー (太字解除・12pt)
    slide.addText(title, { x: 0.8, y: 0.35, w: 9, h: 0.4, fontSize: 12, color: NAVY, fontFace: FONT_FACE, bold: false });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.75, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });

    // フッターライン (ご要望通り少し位置を下げて 7.7)
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 7.7, w: 10.1, h: 0, line: { color: NAVY, width: 0.6 } });
    // ページ番号 (ラインとの間隔を空けるため 7.95)
    slide.addText(pageNum.toString(), { x: 10.0, y: 7.95, w: 0.9, h: 0.2, fontSize: 12, color: NAVY, fontFace: FONT_FACE, align: 'right' });
}

function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    const cardWidth = isTwoCol ? 4.9 : 9.3;
    const numSize = 0.55;

    // 1. ナンバリング (センター調整済みSVG)
    slide.addImage({ data: createStepNumberSvg(step.stepNumber), x: xPos, y: 1.25, w: numSize, h: numSize });

    // 2. 見出し (24pt・中央揃え)
    slide.addText(step.action, { x: xPos + 0.75, y: 1.25, w: cardWidth - 0.8, h: numSize, fontSize: isTwoCol ? 18 : 24, color: SLATE_900, bold: true, fontFace: FONT_FACE, valign: 'middle' });

    // 3. 詳細 (14pt・左端を見出しと揃える)
    slide.addText(step.detail, { x: xPos + 0.75, y: 2.0, w: cardWidth - 0.8, h: 0.8, fontSize: isTwoCol ? 11 : 14, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true });

    // 4. 画像 (位置を上に上げ、横伸びを完全に防止)
    if (step.screenshot) {
        const imgWidth = isTwoCol ? 4.8 : 8.5;
        const imgHeight = isTwoCol ? 3.3 : 4.0;
        const imgY = isTwoCol ? 2.8 : 2.9; // 位置を上に引き上げ
        const imgX = isTwoCol ? xPos + 0.05 : (11.69 - imgWidth) / 2;

        slide.addImage({
            data: step.screenshot,
            x: imgX,
            y: imgY,
            sizing: { type: 'contain', w: imgWidth, h: imgHeight }
        });
    }
}
