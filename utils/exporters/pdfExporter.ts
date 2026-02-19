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
    
    /* --- 表紙 (シンプルデザイン) --- */
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

    /* --- 本文エリア --- */
    /* 上部パディングは PDFのマージン設定(opt.margin) に任せるため、ここは最小限に */
    .content-area { padding: 20px 50px 0; }

    /* 
       コンテナレイアウト: Grid (2カラムの整列を保証)
       Flexだと高さ不揃いで段がずれるため、Gridに戻す
    */
    .steps-container {
        display: grid;
        grid-template-columns: ${isTwoCol ? '1fr 1fr' : '1fr'};
        column-gap: 30px; 
        row-gap: 40px; /* 行間を適切に */
        width: 100%;
    }

    /* ステップカード (分断絶対禁止) */
    .step-card { 
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        position: relative;
        display: block;
        width: 100%;
        /* Gridアイテム内でのスタイル */
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
        
        /* 
           高さ固定: これがないと2カラム時にレイアウトが崩壊する、かつ巨大画像を防ぐための命綱 
           シングル 380px / 2カラム 240px
        */
        height: ${isTwoCol ? '240px' : '380px'}; 
    }

    /* 画像スタイル: アスペクト比絶対死守 */
    .image-frame img { 
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain; /* 枠内に収める */
        display: block;
    }

    /* 2カラム時の微調整: インデント維持 */
    .two-col-layout .detail-text, .two-col-layout .image-frame { margin-left: 44px; }
  </style>
</head>
<body class="${isTwoCol ? 'two-col-layout' : 'single-layout'}">
  <div class="cover-page">
    <div class="cover-body">
        <div class="cover-label">OPERATION MANUAL</div>
        <h1 class="cover-title">${manual.title}</h1>
        <p class="cover-overview">${manual.overview}</p>
    </div>
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
  // opt.margin を設定することで、全ページの上下左右に物理的な余白を確保する。
  // [Top, Right, Bottom, Left] -> Top: 60px (ヘッダー用), Bottom: 30px (フッター用)
  const opt = {
    margin: [60, 0, 30, 0],
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
    },
    jsPDF: { unit: 'px', format: [900, 1272], hotfixes: ['px_scaling'] },
    // css: page-break-inside: avoid を有効にする
    pagebreak: { mode: ['avoid-all', 'css'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // ヘッダー・フッター描画ループ
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) { // 表紙(1)以外
      const marginX = 40;
      const headerY = 35; // margin-top: 60px の内側、上寄り

      // ヘッダーライン (全幅)
      pdf.setDrawColor(30, 27, 75); // Navy
      pdf.setLineWidth(1.5);
      // 左端(marginX)から右端(pageWidth - marginX)まで
      pdf.line(marginX, headerY + 8, pageWidth - marginX, headerY + 8);

      // タイトル描画 (左寄せ)
      // 日本語文字化けリスクがあるが、現状のアーキテクチャではCanvas直接描画しか
      // 「全ページヘッダー」を確実に行う方法がない。（HTMLコピー方式はPDF容量増大・レイアウト崩れリスクあり）
      // ユーザー要望の画像イメージに近づけるため敢えて描画する。
      try {
        pdf.setFontSize(14);
        pdf.setTextColor(30, 27, 75);
        pdf.setFont("helvetica", "bold");
        // 英数字のみのタイトルならこれでOK。日本語の場合は化ける可能性が高いが、
        // マニュアルタイトルが英数字（"Offline Startup Manual"等）であれば綺麗に出る。
        // どうしても日本語を出したい場合は html2pdf のヘッダー機能(有料版や複雑なハック)が必要になるが、
        // ここではベストエフォートで実装する。
        pdf.text(manual.title, marginX, headerY);
      } catch (e) {
        // Ignore font errors
      }

      // ページ番号 (右下)
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${i - 1}`, pageWidth - 40, pageHeight - 15, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
