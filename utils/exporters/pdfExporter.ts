import { ManualData } from '@/app/page';

// FIX: Generate SVG for perfect centering (html2canvas safe)
function createStepNumberSvg(number: number): string {
    const size = 28;
    const radius = size / 2;
    const fontSize = 15;
    const color = '#6366f1';

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

export function generateHTML(manual: ManualData, layout: 'single' | 'two-column' = 'single'): string {
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
        border-spacing: 0 15px;
        table-layout: fixed;
    }
    tbody {
        page-break-inside: avoid;
    }
    .step-cell {
        width: 48%;
        padding: 15px 15px 5px 15px;
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
        padding-top: 0;
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
        font-size: 15px;
        line-height: 1.4;
    }

    .step-text-wrapper {
        flex-grow: 1;
        margin-bottom: 15px;
    }

    .step-detail { 
        margin-left: 38px; 
        font-size: 13px; 
        color: #555; 
        margin-bottom: 5px; 
        white-space: pre-wrap;
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
        max-height: 320px;
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
        html += `<table class="steps-table">`;
        for (let i = 0; i < manual.steps.length; i += 2) {
            const step1 = manual.steps[i];
            const step2 = manual.steps[i + 1];
            const iconSrc1 = createStepNumberSvg(step1.stepNumber);

            html += `<tbody>`;

            html += `<tr>`;
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

            html += `<tr>`;

            html += `<td class="step-cell image-cell">
                    ${step1.screenshot ? `
                    <div class="step-image-wrapper">
                        <div class="step-image"><img src="${step1.screenshot}" /></div>
                    </div>` : '<div style="height: 10px;"></div>'}
                </td>`;

            html += `<td class="spacer-cell"></td>`;

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
        }
        html += `</table>`;
    } else {
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

export async function generateAndDownloadPdf(manual: ManualData, layout: 'single' | 'two-column' = 'single', safeTitle: string): Promise<void> {
    const html2pdf = (await import('html2pdf.js')).default;
    const container = document.createElement('div');
    container.innerHTML = generateHTML(manual, layout);
    document.body.appendChild(container);

    const opt = {
        margin: [10, 10, 15, 10] as [number, number, number, number],
        filename: `${safeTitle}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    const worker = html2pdf().from(container).set(opt).toPdf();
    const pdf = await worker.get('pdf');

    const totalPages = pdf.internal.getNumberOfPages();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text(
            `${i}`,
            pageWidth - 10,
            pageHeight - 8,
            { align: 'right' }
        );
    }

    await worker.save();
    document.body.removeChild(container);
}
