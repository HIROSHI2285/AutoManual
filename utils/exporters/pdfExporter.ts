import { ManualData } from '@/app/page';

// 紺色の円形ナンバリング（中心のズレを完璧に抑えたSVG）
function createStepNumberSvg(number: number): string {
    const size = 32;
    const color = '#1e1b4b'; // 信頼の紺色

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}" />
        <text 
            x="50%" 
            y="50%" 
            dominant-baseline="central" 
            alignment-baseline="middle" 
            text-anchor="middle" 
            fill="white" 
            font-family="sans-serif" 
            font-weight="bold" 
            font-size="16px"
        >${number}</text>
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
        color: #000000; /* テキスト色は黒 */
        line-height: 1.6;
        background: #fff;
    }
    
    /* --- 表紙デザイン --- */
    .cover-page {
        height: 1050px; /* A4比率 */
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 100px 80px;
        page-break-after: always;
        border-top: 15px solid #1e1b4b; /* 上部の紺ライン */
    }
    .cover-label {
        color: #1e1b4b;
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 0.1em;
        margin-bottom: 20px;
    }
    .cover-title {
        font-size: 40px;
        font-weight: 800;
        margin-bottom: 30px;
        line-height: 1.3;
    }
    .cover-overview {
        font-size: 16px;
        color: #333;
        white-space: pre-wrap;
        max-width: 600px;
        border-left: 2px solid #e2e8f0;
        padding-left: 20px;
    }

    /* --- 本文デザイン --- */
    .content-area {
        padding: 60px 50px;
    }
    .doc-title {
        font-size: 22px;
        font-weight: 800;
        color: #1e1b4b;
        border-bottom: 2px solid #1e1b4b;
        padding-bottom: 10px;
        margin-bottom: 40px;
    }

    .steps-container {
        display: grid;
        grid-template-columns: ${isTwoCol ? '1fr 1fr' : '1fr'};
        column-gap: 30px;
        row-gap: 40px;
    }

    .step-card { 
        page-break-inside: avoid;
        break-inside: avoid;
    }

    .step-layout {
        display: flex;
        gap: 12px; /* ナンバリングとタイトルの距離を詰めました */
        align-items: flex-start;
    }

    .num-icon { width: 32px; height: 32px; flex-shrink: 0; }
    .step-content { flex: 1; }

    .action-text { 
        font-size: 17px; 
        font-weight: 800; 
        color: #1e1b4b;
        margin-bottom: 8px;
    }

    .detail-text { 
        font-size: 13.5px; 
        color: #000000; /* 黒 */
        margin-bottom: 15px;
        white-space: pre-wrap;
    }
    
    .img-frame { 
        background: #fcfcfc;
        border: 1px solid #f1f5f9;
        border-radius: 4px;
        padding: 5px;
        page-break-inside: avoid;
    }

    /* シングルカラム画像サイズ制限 */
    .single-layout .img-frame {
        max-width: 70%;
        margin-top: 5px;
    }
    .single-layout img { max-height: 280px; width: auto; }

    /* 2カラム画像高さ揃え */
    .two-col-layout .img-frame { 
        height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    img { max-width: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <div class="cover-page">
    <div class="cover-label">SYSTEM OPERATION MANUAL</div>
    <h1 class="cover-title">${manual.title}</h1>
    <p class="cover-overview">${manual.overview}</p>
  </div>

  <div class="content-area">
    <h2 class="doc-title">${manual.title}</h2>
    <div class="steps-container">
      ${manual.steps.map(step => `
        <div class="step-card">
          <div class="step-layout">
            <img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" />
            <div class="step-content">
                <div class="action-text">${step.action}</div>
                <div class="detail-text">${step.detail}</div>
                ${step.screenshot ? `<div class="img-frame"><img src="${step.screenshot}" /></div>` : ''}
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

    // ページ番号ロジック：表紙(1枚目)を飛ばし、2枚目から1番を振る
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1) continue; // 表紙は表示しない
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        pdf.text(`${i - 1}`, pageWidth - 40, pageHeight - 30, { align: 'right' });
    }

    await worker.save();
    document.body.removeChild(container);
}
