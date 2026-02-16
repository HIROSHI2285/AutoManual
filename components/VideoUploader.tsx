'use client';

import { useRef, useState, DragEvent } from 'react';

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
