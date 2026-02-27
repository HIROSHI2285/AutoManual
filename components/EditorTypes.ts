export type ToolType = 'select' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'stamp' | 'highlight' | 'blur' | 'adjust';
export type StrokeStyle = 'solid' | 'dashed';

export interface EditorState {
    activeTool: ToolType;
    currentColor: string;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    fontSize: number;
    stampCount: number;
}

export const EDITOR_DEFAULTS = {
    strokeWidth: 1,
    fontSize: 24,
    color: '#ef4444'
};

export const EDITOR_COLORS = [
    { value: '#ef4444', label: 'Red' },    // red-500
    { value: '#3b82f6', label: 'Blue' },   // blue-500
    { value: '#10b981', label: 'Green' },  // green-500
    { value: '#f59e0b', label: 'Amber' },  // amber-500
    { value: '#000000', label: 'Black' },
    { value: '#ffffff', label: 'White' },
];
