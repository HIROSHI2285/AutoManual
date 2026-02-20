import { ManualData } from '@/app/page';

/**
 * 紺色の円形ナンバリング（後半ページの座標ズレ対策として広大なバッファを確保）
 */
function createStepNumberSvg(number: number): string {
  // サイズを64に拡大。円の周囲に大きな余白(バッファ)を持たせることで、
  // html2canvasの累積計算誤差による後半ページでの「削れ」を物理的に回避します。
  const size = 64;
  const radius = 18; 
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="#1e1b4b" />
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="20px">${number}</text>
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
    
    /* 表紙: ラインの太さを2.5mmに変更し、強制改ページを追加 */
    .cover-page {
        height: 257mm; display: flex; flex-direction: column; justify-content: center;
        padding: 0 20mm; 
        border-top: 2.5mm solid #1e1b4b;
        border-bottom: 2.5mm solid #1e1b4b;
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
        display: flex; gap: 8mm; margin-bottom: 15mm;
        page-break-inside: avoid; break-inside: avoid;
    }
    .step-card { flex: 1; min-width: 0; }
    
    .step-header { display: flex; gap: 4mm; align-items: center; margin-bottom: 4mm; }
    
    /* ナンバリング見切れ防止: コンテナを拡大し、はみ出しを許容 */
    .num-icon-wrapper { 
        width: 16mm; height: 16mm; flex-shrink: 0; 
        display: flex; align-items: center; justify-content: center;
        overflow: visible !important;
    }
    .num-icon { width: 100%; height: 100%; display: block; }
    
    .action-text { font-size: 13pt; font-weight: 800; color: #1e1b4b; }
    
    .detail-text { margin-left: 20mm; font-size: 10.5pt; margin-bottom: 5mm; white-space: pre-wrap; color: #000; }
    
    /* 画像の中央配置修正: シングルカラム時は auto マージンで中央寄せ */
    .img-box { 
        margin: 0 auto 5mm ${isTwoCol ? '0' : 'auto'};
        background: #fcfcfc; border: 0.3mm solid #eee; border-radius: 2mm;
        height: ${isTwoCol ? '65mm' : '95mm'};
        display: flex; align-items: center; justify-content: center; overflow: hidden;
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
    if (isTwoCol) {
      if (i % 2 === 0) {
        const s1 = step;
        const s2 = manual.steps[i + 1];
        acc += `<div class="step-row">
                    <div class="step-card">
                        <div class="step-header"><div class="num-icon-wrapper"><img src="${createStepNumberSvg(s1.stepNumber)}" class="num-icon" /></div><div class="action-text">${s1.action}</div></div>
                        <div class="detail-text">${s1.detail}</div>
                        ${s1.screenshot ? `<div class="img-box"><img src="${s1.screenshot}" /></div>` : ''}
                    </div>
                    <div class="step-card" style="${s2 ? '' : 'visibility:hidden'}">
                        ${s2 ? `
                        <div class="step-header"><div class="num-icon-wrapper"><img src="${createStepNumberSvg(s2.stepNumber)}" class="num-icon" /></div><div class="action-text">${s2.action}</div></div>
                        <div class="detail-text">${s2.detail}</div>
                        ${s2.screenshot ? `<div class="img-box"><img src="${s2.screenshot}" /></div>` : ''}
                        ` : ''}
                    </div>
                </div>`;
      }
    } else {
      acc += `<div class="step-row">
                <div class="step-card">
                    <div class="step-header"><div class="num-icon-wrapper"><img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" /></div><div class="action-text">${step.action}</div></div>
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

  // ヘッダータイトルのサイズを拡大(32px)
  const titleImageData = createTextAsImage(manual.title, 32, '#1e1b4b');

  const opt = {
    margin: [20, 15, 20, 15],
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
      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(0.3);
      pdf.line(15, 15, 195, 15);
      if (titleImageData) {
        const imgProps = pdf.getImageProperties(titleImageData);
        // ヘッダーの高さを8mmに拡大
        const headerH = 8;
        const imgWidth = (imgProps.width * headerH) / imgProps.height;
        pdf.addImage(titleImageData, 'PNG', 15, 6, imgWidth, headerH);
      }

      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(0.2);
      pdf.line(15, 282, 195, 282);

      // ページ番号の紺色化と配置調整
      pdf.setFontSize(10);
      pdf.setTextColor(30, 27, 75); 
      pdf.text(`${i - 1}`, 195, 289, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
