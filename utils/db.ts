import Dexie, { Table } from 'dexie';
import { ManualData } from '@/app/page';

export class ManualDatabase extends Dexie {
    manuals!: Table<{ id: string; data: ManualData }>;

    constructor() {
        super('AutoManualDB');
        this.version(1).stores({
            manuals: 'id' // 'id' を主キーにする
        });
    }
}

export const db = new ManualDatabase();
