'use client';

import { useRef, useState, useEffect, DragEvent } from 'react';
import QRCode from 'qrcode';

interface VideoUploaderProps {
    onVideosSelect: (files: File[]) => void;
    videoFiles: File[];
    onRemoveVideo: (index: number) => void;
}

const ACCEPTED_VIDEO_TYPES = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/3gpp',
    'video/mpeg',
];

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const UploadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

export default function VideoUploader({
    onVideosSelect,
    videoFiles,
    onRemoveVideo,
}: VideoUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragActive, setIsDragActive] = useState(false);

    // QRコード関連
    const [qrModal, setQrModal] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [qrUploadUrl, setQrUploadUrl] = useState('');
    const [qrStatus, setQrStatus] = useState<'loading' | 'waiting' | 'uploading' | 'done' | 'error'>('loading');
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const sessionIdRef = useRef<string>('');

    const stopPolling = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const handleOpenQrModal = async () => {
        setQrModal(true);
        setQrStatus('loading');
        setQrDataUrl('');

        try {
            const res = await fetch('/api/mobile-session', { method: 'POST' });
            const { sessionId, localIp } = await res.json();
            sessionIdRef.current = sessionId;

            const port = window.location.port || '3000';
            const uploadUrl = `http://${localIp}:${port}/mobile-upload/${sessionId}`;
            setQrUploadUrl(uploadUrl);

            const dataUrl = await QRCode.toDataURL(uploadUrl, { width: 220, margin: 2 });
            setQrDataUrl(dataUrl);
            setQrStatus('waiting');

            // 2秒ごとにセッション状態をポーリング
            pollingRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/mobile-session/${sessionId}`);
                    const { status } = await statusRes.json();

                    if (status === 'uploading') {
                        setQrStatus('uploading');
                    } else if (status === 'complete') {
                        stopPolling();
                        setQrStatus('done');

                        // ファイルをBlobとして取得し File オブジェクトに変換
                        const fileRes = await fetch(`/api/mobile-session/${sessionId}/file`);
                        const blob = await fileRes.blob();
                        const contentDisposition = fileRes.headers.get('Content-Disposition') || '';
                        const match = contentDisposition.match(/filename="([^"]+)"/);
                        const fileName = match ? decodeURIComponent(match[1]) : 'mobile_video.mp4';
                        const file = new File([blob], fileName, { type: blob.type });

                        setTimeout(() => {
                            setQrModal(false);
                            onVideosSelect([file]);
                        }, 1200);
                    } else if (status === 'expired') {
                        stopPolling();
                        setQrStatus('error');
                    }
                } catch {
                    // ポーリングエラーは無視して続行
                }
            }, 2000);
        } catch {
            setQrStatus('error');
        }
    };

    const handleCloseQrModal = () => {
        stopPolling();
        setQrModal(false);
    };

    useEffect(() => {
        return () => stopPolling();
    }, []);

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        setIsDragActive(true);
    };

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            validateAndSelectFiles(files);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length > 0) {
            validateAndSelectFiles(files);
            // clear input to allow selecting the same file again if needed
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const validateAndSelectFiles = (files: File[]) => {
        const validFiles: File[] = [];

        for (const file of files) {
            if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
                // Skip invalid types silently or show one alert at the end?
                // For now, simple validation
                continue;
            }
            if (file.size > 500 * 1024 * 1024) {
                // Skip too large
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length !== files.length) {
            alert('一部のファイルは対応形式外ままたはサイズ超過(500MB)のため除外されました。');
        }

        if (validFiles.length > 0) {
            onVideosSelect(validFiles);
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            {/* Upload Zone */}
            <div
                className={`upload-zone mb-6 ${isDragActive ? 'upload-zone--active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={handleFileChange}
                    className="upload-zone__input"
                />
                <div className="upload-zone__icon">
                    <UploadIcon />
                </div>
                <p className="upload-zone__text">
                    動画を選択またはドロップ
                </p>
                <p className="upload-zone__hint text-xs text-slate-400 mt-2">
                    MP4, MOV, AVI, WebM, 3GPに対応。<br />
                    複数動画を統合して1つのマニュアルを作成できます。
                </p>
            </div>

            {/* スマホから送るボタン */}
            <div className="flex justify-center mb-6">
                <button
                    onClick={handleOpenQrModal}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-bold transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    スマホから送る
                </button>
            </div>

            {/* QRコードモーダル */}
            {qrModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleCloseQrModal}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs text-center" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-black text-slate-900 mb-1">スマホから動画を送る</h3>
                        <p className="text-xs text-slate-500 mb-4">同じWiFiに接続したスマホでQRコードをスキャン</p>

                        {qrStatus === 'loading' && (
                            <div className="flex items-center justify-center h-[220px]">
                                <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                            </div>
                        )}

                        {(qrStatus === 'waiting' || qrStatus === 'uploading') && qrDataUrl && (
                            <>
                                <img src={qrDataUrl} alt="QR Code" className="mx-auto rounded-lg" width={220} height={220} />
                                <div className="mt-3 flex items-center gap-2 justify-center">
                                    {qrStatus === 'uploading' ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                                            <span className="text-xs font-bold text-purple-600">アップロード中...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                                            <span className="text-xs text-slate-500">スマホからのアップロードを待機中</span>
                                        </>
                                    )}
                                </div>
                                <p className="mt-2 text-[10px] text-slate-400 break-all">{qrUploadUrl}</p>
                            </>
                        )}

                        {qrStatus === 'done' && (
                            <div className="flex flex-col items-center justify-center h-[220px] gap-3">
                                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                                    <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <p className="text-sm font-bold text-slate-800">受信完了！読み込み中...</p>
                            </div>
                        )}

                        {qrStatus === 'error' && (
                            <div className="flex flex-col items-center justify-center h-[220px] gap-3">
                                <p className="text-sm text-rose-600 font-bold">エラーが発生しました</p>
                                <button onClick={handleOpenQrModal} className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg">
                                    再試行
                                </button>
                            </div>
                        )}

                        <button onClick={handleCloseQrModal} className="mt-4 text-xs text-slate-400 hover:text-slate-600">
                            閉じる
                        </button>
                    </div>
                </div>
            )}

            {/* File List */}
            {videoFiles.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        アップロード済み動画 ({videoFiles.length})
                    </div>
                    <ul className="divide-y divide-slate-100">
                        {videoFiles.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-bold">
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                                        <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRemoveVideo(index)}
                                    className="ml-4 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                                    title="削除"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
