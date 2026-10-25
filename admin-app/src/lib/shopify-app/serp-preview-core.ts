export type Device = 'desktop' | 'mobile';
export const SNIPPET_WIDTH: Record<Device, {
    title: number;
    titleFont: number;
    description: number;
    descriptionFont: number;
}> = {
    desktop: { title: 600, titleFont: 20, description: 920, descriptionFont: 14 },
    mobile: { title: 620, titleFont: 18, description: 680, descriptionFont: 14 },
};
const NARROW: Record<string, number> = {
    ' ': 278, '!': 278, "'": 191, '(': 333, ')': 333, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '|': 260,
    i: 222, j: 222, l: 222, f: 278, t: 278, r: 333, I: 278, J: 500, '’': 222, '‘': 222, '–': 556, '—': 1000, '&': 667,
    m: 833, w: 722, M: 833, W: 944, '@': 1015, '%': 889,
};
const LOWER = 556;
const UPPER = 667;
const DIGIT = 556;
const DEFAULT = 600;
function charWidth(c: string): number {
    if (c in NARROW)
        return NARROW[c]!;
    if (c >= 'a' && c <= 'z')
        return c === 'k' || c === 's' || c === 'v' || c === 'x' || c === 'y' || c === 'z' || c === 'c' ? 500 : LOWER;
    if (c >= 'A' && c <= 'Z')
        return c === 'C' || c === 'D' || c === 'G' || c === 'H' || c === 'N' || c === 'O' || c === 'Q' || c === 'R' || c === 'U' ? 722 : c === 'F' || c === 'T' || c === 'Z' ? 611 : UPPER;
    if (c >= '0' && c <= '9')
        return DIGIT;
    return DEFAULT;
}
export function textWidth(text: string, fontPx: number): number {
    let units = 0;
    for (const c of text)
        units += charWidth(c);
    return (units / 1000) * fontPx;
}
export interface Fitted {
    shown: string;
    mayBeCut: boolean;
    share: number;
}
export function fitToWidth(text: string, maxPx: number, fontPx: number): Fitted {
    const t = text.replace(/\s+/g, ' ').trim();
    const width = textWidth(t, fontPx);
    const share = maxPx > 0 ? width / maxPx : 0;
    if (width <= maxPx)
        return { shown: t, mayBeCut: false, share };
    const room = maxPx - textWidth('…', fontPx);
    let used = 0;
    let end = 0;
    for (let i = 0; i < t.length; i++) {
        used += (charWidth(t[i]!) / 1000) * fontPx;
        if (used > room)
            break;
        end = i + 1;
    }
    const cut = t.slice(0, end);
    const atWord = cut.lastIndexOf(' ');
    const shown = (atWord > end * 0.5 ? cut.slice(0, atWord) : cut).replace(/[\s,.;:–—|-]+$/, '');
    return { shown: `${shown}…`, mayBeCut: true, share };
}
export interface Snippet {
    title: Fitted;
    description: Fitted | null;
}
export function snippetFor(title: string, description: string | null, device: Device): Snippet {
    const w = SNIPPET_WIDTH[device];
    const d = (description ?? '').trim();
    return {
        title: fitToWidth(title, w.title, w.titleFont),
        description: d ? fitToWidth(d, w.description, w.descriptionFont) : null,
    };
}
export function widthNote(f: Fitted, what: 'title' | 'description'): string {
    const pct = Math.round(f.share * 100);
    if (f.mayBeCut)
        return `About ${pct}% of the space Google usually shows, so the end may be cut off.`;
    if (what === 'title' && f.share < 0.35)
        return `About ${pct}% of the space. A few more words can help a shopper choose.`;
    if (what === 'description' && f.share < 0.45)
        return `About ${pct}% of the space. A sentence more can say why to click.`;
    return `About ${pct}% of the space Google usually shows.`;
}
