'use client';

import { useRef, useState, DragEvent } from 'react';

interface VideoUploaderProps {
    onVideosSelect: (files: File[]) => void;
    videoFiles: File[];
    videoPreviewUrls: string[];
    onRemoveVideo: (index: number) => void;
}

const ACCEPTED_VIDEO_TYPES = [
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'video/webm', 'video/3gpp', 'video/mpeg',
];

const formatFileSize = (bytes: number): string => {
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
    onVideosSelect, videoFiles, videoPreviewUrls, onRemoveVideo,
}: VideoUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragActive, setIsDragActive] = useState(false);

    const handleDragOver = (e: DragEvent) => { e.preventDefault(); setIsDragActive(true); };
    const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragActive(false); };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
        validateAndSelect(Array.from(e.dataTransfer.files));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        validateAndSelect(Array.from(e.target.files || []));
        e.target.value = '';
    };

    const validateAndSelect = (files: File[]) => {
        const valid = files.filter(f => {
            if (!ACCEPTED_VIDEO_TYPES.includes(f.type)) {
                alert(`${f.name} は対応していない形式です。MP4, MOV, AVI, WebM, 3GP形式を選択してください。`);
                return false;
            }
            if (f.size > 500 * 1024 * 1024) {
                alert(`${f.name} は500MBを超えているため追加できません（${formatFileSize(f.size)}）。`);
                return false;
            }
            return true;
        });
        if (valid.length > 0) onVideosSelect(valid);
    };

    return (
        <div className="space-y-4">
            {/* アップロード済みファイル一覧 */}
            {videoFiles.length > 0 && (
                <div className="space-y-3">
                    {videoFiles.map((file, index) => (
                        <div key={index} className="video-preview">
                            <video className="video-preview__player" src={videoPreviewUrls[index]} controls />
                            <div className="video-preview__info">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold shrink-0">
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <span className="video-preview__name truncate block">{file.name}</span>
                                        <span className="video-preview__size text-xs text-slate-400">{formatFileSize(file.size)}</span>
                                    </div>
                                </div>
                                <button className="btn btn--secondary btn--small shrink-0" onClick={() => onRemoveVideo(index)}>
                                    削除
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* アップロードゾーン（常に表示） */}
            <div
                className={`upload-zone ${isDragActive ? 'upload-zone--active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={handleFileChange}
                    className="upload-zone__input"
                />
                <div className="upload-zone__icon"><UploadIcon /></div>
                <p className="upload-zone__text">
                    {videoFiles.length > 0 ? '動画を追加する' : '動画を選択またはドロップ'}
                </p>
                <p className="upload-zone__hint text-xs text-slate-400 mt-2">
                    MP4, MOV, AVI, WebM, 3GPに対応。複数選択可。<br />
                    複数の動画をアップすると1つのマニュアルにまとめられます。
                </p>
            </div>
        </div>
    );
}
