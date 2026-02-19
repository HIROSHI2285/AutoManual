import { ManualData } from '@/app/page';

/**
 * 紺色の円形ナンバリングSVG
 */
function createStepNumberSvg(number: number): string {
  const size = 32;
  const color = '#1e1b4b';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}" />
        <text x="50%" y="50%" dominant-baseline="central" alignment-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-weight="bold" font-size="16px">${number}</text>
    </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export function generateHTML(manual: ManualData, layout: 'single' | 'two-column' = 'single'): string {
  const isTwoCol = layout === 'two-column';
  const steps = manual.steps;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
        font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
        color: #000; line-height: 1.6; background: #fff;
        /* ユーザー指定: 800px固定・中央配置 (左寄り防止) */
        width: 800px; margin: 0 auto;
    }
    
    /* --- ヘッダー用テンプレート (画像スタンプ用) --- */
    /* 
       「紺色の帯」は廃止。
       ユーザー要望の「シンプルなラインとテキスト」をHTMLで表現し、
       これをキャプチャしてスタンプする (文字化け回避のため)。
    */
    #header-template {
        position: absolute; top: -9999px; left: 0;
        width: 800px;
        padding: 0 40px; /* 左右マージン */
        background: #fff;
    }
    .header-inner {
        border-bottom: 1px solid #1e1b4b; /* Navy Line */
        padding-bottom: 4px;
        display: flex; align-items: end;
        height: 40px; /* 高さ確保 */
    }
    .header-title-text {
        font-size: 14px; font-weight: bold; color: #1e1b4b; /* Navy Text */
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* --- スタイリッシュ表紙 (Wallpaperなし・紺ライン) --- */
    .cover-page {
        height: 1100px; display: flex; flex-direction: column;
        justify-content: center; padding: 0 80px; page-break-after: always;
        background: #fff; border-top: 20px solid #1e1b4b;
    }
    .cover-label { color: #1e1b4b; font-weight: bold; font-size: 14px; letter-spacing: 0.2em; margin-bottom: 24px; border-bottom: 2px solid #1e1b4b; display: inline-block; }
    .cover-title { font-size: 48px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-bottom: 40px; }
    .cover-overview { font-size: 16px; color: #475569; max-width: 550px; line-height: 1.8; white-space: pre-wrap; border-left: 4px solid #1e1b4b; padding-left: 24px; }

    /* --- 本文エリア --- */
    /* ヘッダー被り防止のため上部パディング確保 */
    .content-area { padding: 40px 0; }

    /* 2カラム時の左右高さを強制的に同期させる構造 */
    .step-row { 
        display: flex; gap: 30px; margin-bottom: 50px; 
        page-break-inside: avoid; break-inside: avoid;
    }
    .step-card { flex: 1; display: flex; flex-direction: column; }
    .step-card.empty { visibility: hidden; }

    .step-header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .num-icon { width: 32px; height: 32px; flex-shrink: 0; }
    .action-text { font-size: 18px; font-weight: 800; color: #1e1b4b; line-height: 1.4; padding-top: 2px; }

    .detail-text { 
        font-size: 14px; color: #000; margin-left: 44px; /* 32px + 12px */
        margin-bottom: 16px; white-space: pre-wrap; text-align: justify;
    }
    
    /* 画像ボックス：サイズと位置を固定 */
    .image-box { 
        margin-left: ${isTwoCol ? '0' : '44px'}; 
        background: #fcfcfc; border: 1px solid #f1f5f9;
        border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center;
        /* シングル380px, ダブル240px (ユーザー指定) */
        height: ${isTwoCol ? '240px' : '380px'}; 
        width: 100%;
    }

    img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .two-col-layout .detail-text { margin-left: 0; }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <!-- ヘッダーキャプチャ用 (Line Style) -->
  <div id="header-template">
    <div class="header-inner">
        <div class="header-title-text">${manual.title}</div>
    </div>
  </div>

  <div class="cover-page">
    <div class="cover-label">STANDARD OPERATING PROCEDURE</div>
    <h1 class="cover-title">${manual.title}</h1>
    <p class="cover-overview">${manual.overview}</p>
  </div>

  <div class="content-area">
    ${(() => {
      let html = '';
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
                        ${s1.screenshot ? `<div class="image-box"><img src="${s1.screenshot}" /></div>` : ''}
                    </div>
                    ${s2 ? `
                    <div class="step-card">
                        <div class="step-header">
                            <img src="${createStepNumberSvg(s2.stepNumber)}" class="num-icon" />
                            <div class="action-text">${s2.action}</div>
                        </div>
                        <div class="detail-text">${s2.detail}</div>
                        ${s2.screenshot ? `<div class="image-box"><img src="${s2.screenshot}" /></div>` : ''}
                    </div>` : '<div class="step-card empty"></div>'}
                </div>`;
        }
      } else {
        // Single Column: 1 row per step
        html += steps.map(s => `
            <div class="step-row">
                <div class="step-card">
                    <div class="step-header">
                        <img src="${createStepNumberSvg(s.stepNumber)}" class="num-icon" />
                        <div class="action-text">${s.action}</div>
                    </div>
                    <div class="detail-text">${s.detail}</div>
                    ${s.screenshot ? `<div class="image-box"><img src="${s.screenshot}" /></div>` : ''}
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

  // 1. ヘッダー画像をキャプチャ (Line Style)
  // ユーザー指定の「ライン＋テキスト」をHTMLで組み、画像として取得することで文字化けを回避する
  const headerEl = container.querySelector('#header-template') as HTMLElement;
  let headerImgData: string | null = null;
  let headerHeightRef = 0;

  if (headerEl) {
    try {
      headerEl.style.top = '0';
      const canvas = await html2canvas(headerEl, { scale: 2, backgroundColor: null });
      headerImgData = canvas.toDataURL('image/png');
      // 高さを計算 (幅800px基準)
      headerHeightRef = canvas.height / 2;
      headerEl.style.display = 'none';
    } catch (e) {
      console.error("Header capture failed", e);
    }
  }

  // 2. PDF生成
  const opt = {
    // 余白 [上, 右, 下, 左]
    margin: [50, 20, 20, 20],
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, width: 800 },
    jsPDF: { unit: 'px', format: [800, 1131], hotfixes: ['px_scaling'] },
    pagebreak: { mode: ['avoid-all', 'css'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // 3. 全ページスタンプ (Header Image + Footer Text)
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) {
      // --- ヘッダー (画像スタンプ) ---
      if (headerImgData) {
        // margin[0]=50px の内側に描画。30px程度のマージンをとって配置
        // 画像自体にpaddingが含まれているため、x=0で配置しても見た目は合うはずだが、
        // #header-template の幅が800px(pageWidth)なので、そのままフィットさせる
        pdf.addImage(headerImgData, 'PNG', 0, 20, 800, headerHeightRef);
      } else {
        // Fallback: Line only
        pdf.setDrawColor(30, 27, 75);
        pdf.setLineWidth(1);
        pdf.line(40, 35, pageWidth - 40, 35);
      }

      // --- ページ番号 ---
      pdf.setFontSize(9);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`${i - 1}`, pageWidth - 40, pageHeight - 30, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
