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

  // 2カラム時のレイアウト崩れを防ぐため、ステップを「行 (Row)」単位でグループ化
  const stepsHtml = [];
  for (let i = 0; i < manual.steps.length; i += (isTwoCol ? 2 : 1)) {
    const step1 = manual.steps[i];
    const step2 = isTwoCol ? manual.steps[i + 1] : null;

    stepsHtml.push(`
            <div class="step-row">
                <div class="step-card">
                    <div class="step-header">
                        <img src="${createStepNumberSvg(step1.stepNumber)}" class="num-icon" />
                        <div class="action-text">${step1.action}</div>
                    </div>
                    <div class="detail-text">${step1.detail}</div>
                    ${step1.screenshot ? `<div class="image-frame"><img src="${step1.screenshot}" /></div>` : ''}
                </div>
                ${isTwoCol ? (step2 ? `
                <div class="step-card">
                    <div class="step-header">
                        <img src="${createStepNumberSvg(step2.stepNumber)}" class="num-icon" />
                        <div class="action-text">${step2.action}</div>
                    </div>
                    <div class="detail-text">${step2.detail}</div>
                    ${step2.screenshot ? `<div class="image-frame"><img src="${step2.screenshot}" /></div>` : ''}
                </div>` : '<div class="step-card empty"></div>') : ''}
            </div>
        `);
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
        color: #000; line-height: 1.6; background: #fff;
        /* PDFキャンバス幅と完全に一致させ、左寄りを防ぐ */
        width: 900px;
        margin: 0 auto;
    }
    
    /* --- ヘッダー用テンプレート (スタンプ用画像ソース) --- */
    /* ユーザー要望の「紺色全幅背景 + 白文字」を作成 */
    #header-template {
        position: absolute; top: -9999px; left: 0; 
        width: 900px; height: 50px;
        background: #1e1b4b; /* Navy Background */
        display: flex; align-items: center;
        padding: 0 60px;
    }
    .header-title {
        font-size: 16px; font-weight: bold; color: #ffffff; /* White Text */
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* --- 表紙 --- */
    .cover-page {
        height: 1272px; /* PDF高さに合わせる */
        display: flex; flex-direction: column;
        justify-content: center; padding: 0 100px; page-break-after: always;
        background: #fff;
        border-top: 20px solid #1e1b4b; /* アクセント */
    }
    .cover-label { 
        color: #1e1b4b; font-weight: bold; font-size: 14px; letter-spacing: 0.3em; 
        margin-bottom: 24px; border-bottom: 3px solid #1e1b4b; display: inline-block; width: fit-content; 
    }
    .cover-title { font-size: 48px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-bottom: 40px; }
    .cover-overview { 
        font-size: 16px; color: #334155; max-width: 600px; line-height: 1.8; 
        white-space: pre-wrap; border-left: 4px solid #1e1b4b; padding-left: 24px; 
    }

    /* --- 本文エリア --- */
    /* 
       ヘッダー(50px) + 安全余白(30px) = 80px のpadding-topを確保
       これによりヘッダーとコンテンツの被りを物理排除
       width: 100% (900px)
    */
    .content-area { 
        padding: 80px 60px 40px;
        width: 100%;
    }

    /* 行 (Row) レイアウト */
    .step-row { 
        display: flex; gap: 40px; margin-bottom: 50px; 
        page-break-inside: avoid; break-inside: avoid;
        width: 100%;
    }

    /* カード */
    .step-card { 
        flex: 1; display: flex; flex-direction: column; 
        page-break-inside: avoid; 
    }
    .step-card.empty { visibility: hidden; }

    /* ヘッダー */
    .step-header { 
        display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px; 
    }
    .num-icon { width: 32px; height: 32px; flex-shrink: 0; }
    .action-text { 
        font-size: 18px; font-weight: 800; color: #1e1b4b; 
        line-height: 1.4; padding-top: 2px; 
    }

    /* インデント固定 (32px + 14px = 46px) */
    .detail-text { 
        font-size: 14px; color: #000; 
        margin-left: 46px; margin-bottom: 20px; 
        white-space: pre-wrap; text-align: justify;
    }
    
    /* 画像フレーム: 横伸び絶対防止 */
    .image-frame { 
        margin-left: ${isTwoCol ? '0' : '46px'}; 
        background: #fcfcfc; border: 1px solid #f1f5f9;
        border-radius: 8px; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        height: ${isTwoCol ? '240px' : '380px'}; 
    }

    .image-frame img { 
        width: auto; height: auto;
        max-width: 100%; max-height: 100%;
        object-fit: contain; 
        display: block;
    }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <!-- ヘッダーキャプチャ用 (Navy Block + White Text) -->
  <div id="header-template">
    <div class="header-title">${manual.title}</div>
  </div>

  <div class="cover-page">
    <div class="cover-label">OPERATION MANUAL</div>
    <h1 class="cover-title">${manual.title}</h1>
    <p class="cover-overview">${manual.overview}</p>
  </div>

  <div class="content-area">
    ${stepsHtml.join('')}
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

  // 1. ヘッダー画像をキャプチャ (Navy Block)
  const headerEl = container.querySelector('#header-template') as HTMLElement;
  let headerImgData: string | null = null;

  // ヘッダーサイズ定数 (PDFキャンバス座標系)
  const PDF_HEADER_HEIGHT = 50;

  if (headerEl) {
    try {
      headerEl.style.top = '0'; // 一時表示
      // html2canvasでキャプチャ
      const canvas = await html2canvas(headerEl, {
        scale: 2,
        backgroundColor: '#1e1b4b', // 背景色を確実に
        width: 900 // 幅固定
      });
      headerImgData = canvas.toDataURL('image/png');
      headerEl.style.display = 'none';
    } catch (e) {
      console.error("Header capture failed", e);
    }
  }

  // 2. PDF生成設定
  // margin: 0 (フルブリード)
  // width: 900 (左寄り防止)
  const opt = {
    margin: [0, 0, 0, 0],
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      width: 900, // html2canvas幅固定
      windowWidth: 900
    },
    jsPDF: { unit: 'px', format: [900, 1272], hotfixes: ['px_scaling'] },
    pagebreak: { mode: ['avoid-all', 'css'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // 3. 全ページスタンプ処理
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) { // 表紙以外
      // --- ヘッダー画像のスタンプ (Mojibake Free) ---
      if (headerImgData) {
        // (0, 0) から 全幅(pageWidth) x 高さ(50) で描画
        pdf.addImage(headerImgData, 'PNG', 0, 0, pageWidth, PDF_HEADER_HEIGHT);
      } else {
        // 画像生成失敗時のフォールバック (矩形のみ)
        pdf.setFillColor(30, 27, 75);
        pdf.rect(0, 0, pageWidth, PDF_HEADER_HEIGHT, 'F');
      }

      // --- ページ番号 (White text on Navy or Grey on White? Design choice) ---
      // ユーザーのデザインではフッター番号は通常の場所にある
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      pdf.text(`${i - 1}`, pageWidth - 60, pageHeight - 30, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
