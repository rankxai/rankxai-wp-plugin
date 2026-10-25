export function insertAtCursor(text: string, token: string, start: number | null, end: number | null): {
    value: string;
    caret: number;
} {
    const len = text.length;
    const s = start === null || !Number.isFinite(start) ? len : Math.max(0, Math.min(len, start));
    const e = end === null || !Number.isFinite(end) ? s : Math.max(s, Math.min(len, end));
    const before = text.slice(0, s);
    const after = text.slice(e);
    const lead = before !== '' && !/\s$/.test(before) && !/^[\s,.:;|–-]/.test(token) ? ' ' : '';
    const trail = after !== '' && !/^\s/.test(after) ? ' ' : '';
    const value = `${before}${lead}${token}${trail}${after}`;
    return { value, caret: before.length + lead.length + token.length };
}
export type LengthState = 'empty' | 'fits' | 'long';
export function lengthState(value: string, max: number): LengthState {
    const n = [...value.trim()].length;
    if (n === 0)
        return 'empty';
    return n > max ? 'long' : 'fits';
}
export function unknownVariables(template: string, variables: readonly string[]): string[] {
    const known = new Set(variables);
    const used = template.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [];
    return [...new Set(used.map((u) => u.replace(/\s+/g, '')).filter((u) => !known.has(u)))];
}
export function variableLabel(token: string): string {
    const inner = token.replace(/^\{\{\s*|\s*\}\}$/g, '');
    const words = inner.split(/[._]/).filter(Boolean);
    if (words.length === 0)
        return token;
    const text = words.join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}
