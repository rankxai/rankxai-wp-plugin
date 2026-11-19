export interface ListItem {
    text: string;
    children: ListItem[];
}
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type Block = {
    type: 'paragraph';
    text: string;
} | {
    type: 'heading';
    level: HeadingLevel;
    text: string;
} | {
    type: 'list';
    ordered: boolean;
    items: ListItem[];
} | {
    type: 'table';
    headers: string[];
    rows: string[][];
};
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const ORDERED_RE = /^(\d+)\.\s+(.+)$/;
const BULLET_RE = /^[•\-*]\s/;
const ORDERED_MAX_INDENT = 3;
const BULLET_MAX_INDENT = 2;
function indentOf(line: string): number {
    return line.length - line.trimStart().length;
}
function startsBlock(line: string): boolean {
    const trimmed = line.trim();
    if (HEADING_RE.test(trimmed))
        return true;
    if (trimmed.startsWith('|'))
        return true;
    const indent = indentOf(line);
    if (ORDERED_RE.test(trimmed) && indent < ORDERED_MAX_INDENT)
        return true;
    if (BULLET_RE.test(trimmed) && indent < BULLET_MAX_INDENT)
        return true;
    return false;
}
export function parseMarkdown(text: string): Block[] {
    const lines = text.split('\n');
    const blocks: Block[] = [];
    let i = 0;
    let previousPassIndex = -1;
    while (i < lines.length) {
        if (i === previousPassIndex) {
            const stalled = lines[i].trim();
            if (stalled)
                blocks.push({ type: 'paragraph', text: stalled });
            i++;
            continue;
        }
        previousPassIndex = i;
        const line = lines[i];
        const trimmed = line.trim();
        const indent = indentOf(line);
        if (!trimmed) {
            i++;
            continue;
        }
        const headingMatch = trimmed.match(HEADING_RE);
        if (headingMatch) {
            blocks.push({ type: 'heading', level: headingMatch[1].length as HeadingLevel, text: headingMatch[2] });
            i++;
            continue;
        }
        if (trimmed.startsWith('|')) {
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            const parsed = tableLines
                .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
                .filter(cells => cells.length > 0 && !cells.every(c => /^[-:\s]+$/.test(c)));
            if (parsed.length >= 1) {
                blocks.push({ type: 'table', headers: parsed[0], rows: parsed.slice(1) });
            }
            continue;
        }
        const numMatch = trimmed.match(ORDERED_RE);
        if (numMatch && indent < ORDERED_MAX_INDENT) {
            const item: ListItem = { text: numMatch[2], children: [] };
            i++;
            while (i < lines.length) {
                const cl = lines[i];
                const ct = cl.trim();
                const ci = indentOf(cl);
                if (!ct) {
                    i++;
                    break;
                }
                if (ci < 2)
                    break;
                if (BULLET_RE.test(ct)) {
                    const sub: ListItem = { text: ct.replace(/^[•\-*]\s+/, ''), children: [] };
                    item.children.push(sub);
                    i++;
                    while (i < lines.length) {
                        const gl = lines[i];
                        const gt = gl.trim();
                        const gi = indentOf(gl);
                        if (!gt || gi <= ci)
                            break;
                        if (BULLET_RE.test(gt)) {
                            sub.children.push({ text: gt.replace(/^[•\-*]\s+/, ''), children: [] });
                        }
                        i++;
                    }
                }
                else {
                    i++;
                }
            }
            const last = blocks[blocks.length - 1];
            if (last?.type === 'list' && last.ordered) {
                last.items.push(item);
            }
            else {
                blocks.push({ type: 'list', ordered: true, items: [item] });
            }
            continue;
        }
        if (BULLET_RE.test(trimmed) && indent < BULLET_MAX_INDENT) {
            const item: ListItem = { text: trimmed.replace(/^[•\-*]\s+/, ''), children: [] };
            i++;
            while (i < lines.length) {
                const cl = lines[i];
                const ct = cl.trim();
                const ci = indentOf(cl);
                if (!ct || ci < 2)
                    break;
                if (BULLET_RE.test(ct)) {
                    const sub: ListItem = { text: ct.replace(/^[•\-*]\s+/, ''), children: [] };
                    item.children.push(sub);
                    i++;
                    while (i < lines.length) {
                        const gl = lines[i];
                        const gt = gl.trim();
                        const gi = indentOf(gl);
                        if (!gt || gi <= ci)
                            break;
                        if (BULLET_RE.test(gt)) {
                            sub.children.push({ text: gt.replace(/^[•\-*]\s+/, ''), children: [] });
                        }
                        i++;
                    }
                }
                else {
                    i++;
                }
            }
            const last = blocks[blocks.length - 1];
            if (last?.type === 'list' && !last.ordered) {
                last.items.push(item);
            }
            else {
                blocks.push({ type: 'list', ordered: false, items: [item] });
            }
            continue;
        }
        const paraLines: string[] = [trimmed];
        i++;
        while (i < lines.length) {
            const pl = lines[i];
            const pt = pl.trim();
            if (!pt) {
                i++;
                break;
            }
            if (startsBlock(pl))
                break;
            paraLines.push(pt);
            i++;
        }
        blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
    return blocks;
}
