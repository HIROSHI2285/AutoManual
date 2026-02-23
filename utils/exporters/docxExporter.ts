import { ManualData } from '@/app/page';

// Hoisted RegExp
const RE_SAFE_TITLE = /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;

/**
 * ナンバリング画像をCanvasで生成（PPTXと完全同一）
 */
function createStepNumberImage(number: number): string {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#1E1B4B';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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

function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') {
            resolve({ width: 0, height: 0 });
            return;
        }
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = base64;
    });
}

export async function generateAndDownloadDocx(manual: ManualData, layout: 'single' | 'two-column' = 'single'): Promise<void> {
    const { Document, Packer, Paragraph, TextRun, ImageRun, BorderStyle, WidthType, Table, TableRow, TableCell, Footer, PageNumber, AlignmentType, Header, PageBreak, TabStopType } = await import('docx');

    const FONT = 'Meiryo UI';
    const RF = { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT };
    const BLACK = '000000';
    const NAVY = '1E1B4B';

    const PAGE_WIDTH_DXA = 11906; // A4縦
    const MARGIN_DXA = 1134;      // 20mm
    const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - (MARGIN_DXA * 2);
    const indentWidth = 720;      // ナンバリング後のテキスト開始位置 (約12.7mm)

    const isTwoCol = layout === 'two-column';
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const colWidthDxa = isTwoCol ? (CONTENT_WIDTH_DXA - 400) / 2 : CONTENT_WIDTH_DXA;

    // ヘルパー：ステップ要素の構築
    const createStepElements = async (step: any, columnWidth: number) => {
        const elements: any[] = [];

        const numDataUrl = createStepNumberImage(step.stepNumber);
        const { data: numData, type: numType } = dataUrlToUint8Array(numDataUrl);

        // 1. アクション行 (ナンバリング画像とテキストの高さを揃え、開始位置を指定)
        elements.push(new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: indentWidth }],
            spacing: { before: isTwoCol ? 100 : 400, after: 100 },
            children: [
                new ImageRun({
                    data: numData,
                    transformation: { width: 43, height: 43 },
                    type: numType
                }),
                new TextRun({ text: "\t", font: RF }),
                new TextRun({ text: step.action, bold: true, size: 32, font: RF, color: BLACK }) // 16pt
            ]
        }));

        // 2. 詳細行 (アクションと開始位置を垂直に揃える + 複数行改行対応)
        if (step.detail && step.detail !== step.action) {
            const lines = step.detail.split('\n');
            elements.push(new Paragraph({
                indent: { left: indentWidth },
                spacing: { after: 200 },
                children: lines.map((line: string, index: number) =>
                    new TextRun({
                        text: line,
                        size: 24, // 12pt
                        font: RF,
                        color: BLACK,
                        break: index > 0 ? 1 : 0
                    })
                )
            }));
        }

        // 3. 画像 (PPTX/PDF準拠のアスペクト比絶対維持と固定サイズ化)
        if (step.screenshot) {
            try {
                const { data, type } = dataUrlToUint8Array(step.screenshot);
                const dims = await getImageDimensions(step.screenshot);
                const isLandscape = (dims.width > 0 ? dims.width : 4) >= (dims.height > 0 ? dims.height : 3);

                let finalWpx, finalHpx;

                if (isTwoCol) {
                    if (isLandscape) {
                        finalWpx = 4.8 * 96;
                        finalHpx = 3.3 * 96;
                    } else {
                        // 3:4 portrait ratio
                        finalHpx = 4.2 * 96;
                        finalWpx = finalHpx * (3 / 4);
                    }
                } else {
                    if (isLandscape) {
                        finalWpx = 6.69 * 96;
                        finalHpx = dims.width > 0 ? finalWpx * (dims.height / dims.width) : 4.0 * 96;
                        if (finalHpx > 4.0 * 96) {
                            finalHpx = 4.0 * 96;
                            finalWpx = finalHpx * (dims.width / dims.height);
                        }
                    } else {
                        // 3:4 portrait ratio
                        finalHpx = 4.8 * 96;
                        finalWpx = finalHpx * (3 / 4);
                    }
                }

                elements.push(new Paragraph({
                    indent: { left: isTwoCol ? 0 : indentWidth },
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                    children: [
                        new ImageRun({
                            data,
                            transformation: {
                                width: Math.round(finalWpx),
                                height: Math.round(finalHpx)
                            },
                            type
                        })
                    ]
                }));
            } catch (e) { console.error(e); }
        }
        return elements;
    };

    const contentChildren: any[] = [];

    // 概要
    if (manual.overview) {
        contentChildren.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: noBorder, bottom: noBorder, right: noBorder,
                    left: { style: BorderStyle.SINGLE, size: 24, color: NAVY }
                },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                shading: { fill: 'F8FAFC' },
                                margins: { top: 200, bottom: 200, left: 300, right: 200 },
                                children: [
                                    new Paragraph({ children: [new TextRun({ text: "■ DOCUMENT OVERVIEW", bold: true, size: 22, font: RF, color: BLACK })], spacing: { after: 100 } }),
                                    new Paragraph({ children: [new TextRun({ text: manual.overview, size: 21, font: RF, color: BLACK })] })
                                ]
                            })
                        ]
                    })
                ]
            }),
            new Paragraph({ spacing: { after: 600 } })
        );
    }

    // 各ステップの配置 (泣き別れ防止のためTableRow/cantSplitを使用)
    if (isTwoCol) {
        for (let i = 0; i < manual.steps.length; i += 2) {
            const leftCells = await createStepElements(manual.steps[i], colWidthDxa);
            const rightCells = manual.steps[i + 1] ? await createStepElements(manual.steps[i + 1], colWidthDxa) : [];
            contentChildren.push(
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
                    rows: [
                        new TableRow({
                            cantSplit: true,
                            children: [
                                new TableCell({ children: leftCells, width: { size: 50, type: WidthType.PERCENTAGE } }),
                                new TableCell({ children: rightCells, width: { size: 50, type: WidthType.PERCENTAGE } })
                            ]
                        })
                    ]
                })
            );
        }
    } else {
        for (const step of manual.steps) {
            const stepElems = await createStepElements(step, CONTENT_WIDTH_DXA);
            contentChildren.push(
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
                    rows: [
                        new TableRow({
                            cantSplit: true,
                            children: [new TableCell({ children: stepElems })]
                        })
                    ]
                })
            );
        }
    }

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: FONT },
                    paragraph: { spacing: { line: 276 } }
                }
            }
        },
        sections: [
            { // セクション1: 表紙
                properties: {
                    page: { margin: { top: 0, bottom: 0, left: MARGIN_DXA, right: MARGIN_DXA } }
                },
                children: [
                    new Paragraph({
                        border: { top: { style: BorderStyle.SINGLE, size: 96, color: NAVY } }, // 12pt = 96 (1/8pt単位)
                        spacing: { before: 0, after: 3600 }
                    }),
                    new Paragraph({
                        indent: { left: 500 },
                        children: [new TextRun({ text: "OPERATIONAL STANDARD", size: 28, font: RF, color: BLACK, bold: true })]
                    }),
                    new Paragraph({
                        indent: { left: 500 },
                        spacing: { before: 400, after: 3600 },
                        children: [new TextRun({ text: manual.title, bold: true, size: 76, font: RF, color: BLACK })]
                    }),
                    new Paragraph({
                        border: { bottom: { style: BorderStyle.SINGLE, size: 96, color: NAVY } },
                        spacing: { before: 0 }
                    })
                ]
            },
            { // セクション2: 本文
                properties: {
                    page: {
                        margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
                        pageNumbers: { start: 1 }
                    }
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY } },
                                children: [new TextRun({ text: manual.title, size: 18, color: BLACK, font: RF })] // 9pt
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                border: { top: { style: BorderStyle.SINGLE, size: 6, color: NAVY } },
                                spacing: { before: 100 },
                                children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, font: RF, color: BLACK })] // 9pt / 数字のみ
                            })
                        ]
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
