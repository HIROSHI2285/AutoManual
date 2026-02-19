import { ManualData } from '@/app/page';

/**
 * 紺色の円形ナンバリングSVG（中心ズレを徹底排除）
 */
function createStepNumberSvg(number: number): string {
    const size = 32;
    const color = '#1e1b4b';

    // SVG内のテキスト配置を微調整
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}" />
        <text x="50%" y="54%" dominant-baseline="central" alignment-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="16px">${number}</text>
    </svg>`;
    // y="54%" で垂直方向の視覚的中心を調整

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
        color: #000000; line-height: 1.5; background: #fff;
    }
    
    /* --- クールな表紙デザイン (Wallpaper無し・紺ラインVer) --- */
    .cover-page {
        height: 1120px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0 80px;
        page-break-after: always;
        background: #fff;
        border-top: 15px solid #1e1b4b; /* 上部の重厚な紺ライン */
    }
    .cover-label {
        color: #1e1b4b;
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 0.3em;
        margin-bottom: 20px;
        text-transform: uppercase;
        border-bottom: 2px solid #1e1b4b;
        display: inline-block;
        width: fit-content;
    }
    .cover-title {
        font-size: 44px;
        font-weight: 800;
        color: #0f172a;
        line-height: 1.2;
        margin-bottom: 40px;
    }
    .cover-overview {
        font-size: 16px;
        color: #334155;
        max-width: 550px;
        line-height: 1.8;
        white-space: pre-wrap;
        border-left: 4px solid #1e1b4b;
        padding-left: 24px;
    }

    /* --- 本文エリア --- */
    .content-area { padding: 60px 50px; }
    .doc-header {
        border-bottom: 2px solid #1e1b4b;
        margin-bottom: 40px;
        padding-bottom: 12px;
    }
    .doc-title { font-size: 18px; font-weight: bold; color: #1e1b4b; }

    /* Gridによる強固なレイアウト */
    .steps-container {
        display: grid;
        grid-template-columns: ${isTwoCol ? '1fr 1fr' : '1fr'};
        column-gap: 40px;
        row-gap: 50px;
        width: 100%;
    }

    /* 改ページで絶対に切れないようにする設定 */
    .step-card { 
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        display: block;
        width: 100%;
    }

    .step-row { display: flex; gap: 14px; align-items: flex-start; }
    .num-icon { width: 32px; height: 32px; flex-shrink: 0; }
    .step-body { flex: 1; }

    .action-text { 
        font-size: 17px; font-weight: 800; color: #1e1b4b;
        margin-bottom: 8px; line-height: 1.4;
    }

    .detail-text { 
        font-size: 14px; color: #000000; 
        margin-bottom: 16px; white-space: pre-wrap;
        text-align: justify;
    }
    
    .img-frame { 
        background: #fcfcfc; border: 1px solid #f1f5f9;
        border-radius: 6px; padding: 8px; overflow: hidden;
        page-break-inside: avoid;
    }

    /* シングルカラム画像サイズ制限 */
    .single-layout .img-frame {
        max-width: 60%;
        margin-top: 10px;
    }
    .single-layout .img-frame img { max-height: 250px; }

    /* 2カラム画像高さ揃え */
    .two-col-layout .img-frame { 
        height: 180px; 
        display: flex; align-items: center; justify-content: center;
    }

    img { max-width: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <div class="cover-page">
    <div class="cover-label">Operational Standard</div>
    <h1 class="cover-title">${manual.title}</h1>
    <p class="cover-overview">${manual.overview}</p>
  </div>

  <div class="content-area">
    <div class="doc-header">
        <div class="doc-title">${manual.title}</div>
    </div>
    
    <div class="steps-container">
      ${manual.steps.map(step => `
        <div class="step-card">
          <div class="step-row">
            <img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" />
            <div class="step-content">
                <div class="action-text">${step.action}</div>
                <div class="detail-text">${step.detail}</div>
                ${step.screenshot ? `
                <div class="img-frame">
                    <img src="${step.screenshot}" />
                </div>` : ''}
            </div>
          </div>
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

    // ページ番号：表紙を飛ばし、2枚目から「1」と振る
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
