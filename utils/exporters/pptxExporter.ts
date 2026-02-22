import { ManualData } from '@/app/page';

/**
 * ナンバリング用SVGロゴ生成（PDF版のロジックに完全準拠）
 * dominant-baselineとtext-anchorにより、数字を円のど真ん中に固定します。
 */
function createStepNumberSvg(number: number): string {
    const size = 128;
    const radius = 60; // 視認性向上のため円を大きく
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="#1E1B4B" />
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Arial" font-weight="900" font-size="70px">${number}</text>
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

    // 表紙：上限と下限に配置。太さを0.30（従来の倍）に変更
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.30, fill: { color: NAVY } });

    // tracking プロパティは TypeScript でエラるから元のファイルから削除されている（今回は含めないよう注記があったが、ユーザーコードにはしれっと `tracking: 2` が入っている。一旦入れて TSC エラーが出たら消すか、初めから消しておくか。TSの型定義に無いので事前に消す。）
    coverSlide.addText('OPERATIONAL STANDARD', {
        x: 1.0, y: 2.8, w: 6, h: 0.4,
        fontSize: 16, color: NAVY, bold: false, fontFace: FONT_FACE
    });

    coverSlide.addText(manual.title, {
        x: 1.0, y: 3.3, w: '85%', h: 1.5,
        fontSize: 42, color: SLATE_900, bold: false, fontFace: FONT_FACE,
        valign: 'top', margin: 0
    });

    // 表紙：下限位置 (8.27 - 0.30 = 7.97)
    coverSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.97, w: '100%', h: 0.30, fill: { color: NAVY } });

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

    for (let i = 0; i < steps.length; (isTwoCol ? i += 2 : i++)) {
        const slide = pptx.addSlide();
        const currentPageNum = (isTwoCol ? Math.floor(i / 2) + 2 : i + 2);
        addHeaderFooter(slide, pptx, manual.title, currentPageNum);

        addStepToSlide(slide, pptx, steps[i], (isTwoCol ? 0.7 : 1.2), isTwoCol);
        if (isTwoCol && steps[i + 1]) {
            addStepToSlide(slide, pptx, steps[i + 1], 6.1, true);
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

    // ヘッダー：12pt 太字解除
    slide.addText(title, {
        x: 0.8, y: 0.35, w: 9, h: 0.4,
        fontSize: 12, color: NAVY, fontFace: FONT_FACE, bold: false
    });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 0.75, w: 10.1, h: 0, line: { color: NAVY, width: 0.5 } });

    // フッターラインとページ番号の位置：さらに下へ調整 (y: 8.0)
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: 8.0, w: 10.1, h: 0, line: { color: NAVY, width: 0.6 } });
    slide.addText(pageNum.toString(), {
        x: 10.0, y: 8.02, w: 0.9, h: 0.2,
        fontSize: 12, color: NAVY, fontFace: FONT_FACE, align: 'right'
    });
}

/**
 * 手順の描画
 */
function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const SLATE_900 = '0F172A';
    const SLATE_600 = '475569';
    const FONT_FACE = 'Meiryo UI';

    const cardWidth = isTwoCol ? 4.9 : 9.3;
    const numSize = 0.55;

    // ナンバリング：y: 1.25 (PDF版のセンター出しロジック適用)
    slide.addImage({
        data: createStepNumberSvg(step.stepNumber),
        x: xPos, y: 1.25, w: numSize, h: numSize
    });

    // 見出し：24pt
    slide.addText(step.action, {
        x: xPos + 0.75, y: 1.25, w: cardWidth - 0.8, h: numSize,
        fontSize: isTwoCol ? 18 : 24, color: SLATE_900, bold: true, fontFace: FONT_FACE,
        valign: 'middle'
    });

    // 詳細：14pt
    slide.addText(step.detail, {
        x: xPos + 0.75, y: 2.0, w: cardWidth - 0.8, h: 0.8,
        fontSize: isTwoCol ? 11 : 14, color: SLATE_600, fontFace: FONT_FACE,
        valign: 'top', breakLine: true
    });

    // 画像：伸びを防止し、フッター(y: 8.0)に被らないよう高さを制限
    if (step.screenshot) {
        const imgWidth = isTwoCol ? 4.8 : 8.5;
        const imgHeight = isTwoCol ? 3.3 : 4.0;
        const imgY = isTwoCol ? 3.1 : 3.2;
        const imgX = isTwoCol ? xPos + 0.05 : (11.69 - imgWidth) / 2;

        slide.addImage({
            data: step.screenshot,
            x: imgX, y: imgY, w: imgWidth, h: imgHeight,
            sizing: { type: 'contain', w: imgWidth, h: imgHeight }
        });
    }
}
