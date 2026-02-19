import { ManualData } from '@/app/page';

// 紺色のナンバリングSVG
function createStepNumberSvg(number: number): string {
  const size = 32;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#1e1b4b" />
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="16px">${number}</text>
    </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// 日本語タイトルの文字化けを回避するため、Canvasで画像化する関数
function createTextAsImage(text: string, fontSize: number, color: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.font = `bold ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = metrics.width + 20;
  canvas.height = fontSize * 2;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

export function generateHTML(manual: ManualData, layout: 'single' | 'two-column' = 'single'): string {
  const isTwoCol = layout === 'two-column';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: "Helvetica Neue", Arial, sans-serif;
        width: 190mm; margin: 0 auto; background: #fff; color: #000;
    }
    
    /* 表紙: 空白ページを作らないよう高さを抑制 */
    .cover-page {
        height: 280mm; 
        display: flex; flex-direction: column; justify-content: center;
        padding: 0 20mm; border-top: 5mm solid #1e1b4b;
    }
    .cover-title { font-size: 32pt; font-weight: 800; margin-bottom: 8mm; }
    .cover-overview { font-size: 12pt; border-left: 1.5mm solid #1e1b4b; padding-left: 5mm; white-space: pre-wrap; color: #333; }

    /* 本文エリア: PDF側のmarginで制御されるため、ここでの過剰なpaddingは不要 */
    .content-area { padding-top: 5mm; }

    .step-row {
        display: flex; gap: 8mm; margin-bottom: 12mm;
        page-break-inside: avoid; break-inside: avoid;
    }
    .step-card { flex: 1; min-width: 0; break-inside: avoid; }
    
    .step-header { display: flex; gap: 4mm; align-items: flex-start; margin-bottom: 3mm; }
    .num-icon { width: 8mm; height: 8mm; flex-shrink: 0; }
    .action-text { font-size: 13pt; font-weight: 800; color: #1e1b4b; padding-top: 1mm; }
    
    .detail-text { margin-left: 12mm; font-size: 10pt; margin-bottom: 4mm; white-space: pre-wrap; }
    
    .img-box { 
        margin-left: ${isTwoCol ? '0' : '12mm'};
        background: #fcfcfc; border: 0.3mm solid #eee; border-radius: 2mm;
        height: ${isTwoCol ? '60mm' : '90mm'};
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

  // ヘッダー用タイトル画像の生成
  const titleImageData = createTextAsImage(manual.title, 24, '#1e1b4b');

  const opt = {
    margin: [25, 10, 15, 10], // 上部25mmを物理的に確保
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 3, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');
  const totalPages = pdf.internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) {
      // 紺色の細いライン (マージン内の y=18mm 付近)
      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(0.3);
      pdf.line(10, 18, 200, 18);

      // タイトル画像を貼り付け (文字化け回避)
      if (titleImageData) {
        // x=10, y=10, w=自動計算（高さ約6mmに調整）
        // 3番目の引数はwidth, 4番目の引数はheight. 0を指定すると縦横比維持されるが念のため計算
        // ここでは user code通り 0, 6 にしておく (widthはauto)
        const imgProps = pdf.getImageProperties(titleImageData);
        const imgWidth = (imgProps.width * 6) / imgProps.height;
        pdf.addImage(titleImageData, 'PNG', 10, 10, imgWidth, 6);
      }

      // ページ番号 (数字は文字化けしない)
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`${i - 1}`, 200, 287, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
