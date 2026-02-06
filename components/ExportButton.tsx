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

function generateHTML(manual: ManualData): string {
    let html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${manual.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif; max-width: 800px; margin: 0 auto; padding: 48px 24px; line-height: 1.7; color: #1a1a2e; background: #f8f9fc; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 12px; color: #1a1a2e; }
    .overview { color: #4a5568; margin-bottom: 32px; font-size: 1rem; }
    h2 { font-size: 1.25rem; font-weight: 600; margin: 32px 0 16px; color: #1a1a2e; }
    .step { background: #fff; padding: 24px; border-radius: 12px; margin: 12px 0; border: 1px solid #e2e8f0; }
    .step-header { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
    .step-number { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.875rem; }
    .step-action { font-size: 1.0625rem; font-weight: 600; color: #1a1a2e; }
    .step-detail { color: #4a5568; margin-left: 46px; font-size: 0.9375rem; }
    .timestamp { font-size: 0.75rem; color: #94a3b8; margin-top: 10px; margin-left: 46px; background: #f0f2f8; padding: 4px 10px; border-radius: 6px; display: inline-block; }
    .notes { background: #fffbeb; padding: 20px; border-radius: 12px; margin-top: 32px; border: 1px solid rgba(245, 158, 11, 0.2); }
    .notes h3 { color: #f59e0b; margin-bottom: 12px; font-size: 0.9375rem; font-weight: 600; }
    .notes ul { list-style: none; }
    .notes li { color: #4a5568; padding: 4px 0; padding-left: 18px; position: relative; font-size: 0.875rem; }
    .notes li::before { content: ''; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; background: #f59e0b; border-radius: 50%; }
    @media print { body { background: white; } .step { border: 1px solid #ddd; } }
  </style>
</head>
<body>
  <h1>${manual.title}</h1>
  <p class="overview">${manual.overview}</p>
  <h2>手順</h2>
`;

    manual.steps.forEach((step) => {
        html += `  <div class="step">
    <div class="step-header">
      <span class="step-number">${step.stepNumber}</span>
      <span class="step-action">${step.action}</span>
    </div>
    <p class="step-detail">${step.detail}</p>
`;
        if (step.screenshot) {
            html += `    <div class="step-image"><img src="${step.screenshot}" alt="Step ${step.stepNumber}" style="max-width: 100%; border-radius: 8px; margin-top: 12px; border: 1px solid #e2e8f0;"></div>\n`;
        }
        html += `  </div>\n`;
    });

    if (manual.notes && manual.notes.length > 0) {
        html += `  <div class="notes">
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

    const handleExport = async (format: 'markdown' | 'html' | 'pdf') => {
        const safeTitle = manual.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');

        switch (format) {
            case 'markdown':
                downloadFile(generateMarkdown(manual), `${safeTitle}.md`, 'text/markdown;charset=utf-8');
                break;
            case 'html':
                downloadFile(generateHTML(manual), `${safeTitle}.html`, 'text/html;charset=utf-8');
                break;
            case 'pdf':
                // Use html2pdf.js for direct PDF download
                try {
                    const html2pdf = (await import('html2pdf.js')).default;
                    const htmlContent = generateHTML(manual);

                    // Create a temporary container
                    const container = document.createElement('div');
                    container.innerHTML = htmlContent;
                    document.body.appendChild(container);

                    await html2pdf(container, {
                        margin: 10,
                        filename: `${safeTitle}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2 },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    });

                    document.body.removeChild(container);
                } catch (error) {
                    console.error('PDF generation error:', error);
                    // Fallback to print dialog
                    const htmlContent = generateHTML(manual);
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                        printWindow.document.write(htmlContent);
                        printWindow.document.close();
                        printWindow.onload = () => printWindow.print();
                    }
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
                            <button
                                className="export-modal__option"
                                onClick={() => handleExport('pdf')}
                            >
                                <span className="export-modal__label">PDF (.pdf)</span>
                            </button>
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
