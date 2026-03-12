/**
 * OSで禁止されている文字をアンダースコアに置換する
 */
export const sanitizeFileName = (name: string): string => {
  return name.replace(/[\\/:*?"<>|]/g, '_');
};

/**
 * 画像を3:4の比率にセンタークロップしてリサイズする
 */
export const resizeImageTo34 = (dataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Canvas context not found');

      const originalWidth = img.width;
      const originalHeight = img.height;
      
      // ターゲットのアスペクト比 (3:4 = 0.75)
      const targetRatio = 3 / 4;
      
      let sourceW, sourceH, sourceX, sourceY;

      // 元の画像がターゲットより横長か縦長かでクロップ領域を決定
      if (originalWidth / originalHeight > targetRatio) {
        // 元が横長すぎる場合：高さを基準に幅をカット
        sourceH = originalHeight;
        sourceW = originalHeight * targetRatio;
        sourceX = (originalWidth - sourceW) / 2;
        sourceY = 0;
      } else {
        // 元が縦長すぎる場合：幅を基準に高さをカット
        sourceW = originalWidth;
        sourceH = originalWidth / targetRatio;
        sourceX = 0;
        sourceY = (originalHeight - sourceH) / 2;
      }

      // 出力サイズの設定（例：高さ1200px基準）
      canvas.width = 900;
      canvas.height = 1200;

      ctx.drawImage(
        img,
        sourceX, sourceY, sourceW, sourceH, // 元画像の切り抜き範囲
        0, 0, canvas.width, canvas.height   // キャンバスへの描画サイズ
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    if (dataUrl.startsWith('blob:')) {
      // Create a new blob URL to avoid CORS issues if necessary, but usually local blobs are fine.
      img.src = dataUrl;
    } else {
      img.crossOrigin = 'anonymous'; // Added crossOrigin for safety if external URLs are used
      img.src = dataUrl;
    }
  });
};
