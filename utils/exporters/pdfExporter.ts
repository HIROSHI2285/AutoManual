import { ManualData, ManualStep } from '@/app/page';

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

/**
 * 画像のサイズを取得してアスペクト比を判定する
 */
function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve({ width: 0, height: 0 });
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = base64;
  });
}

export async function generateHTML(manual: ManualData): Promise<string> {
  let stepsHtml = '';
  let currentVideoIndex = 0; // 動画IDを追跡

  for (let i = 0; i < manual.steps.length;) {
    const step = manual.steps[i];
    const isTwoCol = step.layout === 'two-column';

    // 動画が切り替わったら改ページ用スタイルを適用
    const needsPageBreak = i > 0 && step.videoIndex !== currentVideoIndex;
    if (needsPageBreak) {
      currentVideoIndex = step.videoIndex || 0;
    }

    const pageBreakStyle = needsPageBreak ? 'style="page-break-before: always; margin-top: 20mm;"' : '';

    let initialImgStyle = '';
    if (step.screenshot) {
      const dims = await getImageDimensions(step.screenshot);
      const isLandscape = dims.width >= dims.height;
      if (!isLandscape) {
        if (isTwoCol) {
          initialImgStyle = `width: 48.75mm; height: 65mm; object-fit: contain;`;
        } else {
          initialImgStyle = `width: 71.25mm; height: 95mm; object-fit: contain;`;
        }
      } else {
        initialImgStyle = `max-width: 100%; max-height: 100%; object-fit: contain;`;
      }
    }

    const colClass = isTwoCol ? 'two-col' : 'single-col';
    const stepHtml = `
      <div class="step-header ${colClass}">
          <div class="num-icon-wrapper"><img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" /></div>
          <div class="action-text ${colClass}">${step.action}</div>
      </div>
      <div class="text-container ${colClass}">
          <div class="detail-text ${colClass}">${step.detail}</div>
      </div>
      ${step.screenshot ? `<div class="img-box ${colClass}"><img src="${step.screenshot}" style="${initialImgStyle}" /></div>` : ''}
    `;

    if (isTwoCol) {
      let nextStep: ManualStep | null = manual.steps[i + 1] || null;
      let increment = 2;

      // もし右側のステップが別の動画だった場合、この行には配置せず次回に回す
      if (nextStep && nextStep.videoIndex !== step.videoIndex) {
        nextStep = null;
        increment = 1;
      }

      let nextStepHtmlContent = '';
      if (nextStep) {
        let nextImgStyle = `max-width: 100%; max-height: 100%; object-fit: contain;`;
        if (nextStep.screenshot) {
          const dims = await getImageDimensions(nextStep.screenshot);
          const isLandscape = dims.width >= dims.height;
          if (!isLandscape) {
            nextImgStyle = `width: 48.75mm; height: 65mm; object-fit: contain;`;
          }
        }
        nextStepHtmlContent = `
                        <div class="step-header ${colClass}">
                            <div class="num-icon-wrapper"><img src="${createStepNumberSvg(nextStep.stepNumber)}" class="num-icon" /></div>
                            <div class="action-text ${colClass}">${nextStep.action}</div>
                        </div>
                        <div class="text-container ${colClass}">
                            <div class="detail-text ${colClass}">${nextStep.detail}</div>
                        </div>
                        ${nextStep.screenshot ? `<div class="img-box ${colClass}"><img src="${nextStep.screenshot}" style="${nextImgStyle}" /></div>` : ''}
        `;
      }
      stepsHtml += `<div class="step-row ${colClass}" ${pageBreakStyle}>
                  <div class="step-card ${colClass}">${stepHtml}</div>
                  <div class="step-card ${colClass}" style="${nextStep ? '' : 'visibility:hidden'}">
                      ${nextStepHtmlContent}
                  </div>
              </div>`;

      i += increment;
    } else {
      stepsHtml += `<div class="step-row ${colClass}" ${pageBreakStyle} style="page-break-inside: avoid;"><div class="step-card ${colClass}">${stepHtml}</div></div>`;
      i++;
    }
  }

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
    .step-row.two-col { align-items: stretch; }

    .step-card { 
        flex: 1; min-width: 0; display: flex; flex-direction: column; 
    }
    .step-card.two-col { height: 100%; }
    
    /* 1. ActionとDetailの間を極限まで詰める (0.5mm) */
    .step-header { 
        display: flex; gap: 1mm; 
        margin-bottom: 0.25mm !important; 
    }
    .step-header.two-col { align-items: center; }
    .step-header.single-col { align-items: flex-start; }

    .num-icon-wrapper { 
        width: 14mm; height: 14mm; flex-shrink: 0; 
        display: flex; align-items: center; justify-content: center;
        overflow: visible !important;
    }
    .num-icon { width: 100%; height: 100%; display: block; object-fit: contain; }
    
    .action-text { 
        font-size: 13pt; 
        font-weight: 800; 
        color: #1e1b4b; 
    }
    .action-text.two-col { line-height: 1.1; }
    .action-text.single-col { line-height: 1.4; padding-top: 1.5mm; }
    
    /* 画像の高さを揃えるためのテキストコンテナ */
    .text-container {
        display: flex; flex-direction: column;
    }
    .text-container.two-col { min-height: 30mm; flex-shrink: 0; }

    .detail-text { 
        margin-left: 15mm; 
        font-size: 10.5pt; 
        margin-top: 0mm !important; 
        white-space: pre-wrap; color: #000; 
    }
    .detail-text.two-col { margin-bottom: 2.5mm !important; }
    .detail-text.single-col { margin-bottom: 15mm !important; }
    
    /* 【絶対見切れない対策】画像ボックスの高さを固定から可変に変更 */
    .img-box { 
        align-self: center;
        background: #fcfcfc; 
        border: 0.3mm solid #eee; 
        border-radius: 2mm;
        width: 100%;
        display: flex; 
        justify-content: center; 
        overflow: hidden;
        flex-shrink: 0;
    }
    .img-box.two-col {
        height: 65mm; max-height: 65mm; min-height: 65mm;
        align-items: flex-start;
        padding-top: 2mm; margin-top: auto;
    }
    .img-box.single-col {
        height: auto; max-height: 95mm; align-items: center;
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

    ${stepsHtml}
  </div>
</body>
</html>`;
}

export async function generateAndDownloadPdf(manual: ManualData, safeTitle: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  const container = document.createElement('div');
  container.innerHTML = await generateHTML(manual);
  document.body.appendChild(container);

  const titleImageData = createTextAsImage(manual.title, 32, '#1e1b4b');

  const opt = {
    margin: [20, 15, 23, 15] as [number, number, number, number], // Increased bottom margin from 15 to 23 to prevent footer numbering getting cut off
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg' as 'jpeg' | 'png' | 'webp', quality: 0.98 },
    /* scaleを3から2に下げることで、後半ページの描画座標の累積誤差による見切れを抑制します */
    html2canvas: { scale: 2, useCORS: true, logging: false },
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
