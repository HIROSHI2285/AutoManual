'use client';

import { useState } from 'react';
import { ManualData } from '@/app/page';

interface CopyButtonProps {
    manual: ManualData;
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

function generateHTML(manual: ManualData): string {
    let html = `<html><body>`;
    html += `<h1>${manual.title}</h1>`;
    html += `<p>${manual.overview}</p>`;
    html += `<h2>手順</h2>`;

    manual.steps.forEach((step) => {
        html += `<div style="margin-bottom: 24px;">`;
        html += `<h3>${step.stepNumber}. ${step.action}</h3>`;
        html += `<p>${step.detail}</p>`;

        if (step.screenshot) {
            html += `<img src="${step.screenshot}" style="max-width: 100%; border-radius: 8px; border: 1px solid #ddd; margin: 10px 0;" />`;
        }

        html += `</div>`;
    });

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

export default function CopyButton({ manual }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const markdown = generateMarkdown(manual);
        const html = generateHTML(manual);

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
