import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { ManualData } from '@/app/page';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { manual }: { manual: ManualData } = body;

        if (!manual) {
            return NextResponse.json({ error: 'Manual data is required' }, { status: 400 });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('チェックリスト');

        // フォント設定 (Meiryo UI, 9pt)
        const baseStyle: Partial<ExcelJS.Font> = { name: 'Meiryo UI', size: 9 };

        // 列の定義
        worksheet.columns = [
            { header: 'No.', key: 'no', width: 6 },
            { header: '完了', key: 'check', width: 8 },
            { header: '操作内容 (キャプション)', key: 'action', width: 35 },
            { header: '詳細説明 / 作業メモ', key: 'detail', width: 45 },
        ];

        // A4印刷設定
        worksheet.pageSetup = {
            paperSize: 9, // A4
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0, // 自動
            margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
        };

        // ヘッダーのスタイル設定
        const headerRow = worksheet.getRow(1);
        headerRow.height = 25;
        headerRow.eachCell((cell) => {
            cell.font = { ...baseStyle, bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate-100
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' }, left: { style: 'thin' },
                bottom: { style: 'medium' }, right: { style: 'thin' }
            };
        });

        // データの流し込み
        manual.steps.forEach((step) => {
            const row = worksheet.addRow({
                no: step.stepNumber,
                check: '', // チェック欄
                action: step.action,
                detail: step.detail || ''
            });

            // 各行のスタイル設定
            row.height = 35;
            row.eachCell((cell, colNumber) => {
                cell.font = baseStyle;
                cell.alignment = { vertical: 'middle', wrapText: true };
                if (colNumber <= 2) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                }
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });
        });

        // タイトル行の挿入（一番上）
        worksheet.insertRow(1, [manual.title]);
        worksheet.mergeCells('A1:D1');
        const titleCell = worksheet.getCell('A1');
        titleCell.font = { name: 'Meiryo UI', size: 14, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
        worksheet.getRow(1).height = 30;

        // バッファ生成
        const buffer = await workbook.xlsx.writeBuffer();

        // バイナリレスポンスとして返す
        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="checklist.xlsx"`,
            },
        });

    } catch (error) {
        console.error('Excel export error:', error);
        return NextResponse.json({ error: 'Failed to generate Excel file' }, { status: 500 });
    }
}
