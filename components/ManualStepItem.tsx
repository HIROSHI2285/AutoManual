'use client';

import { memo } from 'react';
import { ManualStep } from '@/app/page';
import { useBlobUrl } from '@/hooks/useBlobUrl';

interface ManualStepItemProps {
    step: ManualStep;
    isPortrait: boolean;
    isTwoColumn: boolean;
}

/**
 * ビューモード用のステップ1件分のコンポーネント。
 *
 * React.memo でラップされているため、自分の props (step / isPortrait / isTwoColumn) が
 * 変わらない限り再レンダリングされません。
 * タイトルや詳細の編集中も、他のステップの画像は再描画されません。
 *
 * screenshot 表示には useBlobUrl フックを使用し、Base64 文字列を
 * Blob URL に変換してメモリ使用量を削減します。
 */
const ManualStepItem = memo(function ManualStepItem({
    step,
    isPortrait,
    isTwoColumn,
}: ManualStepItemProps) {
    const displayUrl = useBlobUrl(step.screenshot);

    return (
        <section
            className={`manual__step animate-slide-up ${isTwoColumn
                    ? 'bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full'
                    : `mx-auto w-full ${isPortrait ? 'max-w-[576px]' : 'max-w-[768px]'}`
                }`}
        >
            <div className={`flex items-start gap-6 group ${isTwoColumn ? 'flex-grow mb-4' : 'mb-6'}`}>
                <div className="flex flex-col items-center gap-3">
                    <div
                        className={`manual__step-number flex-shrink-0 w-10 h-10 bg-slate-950 text-white rounded-xl flex items-center justify-center text-lg font-black shadow-2xl shadow-slate-900/30 group-hover:scale-110 transition-transform ${!isTwoColumn ? 'mt-[12px]' : ''
                            }`}
                    >
                        {step.stepNumber}
                    </div>
                </div>
                <div className={`flex flex-col gap-3 py-1 w-full ${isTwoColumn ? 'min-h-[140px]' : ''}`}>
                    <h3 className="manual__step-title text-2xl font-black text-slate-950 leading-tight tracking-tight drop-shadow-sm">
                        {step.action}
                    </h3>
                    <p className="manual__step-desc text-slate-800 font-bold text-base leading-relaxed">
                        {step.detail}
                    </p>
                </div>
            </div>

            <div
                className="manual__image-container mx-auto rounded-[16px] overflow-hidden transition-all duration-500 border-2 bg-slate-50 shadow-lg border-slate-900/5 hover:border-slate-900/10 hover:shadow-xl transform hover:-translate-y-1"
                style={{ maxWidth: isPortrait ? '576px' : '768px' }}
            >
                {displayUrl && (
                    <img
                        src={displayUrl}
                        alt={`Step ${step.stepNumber}: ${step.action}`}
                        className="block transition-transform duration-700 group-hover:scale-[1.01] w-full h-auto"
                        loading="lazy"
                        decoding="async"
                    />
                )}
            </div>
        </section>
    );
});

export default ManualStepItem;
