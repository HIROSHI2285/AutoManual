import { ManualData } from '@/app/page';

// 紺色のナンバリングSVG（サイズをmm基準で設計）
function createStepNumberSvg(number: number): string {
  const size = 32;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#1e1b4b" />
        <text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="16px">${number}</text>
    </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export function generateHTML(manual: ManualData, layout: 'single' | 'two-column' = 'single'): string {
  const isTwoCol = layout === 'two-column';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    /* 全てミリメートルで制御 */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: "Helvetica Neue", Arial, sans-serif;
        width: 190mm; /* A4幅 210mm - 左右マージン20mm */
        margin: 0 auto;
        color: #000;
        background: #fff;
    }
    
    /* --- 表紙 --- */
    .cover-page {
        height: 270mm; /* A4高さ 297mm より小さく設定して余白ページを防止 */
        display: flex; flex-direction: column; justify-content: center;
        padding: 0 20mm;
        border-top: 5mm solid #1e1b4b;
    }
    .cover-title { font-size: 32pt; font-weight: 800; margin-bottom: 10mm; line-height: 1.2; }
    .cover-overview { font-size: 12pt; border-left: 1mm solid #1e1b4b; padding-left: 5mm; white-space: pre-wrap; color: #333; }

    /* --- 本文 --- */
    .content-area { padding-top: 15mm; } /* ヘッダー分の空き */

    .step-row {
        display: flex; gap: 8mm; margin-bottom: 12mm;
        page-break-inside: avoid; break-inside: avoid;
    }
    .step-card { flex: 1; min-width: 0; }
    
    .step-header { display: flex; gap: 4mm; align-items: flex-start; margin-bottom: 3mm; }
    .num-icon { width: 8mm; height: 8mm; flex-shrink: 0; }
    .action-text { font-size: 13pt; font-weight: 800; color: #1e1b4b; padding-top: 1mm; }
    
    .detail-text { margin-left: 12mm; font-size: 10pt; margin-bottom: 4mm; white-space: pre-wrap; }
    
    .img-box { 
        margin-left: ${isTwoCol ? '0' : '12mm'};
        background: #fcfcfc; border: 0.3mm solid #eee; border-radius: 2mm;
        height: ${isTwoCol ? '50mm' : '80mm'};
        display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    img { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <div class="cover-page">
    <h1 class="cover-title">${manual.title}</h1>
    <p class="cover-overview">${manual.overview}</p>
  </div>
  <div class="content-area">
    ${manual.steps.reduce((acc, step, i) => {
    if (isTwoCol) {
      if (i % 2 === 0) {
        const s1 = step;
        const s2 = manual.steps[i + 1];
        acc += `<div class="step-row">
                    <div class="step-card">
                        <div class="step-header"><img src="${createStepNumberSvg(s1.stepNumber)}" class="num-icon" /><div class="action-text">${s1.action}</div></div>
                        <div class="detail-text">${s1.detail}</div>
                        ${s1.screenshot ? `<div class="img-box"><img src="${s1.screenshot}" /></div>` : ''}
                    </div>
                    <div class="step-card" style="${s2 ? '' : 'visibility:hidden'}">
                        ${s2 ? `
                        <div class="step-header"><img src="${createStepNumberSvg(s2.stepNumber)}" class="num-icon" /><div class="action-text">${s2.action}</div></div>
                        <div class="detail-text">${s2.detail}</div>
                        ${s2.screenshot ? `<div class="img-box"><img src="${s2.screenshot}" /></div>` : ''}
                        ` : ''}
                    </div>
                </div>`;
      }
    } else {
      acc += `<div class="step-row">
                <div class="step-card">
                    <div class="step-header"><img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" /><div class="action-text">${step.action}</div></div>
                    <div class="detail-text">${step.detail}</div>
                    ${step.screenshot ? `<div class="img-box"><img src="${step.screenshot}" /></div>` : ''}
                </div>
            </div>`;
    }
    return acc;
  }, '')}
  </div>
</body>
</html>`;
}

export async function generateAndDownloadPdf(manual: ManualData, layout: 'single' | 'two-column' = 'single', safeTitle: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  const container = document.createElement('div');
  container.innerHTML = generateHTML(manual, layout);
  document.body.appendChild(container);

  const opt = {
    margin: [10, 10, 10, 10], // mm単位の余白
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 3, useCORS: true }, // スケールを上げて鮮明に
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');
  const totalPages = pdf.internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) {
      // シンプルなラインヘッダー
      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(0.2);
      pdf.line(10, 12, 200, 12);

      pdf.setFontSize(9);
      pdf.setTextColor(30, 27, 75);
      pdf.text(manual.title, 10, 10);

      // ページ番号
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`${i - 1}`, 200, 287, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
