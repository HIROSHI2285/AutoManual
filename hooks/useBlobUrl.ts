'use client';

import { useState, useEffect } from 'react';

/**
 * Base64 データURL / 通常URL を受け取り、表示用の Blob URL を返すフック。
 *
 * - Base64 文字列の場合: URL.createObjectURL() で Blob URL に変換し、
 *   コンポーネントのアンマウント時に URL.revokeObjectURL() でメモリを解放する。
 * - 既に blob: / https: / http: などで始まる URL の場合: そのまま返す。
 * - 空文字や undefined の場合: undefined を返す。
 */
export function useBlobUrl(source: string | undefined): string | undefined {
    const [blobUrl, setBlobUrl] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!source) {
            setBlobUrl(undefined);
            return;
        }

        // blob: / http: / https: はそのまま使用
        if (!source.startsWith('data:')) {
            setBlobUrl(source);
            return;
        }

        // Base64 data URL → Blob URL に変換
        let objectUrl: string | undefined;
        try {
            const [header, base64Data] = source.split(',');
            const mimeMatch = header.match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

            const byteString = atob(base64Data);
            const byteArray = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) {
                byteArray[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([byteArray], { type: mimeType });
            objectUrl = URL.createObjectURL(blob);
            setBlobUrl(objectUrl);
        } catch (e) {
            console.error('[useBlobUrl] Failed to convert base64 to Blob URL:', e);
            // フォールバック: base64 のままで表示
            setBlobUrl(source);
        }

        return () => {
            // クリーンアップ: Blob URL をメモリから解放
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [source]);

    return blobUrl;
}
