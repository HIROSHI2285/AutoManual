import { ManualData } from '@/app/page';

/**
 * 紺色の円形ナンバリングSVG
 * ズレを防止するため座標を固定
 */
function createStepNumberSvg(number: number): string {
  const size = 32;
  const color = '#1e1b4b'; // ネイビー
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}" />
        <text x="50%" y="50%" dominant-baseline="central" alignment-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="16px">${number}</text>
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
        color: #000; line-height: 1.5; background: #fff;
    }
    
    /* --- スタイリッシュ表紙 (紺帯Ver) --- */
    .cover-page {
        height: 1100px; display: flex; flex-direction: column;
        padding: 0; page-break-after: always; background: #fff;
    }
    .cover-header-bar {
        height: 180px; background: #1e1b4b; display: flex;
        align-items: center; padding: 0 80px;
    }
    .cover-header-text { color: rgba(255,255,255,0.4); font-size: 11px; letter-spacing: 0.5em; font-weight: bold; }
    .cover-body { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 80px; }
    .cover-label { color: #1e1b4b; font-weight: bold; font-size: 14px; letter-spacing: 0.2em; margin-bottom: 24px; border-bottom: 3px solid #1e1b4b; display: inline-block; width: fit-content; }
    .cover-title { font-size: 48px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-bottom: 40px; }
    .cover-overview { font-size: 16px; color: #334155; max-width: 550px; line-height: 1.8; white-space: pre-wrap; border-left: 4px solid #cbd5e1; padding-left: 24px; }

    /* --- 本文エリア --- */
    .content-area { padding: 60px 50px; }
    .doc-header { border-bottom: 2px solid #1e1b4b; margin-bottom: 40px; padding-bottom: 12px; }
    .doc-title { font-size: 18px; font-weight: bold; color: #1e1b4b; }

    /* 2カラム・レイアウト崩れ防止 (Grid) */
    .steps-container {
        display: grid; 
        grid-template-columns: ${isTwoCol ? '1fr 1fr' : '1fr'}; 
        column-gap: 30px; row-gap: 40px; width: 100%;
    }

    /* ページ切れ防止 (分断禁止) */
    .step-card { 
        page-break-inside: avoid !important; break-inside: avoid !important;
        display: block; width: 100%;
    }

    .step-header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
    .num-icon { width: 32px; height: 32px; flex-shrink: 0; }
    .action-text { font-size: 17px; font-weight: 800; color: #1e1b4b; line-height: 1.4; padding-top: 2px; }

    /* テキスト位置の整列（タイトルの開始位置と揃える） */
    .detail-text { 
        font-size: 14px; color: #000; margin-left: 44px; /* 32px + 12px gap */
        margin-bottom: 16px; white-space: pre-wrap; text-align: justify;
    }
    
    /* 画像を閉じ込めるための固定ボックスフレーム (横伸び・巨大化防止) */
    .image-frame { 
        margin-left: ${isTwoCol ? '0' : '44px'};
        background: #f8fafc; border: 1px solid #e2e8f0;
        border-radius: 6px; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        /* 高さを制限して巨大化とレイアウト崩れを防止 */
        height: ${isTwoCol ? '180px' : '280px'}; 
    }

    .image-frame img { 
        width: auto; height: auto;
        max-width: 100%; max-height: 100%; 
        display: block;
    }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <div class="cover-page">
    <div class="cover-header-bar"><div class="cover-header-text">SYSTEM OPERATIONAL DOCUMENT</div></div>
    <div class="cover-body">
        <div class="cover-label">OPERATION MANUAL</div>
        <h1 class="cover-title">${manual.title}</h1>
        <p class="cover-overview">${manual.overview}</p>
    </div>
  </div>

  <div class="content-area">
    <div class="doc-header"><div class="doc-title">${manual.title}</div></div>
    <div class="steps-container">
      ${manual.steps.map(step => `
        <div class="step-card">
          <div class="step-header">
            <img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" />
            <div class="action-text">${step.action}</div>
          </div>
          <div class="detail-text">${step.detail}</div>
          ${step.screenshot ? `
          <div class="image-frame">
            <img src="${step.screenshot}" />
          </div>` : ''}
        </div>
      `).join('')}
    </div>
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
    margin: [0, 0, 0, 0],
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'px', format: [900, 1272], hotfixes: ['px_scaling'] },
    pagebreak: { mode: ['avoid-all', 'css'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // ページ番号：表紙を飛ばし、2枚目（本文）を 1 ページ目として振る
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1) continue;
    pdf.setPage(i);
    pdf.setFontSize(10);
    pdf.setTextColor(150);
    pdf.text(`${i - 1}`, pageWidth - 40, pageHeight - 30, { align: 'right' });
  }

  await worker.save();
  document.body.removeChild(container);
}
