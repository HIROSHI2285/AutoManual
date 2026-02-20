import { ManualData } from '@/app/page';

/**
 * 紺色の円形ナンバリング（中心ズレを完璧に抑え、広大な余白で削れを防止）
 */
function createStepNumberSvg(number: number): string {
  // サイズを128に拡大し、半径32の円を配置。
  // 周囲の広大な透明エリアが、PDF変換時の座標計算ズレをすべて吸収します。
  const size = 128; // 広域バッファ
  const radius = 32;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="#1e1b4b" />
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="28px">${number}</text>
    </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

/**
 * 日本語タイトルの文字化け回避用画像生成
 */
function createTextAsImage(text: string, fontSize: number, color: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.font = `bold ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = metrics.width + 40;
  canvas.height = fontSize * 3;
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
        width: 180mm; margin: 0 auto; background: #fff; color: #000;
    }
    
    .cover-page {
        height: 240mm; display: flex; flex-direction: column; justify-content: center;
        padding: 0 20mm; border-top: 2.5mm solid #1e1b4b; border-bottom: 2.5mm solid #1e1b4b;
        page-break-after: always;
    }
    .cover-label { font-size: 14pt; color: #1e1b4b; font-weight: bold; margin-bottom: 5mm; }
    .cover-title { font-size: 38pt; font-weight: 800; color: #0f172a; line-height: 1.2; }

    .content-area { padding-top: 10mm; }
    
    .manual-overview-section {
        margin-bottom: 20mm; padding: 6mm; background: #f8fafc;
        border-radius: 2mm; border-left: 2mm solid #1e1b4b;
    }
    .overview-label { font-size: 11pt; font-weight: bold; color: #1e1b4b; margin-bottom: 3mm; display: block; }
    .overview-text { font-size: 10.5pt; color: #334155; line-height: 1.8; white-space: pre-wrap; }

    .step-row {
        display: flex; gap: 8mm; margin-bottom: 12mm; /* 15mmから短縮 */
        page-break-inside: avoid; break-inside: avoid;
    }
    .step-card { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    
    /* 1. ActionとDetailの間を極限まで詰める (0.5mm) */
    .step-header { 
        display: flex; gap: 4mm; align-items: center; 
        margin-bottom: 0.5mm !important; 
    }
    .num-icon-wrapper { 
        width: 14mm; height: 14mm; flex-shrink: 0; 
        display: flex; align-items: center; justify-content: center;
        overflow: visible !important;
    }
    .num-icon { width: 100%; height: 100%; display: block; object-fit: contain; }
    
    .action-text { font-size: 13pt; font-weight: 800; color: #1e1b4b; line-height: 1.1; }
    
    /* 画像の高さを揃えるためのテキストコンテナ (18mmで同期を安定化) */
    .text-container {
        min-height: ${isTwoCol ? '18mm' : 'auto'}; 
        display: flex; flex-direction: column;
    }

    /* 画像との間隔を2カラム時は維持(2.5mm)、1カラムは大幅に下げる(15mm) */
    .detail-text { 
        margin-left: 18mm; font-size: 10.5pt; 
        margin-top: 0mm !important; 
        margin-bottom: ${isTwoCol ? '2.5mm' : '15mm'} !important; 
        white-space: pre-wrap; color: #000; 
    }
    
    .img-box { 
        align-self: center;
        background: #fcfcfc; 
        border: 0.3mm solid #eee; 
        border-radius: 2mm;
        height: ${isTwoCol ? '65mm' : '95mm'};
        width: 100%;
        display: flex; 
        align-items: center; 
        justify-content: center; 
        overflow: hidden;
        flex-shrink: 0;
    }
    img { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-label">OPERATIONAL STANDARD</div>
    <h1 class="cover-title">${manual.title}</h1>
  </div>

  <div class="content-area">
    <div class="manual-overview-section">
        <span class="overview-label">■ DOCUMENT OVERVIEW</span>
        <p class="overview-text">${manual.overview}</p>
    </div>

    ${manual.steps.reduce((acc, step, i) => {
    const stepHtml = `
      <div class="step-header">
          <div class="num-icon-wrapper"><img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" /></div>
          <div class="action-text">${step.action}</div>
      </div>
      <div class="text-container">
          <div class="detail-text">${step.detail}</div>
      </div>
      ${step.screenshot ? `<div class="img-box"><img src="${step.screenshot}" /></div>` : ''}
    `;

    if (isTwoCol) {
      if (i % 2 === 0) {
        const nextStep = manual.steps[i + 1];
        acc += `<div class="step-row">
                    <div class="step-card">${stepHtml}</div>
                    <div class="step-card" style="${nextStep ? '' : 'visibility:hidden'}">
                        ${nextStep ? `
                          <div class="step-header">
                              <div class="num-icon-wrapper"><img src="${createStepNumberSvg(nextStep.stepNumber)}" class="num-icon" /></div>
                              <div class="action-text">${nextStep.action}</div>
                          </div>
                          <div class="text-container">
                              <div class="detail-text">${nextStep.detail}</div>
                          </div>
                          ${nextStep.screenshot ? `<div class="img-box"><img src="${nextStep.screenshot}" /></div>` : ''}
                        ` : ''}
                    </div>
                </div>`;
      }
    } else {
      acc += `<div class="step-row" style="page-break-inside: avoid; padding-bottom: 5mm;"><div class="step-card">${stepHtml}</div></div>`;
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

  const titleImageData = createTextAsImage(manual.title, 32, '#1e1b4b');

  const opt = {
    margin: [20, 15, 23, 15] as [number, number, number, number], // Increased bottom margin from 15 to 23 to prevent footer numbering getting cut off
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg' as 'jpeg' | 'png' | 'webp', quality: 0.98 },
    html2canvas: { scale: 3, useCORS: true },
    jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'] }
  } as any;

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');
  const totalPages = pdf.internal.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) {
      // ヘッダー
      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(0.3);
      pdf.line(15, 15, 195, 15);
      if (titleImageData) {
        const props = pdf.getImageProperties(titleImageData);
        const headerH = 10;
        const imgWidth = (props.width * headerH) / props.height;
        pdf.addImage(titleImageData, 'PNG', 15, 4, imgWidth, headerH);
      }

      // フッター（ラインのみ、タイトルなし）
      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(0.2);
      pdf.line(15, 282, 195, 282);

      // ページ番号 (9pt、紺色)
      pdf.setFontSize(9);
      pdf.setTextColor(30, 27, 75);
      pdf.text(`${i - 1}`, 195, 289, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
