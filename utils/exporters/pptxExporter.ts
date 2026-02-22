import { ManualData } from '@/app/page';

/**
 * ナンバリング用SVGロゴ生成（高解像度・角丸四角形）
 * アプリのUI（bg-slate-950）に合わせた配色と角丸(rx)を適用
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const r = 32; // UIに合わせた角丸設定
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" fill="#0F172A" />
        <text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Meiryo, sans-serif" font-weight="900" font-size="72px">${number}</text>
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
    const FONT_FACE = 'Meiryo UI'; // 指定のMeiryo UIを使用

    // 1. 表紙スライド (サンプルに合わせたプロフェッショナルな構成)
    const coverSlide = pptx.addSlide();
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.12, fill: { color: NAVY } });

    // trackingプロパティはTypeScriptの型エラーになるため削除
    coverSlide.addText('OPERATIONAL STANDARD', {
        x: 1.0, y: 2.8, w: 5, h: 0.4,
        fontSize: 16, color: NAVY, bold: true, fontFace: FONT_FACE
    });

    coverSlide.addText(manual.title, {
        x: 1.0, y: 3.3, w: '85%', h: 1.5,
        fontSize: 42, color: SLATE_900, bold: true, fontFace: FONT_FACE,
        valign: 'top', margin: 0
    });

    coverSlide.addShape(pptx.ShapeType.rect, { x: 1.0, y: 5.5, w: 2.8, h: 0.06, fill: { color: NAVY } });

    // 2. 概要スライド
    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1);

    overviewSlide.addText('■ DOCUMENT OVERVIEW', {
        x: 1.0, y: 1.5, w: 5, h: 0.4,
        fontSize: 14, color: NAVY, bold: true, fontFace: FONT_FACE
    });

    overviewSlide.addText(manual.overview, {
        x: 1.0, y: 2.0, w: 9.7, h: 4.0,
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
            addStepToSlide(slide, pptx, steps[i], 0.7, true);
            if (steps[i + 1]) {
                addStepToSlide(slide, pptx, steps[i + 1], 6.1, true);
            }
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
 * ヘッダー・フッターの描画
 */
function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';
    const FONT_FACE = 'Meiryo UI';

    // ヘッダーライン
    slide.addText(title, {
        x: 0.8, y: 0.35, w: 9, h: 0.4,
        fontSize: 10, color: NAVY, fontFace: FONT_FACE, bold: true
    });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.75, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });

    // フッターライン (ご要望通り、より下の位置 y: 7.9 に配置)
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 7.85, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });
    slide.addText(pageNum.toString(), {
        x: 10.0, y: 7.9, w: 0.9, h: 0.3,
        fontSize: 10, color: NAVY, fontFace: FONT_FACE, align: 'right'
    });
}

/**
 * スライドに手順を追加
 */
function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    const cardWidth = isTwoCol ? 4.9 : 9.3;
    const numSize = 0.55; // 現行より少し大きく設定

    // 1. ナンバリング (SVGロゴ画像)
    slide.addImage({
        data: createStepNumberSvg(step.stepNumber),
        x: xPos, y: 1.25, w: numSize, h: numSize
    });

    // 2. タイトル (アクション) - サンプルのような太字強調
    slide.addText(step.action, {
        x: xPos + 0.75, y: 1.25, w: cardWidth - 0.8, h: numSize,
        fontSize: isTwoCol ? 18 : 26, color: SLATE_900, bold: true, fontFace: FONT_FACE,
        valign: 'middle'
    });

    // 3. 詳細説明 - インデントを揃えて配置
    slide.addText(step.detail, {
        x: xPos + 0.75, y: 2.0, w: cardWidth - 0.8, h: 0.8,
        fontSize: isTwoCol ? 11 : 13, color: SLATE_600, fontFace: FONT_FACE,
        valign: 'top', breakLine: true
    });

    // 4. 画像 - 画像の横伸びを防ぐため sizing プロパティを使用して完全に制御
    if (step.screenshot) {
        const imgWidth = isTwoCol ? 4.8 : 8.5;
        const imgHeight = isTwoCol ? 3.5 : 4.5;
        const imgY = isTwoCol ? 3.1 : 3.2;
        const imgX = isTwoCol ? xPos + 0.05 : (11.69 - imgWidth) / 2;

        slide.addImage({
            data: step.screenshot,
            x: imgX, y: imgY,
            sizing: { type: 'contain', w: imgWidth, h: imgHeight }
        });
    }
}
