'use client';

import { useState } from 'react';
import { ManualData } from '@/app/page';

interface ExportButtonProps {
    manual: ManualData;
}



function generateMarkdown(manual: ManualData): string {
    let md = `# ${manual.title}\n\n`;
    md += `${manual.overview}\n\n`;
    md += `## 手順\n\n`;

    manual.steps.forEach((step) => {
        md += `### ${step.stepNumber}. ${step.action}\n\n`;
        md += `${step.detail}\n\n`;

        if (step.screenshot) {
            md += `![Step ${step.stepNumber}](${step.screenshot})\n\n`;
        }
    });

    if (manual.notes && manual.notes.length > 0) {
        md += `## 注意事項\n\n`;
        manual.notes.forEach((note) => {
            md += `- ${note}\n`;
        });
    }

    return md;
}

function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export default function ExportButton({ manual }: ExportButtonProps) {
    const [showModal, setShowModal] = useState(false);

    const handleExport = async (format: 'markdown' | 'html' | 'pdf', layout: 'single' | 'two-column' = 'single') => {
        const safeTitle = manual.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');

        switch (format) {
            case 'markdown':
                downloadFile(generateMarkdown(manual), `${safeTitle}.md`, 'text/markdown;charset=utf-8');
                break;
            case 'html':
                downloadFile(generateHTML(manual, layout), `${safeTitle}.html`, 'text/html;charset=utf-8');
                break;
            case 'pdf':
                try {
                    const html2pdf = (await import('html2pdf.js')).default;
                    const htmlContent = generateHTML(manual, layout);

                    const container = document.createElement('div');
                    container.innerHTML = htmlContent;
                    // Apply layout class for 2-column mode
                    if (layout === 'two-column') {
                        container.classList.add('two-column');
                        // Inject specific grid styles for PDF rendering if not already handled by inline styles
                    }
                    document.body.appendChild(container);

                    const opt: any = {
                        margin: 10,
                        filename: `${safeTitle}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    };

                    // Correct chaining for html2pdf
                    const worker = html2pdf().from(container).set(opt).toPdf();

                    await worker.get('pdf').then((pdf: any) => {
                        const totalPages = pdf.internal.getNumberOfPages();
                        const pageWidth = pdf.internal.pageSize.getWidth();
                        const pageHeight = pdf.internal.pageSize.getHeight();

                        for (let i = 1; i <= totalPages; i++) {
                            pdf.setPage(i);
                            pdf.setFontSize(10);
                            pdf.setTextColor(150);
                            pdf.text(`${i} / ${totalPages}`, pageWidth - 10, pageHeight - 10, { align: 'right' });
                        }
                    });

                    worker.save();

                    document.body.removeChild(container);
                } catch (error) {
                    console.error('PDF generation error:', error);
                    alert('PDF generation failed. Please try printing via browser (Ctrl+P).');
                }
                break;
        }

        setShowModal(false);
    };

    return (
        <>
            <button
                className="btn btn--secondary btn--small"
                onClick={() => setShowModal(true)}
            >
                エクスポート
            </button>

            {showModal && (
                <div className="export-modal" onClick={() => setShowModal(false)}>
                    <div className="export-modal__content" onClick={(e) => e.stopPropagation()}>
                        <h3 className="export-modal__title">エクスポート形式を選択</h3>
                        <div className="export-modal__options">
                            <button
                                className="export-modal__option"
                                onClick={() => handleExport('markdown')}
                            >
                                <span className="export-modal__label">Markdown (.md)</span>
                            </button>
                            <button
                                className="export-modal__option"
                                onClick={() => handleExport('html')}
                            >
                                <span className="export-modal__label">HTML (.html)</span>
                            </button>
                            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                <button
                                    className="export-modal__option"
                                    onClick={() => handleExport('pdf', 'single')}
                                    style={{ flex: 1 }}
                                >
                                    <span className="export-modal__label">PDF (標準)</span>
                                </button>
                                <button
                                    className="export-modal__option"
                                    onClick={() => handleExport('pdf', 'two-column')}
                                    style={{ flex: 1 }}
                                >
                                    <span className="export-modal__label">PDF (2列)</span>
                                </button>
                            </div>
                        </div>
                        <button
                            className="btn btn--secondary export-modal__close"
                            onClick={() => setShowModal(false)}
                        >
                            キャンセル
                        </button>
                    </div>
                </div>
            )}
        </>
    );
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
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; /* Standard font for PDF stability */
        max-width: 800px; 
        margin: 0 auto; 
        padding: 40px; 
        line-height: 1.6; 
        color: #333; 
        background: #fff; 
    }
    h1 { font-size: 24px; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .overview { margin-bottom: 30px; font-size: 14px; color: #666; }
    h2 { font-size: 18px; margin: 30px 0 15px; background: #f4f4f4; padding: 8px 12px; border-radius: 4px; }
    
    /* Layout Container */
    .steps-container {
        display: ${isTwoCol ? 'grid' : 'block'};
        grid-template-columns: 1fr 1fr;
        gap: 20px;
    }
    
    .step { 
        margin-bottom: ${isTwoCol ? '0' : '30px'}; 
        page-break-inside: avoid; /* Important for PDF */
        break-inside: avoid;
        border: 1px solid #eee;
        padding: 15px;
        border-radius: 8px;
    }

    .step-header { margin-bottom: 10px; }
    
    /* FIX: Improved Step Number Alignment for PDF (Flexbox + Minimal Lift) */
    .step-number { 
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #6366f1; 
        color: white; 
        width: 28px; 
        height: 28px; 
        line-height: 1; /* Standard line-height for flex centering */
        text-align: center;
        border-radius: 50%; 
        font-weight: bold; 
        font-size: 15px; /* Revert to 15px for better breathing room */
        font-family: Arial, sans-serif; 
        margin-right: 10px;
        vertical-align: middle;
        padding: 0;
        padding-bottom: 2px; /* Slight lift to counter html2canvas drop */
        box-sizing: border-box;
    }
    
    .step-action { font-weight: bold; font-size: 16px; vertical-align: middle; }
    .step-detail { margin-left: 34px; font-size: 13px; color: #555; margin-bottom: 10px; }
    .step-image img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; display: block; }
    
    .notes { margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; }
    .notes li { margin-bottom: 6px; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <h1>${manual.title}</h1>
  <p class="overview">${manual.overview}</p>
  
  <h2>手順</h2>
  <div class="steps-container">
`;

    manual.steps.forEach((step) => {
        html += `    <div class="step">
      <div class="step-header">
        <span class="step-number">${step.stepNumber}</span>
        <span class="step-action">${step.action}</span>
      </div>
      <p class="step-detail">${step.detail}</p>
`;
        if (step.screenshot) {
            html += `      <div class="step-image"><img src="${step.screenshot}" alt="Step ${step.stepNumber}"></div>\n`;
        }
        html += `    </div>\n`;
    });

    html += `  </div>`;

    if (manual.notes && manual.notes.length > 0) {
        html += `
  <div class="notes">
    <h3>注意事項</h3>
    <ul>
`;
        manual.notes.forEach((note) => {
            html += `      <li>${note}</li>\n`;
        });
        html += `    </ul>
  </div>
`;
    }

    html += `</body>
</html>`;

    return html;
}
