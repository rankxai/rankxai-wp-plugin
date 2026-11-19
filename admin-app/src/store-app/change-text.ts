const LABEL: Record<string, string> = {
    seoTitle: 'Search title', seoDescription: 'Search description', alt: 'Alt text', description: 'Description', score: 'Content score',
    path: 'From', target: 'To', categoryName: 'Category', barcode: 'Barcode', values: 'Values', article: 'Article',
};
const HIDDEN = new Set(['category', 'productId']);
const filled = (x: unknown): boolean => x !== null && x !== undefined && x !== '';
export function changeValueText(v: Record<string, unknown> | null, kind: string): string {
    if (kind === 'visibility')
        return v?.seoHidden === '1' || v?.seoHidden === true ? 'Hidden from search engines' : 'Shown to search engines';
    const empty = kind === 'category' ? 'No category' : kind === 'gtin' ? 'No barcode' : '(empty)';
    if (!v)
        return empty;
    const parts = Object.entries(v)
        .filter(([k, x]) => !HIDDEN.has(k) && filled(x))
        .map(([k, x]) => `${LABEL[k] ?? k}: ${(Array.isArray(x) ? x.join(', ') : String(x)).slice(0, 200)}`);
    if (parts.length)
        return parts.join(' · ');
    if (kind === 'category' && filled(v.category))
        return 'A category (its name was not recorded)';
    return empty;
}
