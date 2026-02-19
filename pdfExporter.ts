import { ManualData } from '@/app/page';

/**
 * ナンバリング用SVG（紺丸）
 */
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
    /* 全ての余白・サイズ計算を固定 */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body { 
        font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
        color: #000; line-height: 1.5; background: #fff;
        width: 794px; /* A4 width (px at 96dpi) to match PDF width */
        margin: 0 auto; /* Center in the PDF canvas if margin-left is 0 */
    }

    /* --- ヘッダータイトル用 (文字化け対策) --- */
    #header-source {
        position: absolute; top: -9999px; left: 0;
        width: 600px; 
        font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
    }
    .header-source-text {
        font-size: 14px; font-weight: bold; color: #1e1b4b; /* Navy */
        line-height: 1.2;
    }
    
    /* --- 表紙デザイン --- */
    .cover-page {
        /* A4高さに合わせて調整（空白ページ防止） */
        height: 1050px; 
        display: flex; flex-direction: column; justify-content: center;
        padding: 0 80px; 
        page-break-after: always !important; /* 必ず改ページ */
        border-top: 15px solid #1e1b4b;
    }
    .cover-label { color: #1e1b4b; font-weight: bold; font-size: 14px; letter-spacing: 0.2em; margin-bottom: 24px; border-bottom: 2px solid #1e1b4b; display: inline-block; width: fit-content; }
    .cover-title { font-size: 42px; font-weight: 800; color: #0f172a; line-height: 1.2; margin-bottom: 40px; }
    .cover-overview { font-size: 16px; color: #334155; max-width: 550px; line-height: 1.8; white-space: pre-wrap; border-left: 4px solid #1e1b4b; padding-left: 24px; }

    /* --- 本文エリア --- */
    /* マージンはPDF設定(opt.margin)に任せるため、ここではパディング不要 */
    .content-area { 
        padding: 20px 40px; 
    }

    /* 2カラム・レイアウト崩れ防止 (Row管理) */
    .step-row {
        display: flex; gap: 20px; width: 100%; margin-bottom: 40px;
        page-break-inside: avoid !important; 
        break-inside: avoid-page !important; /* 行単位で改ページを絶対禁止 */
    }

    .step-card { 
        flex: 1; display: flex; flex-direction: column;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
    }
    .step-card.empty { visibility: hidden; }

    .step-header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
    .num-icon { width: 32px; height: 32px; flex-shrink: 0; }
    .action-text { font-size: 16px; font-weight: 800; color: #1e1b4b; line-height: 1.4; padding-top: 4px; }

    .detail-text { 
        font-size: 13.5px; color: #000; margin-left: 44px;
        margin-bottom: 15px; white-space: pre-wrap;
    }
    
    .image-frame { 
        margin-left: ${isTwoCol ? '0' : '44px'};
        background: #fcfcfc; border: 1px solid #f1f5f9;
        border-radius: 4px; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        height: ${isTwoCol ? '240px' : '380px'}; 
    }
    .image-frame img { 
        max-width: 100%; max-height: 100%; 
        object-fit: contain; display: block;
    }

    /* 2カラム時の微調整 */
    .two-col-layout .detail-text { margin-left: 0; }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <!-- ヘッダーキャプチャ用 -->
  <div id="header-source">
    <div class="header-source-text">${manual.title}</div>
  </div>

  <div class="cover-page">
    <div class="cover-label">Operational Standard</div>
    <h1 class="cover-title">${manual.title}</h1>
    <p class="cover-overview">${manual.overview}</p>
  </div>

  <div class="content-area">
    ${(() => {
      let html = '';
      const steps = manual.steps;
      if (isTwoCol) {
        for (let i = 0; i < steps.length; i += 2) {
          const s1 = steps[i];
          const s2 = steps[i + 1];
          html += `
                <div class="step-row">
                    <div class="step-card">
                        <div class="step-header">
                            <img src="${createStepNumberSvg(s1.stepNumber)}" class="num-icon" />
                            <div class="action-text">${s1.action}</div>
                        </div>
                        <div class="detail-text">${s1.detail}</div>
                        ${s1.screenshot ? `<div class="image-frame"><img src="${s1.screenshot}" /></div>` : ''}
                    </div>
                    ${s2 ? `
                    <div class="step-card">
                        <div class="step-header">
                            <img src="${createStepNumberSvg(s2.stepNumber)}" class="num-icon" />
                            <div class="action-text">${s2.action}</div>
                        </div>
                        <div class="detail-text">${s2.detail}</div>
                        ${s2.screenshot ? `<div class="image-frame"><img src="${s2.screenshot}" /></div>` : ''}
                    </div>` : '<div class="step-card empty"></div>'}
                </div>`;
        }
      } else {
        html += steps.map(s => `
                <div class="step-row">
                    <div class="step-card">
                        <div class="step-header">
                            <img src="${createStepNumberSvg(s.stepNumber)}" class="num-icon" />
                            <div class="action-text">${s.action}</div>
                        </div>
                        <div class="detail-text">${s.detail}</div>
                        ${s.screenshot ? `<div class="image-frame"><img src="${s.screenshot}" /></div>` : ''}
                    </div>
                </div>`).join('');
      }
      return html;
    })()}
  </div>
</body>
</html>`;
}

export async function generateAndDownloadPdf(manual: ManualData, layout: 'single' | 'two-column' = 'single', safeTitle: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  const html2canvas = (await import('html2canvas')).default;

  const container = document.createElement('div');
  container.innerHTML = generateHTML(manual, layout);
  document.body.appendChild(container);

  // 1. ヘッダーテキストを画像化 (Mojibake対策)
  const headerEl = container.querySelector('#header-source') as HTMLElement;
  let headerImgData: string | null = null;
  let headerAspectRatio = 0;

  if (headerEl) {
    try {
      headerEl.style.top = '0';
      const canvas = await html2canvas(headerEl, { 
        scale: 5, // 3→5に大幅UP（文字潰れ完全対策）
        backgroundColor: null,
        width: 600,
        height: 30,
        logging: false
      });
      headerImgData = canvas.toDataURL('image/png');
      headerAspectRatio = canvas.width / canvas.height;
      headerEl.style.display = 'none';
    } catch (e) {
      console.error("Header capture failed", e);
    }
  }

  // 2. 余白設定 (重要: 本文の開始位置を物理的に下げる)
  // Top: 25mm (ヘッダー用), Bottom: 15mm (ページ番号用)
  const opt = {
    margin: [25, 0, 15, 0],
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 3, // 2→3に上げて全体の解像度向上
      useCORS: true, 
      logging: false, 
      width: 794,
      windowWidth: 794
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { 
      mode: ['avoid-all', 'css'],
      after: '.cover-page' // 表紙直後で必ず改ページ
    }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    // Header/Footer Loop (表紙以外)
    if (i > 1) {
      // --- Header Area (Top Margin: 25mm) ---
      // ライン: y=15mm (余白内)
      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(0.3);
      pdf.line(10, 15, pageWidth - 10, 15);

      // タイトル画像: y=10~14nm付近
      if (headerImgData) {
        const imgHeight = 4; // 4mm
        const imgWidth = imgHeight * headerAspectRatio;
        // Line(15)の少し上に配置 -> y=10あたり
        pdf.addImage(headerImgData, 'PNG', 10, 10, imgWidth, imgHeight);
      }

      // --- Footer Area (Bottom Margin: 15mm) ---
      pdf.setFontSize(9);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`${i - 1}`, pageWidth - 10, pageHeight - 10, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
