'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function MobileUploadPage() {
    const params = useParams();
    const sessionId = params.sessionId as string;

    const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setSelectedFile(file);
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setStatus('uploading');
        setProgress(0);

        const formData = new FormData();
        formData.append('video', selectedFile);

        try {
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `/api/mobile-session/${sessionId}`);

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        setProgress(Math.round((e.loaded / e.total) * 100));
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error('アップロードに失敗しました。'));
                    }
                };

                xhr.onerror = () => reject(new Error('通信エラーが発生しました。'));
                xhr.send(formData);
            });

            setProgress(100);
            setStatus('done');
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'エラーが発生しました。');
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            {/* Header */}
            <div className="mb-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-600 mb-3">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                    </svg>
                </div>
                <h1 className="text-xl font-black text-slate-900">AutoManual</h1>
                <p className="text-sm text-slate-500 mt-1">スマホから動画を送る</p>
            </div>

            <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                {status === 'idle' && (
                    <>
                        {!selectedFile ? (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-5 border-2 border-dashed border-purple-300 rounded-xl text-center bg-purple-50 active:bg-purple-100 transition-colors"
                            >
                                <svg className="w-10 h-10 text-purple-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                                </svg>
                                <p className="text-sm font-bold text-purple-700">動画を選択</p>
                                <p className="text-xs text-purple-400 mt-1">MP4, MOV, WebM など</p>
                            </button>
                        ) : (
                            <div className="mb-4">
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.069A1 1 0 0121 8.87V15.13a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                                        </svg>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-700 truncate">{selectedFile.name}</p>
                                        <p className="text-xs text-slate-400">{formatFileSize(selectedFile.size)}</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedFile(null)}
                                        className="text-slate-400 active:text-rose-500 p-1"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <button
                                    onClick={handleUpload}
                                    className="w-full mt-4 py-3 bg-purple-600 active:bg-purple-700 text-white font-bold rounded-xl transition-colors"
                                >
                                    PCに送る
                                </button>
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </>
                )}

                {status === 'uploading' && (
                    <div className="text-center py-4">
                        <p className="text-sm font-bold text-slate-700 mb-4">アップロード中...</p>
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-2">
                            <div
                                className="bg-gradient-to-r from-purple-600 to-violet-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-sm font-black text-purple-600 tabular-nums">{progress}%</p>
                    </div>
                )}

                {status === 'done' && (
                    <div className="text-center py-4">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-3">
                            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-base font-bold text-slate-900">送信完了！</p>
                        <p className="text-sm text-slate-500 mt-1">PCで自動的に読み込まれます</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="text-center py-4">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-rose-100 mb-3">
                            <svg className="w-7 h-7 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-base font-bold text-slate-900">エラーが発生しました</p>
                        <p className="text-sm text-slate-500 mt-1">{errorMessage}</p>
                        <button
                            onClick={() => { setStatus('idle'); setSelectedFile(null); }}
                            className="mt-4 px-6 py-2 bg-slate-100 active:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm"
                        >
                            やり直す
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
