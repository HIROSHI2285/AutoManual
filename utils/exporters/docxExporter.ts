import { ManualData, ManualStep } from '@/app/page';

/**
 * 画像サイズ取得（アスペクト比計算用）
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
 * ナンバリング画像生成（サークル・ネイビー）
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

export async function generateAndDownloadDocx(manual: ManualData): Promise<void> {
    const { Document, Packer, Paragraph, TextRun, ImageRun, BorderStyle, WidthType, Table, TableRow, TableCell, Footer, PageNumber, AlignmentType, Header, VerticalAlign, HeightRule } = await import('docx');

    const FONT = 'Meiryo UI';
    const RF = { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT };
    const BLACK = '000000';
    const NAVY = '1E1B4B'; // 表紙サンプルのラインカラー

    const PAGE_WIDTH_DXA = 11906;
    const MARGIN_DXA = 1134;
    const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - (MARGIN_DXA * 2);
    const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

    const numCellWidth = 600;
    const spacingDXA = 200; // 80から200（+約半角分）に増加

    /**
     * ステップの各パーツ（表題、詳細、画像）を個別に生成するヘルパー
     */
    const getStepParts = async (step: any | null, isTwoCol: boolean) => {
        if (!step) return { title: [], detail: [], image: [] };

        const numDataUrl = createStepNumberImage(step.stepNumber);
        const { data: numData, type: numType } = dataUrlToUint8Array(numDataUrl);
        const actionSize = isTwoCol ? 28 : 32; // 14pt / 16pt
        const detailSize = isTwoCol ? 22 : 24; // 11pt / 12pt

        // 1. 表題 (VerticalAlign.TOP に変更して上揃えを強制)
        const titleTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
            rows: [new TableRow({
                children: [
                    new TableCell({
                        width: { size: numCellWidth, type: WidthType.DXA },
                        verticalAlign: VerticalAlign.TOP, // 上揃え
                        children: [new Paragraph({
                            keepNext: true, // 泣き別れ防止
                            children: [new ImageRun({ data: numData, transformation: { width: 32, height: 32 }, type: numType })]
                        })]
                    }),
                    new TableCell({
                        verticalAlign: VerticalAlign.TOP, // 上揃え
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        margins: { left: spacingDXA }, // 間隔を200に設定
                        children: [new Paragraph({
                            keepNext: true, // 泣き別れ防止
                            children: [new TextRun({ text: step.action, bold: true, size: actionSize, font: RF, color: BLACK })]
                        })]
                    })
                ]
            })]
        });

        const detailPara = new Paragraph({
            indent: { left: numCellWidth + spacingDXA }, // 表題の間隔と合わせて調整
            spacing: { before: 100, after: 200 },
            keepNext: true, // 泣き別れ防止
            children: [new TextRun({ text: step.detail || "", size: detailSize, font: RF, color: BLACK })]
        });

        let imagePara = new Paragraph({ spacing: { before: 0, after: 0 } });
        if (step.screenshot) {
            try {
                const dims = await getImageDimensions(step.screenshot);
                const { data, type } = dataUrlToUint8Array(step.screenshot);
                const isLandscape = (dims.width || 4) >= (dims.height || 3);

                // カラム内での画像サイズ計算（左右の重なりを防止）
                const maxW_DXA = isTwoCol ? (CONTENT_WIDTH_DXA * 0.46) : CONTENT_WIDTH_DXA;
                const baseW = isTwoCol ? (4.2 * 96) : (8.5 * 96);
                const baseH = isTwoCol ? (3.3 * 96) : (4.0 * 96);

                let finalW = baseW;
                let finalH = baseH;

                if (!isLandscape) {
                    finalH = isTwoCol ? (4.2 * 96) : (4.8 * 96);
                    finalW = finalH * (dims.width / (dims.height || 1));
                    if (isTwoCol && finalW * 15 > maxW_DXA) {
                        finalW = maxW_DXA / 15;
                        finalH = finalW / (dims.width / (dims.height || 1));
                    }
                } else {
                    finalW = Math.min(baseW, maxW_DXA / 15);
                    finalH = finalW / (dims.width / (dims.height || 1));
                }

                imagePara = new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 500, after: 400 },
                    children: [new ImageRun({ data, transformation: { width: Math.round(finalW), height: Math.round(finalH) }, type })]
                });
            } catch (e) { console.error(e); }
        }

        return { title: [titleTable], detail: [detailPara], image: [imagePara] };
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

    let currentVideoIndex = 0; // 現在処理中の動画IDを追跡

    for (let i = 0; i < manual.steps.length;) {
        const stepL = manual.steps[i];
        const isTwoCol = stepL.layout === 'two-column';

        // 動画が切り替わったら改ページを挿入 (左側のステップ基準)
        if (i > 0 && stepL.videoIndex !== currentVideoIndex) {
            contentChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
            currentVideoIndex = stepL.videoIndex || 0;
        }

        if (isTwoCol) {
            let stepR: ManualStep | null = manual.steps[i + 1] || null;
            let increment = 2;

            // もし右側のステップが別の動画だった場合、この行には配置せず次回に回す
            if (stepR && stepR.videoIndex !== stepL.videoIndex) {
                stepR = null;
                increment = 1;
            }

            const stepLParts = await getStepParts(stepL, true);
            const stepRParts = stepR ? await getStepParts(stepR, true) : null;

            // 左右で高さを揃えるため、表題、詳細、画像を別々の行にする
            contentChildren.push(new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
                rows: [
                    // 行1: 表題
                    new TableRow({
                        cantSplit: true, // 行の分割防止
                        children: [
                            new TableCell({ children: stepLParts.title, width: { size: 50, type: WidthType.PERCENTAGE } }),
                            new TableCell({ children: stepRParts ? stepRParts.title : [], width: { size: 50, type: WidthType.PERCENTAGE } })
                        ]
                    }),
                    // 行2: 詳細説明
                    new TableRow({
                        cantSplit: true, // 行の分割防止
                        children: [
                            new TableCell({ children: stepLParts.detail, width: { size: 50, type: WidthType.PERCENTAGE } }),
                            new TableCell({ children: stepRParts ? stepRParts.detail : [], width: { size: 50, type: WidthType.PERCENTAGE } })
                        ]
                    }),
                    // 行3: 画像
                    new TableRow({
                        cantSplit: true, // 行の分割防止
                        children: [
                            new TableCell({ children: stepLParts.image, width: { size: 50, type: WidthType.PERCENTAGE } }),
                            new TableCell({ children: stepRParts ? stepRParts.image : [], width: { size: 50, type: WidthType.PERCENTAGE } })
                        ]
                    })
                ]
            }), new Paragraph({ spacing: { after: 400 } }));

            i += increment;
        } else {
            const parts = await getStepParts(stepL, false);
            contentChildren.push(new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
                rows: [new TableRow({
                    cantSplit: true,
                    children: [new TableCell({ children: [...parts.title, ...parts.detail, ...parts.image], width: { size: 100, type: WidthType.PERCENTAGE } })]
                })]
            }));

            i++;
        }
    }

    const doc = new Document({
        styles: { default: { document: { run: { font: FONT }, paragraph: { spacing: { line: 276 } } } } },
        sections: [
            {
                // セクション1: 表紙
                properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
                children: [
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
                        rows: [
                            new TableRow({ // 上端ライン
                                height: { value: 200, rule: HeightRule.ATLEAST },
                                children: [new TableCell({
                                    verticalAlign: VerticalAlign.TOP,
                                    children: [new Paragraph({
                                        border: { top: { style: BorderStyle.SINGLE, size: 96, color: NAVY, space: 0 } },
                                        spacing: { before: 220, after: 0 },
                                        children: [new TextRun({ text: "", size: 1 })]
                                    })]
                                })]
                            }),
                            new TableRow({ // 中央コンテンツ
                                height: { value: 15100, rule: HeightRule.ATLEAST },
                                children: [new TableCell({
                                    verticalAlign: VerticalAlign.CENTER,
                                    children: [
                                        new Paragraph({
                                            alignment: AlignmentType.LEFT,
                                            indent: { left: 1134 },
                                            children: [new TextRun({ text: "OPERATIONAL STANDARD", size: 28, font: RF, color: BLACK, bold: true })]
                                        }),
                                        new Paragraph({
                                            alignment: AlignmentType.LEFT,
                                            indent: { left: 1134 },
                                            spacing: { before: 400 },
                                            children: [new TextRun({ text: manual.title, bold: true, size: 76, font: RF, color: BLACK })]
                                        })
                                    ]
                                })]
                            }),
                            new TableRow({ // 下端ライン
                                height: { value: 200, rule: HeightRule.ATLEAST },
                                children: [new TableCell({
                                    verticalAlign: VerticalAlign.BOTTOM,
                                    children: [new Paragraph({
                                        border: { bottom: { style: BorderStyle.SINGLE, size: 96, color: NAVY, space: 0 } },
                                        spacing: { before: 0, after: 0 },
                                        children: [new TextRun({ text: "", size: 1 })]
                                    })]
                                })]
                            })
                        ]
                    })
                ]
            },
            {
                // セクション2: 本文
                properties: {
                    page: {
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
