import { ManualData } from '@/app/page';

/**
 * 画像サイズ取得（アスペクト比維持用）
 */
function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') { resolve({ width: 0, height: 0 }); return; }
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = base64;
    });
}

/**
 * ナンバリング画像生成（PDF/PPTXと完全同一の「ど真ん中」ロジック）
 */
function createStepNumberImage(number: number): string {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#1E1B4B';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, 58, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), size / 2, size / 2 + 4);
    return canvas.toDataURL('image/png');
}

function dataUrlToUint8Array(dataUrl: string): { data: Uint8Array; type: 'png' | 'jpg' } {
    const [header, base64] = dataUrl.split(',');
    const type = header.includes('png') ? 'png' : 'jpg';
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return { data: arr, type };
}

export async function generateAndDownloadDocx(manual: ManualData, layout: 'single' | 'two-column' = 'single'): Promise<void> {
    const { Document, Packer, Paragraph, TextRun, ImageRun, BorderStyle, WidthType, Table, TableRow, TableCell, Footer, PageNumber, AlignmentType, Header, VerticalAlign } = await import('docx');

    const FONT = 'Meiryo UI';
    const RF = { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT };
    const BLACK = '000000';
    const NAVY = '1E1B4B';

    const PAGE_WIDTH_DXA = 11906;
    const MARGIN_DXA = 1134;
    const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - (MARGIN_DXA * 2);
    const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

    const isTwoCol = layout === 'two-column';
    const numCellWidth = 550; // ナンバリングサークルの幅

    const createStepElements = async (step: any) => {
        const elements: any[] = [];
        const numDataUrl = createStepNumberImage(step.stepNumber);
        const { data: numData, type: numType } = dataUrlToUint8Array(numDataUrl);

        // 1. 表題（アクション行）：絶対に一行で収まるよう、テキストセルの幅を最大化
        elements.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
            rows: [new TableRow({
                children: [
                    new TableCell({
                        width: { size: numCellWidth, type: WidthType.DXA },
                        verticalAlign: VerticalAlign.CENTER,
                        children: [new Paragraph({ children: [new ImageRun({ data: numData, transformation: { width: 32, height: 32 }, type: numType })] })]
                    }),
                    new TableCell({
                        verticalAlign: VerticalAlign.CENTER,
                        // 幅指定を削除し、内容に合わせて一行で広がるように修正
                        margins: { left: 80 },
                        children: [new Paragraph({ children: [new TextRun({ text: step.action, bold: true, size: 32, font: RF, color: BLACK })] })]
                    })
                ]
            })]
        }));

        // 2. 詳細説明：左端を揃える
        if (step.detail && step.detail !== step.action) {
            elements.push(new Paragraph({
                indent: { left: numCellWidth + 80 },
                spacing: { before: 100, after: 200 },
                children: [new TextRun({ text: step.detail, size: 24, font: RF, color: BLACK })]
            }));
        }

        // 3. 画像配置：全ページ、確実に中央に配置
        if (step.screenshot) {
            try {
                const dims = await getImageDimensions(step.screenshot);
                const { data, type } = dataUrlToUint8Array(step.screenshot);
                const isLandscape = (dims.width || 4) >= (dims.height || 3);

                let finalW, finalH;
                if (isTwoCol) {
                    finalW = isLandscape ? (4.8 * 96) : (3.15 * 96);
                    finalH = isLandscape ? (3.3 * 96) : (4.2 * 96);
                } else {
                    // 現在調整中のシングルカラム・縦画像（比率 3:4）
                    finalH = 4.8 * 96;
                    finalW = isLandscape ? (8.5 * 96) : (finalH * 0.75);
                    if (isLandscape) finalH = finalW / (dims.width / dims.height);
                }

                elements.push(new Paragraph({
                    alignment: AlignmentType.CENTER, // カラム内中央
                    indent: { left: 0 }, // 左寄りの原因となるインデントをリセット
                    spacing: { before: 200, after: 400 },
                    children: [new ImageRun({ data, transformation: { width: Math.round(finalW), height: Math.round(finalH) }, type })]
                }));
            } catch (e) { console.error(e); }
        }
        return elements;
    };

    const contentChildren: any[] = [];
    if (manual.overview) {
        contentChildren.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER, left: { style: BorderStyle.SINGLE, size: 24, color: NAVY } },
            rows: [new TableRow({
                children: [new TableCell({
                    shading: { fill: 'F8FAFC' },
                    margins: { top: 200, bottom: 200, left: 300, right: 200 },
                    children: [
                        new Paragraph({ children: [new TextRun({ text: "■ DOCUMENT OVERVIEW", bold: true, size: 22, font: RF, color: BLACK })], spacing: { after: 100 } }),
                        new Paragraph({ children: [new TextRun({ text: manual.overview, size: 21, font: RF, color: BLACK })] })
                    ]
                })]
            })]
        }), new Paragraph({ spacing: { after: 600 } }));
    }

    for (let i = 0; i < manual.steps.length; (isTwoCol ? i += 2 : i++)) {
        const left = await createStepElements(manual.steps[i]);
        const right = (isTwoCol && manual.steps[i + 1]) ? await createStepElements(manual.steps[i + 1]) : [];
        contentChildren.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
            rows: [new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({ children: left, width: { size: 50, type: WidthType.PERCENTAGE } }),
                    new TableCell({ children: right, width: { size: 50, type: WidthType.PERCENTAGE } })
                ]
            })]
        }));
    }

    const doc = new Document({
        styles: { default: { document: { run: { font: FONT }, paragraph: { spacing: { line: 276 } } } } },
        sections: [
            {
                // セクション1: 表紙
                properties: { page: { margin: { top: 0, bottom: 0, left: MARGIN_DXA, right: MARGIN_DXA } } },
                children: [
                    new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 96, color: NAVY } }, spacing: { before: 0, after: 3600 } }),
                    new Paragraph({ indent: { left: 500 }, children: [new TextRun({ text: "OPERATIONAL STANDARD", size: 28, font: RF, color: BLACK, bold: true })] }),
                    new Paragraph({ indent: { left: 500 }, spacing: { before: 400, after: 3600 }, children: [new TextRun({ text: manual.title, bold: true, size: 76, font: RF, color: BLACK })] }),
                    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 96, color: NAVY } }, spacing: { before: 0 } })
                ]
            },
            {
                // セクション2: 本文
                properties: {
                    page: {
                        // 高さ調整：赤線位置に対応する 1600 DXA を再設定
                        margin: { top: 1600, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
                        pageNumbers: { start: 1 }
                    }
                },
                headers: {
                    default: new Header({
                        children: [new Paragraph({
                            alignment: AlignmentType.LEFT,
                            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY } },
                            children: [new TextRun({ text: manual.title, size: 18, color: BLACK, font: RF })]
                        })]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            border: { top: { style: BorderStyle.SINGLE, size: 6, color: NAVY } },
                            spacing: { before: 100 },
                            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, font: RF, color: BLACK })]
                        })]
                    })
                },
                children: contentChildren
            }
        ]
    });

    const blob = await Packer.toBlob(doc);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${manual.title.substring(0, 30)}.docx`;
    a.click();
}
