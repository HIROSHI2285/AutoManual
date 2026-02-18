import { ManualData } from '@/app/page';

// Hoisted RegExp
const RE_SAFE_TITLE = /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;

const getCircledNumber = (num: number) => {
    if (num >= 1 && num <= 20) return String.fromCodePoint(0x245F + num);
    return `(${num})`;
};

export async function generateAndDownloadPptx(manual: ManualData, layout: 'single' | 'two-column' = 'single'): Promise<void> {
    const pptxgen = (await import('pptxgenjs')).default;
    const pres = new pptxgen();
    const isTwoCol = layout === 'two-column';
    const FONT_NAME = 'Meiryo';
    const SLIDE_W = 10;
    const SLIDE_H = 5.625;
    const PAGE_NUM_Y = SLIDE_H - 0.35;
    const CONTENT_BOTTOM = PAGE_NUM_Y - 0.1;

    let pageNum = 0;

    const addStepToSlide = async (slide: any, step: any, xPos: number, width: number) => {
        slide.addText(`${getCircledNumber(step.stepNumber)} ${step.action}`, {
            x: xPos, y: 0.15, w: width, h: 0.4,
            fontSize: isTwoCol ? 16 : 20, bold: true, fontFace: FONT_NAME, color: '000000', fill: { color: 'F8FAFC' }
        });

        let currentY = 0.6;
        if (step.detail && step.detail !== step.action) {
            const lines = Math.ceil(step.detail.length / (isTwoCol ? 25 : 55));
            const textH = Math.min(Math.max(0.3, lines * 0.2), 1.2);

            slide.addText(step.detail, {
                x: xPos, y: currentY, w: width, h: textH,
                fontSize: isTwoCol ? 10 : 12, fontFace: FONT_NAME, color: '333333', valign: 'top'
            });
            currentY += textH + 0.1;
        }

        if (step.screenshot) {
            try {
                const ratio = await new Promise<number>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(img.height / img.width);
                    img.onerror = () => resolve(0.5625);
                    img.src = step.screenshot!;
                });

                const maxW = width;
                const maxH = Math.max(0.5, CONTENT_BOTTOM - currentY);

                let finalW = maxW;
                let finalH = finalW * ratio;

                if (finalH > maxH) {
                    finalH = maxH;
                    finalW = finalH / ratio;
                }

                if (currentY + finalH > CONTENT_BOTTOM) {
                    finalH = CONTENT_BOTTOM - currentY;
                    finalW = finalH / ratio;
                }

                slide.addImage({
                    data: step.screenshot,
                    x: xPos + (width - finalW) / 2,
                    y: currentY,
                    w: Math.max(0.5, finalW),
                    h: Math.max(0.5, finalH)
                });
            } catch (e) { console.error(e); }
        }
    };

    // 表紙
    const titleSlide = pres.addSlide();
    titleSlide.background = { fill: 'F1F5F9' };
    titleSlide.addText(manual.title, { x: 0, y: '35%', w: '100%', h: 1, fontSize: 28, bold: true, fontFace: FONT_NAME, align: 'center', color: '000000' });

    if (isTwoCol) {
        for (let i = 0; i < manual.steps.length; i += 2) {
            const slide = pres.addSlide();
            pageNum++;
            await addStepToSlide(slide, manual.steps[i], 0.25, 4.5);
            if (manual.steps[i + 1]) await addStepToSlide(slide, manual.steps[i + 1], 5.25, 4.5);
            slide.addText(`${pageNum}`, {
                x: SLIDE_W - 1.2, y: PAGE_NUM_Y, w: 1.0, h: 0.3,
                fontSize: 9, fontFace: FONT_NAME, color: '888888', align: 'right'
            });
        }
    } else {
        for (const step of manual.steps) {
            const slide = pres.addSlide();
            pageNum++;
            await addStepToSlide(slide, step, 0.5, 9.0);
            slide.addText(`${pageNum}`, {
                x: SLIDE_W - 1.2, y: PAGE_NUM_Y, w: 1.0, h: 0.3,
                fontSize: 9, fontFace: FONT_NAME, color: '888888', align: 'right'
            });
        }
    }

    const safeTitle = manual.title.replace(RE_SAFE_TITLE, '_');
    await pres.writeFile({ fileName: `${safeTitle}_${layout}.pptx` });
}
