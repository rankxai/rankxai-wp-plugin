export interface RedirectRow {
    path: string;
    target: string;
}
export interface CsvReadResult {
    rows: RedirectRow[];
    problems: Array<{
        line: number;
        reason: string;
    }>;
}
export const MAX_IMPORT_ROWS = 250;
function cell(v: string): string {
    return /[",;\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
export function redirectsToCsv(rows: readonly RedirectRow[]): string {
    return ['Redirect from,Redirect to', ...rows.map((r) => `${cell(r.path)},${cell(r.target)}`)].join('\r\n') + '\r\n';
}
export function parseCsv(text: string): string[][] {
    const src = text.replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
    const sep = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
    const out: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]!;
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else
                    quoted = false;
            }
            else
                field += ch;
            continue;
        }
        if (ch === '"' && field === '')
            quoted = true;
        else if (ch === sep) {
            row.push(field);
            field = '';
        }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n')
                i++;
            row.push(field);
            out.push(row);
            row = [];
            field = '';
        }
        else
            field += ch;
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        out.push(row);
    }
    return out;
}
const isHeader = (cells: string[]) => /redirect|from|path|source/i.test(cells[0] ?? '') && !(cells[0] ?? '').trim().startsWith('/');
export function readRedirectsCsv(text: string): CsvReadResult {
    const records = parseCsv(text);
    const rows: RedirectRow[] = [];
    const problems: CsvReadResult['problems'] = [];
    const seen = new Set<string>();
    records.forEach((cells, i) => {
        const line = i + 1;
        const trimmed = cells.map((c) => c.trim());
        if (trimmed.every((c) => c === ''))
            return;
        if (i === 0 && isHeader(trimmed))
            return;
        const [path = '', target = ''] = trimmed;
        if (!path || !target)
            return void problems.push({ line, reason: 'Needs both a from and a to.' });
        if (!path.startsWith('/') || path.startsWith('//'))
            return void problems.push({ line, reason: 'The from must be a path on your store, starting with /.' });
        if (path === target)
            return void problems.push({ line, reason: 'The from and to are the same.' });
        if (seen.has(path.toLowerCase()))
            return void problems.push({ line, reason: 'This from appears more than once.' });
        if (rows.length >= MAX_IMPORT_ROWS)
            return void problems.push({ line, reason: `Only the first ${MAX_IMPORT_ROWS} redirects are imported at once.` });
        seen.add(path.toLowerCase());
        rows.push({ path, target });
    });
    return { rows, problems };
}
