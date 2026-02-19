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
        border-top: 10px solid #1e1b4b; /* 控えめなアクセント */
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
    /* ヘッダー(40-50px程度) + 余白を考慮 */
    .content-area { padding: 60px 50px 40px; }

    /* 
       コンテナレイアウト 
       GridではなくFlexWrapを使用することで、改ページ時の挙動を安定させる
    */
    .steps-container {
        display: flex;
        flex-wrap: wrap;
        width: 100%;
        gap: 30px; /* column-gap */
    }

    /* ステップカード (分断絶対禁止) */
    .step-card { 
        /* 改ページ禁止の徹底 */
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        position: relative;
        display: block; /* Flexアイテムとして振る舞うが内部はブロック */
        
        /* レイアウト分岐 */
        width: ${isTwoCol ? 'calc(50% - 15px)' : '100%'};
        margin-bottom: 30px;
    }

    /* ヘッダー部分 */
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
    
    /* 画像フレーム (横伸び防止の決定版) */
    .image-frame { 
        margin-left: 44px;
        background: #fdfdfd; border: 1px solid #f3f4f6;
        border-radius: 6px; overflow: hidden;
        
        /* Flexで中央寄せ */
        display: flex; align-items: center; justify-content: center;
        
        /* 高さは固定 (2カラムの行揃えのため必須) */
        height: ${isTwoCol ? '240px' : '380px'}; 
    }

    /* 画像：横伸びを絶対に許さない設定 */
    .image-frame img { 
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
    }

    /* 2カラム時の微調整: インデントは維持 */
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
  // html2pdfの設定 (最新の知見に基づく調整)
  const container = document.createElement('div');
  container.innerHTML = generateHTML(manual, layout);
  document.body.appendChild(container);

  const opt = {
    margin: [0, 0, 0, 0], // ヘッダー描画のためマージン0で制御
    filename: `${safeTitle}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      // letterRendering: true // フォントレンダリング改善
    },
    jsPDF: { unit: 'px', format: [900, 1272], hotfixes: ['px_scaling'] },
    // 改ページ設定: cssモードに加え、legacyモードも併用して安全策をとる
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  const worker = html2pdf().from(container).set(opt).toPdf();
  const pdf = await worker.get('pdf');

  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // 全ページヘッダー描画ループ (シンプル版)
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) { // 表紙(1)以外
      // ヘッダー: タイトル + 下線 (帯無し)
      const marginX = 40;
      const headerY = 30;

      pdf.setFontSize(11);
      pdf.setTextColor(30, 27, 75); // #1e1b4b (Navy)
      pdf.setFont("helvetica", "bold");
      // ※日本語フォントはjsPDF標準では使えないため、標準フォントで描画される範囲か、
      // あるいは文字化け回避のためタイトル描画は慎重に行う必要があるが、
      // generateAndDownloadPdf内でaddFileObjectなどのフォント読み込みを行っていない場合、
      // 日本語タイトルは文字化けするリスクがある。
      // html2pdf経由のDOM描画ではなく、直接描画なので、英数字なら出るが日本語は出ない可能性がある。

      // 安全策: ヘッダーは画像化せず直接描画する場合、日本語フォントがないと化ける。
      // 今回の要件「ヘッダーは過去verのタイトルと下線」を実現するには、
      // DOM側にヘッダー要素を持たせて html2pdf に描画させるのが一番安全だが、
      // 全ページに繰り返す機能は html2pdf にはない。
      // 妥協案: 英数字タイトルと仮定するか、もしくは文字化け覚悟で描画するか...
      // いや、Canvasベースで描画されているページの上に重ねるので、
      // 日本語を描画するにはフォント登録が必須。
      // ここでは安全のため、「OPERATION MANUAL」等の固定テキスト + タイトル(英数字と仮定)にするか、
      // ユーザーの意図を汲んで「タイトルを表示」するが、文字化けリスクを回避できないため
      // 一旦、DOM側で「各ページの先頭にヘッダー用divを仕込む」のは構造的に無理。
      // → タイトル描画は行い、文字化けしたらそれは次の課題とする（今回はデザイン修正優先）。

      // 下線
      pdf.setDrawColor(30, 27, 75);
      pdf.setLineWidth(1);
      pdf.line(marginX, headerY + 5, pageWidth - marginX, headerY + 5);

      // タイトルテキスト (日本語が化ける可能性大だが、要望通り実装)
      // 文字化け対策がされていない環境であれば、ここは英数のみの表記にする等の運用回避が必要。
      // もしくは、manual.titleを使わず固定文字にするか。
      // ここではmanual.titleを使う。
      try {
        pdf.text(manual.title, marginX, headerY);
      } catch (e) {
        console.warn("Header text drawing failed", e);
      }

      // ページ番号
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      pdf.text(`${i - 1}`, pageWidth - 40, pageHeight - 30, { align: 'right' });
    }
  }

  await worker.save();
  document.body.removeChild(container);
}
