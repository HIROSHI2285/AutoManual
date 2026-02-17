'use client';

import { useState } from 'react';
import { ManualData } from '@/app/page';

interface ExportButtonProps {
    manual: ManualData;
}

// 1. スコープエラーを防ぐため、ヘルパー関数を一番外側に定義
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

// --- Word出力 ---
async function generateAndDownloadDocx(manual: ManualData, layout: 'single' | 'two-column' = 'single'): Promise<void> {
    const { Document, Packer, Paragraph, TextRun, ImageRun, BorderStyle, WidthType, Table, TableRow, TableCell, ShadingType } = await import('docx');
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
        elements.push(new Paragraph({ children: [new TextRun({ text: `${getCircledNumber(step.stepNumber)} ${step.action}`, bold: true, size: 28, font: RF })], spacing: { before: isTwoCol ? 0 : 300, after: 100 } }));
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

    if (isTwoCol) {
        for (let i = 0; i < manual.steps.length; i += 2) {
            const left = await createStepElements(manual.steps[i]);
            const right = manual.steps[i + 1] ? await createStepElements(manual.steps[i + 1]) : [];
            children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: BorderStyle.NONE, bottom: BorderStyle.NONE, left: BorderStyle.NONE, right: BorderStyle.NONE, insideHorizontal: BorderStyle.NONE, insideVertical: BorderStyle.NONE }, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ children: left, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { bottom: 400, right: 200 } }), new TableCell({ children: right, width: { size: 50, type: WidthType.PERCENTAGE }, margins: { bottom: 400, left: 200 } })] })] }));
        }
    } else {
        for (const step of manual.steps) children.push(...(await createStepElements(step)));
    }

    const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${manual.title}.docx`; a.click();
}

// --- PowerPoint出力 (2列対応 & 画像突き抜け防止) ---
async function generateAndDownloadPptx(manual: ManualData, layout: 'single' | 'two-column' = 'single'): Promise<void> {
    const pptxgen = (await import('pptxgenjs')).default;
    const pres = new pptxgen();
    const isTwoCol = layout === 'two-column';
    const FONT_NAME = 'Meiryo';

    const addStepToSlide = async (slide: any, step: any, xPos: number, width: number) => {
        // タイトル
        slide.addText(`${getCircledNumber(step.stepNumber)} ${step.action}`, {
            x: xPos, y: 0.3, w: width, h: 0.6,
            fontSize: isTwoCol ? 18 : 22, bold: true, fontFace: FONT_NAME, color: '4F46E5', fill: { color: 'F8FAFC' }
        });

        let currentY = 1.0;
        if (step.detail && step.detail !== step.action) {
            slide.addText(step.detail, {
                x: xPos, y: currentY, w: width, h: 0.6,
                fontSize: isTwoCol ? 11 : 13, fontFace: FONT_NAME, color: '334155', valign: 'top'
            });
            currentY += 0.7;
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
                // 重要: スライドの高さ(7.5)からテキスト位置を引いた「残りスペース」を最大高さにする
                const maxH = Math.max(1.0, 7.2 - currentY);

                let finalW = maxW;
                let finalH = finalW * ratio;

                if (finalH > maxH) {
                    finalH = maxH;
                    finalW = finalH / ratio;
                }

                slide.addImage({
                    data: step.screenshot,
                    x: xPos + (width - finalW) / 2, // 列内での中央寄せ
                    y: currentY,
                    w: finalW,
                    h: finalH
                });
            } catch (e) { console.warn(e); }
        }
    };

    // 表紙
    const titleSlide = pres.addSlide();
    titleSlide.background = { fill: 'F1F5F9' };
    titleSlide.addText(manual.title, { x: 0, y: '40%', w: '100%', h: 1, fontSize: 32, bold: true, fontFace: FONT_NAME, align: 'center' });

    // 各手順スライド
    if (isTwoCol) {
        for (let i = 0; i < manual.steps.length; i += 2) {
            const slide = pres.addSlide();
            await addStepToSlide(slide, manual.steps[i], 0.25, 4.5);
            if (manual.steps[i + 1]) await addStepToSlide(slide, manual.steps[i + 1], 5.25, 4.5);
        }
    } else {
        for (const step of manual.steps) {
            const slide = pres.addSlide();
            await addStepToSlide(slide, step, 0.5, 9.0);
        }
    }

    const safeTitle = manual.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
    await pres.writeFile({ fileName: `${safeTitle}_${layout}.pptx` });
}

export default function ExportButton({ manual }: ExportButtonProps) {
    const [showModal, setShowModal] = useState(false);

    const handleExport = async (format: string, layout: 'single' | 'two-column' = 'single') => {
        const safeTitle = manual.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');

        switch (format) {
            case 'docx': await generateAndDownloadDocx(manual, layout); break;
            case 'pptx': await generateAndDownloadPptx(manual, layout); break;
            case 'pdf':
                try {
                    const html2pdf = (await import('html2pdf.js')).default;
                    const container = document.createElement('div');
                    container.innerHTML = generateHTML(manual, layout);
                    document.body.appendChild(container);

                    const opt = {
                        margin: [10, 10, 15, 10],
                        filename: `${safeTitle}.pdf`,
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    };

                    const worker = html2pdf().from(container).set(opt).toPdf();
                    await worker.get('pdf').then((pdf: any) => {
                        const totalPages = pdf.internal.getNumberOfPages();
                        const pageWidth = pdf.internal.pageSize.getWidth();
                        const pageHeight = pdf.internal.pageSize.getHeight();

                        // 表紙(1枚目)を飛ばして2枚目から番号を振る
                        for (let i = 2; i <= totalPages; i++) {
                            pdf.setPage(i);
                            pdf.setFontSize(10);
                            pdf.setTextColor(150);
                            // 2枚目を「1」とする
                            pdf.text(`${i - 1} / ${totalPages - 1}`, pageWidth - 10, pageHeight - 8, { align: 'right' });
                        }
                    });
                    worker.save().then(() => {
                        document.body.removeChild(container);
                    });
                } catch (e) { console.error(e); }
                break;
        }
        setShowModal(false);
    };

    return (
        <>
            <button className="btn btn--secondary btn--small" onClick={() => setShowModal(true)}>エクスポート</button>
            {showModal && (
                <div className="export-modal" onClick={() => setShowModal(false)}>
                    <div className="export-modal__content" onClick={(e) => e.stopPropagation()}>
                        <h3 className="export-modal__title">形式を選択</h3>
                        <div className="export-modal__options">
                            {/* Word */}
                            <div className="flex gap-2 w-full">
                                <button className="export-modal__option flex-1" onClick={() => handleExport('docx', 'single')}><span className="export-modal__label">Word (標準)</span></button>
                                <button className="export-modal__option flex-1" onClick={() => handleExport('docx', 'two-column')}><span className="export-modal__label">Word (2列)</span></button>
                            </div>
                            {/* PPT */}
                            <div className="flex gap-2 w-full">
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pptx', 'single')}><span className="export-modal__label">PPT (標準)</span></button>
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pptx', 'two-column')}><span className="export-modal__label">PPT (2列)</span></button>
                            </div>
                            {/* PDF */}
                            <div className="flex gap-2 w-full">
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pdf', 'single')}><span className="export-modal__label">PDF (標準)</span></button>
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pdf', 'two-column')}><span className="export-modal__label">PDF (2列)</span></button>
                            </div>
                        </div>
                        <button className="btn btn--secondary mt-4 w-full" onClick={() => setShowModal(false)}>キャンセル</button>
                    </div>
                </div>
            )}
        </>
    );
}

// FIX: Generate SVG for perfect centering (html2canvas safe)
function createStepNumberSvg(number: number): string {
    const size = 28;
    const radius = size / 2;
    const fontSize = 15;
    const color = '#6366f1';

    // SVG with simple circle and centered text using dominant-baseline and text-anchor
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${radius}" cy="${radius}" r="${radius}" fill="${color}" />
        <text 
            x="50%" 
            y="50%" 
            dy="1" 
            dominant-baseline="central" 
            text-anchor="middle" 
            fill="white" 
            font-family="Arial, sans-serif" 
            font-weight="bold" 
            font-size="${fontSize}px"
        >${number}</text>
    </svg>`;

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// FIX: Generate SVG for section header to ensuring perfect vertical centering
function createSectionHeaderSvg(text: string): string {
    // Width and height based on the CSS: width 100% (container), height 44px
    // Since we don't know the exact pixel width of A4/container here easily without DOM, we can make it wide enough or responsive.
    // However, html2pdf renders images well. Let's assume a standard width or use 100% in img tag.
    // For the SVG itself, we can set a viewBox. 800px is the max-width of the body.
    const width = 800;
    const height = 44;
    const fontSize = 18;
    const backgroundColor = '#f4f4f4';
    const textColor = '#333333';
    const borderRadius = 4;

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="${backgroundColor}" />
        <text 
            x="12" 
            y="50%" 
            dy="1" 
            dominant-baseline="central" 
            text-anchor="start" 
            fill="${textColor}" 
            font-family="Arial, 'Helvetica Neue', Helvetica, sans-serif" 
            font-weight="bold" 
            font-size="${fontSize}px"
        >${text}</text>
    </svg>`;

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// Update generateHTML signature to accept layout
function generateHTML(manual: ManualData, layout: 'single' | 'two-column' = 'single'): string {
    const isTwoCol = layout === 'two-column';

    let html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${manual.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
        max-width: 800px; 
        margin: 0 auto; 
        padding: 20px; 
        line-height: 1.6; 
        color: #333; 
        background: #fff; 
        font-weight: 500;
    }
    h1 { font-size: 24px; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .overview { margin-bottom: 30px; font-size: 14px; color: #666; white-space: pre-wrap; }
    h2 { margin: 30px 0 15px; display: block; border: none; background: none; padding: 0; }
    .section-header-img { width: 100%; height: 44px; display: block; }
    
    /* Table Layout for 2-Column strict alignment */
    .steps-table {
        width: 100%;
        border-collapse: separate; 
        border-spacing: 0 15px; /* Reduced vertical spacing */
        table-layout: fixed;
    }
    tbody {
        page-break-inside: avoid; /* Prevent breaking inside a step pair */
    }
    .step-cell {
        width: 48%;
        padding: 15px 15px 5px 15px; /* Reduced bottom padding */
        background: #fff;
        border-left: 1px solid #eee;
        border-right: 1px solid #eee;
        vertical-align: top;
    }
    .text-cell {
        border-top: 1px solid #eee;
        border-bottom: none;
        border-radius: 8px 8px 0 0;
        height: auto; 
    }
    .image-cell {
        border-bottom: 1px solid #eee;
        border-top: none;
        border-radius: 0 0 8px 8px;
        padding-top: 0; /* Remove top padding to close gap visually */
        padding-bottom: 15px;
        height: 100%; 
        vertical-align: bottom; 
    }
    .empty-cell {
        border: none;
        background: transparent;
    }
    .spacer-cell {
        width: 4%;
    }

    .step-content {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .step-header { 
        display: table;
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
    }
    
    .step-number-cell {
        display: table-cell;
        width: 38px;
        vertical-align: middle;
        padding: 0;
    }

    .step-number-img {
        width: 28px;
        height: 28px;
        display: block;
    }
    
    .step-action-cell {
        display: table-cell;
        vertical-align: middle;
        font-weight: bold; 
        font-size: 15px; /* Slightly smaller for better fit */
        line-height: 1.4;
    }

    .step-text-wrapper {
        flex-grow: 1; /* Push image to bottom */
        margin-bottom: 15px;
    }

    .step-detail { 
        margin-left: 38px; 
        font-size: 13px; 
        color: #555; 
        margin-bottom: 5px; 
        white-space: pre-wrap; /* Allow user manual breaks */
    }
    
    .step-image-wrapper {
        margin-left: 38px;
        text-align: center;
        background: #fdfdfd;
        border: 1px solid #f0f0f0;
        border-radius: 4px;
        padding: 4px;
        display: flex; 
        align-items: flex-end; 
        justify-content: center;
        min-height: 150px; 
    }

    .step-image img { 
        max-width: 100%; 
        max-height: 320px; /* Limit height further to fit page */
        object-fit: contain; 
        display: block; 
        margin: 0 auto;
    }
    
    /* Single Column Fallback Style */
    .step-single {
        margin-bottom: 30px;
        background: #fff;
        border: 1px solid #eee;
        padding: 15px;
        border-radius: 8px;
        page-break-inside: avoid;
    }

    .step-single .step-image {
        margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${manual.title}</h1>
  <p class="overview">${manual.overview}</p>
  
  <h2><img src="${createSectionHeaderSvg('手順')}" class="section-header-img" alt="手順" /></h2>
`;

    if (isTwoCol) {
        // Table-based 2-Column Layout
        html += `<table class="steps-table">`;
        for (let i = 0; i < manual.steps.length; i += 2) {
            const step1 = manual.steps[i];
            const step2 = manual.steps[i + 1];
            const iconSrc1 = createStepNumberSvg(step1.stepNumber);

            // Wrap pair in tbody for page-break protection
            html += `<tbody>`;

            html += `<tr>`;
            // Col 1 Text
            html += `<td class="step-cell text-cell">
                    <div class="step-content">
                        <div class="step-header">
                            <div class="step-number-cell"><img src="${iconSrc1}" class="step-number-img" /></div>
                            <div class="step-action-cell">${step1.action}</div>
                        </div>
                        <p class="step-detail">${step1.detail}</p>
                    </div>
                </td>`;

            html += `<td class="spacer-cell"></td>`;

            // Col 2 Text
            if (step2) {
                const iconSrc2 = createStepNumberSvg(step2.stepNumber);
                html += `<td class="step-cell text-cell">
                        <div class="step-content">
                            <div class="step-header">
                                <div class="step-number-cell"><img src="${iconSrc2}" class="step-number-img" /></div>
                                <div class="step-action-cell">${step2.action}</div>
                            </div>
                            <p class="step-detail">${step2.detail}</p>
                        </div>
                    </td>`;
            } else {
                html += `<td class="step-cell empty-cell"></td>`;
            }
            html += `</tr>`;

            // Image Row
            html += `<tr>`;

            // Col 1 Image
            html += `<td class="step-cell image-cell">
                    ${step1.screenshot ? `
                    <div class="step-image-wrapper">
                        <div class="step-image"><img src="${step1.screenshot}" /></div>
                    </div>` : '<div style="height: 10px;"></div>'}
                </td>`;

            html += `<td class="spacer-cell"></td>`;

            // Col 2 Image
            if (step2) {
                html += `<td class="step-cell image-cell">
                        ${step2.screenshot ? `
                        <div class="step-image-wrapper">
                            <div class="step-image"><img src="${step2.screenshot}" /></div>
                        </div>` : '<div style="height: 10px;"></div>'}
                    </td>`;
            } else {
                html += `<td class="step-cell empty-cell"></td>`;
            }

            html += `</tr>`;

            html += `</tbody>`;

            // Spacer Row removed to prevent blank pages
        }
        html += `</table>`;
    } else {
        // Single Column Layout
        manual.steps.forEach((step) => {
            const iconSrc = createStepNumberSvg(step.stepNumber);
            html += `<div class="step-single">
                <div class="step-header">
                    <div class="step-number-cell"><img src="${iconSrc}" class="step-number-img" /></div>
                    <div class="step-action-cell">${step.action}</div>
                </div>
                <p class="step-detail">${step.detail}</p>
                ${step.screenshot ? `<div class="step-image"><img src="${step.screenshot}" /></div>` : ''}
            </div>`;
        });
    }

    html += `
</body>
</html>`;

    return html;
}
