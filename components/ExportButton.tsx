'use client';

import { useState } from 'react';
import { ManualData } from '@/app/page';

// Hoisted RegExp (js-hoist-regexp: compiled once at module level)
const RE_SAFE_TITLE = /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g;

interface ExportButtonProps {
    manual: ManualData;
}

// --- Markdown出力 ---
function generateMarkdown(manual: ManualData): string {
    let md = `# ${manual.title}\n\n`;
    md += `${manual.overview}\n\n---\n\n`;
    manual.steps.forEach(step => {
        md += `## 手順${step.stepNumber}: ${step.action}\n\n`;
        if (step.detail && step.detail !== step.action) md += `${step.detail}\n\n`;
        if (step.screenshot) md += `![Step ${step.stepNumber}](${step.screenshot})\n\n`;
    });
    if (manual.notes && manual.notes.length > 0) {
        md += `---\n\n## 注意事項\n\n`;
        manual.notes.forEach(note => md += `- ${note}\n`);
    }
    return md;
}

function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

export default function ExportButton({ manual }: ExportButtonProps) {
    const [showModal, setShowModal] = useState(false);

    const handleExport = async (format: string, layout: 'single' | 'two-column' = 'single') => {
        const safeTitle = manual.title.replace(RE_SAFE_TITLE, '_');

        switch (format) {
            case 'docx': {
                const { generateAndDownloadDocx } = await import('@/utils/exporters/docxExporter');
                await generateAndDownloadDocx(manual, layout);
                break;
            }
            case 'pptx': {
                const { generateAndDownloadPptx } = await import('@/utils/exporters/pptxExporter');
                await generateAndDownloadPptx(manual, layout);
                break;
            }
            case 'pdf': {
                try {
                    const { generateAndDownloadPdf } = await import('@/utils/exporters/pdfExporter');
                    await generateAndDownloadPdf(manual, layout, safeTitle);
                } catch (e) { console.error(e); }
                break;
            }
            case 'markdown':
                downloadFile(generateMarkdown(manual), `${safeTitle}.md`, 'text/markdown;charset=utf-8');
                break;
            case 'html': {
                const { generateHTML } = await import('@/utils/exporters/pdfExporter');
                downloadFile(generateHTML(manual, layout), `${safeTitle}.html`, 'text/html;charset=utf-8');
                break;
            }
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
                            {/* 各ボタンの配置 */}
                            <div className="flex gap-2 w-full">
                                <button className="export-modal__option flex-1" onClick={() => handleExport('docx', 'single')}><span className="export-modal__label">Word (標準)</span></button>
                                <button className="export-modal__option flex-1" onClick={() => handleExport('docx', 'two-column')}><span className="export-modal__label">Word (2列)</span></button>
                            </div>
                            <div className="flex gap-2 w-full">
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pptx', 'single')}><span className="export-modal__label">PPT (標準)</span></button>
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pptx', 'two-column')}><span className="export-modal__label">PPT (2列)</span></button>
                            </div>
                            <div className="flex gap-2 w-full">
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pdf', 'single')}><span className="export-modal__label">PDF (標準)</span></button>
                                <button className="export-modal__option flex-1" onClick={() => handleExport('pdf', 'two-column')}><span className="export-modal__label">PDF (2列)</span></button>
                            </div>
                            {/* Markdown/HTML */}
                            <div className="flex gap-2 w-full">
                                <button className="export-modal__option flex-1" onClick={() => handleExport('markdown')}><span className="export-modal__label">Markdown</span></button>
                                <button className="export-modal__option flex-1" onClick={() => handleExport('html')}><span className="export-modal__label">HTML</span></button>
                            </div>
                        </div>
                        <button className="btn btn--secondary mt-4 w-full" onClick={() => setShowModal(false)}>キャンセル</button>
                    </div>
                </div>
            )}
        </>
    );
}
