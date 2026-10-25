export const FREE_BULK_PRODUCTS = 25;
export const FREE_BULK_INCLUDED = true;
export type FixMode = 'category' | 'barcode' | 'visibility' | 'attributes' | 'images' | 'search' | 'shopify';
export function fixModeFor(code: string): FixMode {
    if (code === 'no_category' || code === 'category_too_broad')
        return 'category';
    if (code === 'gtin_missing' || code === 'gtin_invalid')
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
    note: string | null;
}
export function bulkGate(input: {
    selected: number;
    freePlanNeeded: string | null;
    mode: FixMode;
    categories?: ReadonlyArray<string | null>;
}): BulkGate {
    const limited = !!input.freePlanNeeded && !FREE_BULK_INCLUDED;
    const note = limited ? `${FREE_BULK_PRODUCTS} products a month on the Free plan. One product at a time is always free.` : null;
    if (!bulkable(input.mode))
        return { allowed: false, reason: 'These are fixed one product at a time.', note: null };
    if (input.selected === 0)
        return { allowed: false, reason: 'Select the products to fix.', note };
    if (input.mode === 'attributes') {
        const cats = new Set(input.categories ?? []);
        if (cats.has(null) || cats.size > 1)
            return { allowed: false, reason: 'Select products in the same category: the details to set come from the category.', note };
    }
    if (limited && input.selected > FREE_BULK_PRODUCTS) {
        return { allowed: false, reason: `The Free plan fixes up to ${FREE_BULK_PRODUCTS} products at once. Select ${FREE_BULK_PRODUCTS} or fewer, or choose ${input.freePlanNeeded} to fix more.`, note };
    }
    return { allowed: true, reason: null, note };
}
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
