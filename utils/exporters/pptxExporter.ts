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

    // ---------------------------------------------------------
    // 1. 表紙スライド
    // ---------------------------------------------------------
    const coverSlide = pptx.addSlide();

    // 上部のグラデーションライン（紺色から透明へ）
    coverSlide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 0.2, w: '90%', h: 0.08,
        fill: { type: 'gradient', colorStops: [{ offset: 0, color: NAVY }, { offset: 100, color: 'FFFFFF' }] } as any
    });

    coverSlide.addText('OPERATIONAL STANDARD', {
        x: 0.8, y: 2.5, w: 5, h: 0.4,
        fontSize: 14, color: NAVY, bold: true, fontFace: 'Arial'
    });

    coverSlide.addText(manual.title, {
        x: 0.8, y: 3.0, w: '85%', h: 1.2,
        fontSize: 38, color: SLATE_900, bold: true, fontFace: 'Arial',
        valign: 'top'
    });

    // 下部のグラデーションライン
    coverSlide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 5.5, w: '90%', h: 0.08,
        fill: { type: 'gradient', colorStops: [{ offset: 0, color: NAVY }, { offset: 100, color: 'FFFFFF' }] } as any
    });

    // ---------------------------------------------------------
    // 2. 概要スライド (Overview)
    // ---------------------------------------------------------
    const overviewSlide = pptx.addSlide();
    addHeaderFooter(overviewSlide, pptx, manual.title, 1);

    overviewSlide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 1.2, w: '90%', h: 1.5,
        fill: { color: GRAY_BG },
        line: { color: NAVY, width: 2 },
    });

    overviewSlide.addText('■ DOCUMENT OVERVIEW', {
        x: 0.7, y: 1.4, w: 5, h: 0.3,
        fontSize: 11, color: NAVY, bold: true
    });

    overviewSlide.addText(manual.overview, {
        x: 0.7, y: 1.8, w: '85%', h: 0.8,
        fontSize: 10.5, color: SLATE_500, fontFace: 'Arial',
        valign: 'top', breakLine: true
    });

    // ---------------------------------------------------------
    // 3. 手順スライド (Steps)
    // ---------------------------------------------------------
    const isTwoCol = layout === 'two-column';
    const steps = manual.steps;

    if (isTwoCol) {
        // 2カラムレイアウト
        for (let i = 0; i < steps.length; i += 2) {
            const slide = pptx.addSlide();
            const pageNum = Math.floor(i / 2) + 2;
            addHeaderFooter(slide, pptx, manual.title, pageNum);

            addStepToSlide(slide, pptx, steps[i], 0.5, true); // 左
            if (steps[i + 1]) {
                addStepToSlide(slide, pptx, steps[i + 1], 5.2, true); // 右
            }
        }
    } else {
        // シングルカラムレイアウト (1枚1〜2ステップ、または1枚1ステップ)
        // ここではPDFに合わせ、1枚につき2ステップまで入るようにします
        for (let i = 0; i < steps.length; i += 1) {
            const slide = pptx.addSlide();
            addHeaderFooter(slide, pptx, manual.title, i + 2);
            addStepToSlide(slide, pptx, steps[i], 0.5, false);
        }
    }

    // 保存
    await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}

/**
 * 共通：ヘッダー・フッターの描画
 */
function addHeaderFooter(slide: any, pptx: any, title: string, pageNum: number) {
    const NAVY = '1E1B4B';

    // ヘッダー線
    slide.addShape(pptx.ShapeType.line, {
        x: 0.5, y: 0.6, w: 9.0, h: 0,
        line: { color: NAVY, width: 1 }
    });
    slide.addText(title, {
        x: 0.5, y: 0.3, w: 8, h: 0.3,
        fontSize: 12, color: NAVY, bold: true
    });

    // フッター線
    slide.addShape(pptx.ShapeType.line, {
        x: 0.5, y: 7.0, w: 9.0, h: 0,
        line: { color: NAVY, width: 0.5 }
    });
    slide.addText(pageNum.toString(), {
        x: 8.5, y: 7.1, w: 1, h: 0.3,
        fontSize: 9, color: NAVY, align: 'right'
    });
}

// ... (ライブラリインポートと定数定義)

/**
 * スライドに手順を追加
 */
function addStepToSlide(slide: any, pptx: any, step: any, xPos: number, isTwoCol: boolean) {
    const NAVY = '1E1B4B';
    const cardWidth = isTwoCol ? 4.3 : 9.0;

    // ナンバリング (y: 1.2)
    slide.addShape(pptx.ShapeType.ellipse, { x: xPos, y: 1.2, w: 0.35, h: 0.35, fill: { color: NAVY } });
    slide.addText(step.stepNumber.toString(), { x: xPos, y: 1.2, w: 0.35, h: 0.35, fontSize: 12, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle' });

    // 1. アクション (y: 1.2, h: 0.3) -> 1.5まで
    slide.addText(step.action, {
        x: xPos + 0.5, y: 1.2, w: cardWidth - 0.5, h: 0.3,
        fontSize: 14, color: NAVY, bold: true, valign: 'middle'
    });

    // 2. 詳細 (y: 1.5 に配置。Actionとほぼ密着) -> 1.95まで
    slide.addText(step.detail, {
        x: xPos + 0.5, y: 1.5, w: cardWidth - 0.5, h: 0.45,
        fontSize: 10, color: '000000', valign: 'top', breakLine: true
    });

    // 3. 画像 (2カラム時は y: 2.2 から 2.0 へ引き上げ、間隔を半減)
    if (step.screenshot) {
        const imgWidth = isTwoCol ? 4.0 : 6.0;
        const imgHeight = isTwoCol ? 2.8 : 3.8;
        const imgX = isTwoCol ? xPos + 0.15 : (11.69 - imgWidth) / 2;

        // 1カラム時は y: 2.2 を維持、2カラム時は y: 2.0 に接近
        const imgY = isTwoCol ? 2.0 : 2.2;

        slide.addImage({
            data: step.screenshot,
            x: imgX, y: imgY, w: imgWidth, h: imgHeight,
            sizing: { type: 'contain' }
        });
    }
}
