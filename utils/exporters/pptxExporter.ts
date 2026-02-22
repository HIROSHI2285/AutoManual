import { ManualData } from '@/app/page';

/**
 * ナンバリング用SVGロゴ生成
 * Arialフォントで完璧な中央配置を実現
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="64" cy="64" r="58" fill="#1E1B4B" />
        <text x="64" y="76" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-weight="bold" font-size="65px">${number}</text>
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

    // 1. 表紙スライド（仕様維持）
    const coverSlide = pptx.addSlide();
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.30, fill: { color: NAVY } });

    // tracking プロパティは @types/pptxgenjs に定義されていない可能性があるため // @ts-ignore で回避しておくのが安全です（または any キャスト）
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

    // PDF版と同じスタイル：グレー背景＋左ボーダー
    overviewSlide.addShape(pptx.ShapeType.rect, {
        x: 1.0,
        y: 1.3,
        w: 9.7,
        h: 5.2,
        fill: { color: 'F8FAFC' }, // グレー背景
        line: { color: '1E1B4B', width: 0.1, pt: 3 } // 左側に紺色ボーダー
    });

    overviewSlide.addText('■ DOCUMENT OVERVIEW', {
        x: 1.2,
        y: 1.5,
        w: 5,
        h: 0.4,
        fontSize: 11,
        color: NAVY,
        bold: true,
        fontFace: FONT_FACE
    });

    overviewSlide.addText(manual.overview, {
        x: 1.2,
        y: 2.0,
        w: 9.3,
        h: 4.2,
        fontSize: 11,
        color: SLATE_600,
        fontFace: FONT_FACE,
        valign: 'top',
        breakLine: true,
        lineSpacing: 22
    });

    // 手順ループ
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

/**
 * 共通ヘッダー・フッター
 */
function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';
    const FONT_FACE = 'Meiryo UI';

    // ヘッダー (12pt・太字解除)
    slide.addText(title, { x: 0.8, y: 0.35, w: 9, h: 0.4, fontSize: 12, color: NAVY, fontFace: FONT_FACE, bold: false });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.75, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });

    // フッターライン (ご要望通り 7.8 に配置)
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 7.8, w: 10.1, h: 0, line: { color: NAVY, width: 0.6 } });
    // ページ番号 (ご要望通り 7.9 に配置)
    slide.addText(pageNum.toString(), { x: 10.0, y: 7.9, w: 0.9, h: 0.2, fontSize: 12, color: NAVY, fontFace: FONT_FACE, align: 'right' });
}

/**
 * 手順の描画
 */
function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    const cardWidth = isTwoCol ? 4.9 : 9.3;
    const numSize = 0.45; // 0.55 → 0.45 に縮小

    // 1. ナンバリング
    slide.addImage({ data: createStepNumberSvg(step.stepNumber), x: xPos, y: 1.25, w: numSize, h: numSize });

    // 2. 見出し (24pt)
    slide.addText(step.action, { x: xPos + 0.65, y: 1.25, w: cardWidth - 0.7, h: numSize, fontSize: isTwoCol ? 18 : 24, color: SLATE_900, bold: true, fontFace: FONT_FACE, valign: 'middle' });

    // 3. 詳細 (14pt)
    slide.addText(step.detail, { x: xPos + 0.65, y: 1.9, w: cardWidth - 0.7, h: 0.8, fontSize: isTwoCol ? 11 : 14, color: SLATE_600, fontFace: FONT_FACE, valign: 'top', breakLine: true });

    // 4. 画像 (位置を上に調整し、横伸びを防止)
    if (step.screenshot) {
        const imgWidth = isTwoCol ? 4.8 : 8.5;
        const imgHeight = isTwoCol ? 3.3 : 4.0;
        const imgY = isTwoCol ? 2.5 : 2.6; // 少し上に調整
        const imgX = isTwoCol ? xPos + 0.05 : (11.69 - imgWidth) / 2;

        slide.addImage({
            data: step.screenshot,
            x: imgX,
            y: imgY,
            sizing: { type: 'contain', w: imgWidth, h: imgHeight }
        });
    }
}
