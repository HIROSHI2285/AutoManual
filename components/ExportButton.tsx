'use client';

import { useState } from 'react';
import { ManualData } from '@/app/page';

interface ExportButtonProps {
    manual: ManualData;
}



// Base64 data URLをUint8Arrayに変換するヘルパー
function dataUrlToUint8Array(dataUrl: string): { data: Uint8Array; type: 'png' | 'jpg' } {
    const [header, base64] = dataUrl.split(',');
    const type = header.includes('png') ? 'png' : 'jpg';
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return { data: arr, type };
}

// Word(.docx)ファイルを生成してダウンロードする
// docxライブラリをdynamic importで使用（ブラウザバンドル対応）
async function generateAndDownloadDocx(manual: ManualData): Promise<void> {
    const {
        Document, Packer, Paragraph, TextRun, ImageRun,
        AlignmentType, BorderStyle, WidthType,
        Table, TableRow, TableCell, ShadingType, VerticalAlign,
    } = await import('docx');

    const FONT = 'Meiryo UI';
    // docxライブラリはfont: '...'では日本語フォントが反映されない
    // rFontsオブジェクトでascii/hAnsi/eastAsia/csを全指定する必要がある
    const RF = { ascii: FONT, hAnsi: FONT, eastAsia: FONT, cs: FONT };

    const PAGE_WIDTH_DXA = 11906;
    const MARGIN_DXA = 1000;
    const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - MARGIN_DXA * 2; // 9906 DXA ≒ 174mm

    // 画像の表示幅：コンテンツ幅の60%に縮小（2ページにまたがらないように）
    const IMG_WIDTH_EMU = Math.round(CONTENT_WIDTH_DXA * 635 * 0.6);

    const children: any[] = [];

    // タイトル
    children.push(
        new Paragraph({
            children: [new TextRun({ text: manual.title, bold: true, size: 36, font: RF })],
            spacing: { after: 200 },
            indent: { left: 0, right: 0, hanging: 0, firstLine: 0 }, // 箇条書き回避の最終手段
        })
    );

    // 概要
    if (manual.overview) {
        children.push(
            new Paragraph({
                children: [new TextRun({ text: manual.overview, size: 24, font: RF })],
                spacing: { after: 400 },
                indent: { left: 0, right: 0, hanging: 0, firstLine: 0 }, // 箇条書き回避の最終手段
            })
        );
    }

    // 「手順」見出し帯（グレー背景の段落で代用）
    children.push(
        new Paragraph({
            children: [new TextRun({ text: '手順', bold: true, size: 28, font: RF })],
            shading: { fill: 'F4F4F4', type: ShadingType.CLEAR },
            spacing: { before: 200, after: 300 },
            border: {
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            },
            indent: { left: 0, right: 0, hanging: 0, firstLine: 0 }, // 箇条書き回避の最終手段
        })
    );

    // 各ステップ
    for (const step of manual.steps) {
        // ステップ番号＋タイトル（スタイルなし・直接指定）
        children.push(
            new Paragraph({
                children: [
                    new TextRun({ text: `■手順${step.stepNumber} `, bold: true, size: 28, font: RF }),
                    new TextRun({ text: step.action, bold: true, size: 28, font: RF }),
                ],
                spacing: { before: 300, after: 100 },

                indent: { left: 0, right: 0, hanging: 0, firstLine: 0 }, // インデント完全無効化
            })
        );

        // 説明文
        if (step.detail && step.detail !== step.action) {
            const lines = step.detail.split('\n');
            children.push(
                new Paragraph({
                    children: lines.map((line, index) =>
                        new TextRun({
                            text: line,
                            size: 22,
                            font: RF,
                            break: index > 0 ? 1 : 0
                        })
                    ),
                    spacing: { after: 120 },
                    // keepNext removed to prevent "black square" formatting marks
                    indent: { left: 0, right: 0, hanging: 0, firstLine: 0 }, // インデント完全無効化
                })
            );
        }

        // スクリーンショット画像
        if (step.screenshot) {
            try {
                const { data, type } = dataUrlToUint8Array(step.screenshot);

                // 画像の実際のサイズを取得して縦横比を計算
                const imgHeight = await new Promise<number>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const ratio = img.height / img.width;
                        resolve(Math.round(IMG_WIDTH_EMU * ratio));
                    };
                    img.onerror = () => resolve(Math.round(IMG_WIDTH_EMU * 0.5625)); // 16:9 fallback
                    img.src = step.screenshot!;
                });

                children.push(
                    new Paragraph({
                        children: [
                            new ImageRun({
                                data,
                                transformation: { width: Math.round(IMG_WIDTH_EMU / 9525), height: Math.round(imgHeight / 9525) },
                                type,
                            }),
                        ],
                        spacing: { after: 300 },

                        indent: { left: 0, right: 0, hanging: 0, firstLine: 0 }, // インデント完全無効化
                    })
                );
            } catch (e) {
                console.warn(`Step ${step.stepNumber} image embedding failed:`, e);
            }
        }
    }

    // ドキュメント生成
    const doc = new Document({
        numbering: {
            config: [], // 箇条書き設定を完全に無効化
        },
        styles: {
            default: {
                document: { run: { font: RF, size: 22 } },
            },
            paragraphStyles: [
                {
                    id: 'Normal',
                    name: 'Normal',
                    run: { font: RF, size: 22 },
                    paragraph: { spacing: { line: 240 }, indent: { left: 0, right: 0, hanging: 0, firstLine: 0 } },
                },
            ],
        },
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_WIDTH_DXA, height: 16838 },
                    margin: { top: MARGIN_DXA, right: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA },
                },
            },
            children,
        }],
    });

    // Blobに変換
    const blob = await Packer.toBlob(doc);

    // JSZipでXMLを直接編集して、箇条書き無効化設定を注入
    try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(blob);
        const settingsXml = await zip.file("word/settings.xml")?.async("string");

        if (settingsXml) {
            // <w:settings>直下に設定を追加
            // 既存のsettingsがあればそれにマージすべきだが、単純な置換で対応
            // <w:settings ...> の直後に挿入
            const newSettingsXml = settingsXml.replace(
                /(<w:settings[^>]*>)/,
                '$1<w:autoHyphenation w:val="0"/><w:doNotUseIndentAsNumberingTabStop/>'
            );
            zip.file("word/settings.xml", newSettingsXml);

            // 再生成
            const newBlob = await zip.generateAsync({ type: "blob" });

            // ダウンロード
            const url = URL.createObjectURL(newBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${manual.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return;
        }
    } catch (e) {
        console.error("ZIP editing failed:", e);
        // フォールバック：元のBlobでダウンロード
    }

    // ZIP編集に失敗した場合は元のBlobを使用
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${manual.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

    const handleExport = async (format: 'markdown' | 'html' | 'pdf' | 'docx', layout: 'single' | 'two-column' = 'single') => {
        const safeTitle = manual.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');

        switch (format) {
            case 'markdown':
                downloadFile(generateMarkdown(manual), `${safeTitle}.md`, 'text/markdown;charset=utf-8');
                break;
            case 'html':
                downloadFile(generateHTML(manual, layout), `${safeTitle}.html`, 'text/html;charset=utf-8');
                break;
            case 'docx':
                try {
                    await generateAndDownloadDocx(manual);
                } catch (error) {
                    console.error('Word generation error:', error);
                    alert('Word出力に失敗しました。ブラウザの対応状況をご確認ください。');
                }
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
                        margin: [10, 10, 15, 10],
                        filename: `${safeTitle}.pdf`,
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true },
                        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                        pagebreak: { mode: ['css', 'legacy'] }
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
                            <button
                                className="export-modal__option"
                                onClick={() => handleExport('docx')}
                            >
                                <span className="export-modal__label">Word (.docx)</span>
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
