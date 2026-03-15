import { ManualData } from '@/app/page';

export async function generateAndDownloadExcel(manual: ManualData, safeTitle: string): Promise<void> {
    try {
        const response = await fetch('/api/export-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manual }),
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}_checklist.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Client-side Excel export call failed:', error);
        throw error;
    }
}
