import { ManualData } from '@/app/page';

// Hoisted RegExp
const RE_SAFE_TITLE = /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;

const getCircledNumber = (num: number) => {
    if (num >= 1 && num <= 20) return String.fromCodePoint(0x245F + num);
    return `(${num})`;
};

function dataUrlToUint8Array(dataUrl: string): { data: Uint8Array; type: 'png' | 'jpg' } {
    const [header, base64] = dataUrl.split(',');
    const type = header.includes('png') ? 'png' : 'jpg';
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return { data: arr, type };
}

export async function generateAndDownloadDocx(manual: ManualData, layout: 'single' | 'two-column' = 'single'): Promise<void> {
    const { Document, Packer, Paragraph, TextRun, ImageRun, BorderStyle, WidthType, Table, TableRow, TableCell, Footer, PageNumber, AlignmentType, Header, HorizontalPositionAlign, VerticalPositionAlign, TextWrappingType, TextWrappingSide, PageBreak } = await import('docx');

    // Core styling definitions to match PDF/PPTX
    const FONT = 'Meiryo UI';
    const RF = { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT };
    const THEME_COLOR = '1E1B4B'; // Indigo-950
    const TEXT_COLOR = '333333';

    // Page dimensions (A4 portrait)
    const PAGE_WIDTH_DXA = 11906; // 210mm
    const PAGE_HEIGHT_DXA = 16838; // 297mm
    const MARGIN_DXA = 1134; // 20mm margins
    const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - (MARGIN_DXA * 2);

    const isTwoCol = layout === 'two-column';
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

    // Calculate exact image dimensions based on column layout
    // In two-column, we need spacing between the columns
    const GAP_DXA = 400; // ~7mm gap
    const colWidthDxa = isTwoCol ? (CONTENT_WIDTH_DXA - GAP_DXA) / 2 : CONTENT_WIDTH_DXA;
    // EMU = DXA * 635. We scale the image width to fill the column width exactly.
    const imgWidthEmu = Math.round(colWidthDxa * 635);

    const children: any[] = [];

    // COVER PAGE (A4 Portrait Center Alignment)
    children.push(
        new Paragraph({
            spacing: { before: 4000 }, // Push to center
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: "OPERATION MANUAL",
                    size: 28, // 14pt
                    font: RF,
                    color: THEME_COLOR,
                    bold: true,
                    allCaps: true
                })
            ]
        }),
        new Paragraph({
            spacing: { before: 400, after: 4000 },
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: manual.title,
                    bold: true,
                    size: 72, // 36pt (Hero Title)
                    font: RF,
                    color: '0f172a' // Slate-900
                })
            ]
        }),
        new Paragraph({ children: [new PageBreak()] }) // Force page break
    );

    // CONTENT PAGE START

    // Overview Section (Indigo Box Style)
    if (manual.overview) {
        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: noBorder, bottom: noBorder, right: noBorder,
                    left: { style: BorderStyle.SINGLE, size: 24, color: THEME_COLOR }
                },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                shading: { fill: 'F8FAFC' }, // Slate-50
                                margins: { top: 200, bottom: 200, left: 200, right: 200 },
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({
                                                text: "【概要・目的】",
                                                bold: true,
                                                size: 22,
                                                font: RF,
                                                color: THEME_COLOR
                                            })
                                        ],
                                        spacing: { after: 100 }
                                    }),
                                    new Paragraph({
                                        children: [
                                            new TextRun({
                                                text: manual.overview,
                                                size: 20,
                                                font: RF,
                                                color: '334155'
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ],
                // Spacing after overview
            }),
            new Paragraph({ spacing: { after: 800 } })
        );
    }

    // Helper block to create a step's complete visual structure
    const createStepElements = async (step: any) => {
        const elements: any[] = [];

        // 1. Step Header: Number and Title
        elements.push(
            new Paragraph({
                spacing: { before: isTwoCol ? 0 : 400, after: 100 },
                children: [
                    new TextRun({
                        text: `${getCircledNumber(step.stepNumber)}  `,
                        bold: true,
                        size: 32, // 16pt (slightly larger number)
                        font: RF,
                        color: THEME_COLOR
                    }),
                    new TextRun({
                        text: step.action,
                        bold: true,
                        size: 28, // 14pt
                        font: RF,
                        color: THEME_COLOR
                    })
                ]
            })
        );

        // 2. Step Detailed Description
        if (step.detail && step.detail !== step.action) {
            const lines = step.detail.split('\n');
            elements.push(
                new Paragraph({
                    spacing: { after: 200, line: 360 }, // 1.5 line spacing
                    children: lines.map((line: string, index: number) =>
                        new TextRun({
                            text: line,
                            size: 20, // 10pt
                            color: TEXT_COLOR,
                            font: RF,
                            break: index > 0 ? 1 : 0
                        })
                    )
                })
            );
        } else {
            // Add artificial spacing if no detail text
            elements.push(new Paragraph({ spacing: { after: 200 } }));
        }

        // 3. Step Screenshot (Lossless aspect-ratio preserved)
        if (step.screenshot) {
            try {
                const { data, type } = dataUrlToUint8Array(step.screenshot);
                const imgHeightEmu = await new Promise<number>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(Math.round(imgWidthEmu * (img.height / img.width)));
                    // Fallback to 16:9 if load fails
                    img.onerror = () => resolve(Math.round(imgWidthEmu * 0.5625));
                    img.src = step.screenshot!;
                });

                elements.push(
                    new Paragraph({
                        spacing: { after: isTwoCol ? 600 : 400 },
                        alignment: AlignmentType.CENTER,
                        children: [
                            new ImageRun({
                                data,
                                transformation: {
                                    width: Math.round(imgWidthEmu / 9525), // convert EMU to pixels for DOCX standard
                                    height: Math.round(imgHeightEmu / 9525)
                                },
                                type
                            })
                        ]
                    })
                );
            } catch (e) {
                console.error("Docx Image embedding failed:", e);
            }
        }
        return elements;
    };

    // Construct Body Layout
    if (isTwoCol) {
        // Build tables for two-column flow
        for (let i = 0; i < manual.steps.length; i += 2) {
            const leftCells = await createStepElements(manual.steps[i]);
            const rightCells = manual.steps[i + 1] ? await createStepElements(manual.steps[i + 1]) : [new Paragraph("")];

            children.push(
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
                        insideHorizontal: noBorder, insideVertical: noBorder
                    },
                    rows: [
                        new TableRow({
                            cantSplit: true, // Keep side-by-side steps on the same page
                            children: [
                                new TableCell({
                                    children: leftCells,
                                    width: { size: 50, type: WidthType.PERCENTAGE },
                                    margins: { bottom: 0, right: Math.round(GAP_DXA / 2), left: 0, top: 0 }
                                }),
                                new TableCell({
                                    children: rightCells,
                                    width: { size: 50, type: WidthType.PERCENTAGE },
                                    margins: { bottom: 0, left: Math.round(GAP_DXA / 2), right: 0, top: 0 }
                                })
                            ]
                        })
                    ]
                })
            );
        }
    } else {
        // Single column sequential flow
        for (const step of manual.steps) {
            const stepElems = await createStepElements(step);
            children.push(...stepElems);
        }
    }

    // Notes Section (Optional Addendum)
    if (manual.notes && manual.notes.length > 0) {
        children.push(
            new Paragraph({
                spacing: { before: 800, after: 200 },
                children: [
                    new TextRun({
                        text: "補足事項",
                        bold: true,
                        size: 28,
                        font: RF,
                        color: THEME_COLOR
                    })
                ]
            }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
                },
                rows: manual.notes.map(note => new TableRow({
                    children: [
                        new TableCell({
                            shading: { fill: 'FFFBEB' }, // Amber-50
                            margins: { top: 120, bottom: 120, left: 160, right: 160 },
                            children: [
                                new Paragraph({
                                    children: [
                                        new TextRun({ text: "• ", bold: true, color: 'B45309' }),
                                        new TextRun({ text: note, size: 18, font: RF, color: '451A03' })
                                    ]
                                })
                            ]
                        })
                    ]
                }))
            })
        );
    }

    // Final Document Assembly
    const blob = await Packer.toBlob(new Document({
        styles: {
            default: {
                document: {
                    run: { font: FONT },
                    paragraph: { spacing: { line: 276 /* 1.15 multiplier */ } }
                }
            }
        },
        sections: [{
            properties: {
                page: {
                    margin: { top: MARGIN_DXA, right: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA }
                }
            },
            headers: {
                default: new Header({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                                new TextRun({
                                    text: manual.title,
                                    size: 16, // 8pt 
                                    color: '999999',
                                    font: RF
                                })
                            ]
                        })
                    ]
                })
            },
            footers: {
                default: new Footer({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({
                                    children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
                                    size: 20, // 10pt
                                    font: RF,
                                    color: THEME_COLOR
                                })
                            ]
                        })
                    ]
                })
            },
            children
        }]
    }));

    // Download Trigger
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${manual.title.substring(0, 30) || 'Manual'}.docx`;
    a.click();
}
