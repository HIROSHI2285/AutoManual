import { ManualData } from '@/app/page';

/**
 * パワーポイントの生成とダウンロード
 */
export async function generateAndDownloadPptx(manual: ManualData, layout: 'single' | 'two-column' = 'single', safeTitle: string): Promise<void> {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();

    // UNKNOWN-LAYOUT エラーを解消するため、カスタムレイアウト(A4横)を定義
    pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.69, height: 8.27 });
    pptx.layout = 'A4_LANDSCAPE';

    const NAVY = '1E1B4B';
    const GRAY_BG = 'F8FAFC';
    const SLATE_900 = '0F172A';
    const SLATE_500 = '64748B';
    const FONT = 'Meiryo UI';

    // ---------------------------------------------------------
    // 1. 表紙スライド
    // ---------------------------------------------------------
    const coverSlide = pptx.addSlide();

    // 上部のソリッドライン（PDFに合わせた紺色線）
    coverSlide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: 0.15,
        fill: { color: NAVY }
    });

    coverSlide.addText('OPERATIONAL STANDARD', {
        x: 0.8, y: 2.5, w: 5, h: 0.4,
        fontSize: 14, color: NAVY, bold: true, fontFace: FONT
    });

    coverSlide.addText(manual.title, {
        x: 0.8, y: 3.0, w: '85%', h: 1.2,
        fontSize: 38, color: SLATE_900, bold: true, fontFace: FONT,
        valign: 'top'
    });

    // 下部のソリッドライン（PDFに合わせた紺色線）
    coverSlide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 8.12, w: '100%', h: 0.15, // 8.27(height) - 0.15
        fill: { color: NAVY }
    });

    // ---------------------------------------------------------
    // 2. 概要スライド 兼 手順スライド (Page 1)
    // ---------------------------------------------------------
    const isTwoCol = layout === 'two-column';
    const steps = manual.steps;

    // Overviewの作成 (Slide 2, ページ番号1)
    const page1Slide = pptx.addSlide();
    addHeaderFooter(page1Slide, pptx, manual.title, 1);

    page1Slide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 1.2, w: '90%', h: 1.2, // 縮小して余白を確保
        fill: { color: GRAY_BG },
        line: { color: NAVY, width: 2 },
    });

    page1Slide.addText('■ DOCUMENT OVERVIEW', {
        x: 0.7, y: 1.3, w: 5, h: 0.3,
        fontSize: 11, color: NAVY, bold: true, fontFace: FONT
    });

    page1Slide.addText(manual.overview, {
        x: 0.7, y: 1.6, w: '85%', h: 0.7,
        fontSize: 10.5, color: SLATE_500, fontFace: FONT,
        valign: 'top', breakLine: true
    });

    // ---------------------------------------------------------
    // 3. 手順描画ループ (Overviewの下から開始)
    // ---------------------------------------------------------
    let currentSlide = page1Slide;
    let pageNum = 1;
    let stepIndex = 0;

    // Overviewが存在するPage 1用のY軸オフセット
    const OVERVIEW_OFFSETY = 1.4;

    while (stepIndex < steps.length) {
        // 新しいページが必要か判定 (pageNum > 1の場合は新規スライド)
        if (pageNum > 1) {
            currentSlide = pptx.addSlide();
            addHeaderFooter(currentSlide, pptx, manual.title, pageNum);
        }

        const offsetY = (pageNum === 1) ? OVERVIEW_OFFSETY : 0;

        // Overviewがあるページ1は、スペースが狭いため画像の高さを少し縮小する係数
        const scalePage1 = (pageNum === 1) ? 0.75 : 1.0;

        if (isTwoCol) {
            // 2カラム：1ページに2ステップ
            addStepToSlide(currentSlide, pptx, steps[stepIndex], 0.5, true, offsetY, scalePage1); // 左
            if (steps[stepIndex + 1]) {
                addStepToSlide(currentSlide, pptx, steps[stepIndex + 1], 5.2, true, offsetY, scalePage1); // 右
            }
            stepIndex += 2;
        } else {
            // 1カラム：1ページに1ステップ
            addStepToSlide(currentSlide, pptx, steps[stepIndex], 0.5, false, offsetY, scalePage1);
            stepIndex += 1;
        }
        pageNum++;
    }

    // 保存
    await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}

/**
 * 共通：ヘッダー・フッターの描画
 */
function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';
    const FONT = 'Meiryo UI';

    // ヘッダー線
    slide.addShape(pptx.ShapeType.line, {
        x: 0.5, y: 0.6, w: 9.0, h: 0,
        line: { color: NAVY, width: 1 }
    });
    slide.addText(title, {
        x: 0.5, y: 0.3, w: 8, h: 0.3,
        fontSize: 12, color: NAVY, bold: true, fontFace: FONT
    });

    // フッター線
    slide.addShape(pptx.ShapeType.line, {
        x: 0.5, y: 7.0, w: 9.0, h: 0,
        line: { color: NAVY, width: 0.5 }
    });
    slide.addText(pageNum.toString(), {
        x: 8.5, y: 7.1, w: 1, h: 0.3,
        fontSize: 9, color: NAVY, align: 'right', fontFace: FONT
    });
}

/**
 * スライドに手順を追加
 */
function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean, offsetY: number = 0, scale: number = 1.0) {
    const NAVY = '1E1B4B';
    const FONT = 'Meiryo UI';
    const cardWidth = isTwoCol ? 4.3 : 9.0;

    const baseNumY = 1.2 + offsetY;
    const baseDetailY = 1.5 + offsetY;

    // ナンバリング
    slide.addShape(pptx.ShapeType.ellipse, { x: xPos, y: baseNumY, w: 0.35, h: 0.35, fill: { color: NAVY } });
    slide.addText(step.stepNumber.toString(), { x: xPos, y: baseNumY, w: 0.35, h: 0.35, fontSize: 12, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', fontFace: FONT });

    // 1. アクション
    slide.addText(step.action, {
        x: xPos + 0.5, y: baseNumY, w: cardWidth - 0.5, h: 0.3,
        fontSize: 14, color: NAVY, bold: true, valign: 'middle', fontFace: FONT
    });

    // 2. 詳細
    slide.addText(step.detail, {
        x: xPos + 0.5, y: baseDetailY, w: cardWidth - 0.5, h: 0.5 * scale,
        fontSize: 10, color: '000000', valign: 'top', breakLine: true, fontFace: FONT
    });

    // 3. 画像
    if (step.screenshot) {
        const baseImgWidth = isTwoCol ? 4.0 : 6.0;
        const baseImgHeight = isTwoCol ? 2.8 : 3.8;

        let imgWidth = baseImgWidth * scale;
        let imgHeight = baseImgHeight * scale;

        const imgX = isTwoCol ? xPos + 0.15 : (11.69 - imgWidth) / 2;

        // 画像のY位置（Overviewがある場合は少し詰める）
        const imgY = (isTwoCol ? 2.1 : 3.2) + offsetY - (1.0 - scale);

        // ※※ 最重要修正点：Topレベルの w, h を削除し sizing プロパティ内部のみに指定することで、横伸び(Stretching)を防止しアスペクト比を維持。※※
        slide.addImage({
            data: step.screenshot,
            x: imgX, y: imgY,
            sizing: { type: 'contain', w: imgWidth, h: imgHeight }
        });
    }
}
