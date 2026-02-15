'use client';

import { useState } from 'react';
import { ManualData } from '@/app/page';

interface CopyButtonProps {
    manual: ManualData;
    isTwoColumn?: boolean;
}

function generateMarkdown(manual: ManualData): string {
    let md = `# ${manual.title}\n\n`;
    md += `${manual.overview}\n\n`;
    md += `## 手順\n\n`;

    manual.steps.forEach((step) => {
        md += `### ${step.stepNumber}. ${step.action}\n\n`;
        md += `${step.detail}\n\n`;
    });

    if (manual.notes && manual.notes.length > 0) {
        md += `## 注意事項\n\n`;
        manual.notes.forEach((note) => {
            md += `- ${note}\n`;
        });
    }

    return md;
}

function generateHTML(manual: ManualData, isTwoColumn: boolean = false): string {
    let html = `<html><body>`;
    html += `<h1>${manual.title}</h1>`;
    html += `<p>${manual.overview}</p>`;
    html += `<h2>手順</h2>`;

    if (isTwoColumn) {
        // 2-column Layout (Using Table for maximum compatibility)
        html += `<table style="width: 100%; border-collapse: collapse; table-layout: fixed;">`;
        for (let i = 0; i < manual.steps.length; i += 2) {
            html += `<tr>`;
            // Left Column
            const step1 = manual.steps[i];
            html += `<td style="width: 50%; vertical-align: top; padding: 10px; border: 1px solid #eee;">`;
            html += `<h3>${step1.stepNumber}. ${step1.action}</h3>`;
            html += `<p>${step1.detail}</p>`;
            if (step1.screenshot) {
                html += `<div style="height: 300px; display: flex; align-items: center; justify-content: center; background: #f8f9fa; border: 1px solid #ddd; margin-top: 10px;">`;
                html += `<img src="${step1.screenshot}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
                html += `</div>`;
            }
            html += `</td>`;

            // Right Column
            const step2 = manual.steps[i + 1];
            if (step2) {
                html += `<td style="width: 50%; vertical-align: top; padding: 10px; border: 1px solid #eee;">`;
                html += `<h3>${step2.stepNumber}. ${step2.action}</h3>`;
                html += `<p>${step2.detail}</p>`;
                if (step2.screenshot) {
                    html += `<div style="height: 300px; display: flex; align-items: center; justify-content: center; background: #f8f9fa; border: 1px solid #ddd; margin-top: 10px;">`;
                    html += `<img src="${step2.screenshot}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
                    html += `</div>`;
                }
                html += `</td>`;
            } else {
                html += `<td style="width: 50%;"></td>`; // Empty cell
            }
            html += `</tr>`;
        }
        html += `</table>`;
    } else {
        // Standard 1-column Layout
        manual.steps.forEach((step) => {
            html += `<div style="margin-bottom: 24px;">`;
            html += `<h3>${step.stepNumber}. ${step.action}</h3>`;
            html += `<p>${step.detail}</p>`;

            if (step.screenshot) {
                html += `<img src="${step.screenshot}" style="max-width: 100%; border-radius: 8px; border: 1px solid #ddd; margin: 10px 0;" />`;
            }

            html += `</div>`;
        });
    }

    if (manual.notes && manual.notes.length > 0) {
        html += `<h2>注意事項</h2><ul>`;
        manual.notes.forEach((note) => {
            html += `<li>${note}</li>`;
        });
        html += `</ul>`;
    }

    html += `</body></html>`;
    return html;
}

export default function CopyButton({ manual, isTwoColumn }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const markdown = generateMarkdown(manual);
        const html = generateHTML(manual, isTwoColumn);

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob([markdown], { type: 'text/plain' });

            const data = [new ClipboardItem({
                'text/html': blobHtml,
                'text/plain': blobText
            })];

            await navigator.clipboard.write(data);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy formatted content:', err);
            // Fallback to plain text only
            try {
                await navigator.clipboard.writeText(markdown);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (fallbackErr) {
                console.error('Fallback copy failed:', fallbackErr);
            }
        }
    };

    return (
        <button
            className="btn btn--secondary btn--small"
            onClick={handleCopy}
        >
            {copied ? 'コピーしました' : 'コピー'}
        </button>
    );
}
