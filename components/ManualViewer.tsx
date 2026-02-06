'use client';

import { useState } from 'react';
import { ManualData } from '@/app/page';
import CopyButton from './CopyButton';
import ExportButton from './ExportButton';
import ImageEditor from './ImageEditor';

interface ManualViewerProps {
    manual: ManualData;
    videoFile?: File;
    onUpdateManual?: (manual: ManualData) => void;
}

export default function ManualViewer({ manual, videoFile, onUpdateManual }: ManualViewerProps) {
    const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

    const handleEditImage = (index: number) => {
        setEditingStepIndex(index);
    };

    const handleSaveImage = (newImageUrl: string) => {
        if (editingStepIndex === null || !onUpdateManual) return;

        const updatedSteps = [...manual.steps];
        updatedSteps[editingStepIndex] = {
            ...updatedSteps[editingStepIndex],
            screenshot: newImageUrl
        };

        onUpdateManual({
            ...manual,
            steps: updatedSteps
        });

        setEditingStepIndex(null);
    };

    return (
        <div className="manual">
            <div className="manual__header">
                <div>
                    <h2 className="manual__title">{manual.title}</h2>
                    <p className="manual__overview">{manual.overview}</p>
                </div>
                <div className="manual__actions">
                    <CopyButton manual={manual} />
                    <ExportButton manual={manual} />
                </div>
            </div>

            {/* Steps */}
            <div className="steps">
                {manual.steps.map((step, index) => (
                    <div key={step.stepNumber} className="step">
                        <div className="step__header">
                            <div className="step__number">{step.stepNumber}</div>
                            <h3 className="step__action">{step.action}</h3>
                        </div>

                        {/* Screenshot with bounding box */}
                        {step.screenshot && (
                            <div className="step__screenshot group relative">
                                <img
                                    src={step.screenshot}
                                    alt={`Step ${step.stepNumber}: ${step.action}`}
                                    className="step__screenshot-img"
                                />
                                {onUpdateManual && (
                                    <button
                                        onClick={() => handleEditImage(index)}
                                        className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 p-2 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="画像を編集"
                                    >
                                        ✏️
                                    </button>
                                )}
                            </div>
                        )}

                        <p className="step__detail">{step.detail}</p>
                    </div>
                ))}
            </div>

            {/* Notes */}
            {manual.notes && manual.notes.length > 0 && (
                <div className="notes">
                    <h4 className="notes__title">
                        注意事項
                    </h4>
                    <ul className="notes__list">
                        {manual.notes.map((note, index) => (
                            <li key={index} className="notes__item">
                                {note}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Image Editor Modal */}
            {editingStepIndex !== null && manual.steps[editingStepIndex].screenshot && (
                <ImageEditor
                    imageUrl={manual.steps[editingStepIndex].screenshot!}
                    onSave={handleSaveImage}
                    onCancel={() => setEditingStepIndex(null)}
                />
            )}
        </div>
    );
}
