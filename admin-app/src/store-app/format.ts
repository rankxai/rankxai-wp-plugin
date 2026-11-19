import { host } from './host';
let cached: string | null = null;
function supported(tag: string): string | null {
    try {
        return Intl.NumberFormat.supportedLocalesOf([tag]).length > 0 ? tag : null;
    }
    catch {
        return null;
    }
}
export function adminLocale(): string {
    if (cached)
        return cached;
    let tag: string | null = null;
    const fromAdmin = host.locale();
    if (fromAdmin)
        tag = supported(fromAdmin);
    if (!tag && typeof navigator !== 'undefined' && navigator.language)
        tag = supported(navigator.language);
    cached = tag ?? 'en';
    return cached;
}
let numberFmt: Intl.NumberFormat | null = null;
let percentFmt: Intl.NumberFormat | null = null;
let dateFmt: Intl.DateTimeFormat | null = null;
export function fmtNumber(n: number): string {
    numberFmt ??= new Intl.NumberFormat(adminLocale(), { maximumFractionDigits: 0 });
    return numberFmt.format(n);
}
export function fmtPercent(p: number): string {
    percentFmt ??= new Intl.NumberFormat(adminLocale(), { style: 'percent', maximumFractionDigits: 0 });
    return percentFmt.format(p);
}
export function fmtDate(iso: string | null | undefined): string {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    dateFmt ??= new Intl.DateTimeFormat(adminLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    return dateFmt.format(d);
}
let dateTimeFmt: Intl.DateTimeFormat | null = null;
export function fmtDateTime(iso: string | null | undefined): string {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    dateTimeFmt ??= new Intl.DateTimeFormat(adminLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    return dateTimeFmt.format(d);
}
export function fmtCount(n: number, one: string, many: string): string {
    return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}
