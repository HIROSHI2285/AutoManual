import { ManualData } from '@/app/page';

// 紺色の円形ナンバリング（SVG）
function createStepNumberSvg(number: number): string {
  const size = 32;
  const color = '#1e1b4b';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}" />
        <text x="50%" y="54%" dominant-baseline="central" alignment-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="16px">${number}</text>
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
        color: #000; line-height: 1.6; background: #fff;
    }
    
    /* --- 表紙 --- */
    .cover-page {
        height: 1100px; display: flex; flex-direction: column;
        padding: 0; page-break-after: always; background: #fff;
    }
    .cover-body { 
        flex-grow: 1; display: flex; flex-direction: column; 
        justify-content: center; padding: 0 80px; 
    }
    .cover-label { 
        color: #1e1b4b; font-weight: bold; font-size: 14px; letter-spacing: 0.2em; 
        margin-top: 40px; margin-bottom: 24px; 
        border-bottom: 2px solid #1e1b4b; display: inline-block; width: fit-content; 
    }
    .cover-title { font-size: 48px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-bottom: 40px; }
    .cover-overview { 
        font-size: 16px; color: #334155; max-width: 550px; line-height: 1.8; 
        white-space: pre-wrap; border-left: 4px solid #cbd5e1; padding-left: 24px; 
    }

    /* --- ページヘッダー（HTML要素として実装） --- */
    .page-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 50px;
        background: white;
        border-bottom: 2px solid #1e1b4b;
        display: flex;
        align-items: center;
        padding: 0 40px;
        z-index: 1000;
    }
    .page-header-title {
        font-size: 14px;
        font-weight: bold;
        color: #1e1b4b;
    }
    
    /* 表紙ではヘッダーを非表示 */
    .cover-page ~ .page-header {
        display: none;
    }

    /* --- 本文エリア --- */
    .content-area { 
        padding: 70px 50px 30px; /* 上部にヘッダー分の余白を追加 */
    }

    /* コンテナレイアウト: Grid */
    .steps-container {
        display: grid;
        grid-template-columns: ${isTwoCol ? '1fr 1fr' : '1fr'};
        column-gap: 30px; 
        row-gap: 40px;
        width: 100%;
    }

    /* ステップカード (分断絶対禁止) */
    .step-card { 
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        position: relative;
        display: block;
        width: 100%;
    }

    .step-header { 
        display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px; 
    }
    .num-icon { width: 32px; height: 32px; flex-shrink: 0; }
    .action-text { 
        font-size: 17px; font-weight: 800; color: #1e1b4b; 
        line-height: 1.4; padding-top: 2px; 
    }

    /* インデント固定 (32px + 12px = 44px) */
    .detail-text { 
        font-size: 14px; color: #000; 
        margin-left: 44px; margin-bottom: 12px; 
        white-space: pre-wrap; text-align: justify;
    }
    
    /* 画像フレーム */
    .image-frame { 
        margin-left: 44px;
        background: #fdfdfd; border: 1px solid #f3f4f6;
        border-radius: 6px; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        height: ${isTwoCol ? '240px' : '380px'}; 
    }

    /* 画像スタイル: アスペクト比絶対死守 */
    .image-frame img { 
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
    }

    /* 2カラム時の微調整 */
    .two-col-layout .detail-text, 
    .two-col-layout .image-frame { 
        margin-left: 44px; 
    }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <div class="cover-page">
    <div class="cover-body">
        <div class="cover-label">OPERATION MANUAL</div>
        <h1 class="cover-title">${manual.title}</h1>
        <p class="cover-overview">${manual.overview || ''}</p>
    </div>
  </div>

  <!-- ページヘッダー（2ページ目以降に表示） -->
  <div class="page-header">
    <div class="page-header-title">${manual.title}</div>
  </div>

  <div class="content-area">
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

  // PDF生成設定
  const opt = {
    margin: [10, 0, 10, 0], // マージンを最小限に（ヘッダーはHTML要素で実装）
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
    },
    jsPDF: { unit: 'px', format: [900, 1272], hotfixes: ['px_scaling'] },
    pagebreak: { mode: ['avoid-all', 'css'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // ページ番号のみをjsPDFで描画（フッター）
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) { // 表紙以外
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${i - 1}`, pageWidth - 40, pageHeight - 15, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
