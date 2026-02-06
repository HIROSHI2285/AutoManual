'use client';

import { useRef, useState, DragEvent } from 'react';

interface VideoUploaderProps {
    onVideoSelect: (file: File) => void;
    videoFile: File | null;
    videoPreviewUrl: string | null;
    onRemoveVideo: () => void;
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
    onVideoSelect,
    videoFile,
    videoPreviewUrl,
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

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            validateAndSelectFile(files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            validateAndSelectFile(files[0]);
        }
    };

    const validateAndSelectFile = (file: File) => {
        if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
            alert('対応していない動画形式です。MP4, MOV, AVI, WebM, 3GP形式の動画をアップロードしてください。');
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            const proceed = confirm(
                `ファイルサイズが${formatFileSize(file.size)}です。20MB以上のファイルは処理に時間がかかる場合があります。続行しますか？`
            );
            if (!proceed) return;
        }

        onVideoSelect(file);
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    if (videoFile && videoPreviewUrl) {
        return (
            <div className="video-preview">
                <video
                    className="video-preview__player"
                    src={videoPreviewUrl}
                    controls
                />
                <div className="video-preview__info">
                    <div>
                        <span className="video-preview__name">{videoFile.name}</span>
                        <span className="video-preview__size"> ({formatFileSize(videoFile.size)})</span>
                    </div>
                    <button
                        className="btn btn--secondary btn--small"
                        onClick={onRemoveVideo}
                    >
                        削除
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div
                className={`upload-zone ${isDragActive ? 'upload-zone--active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="upload-zone__input"
                />
                <div className="upload-zone__icon">
                    <UploadIcon />
                </div>
                <p className="upload-zone__text">
                    動画を選択またはドロップ
                </p>
                <p className="upload-zone__hint">
                    MP4, MOV, AVI, WebM, 3GPに対応しています。<br />
                    ※動画データはサーバーに送信され、AI分析に使用されます。
                </p>
            </div>


        </>
    );
}
