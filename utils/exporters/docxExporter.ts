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
    const { Document, Packer, Paragraph, TextRun, ImageRun, BorderStyle, WidthType, Table, TableRow, TableCell, Footer, PageNumber, AlignmentType } = await import('docx');
    const FONT = 'Meiryo UI';
    const RF = { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT };
    const PAGE_WIDTH_DXA = 11906;
    const MARGIN_DXA = 1000;
    const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - MARGIN_DXA * 2;
    const isTwoCol = layout === 'two-column';
    const colWidthDxa = isTwoCol ? (CONTENT_WIDTH_DXA / 2) - 100 : CONTENT_WIDTH_DXA;
    const imgWidthEmu = Math.round(colWidthDxa * 635 * (isTwoCol ? 0.95 : 0.6));

    const children: any[] = [];
    children.push(new Paragraph({ children: [new TextRun({ text: manual.title, bold: true, size: 36, font: RF })], spacing: { after: 200 } }));
    if (manual.overview) children.push(new Paragraph({ children: [new TextRun({ text: manual.overview, size: 24, font: RF })], spacing: { after: 400 } }));

    const createStepElements = async (step: any) => {
        const elements: any[] = [];
        elements.push(new Paragraph({ children: [new TextRun({ text: `${getCircledNumber(step.stepNumber)} ${step.action}`, bold: true, size: 28, font: RF })], spacing: { before: isTwoCol ? 0 : 300, after: 40 } }));
        if (step.detail && step.detail !== step.action) {
            const lines = step.detail.split('\n');
            elements.push(new Paragraph({ children: lines.map((line: string, index: number) => new TextRun({ text: line, size: 22, font: RF, break: index > 0 ? 1 : 0 })), spacing: { after: 120 } }));
        }
        if (step.screenshot) {
            try {
                const { data, type } = dataUrlToUint8Array(step.screenshot);
                const imgHeight = await new Promise<number>((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve(Math.round(imgWidthEmu * (img.height / img.width)));
                    img.onerror = () => resolve(Math.round(imgWidthEmu * 0.5625));
                    img.src = step.screenshot!;
                });
                elements.push(new Paragraph({ children: [new ImageRun({ data, transformation: { width: Math.round(imgWidthEmu / 9525), height: Math.round(imgHeight / 9525) }, type })], spacing: { after: 200 } }));
            } catch (e) { console.error(e); }
        }
        return elements;
    };

    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    if (isTwoCol) {
        for (let i = 0; i < manual.steps.length; i += 2) {
            const left = await createStepElements(manual.steps[i]);
            const right = manual.steps[i + 1] ? await createStepElements(manual.steps[i + 1]) : [];
            children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ children: left, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { bottom: 400, right: 200 } }), new TableCell({ children: right, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { bottom: 400, left: 200 } })] })] }));
        }
    } else {
        for (const step of manual.steps) children.push(...(await createStepElements(step)));
    }

    const blob = await Packer.toBlob(new Document({
        sections: [{
            children,
            footers: {
                default: new Footer({
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                                new TextRun({
                                    children: [PageNumber.CURRENT],
                                    size: 18,
                                    font: RF,
                                    color: '888888'
                                })
                            ]
                        })
                    ]
                })
            }
        }]
    }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${manual.title}.docx`; a.click();
}
