import { ManualData } from '@/app/page';

/**
 * 紺色の円形ナンバリングSVG
 * ブラウザごとのレンダリング差異を吸収する絶対中央配置
 */
function createStepNumberSvg(number: number): string {
    const size = 32;
    const color = '#1e1b4b'; // 深みのある紺色

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
            font-family="'Helvetica Neue', Arial, sans-serif" 
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
        color: #000000; 
        line-height: 1.5;
        background: #fff;
    }
    
    /* --- プロフェッショナルな表紙デザイン --- */
    .cover-page {
        height: 1100px; /* A4比率に合わせた高さ */
        display: flex;
        flex-direction: column;
        padding: 100px 80px;
        page-break-after: always;
        border-top: 16px solid #1e1b4b; /* 上部の重厚な紺ライン */
    }
    .cover-header {
        font-size: 14px;
        font-weight: bold;
        color: #1e1b4b;
        letter-spacing: 0.1em;
        margin-bottom: 120px;
    }
    .cover-main {
        flex-grow: 1;
    }
    .cover-label {
        display: inline-block;
        background: #f1f5f9;
        color: #475569;
        padding: 4px 12px;
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 24px;
        border-radius: 2px;
    }
    .cover-title {
        font-size: 40px;
        font-weight: 800;
        color: #0f172a;
        line-height: 1.2;
        margin-bottom: 40px;
    }
    .cover-overview {
        font-size: 15px;
        color: #334155;
        max-width: 520px;
        line-height: 1.8;
        white-space: pre-wrap;
    }
    .cover-footer {
        border-top: 1px solid #e2e8f0;
        padding-top: 30px;
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        color: #64748b;
    }

    /* --- 本文コンテンツ --- */
    .content-area {
        padding: 60px 50px;
    }
    .doc-header {
        border-bottom: 2px solid #1e1b4b;
        margin-bottom: 40px;
        padding-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
    }
    .doc-header-title {
        font-size: 18px;
        font-weight: bold;
        color: #1e1b4b;
    }

    /* ステップレイアウト */
    .steps-container {
        display: grid;
        grid-template-columns: ${isTwoCol ? '1fr 1fr' : '1fr'};
        column-gap: 40px;
        row-gap: 50px;
    }

    /* 分断を徹底的に防ぐステップカード */
    .step-card { 
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        display: block;
        width: 100%;
    }

    .step-row {
        display: flex;
        gap: 14px;
        align-items: flex-start;
    }

    .num-icon {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
    }

    .step-body {
        flex: 1;
    }

    .action-text { 
        font-size: 16px; 
        font-weight: 800; 
        color: #1e1b4b;
        margin-bottom: 8px;
        line-height: 1.4;
    }

    .detail-text { 
        font-size: 13px; 
        color: #000000; 
        margin-bottom: 16px;
        white-space: pre-wrap;
        text-align: justify;
    }
    
    /* 画像コンテナの改善 */
    .img-frame { 
        background: #fcfcfc;
        border: 1px solid #f1f5f9;
        border-radius: 4px;
        padding: 6px;
        overflow: hidden;
        page-break-inside: avoid;
    }

    /* シングルカラム（1列）：見やすさ重視のサイズ抑制 */
    .single-layout .img-frame {
        max-width: 60%; /* 横幅を60%に制限 */
        margin-top: 8px;
    }
    .single-layout .img-frame img {
        max-height: 250px; /* 高さを大幅に抑制 */
    }

    /* 2カラム（2列）：左右の高さとラインを完璧に揃える */
    .two-col-layout .img-frame { 
        height: 180px; /* 高さを固定 */
        display: flex;
        align-items: center;
        justify-content: center;
    }

    img { 
        max-width: 100%; 
        object-fit: contain; 
        display: block;
    }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <div class="cover-page">
    <div class="cover-header">AutoManual System Document</div>
    <div class="cover-main">
        <span class="cover-label">OPERATION MANUAL</span>
        <h1 class="cover-title">${manual.title}</h1>
        <p class="cover-overview">${manual.overview}</p>
    </div>
    <div class="cover-footer">
        <span>&copy; 2026 AutoManual Professional Edition</span>
        <span>Date: 2026-02-19</span>
    </div>
  </div>

  <div class="content-area">
    <div class="doc-header">
        <div class="doc-header-title">${manual.title}</div>
    </div>
    
    <div class="steps-container">
      ${manual.steps.map(step => `
        <div class="step-card">
          <div class="step-row">
            <img src="${createStepNumberSvg(step.stepNumber)}" class="num-icon" />
            <div class="step-body">
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
        pagebreak: { mode: ['avoid-all', 'css'] } // ステップ単位での分断を防止
    };

    const worker = html2pdf().from(container).set(opt).toPdf();
    const pdf = await worker.get('pdf');

    const totalPages = pdf.internal.getNumberOfPages();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        // フッター右下にシンプルなページ番号
        pdf.text(`${i}`, pageWidth - 40, pageHeight - 30, { align: 'right' });
    }

    await worker.save();
    document.body.removeChild(container);
}
