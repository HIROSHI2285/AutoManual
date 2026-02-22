import { ManualData } from '@/app/page';

/**
 * ナンバリング用SVGロゴ生成（数字と紺色の円を完全に一体化）
 * メイリオUIを使用し、高解像度で生成することでPPT側でのズレを防止
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#1E1B4B" />
        <text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Meiryo UI" font-weight="900" font-size="70px">${number}</text>
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

    // A4横サイズ (11.69 x 8.27 inch)
    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
    pptx.layout = 'A4_LANDSCAPE';

    const NAVY = '1E1B4B';
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    // 1. 表紙スライド
    const coverSlide = pptx.addSlide();

    // 上下のライン：幅100%、太さ0.15で統一
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.15, fill: { color: NAVY } });

    // trackingプロパティはTypeScriptエラーになるため除外して適用
    coverSlide.addText('OPERATIONAL STANDARD', {
        x: 1.0, y: 2.8, w: 6, h: 0.4,
        fontSize: 16, color: NAVY, bold: false, fontFace: FONT_FACE
    });

    coverSlide.addText(manual.title, {
        x: 1.0, y: 3.3, w: '85%', h: 1.5,
        fontSize: 42, color: SLATE_900, bold: false, fontFace: FONT_FACE,
        valign: 'top', margin: 0
    });

    // 表紙の下線：上線と同じ太さで位置を引き上げ (y: 7.5)
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.5, w: '100%', h: 0.15, fill: { color: NAVY } });

    // 2. 概要スライド
    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1);

    overviewSlide.addText('■ DOCUMENT OVERVIEW', {
        x: 1.0, y: 1.3, w: 5, h: 0.4,
        fontSize: 14, color: NAVY, bold: false, fontFace: FONT_FACE
    });

    overviewSlide.addText(manual.overview, {
        x: 1.0, y: 1.8, w: 9.7, h: 4.5,
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

function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';
    const FONT_FACE = 'Meiryo UI';

    // ヘッダー：太字を解除
    slide.addText(title, {
        x: 0.8, y: 0.35, w: 9, h: 0.4,
        fontSize: 10, color: NAVY, fontFace: FONT_FACE, bold: false
    });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.75, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });

    // フッターライン：位置を高く調整 (y: 7.5)
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 7.5, w: 10.1, h: 0, line: { color: NAVY, width: 0.6 } });
    slide.addText(pageNum.toString(), {
        x: 10.0, y: 7.55, w: 0.9, h: 0.15,
        fontSize: 10, color: NAVY, fontFace: FONT_FACE, align: 'right'
    });
}

function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    const cardWidth = isTwoCol ? 4.9 : 9.3;
    const numSize = 0.55;

    // 1. ナンバリング（一体型SVGロゴを挿入）：赤字指示の通り y: 1.25 に配置
    slide.addImage({
        data: createStepNumberSvg(step.stepNumber),
        x: xPos, y: 1.25, w: numSize, h: numSize
    });

    // 2. 見出しテキスト：y座標と高さをロゴと一致させ、中央揃え(valign)にすることで垂直軸を合致させる
    slide.addText(step.action, {
        x: xPos + 0.75, y: 1.25, w: cardWidth - 0.8, h: numSize,
        fontSize: isTwoCol ? 18 : 26, color: SLATE_900, bold: true, fontFace: FONT_FACE,
        valign: 'middle'
    });

    // 3. 詳細説明：開始位置(x)を見出し(xPos + 0.75)と完全に揃え、赤字指示の水平整列を再現
    slide.addText(step.detail, {
        x: xPos + 0.75, y: 2.0, w: cardWidth - 0.8, h: 0.8,
        fontSize: isTwoCol ? 11 : 13, color: SLATE_600, fontFace: FONT_FACE,
        valign: 'top', breakLine: true
    });

    // 4. 画像：アスペクト比を維持して枠内に収める
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
