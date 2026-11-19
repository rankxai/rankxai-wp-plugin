export type FixMode = 'category' | 'barcode' | 'visibility' | 'attributes' | 'images' | 'search' | 'shopify';
export function fixModeFor(code: string): FixMode {
    if (code === 'no_category' || code === 'category_too_broad' || code === 'category_archived')
        return 'category';
    if (code === 'gtin_missing' || code === 'gtin_invalid' || code === 'gtin_duplicate' || code === 'gtin_unchecked')
        return 'barcode';
    if (code === 'hidden_from_search')
        return 'visibility';
    if (code === 'attributes_missing')
        return 'attributes';
    if (code === 'alt_text_missing' || code.startsWith('image_'))
        return 'images';
    if (code === 'seo_title_missing' || code === 'seo_description_missing')
        return 'search';
    return 'shopify';
}
export function bulkable(mode: FixMode): boolean {
    return mode === 'category' || mode === 'visibility' || mode === 'attributes';
}
export interface BulkGate {
    allowed: boolean;
    reason: string | null;
}
export function bulkGate(input: {
    selected: number;
    mode: FixMode;
    categories?: ReadonlyArray<string | null>;
}): BulkGate {
    if (!bulkable(input.mode))
        return { allowed: false, reason: 'These are fixed one product at a time.' };
    if (input.selected === 0)
        return { allowed: false, reason: 'Select the products to fix.' };
    if (input.mode === 'attributes') {
        const cats = new Set(input.categories ?? []);
        if (cats.has(null) || cats.size > 1)
            return { allowed: false, reason: 'Select products in the same category: the details to set come from the category.' };
    }
    return { allowed: true, reason: null };
}
export const BULK_SELECT_MAX = 250;
export function matchesQuery(title: string | null, query: string): boolean {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const q = norm(query.trim());
    if (q === '')
        return true;
    const t = norm(title ?? '');
    return q.split(/\s+/).every((w) => t.includes(w));
}
export function numericId(gid: string): string | null {
    const m = /^gid:\/\/shopify\/\w+\/(\d+)$/.exec(gid);
    return m ? m[1]! : null;
}
export function adminProductHref(gid: string): string {
    const id = numericId(gid);
    return id ? `shopify://admin/products/${id}` : 'shopify://admin/products';
}
