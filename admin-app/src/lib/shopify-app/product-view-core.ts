import { CHANNEL_LABEL, GAP_META, STORE_LEVEL_BLOCKS, STORE_LEVEL_UNKNOWNS, type BlockCode, type Eligibility, type Gap, type GapCode, type GapGroup, type UnknownCode } from './catalogue-copy';
import { channelLabelFor, gapCopyFor, type CataloguePlatform } from './woo-catalogue-copy';
import { fixModeFor, type FixMode } from './fix-index-core';
export type AiShoppingStatus = 'can_be_shown' | 'store_blocked' | 'cant_be_shown' | 'cant_tell';
export const AI_SHOPPING_STATUS_LABEL: Record<AiShoppingStatus, string> = {
    can_be_shown: 'Can be shown',
    store_blocked: 'Blocked by store settings',
    cant_be_shown: 'Can’t be shown',
    cant_tell: 'We can’t tell',
};
export function aiShoppingStatus(e: Eligibility | null | undefined): AiShoppingStatus {
    if (!e)
        return 'cant_tell';
    const channels = [e.catalog, e.google].filter(Boolean);
    const productBlocks = channels.flatMap((c) => c.blocks).filter((b) => !STORE_LEVEL_BLOCKS.has(b));
    if (productBlocks.length > 0)
        return 'cant_be_shown';
    if (channels.some((c) => c.blocks.some((b) => STORE_LEVEL_BLOCKS.has(b))))
        return 'store_blocked';
    if (channels.some((c) => c.verdict === 'unknown'))
        return 'cant_tell';
    return 'can_be_shown';
}
const BLOCK_REASON: Record<BlockCode, string> = {
    store_password: 'Your store is password-protected',
    not_active: 'It is a draft or archived',
    unlisted: 'It is unlisted',
    hidden_from_search: 'It is hidden from search engines',
    no_title: 'It has no title',
    no_image: 'It has no image',
    no_price: 'It has no price',
    not_published: 'It is not published to your online store',
    crawler_blocked: 'Your robots.txt keeps this assistant’s crawler out',
};
const WOO_BLOCK_REASON: Record<BlockCode, string> = {
    store_password: 'Your store is in coming soon mode, so visitors see a holding page',
    not_active: 'It is not published (a draft, pending review or private)',
    unlisted: 'Its catalog visibility is Hidden, so your shop and its search leave it out',
    hidden_from_search: 'Your SEO plugin tells search engines not to index it',
    no_title: 'It has no title',
    no_image: 'It has no image',
    no_price: 'It has no price',
    not_published: 'It is password-protected',
    crawler_blocked: 'Your robots.txt keeps this assistant’s crawler out',
};
const UNKNOWN_REASON: Record<UnknownCode, string> = {
    store_password_unread: 'We could not read whether your store has a password',
    status_unread: 'We could not read its status',
    hidden_unread: 'We could not read whether it is hidden from search engines',
    images_unread: 'We could not read its images',
    price_unread: 'We could not read its price',
    published_unread: 'We could not read whether it is published to your online store',
    other_storefront: 'It is not on your online store, and your store has another storefront we cannot read',
    crawler_unread: 'We could not read your robots.txt',
};
const WOO_UNKNOWN_REASON: Record<UnknownCode, string> = {
    ...UNKNOWN_REASON,
    store_password_unread: 'We could not read whether your store is in coming soon mode',
    hidden_unread: 'We could not read whether your SEO plugin hides it from search engines',
    published_unread: 'We could not read whether it is password-protected',
};
export interface ChannelLine {
    channel: 'catalog' | 'google';
    name: string;
    feeds: string;
    verdict: 'clear' | 'blocked' | 'unknown';
    reasons: string[];
}
export function channelLines(e: Eligibility | null | undefined, platform: CataloguePlatform = 'shopify'): ChannelLine[] {
    if (!e)
        return [];
    const blocks = platform === 'shopify' ? BLOCK_REASON : WOO_BLOCK_REASON;
    const unknowns = platform === 'shopify' ? UNKNOWN_REASON : WOO_UNKNOWN_REASON;
    const labels = platform === 'shopify' ? CHANNEL_LABEL : channelLabelFor(platform);
    return (['catalog', 'google'] as const)
        .filter((c) => e[c])
        .map((c) => ({
        channel: c,
        ...labels[c],
        verdict: e[c].verdict,
        reasons: [...e[c].blocks.map((b) => blocks[b] ?? b), ...e[c].unknowns.map((u) => unknowns[u] ?? u)],
    }));
}
export interface GapView {
    code: GapCode;
    title: string;
    fix: string;
    group: GapGroup;
    mode: FixMode;
    detail: Gap['detail'] | null;
}
const GROUP_ORDER: Record<GapGroup, number> = { cant_be_shown: 0, missing_details: 1, search_basics: 2, images: 3 };
export function gapViews(gaps: readonly Gap[] | null | undefined, platform: CataloguePlatform = 'shopify'): GapView[] {
    const copy = gapCopyFor(platform);
    return (gaps ?? [])
        .filter((g): g is Gap => !!g && typeof g.code === 'string' && g.code in GAP_META)
        .map((g) => ({ code: g.code, ...copy[g.code], group: GAP_META[g.code].group, mode: fixModeFor(g.code), detail: g.detail ?? null }))
        .sort((a, b) => GAP_META[b.code].severity - GAP_META[a.code].severity || GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.code.localeCompare(b.code));
}
export type ProductState = 'ready' | 'needs_fix' | 'cant_tell';
export const PRODUCT_STATE_LABEL: Record<ProductState, string> = {
    ready: 'Ready to be shown',
    needs_fix: 'Needs a fix',
    cant_tell: 'We can’t tell',
};
export function productState(e: Eligibility | null | undefined): ProductState {
    const s = aiShoppingStatus(e);
    return s === 'cant_be_shown' ? 'needs_fix' : s === 'cant_tell' ? 'cant_tell' : 'ready';
}
export function missesDetails(gaps: readonly Gap[] | null | undefined): boolean {
    return gapViews(gaps).some((g) => g.group === 'missing_details');
}
export const PRODUCT_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'needs_fix', label: 'Needs a fix' },
    { id: 'missing_details', label: 'Missing details' },
    { id: 'ready', label: 'Ready to be shown' },
    { id: 'not_checked', label: 'Not in the check' },
] as const;
export type ProductFilter = (typeof PRODUCT_FILTERS)[number]['id'];
export function isProductFilter(v: unknown): v is ProductFilter {
    return PRODUCT_FILTERS.some((f) => f.id === v);
}
export function inFilter(row: {
    eligibility: Eligibility | null | undefined;
    gaps: readonly Gap[] | null | undefined;
}, filter: ProductFilter): boolean {
    if (filter === 'all')
        return true;
    if (filter === 'needs_fix')
        return productState(row.eligibility) === 'needs_fix';
    if (filter === 'ready')
        return productState(row.eligibility) === 'ready';
    if (filter === 'missing_details')
        return missesDetails(row.gaps);
    return false;
}
export interface ChannelCounts {
    clear: number;
    blocked: number;
    unknown: number;
}
export interface Readiness {
    products: number;
    ready: number;
    needsFix: number;
    cantTell: number;
    missingDetails: number;
    channels: Record<'catalog' | 'google', ChannelCounts>;
}
function ownVerdict(c: Eligibility['catalog'] | undefined): keyof ChannelCounts {
    if (!c)
        return 'unknown';
    if (c.blocks.some((b) => !STORE_LEVEL_BLOCKS.has(b)))
        return 'blocked';
    return c.unknowns.some((u) => !STORE_LEVEL_UNKNOWNS.has(u)) ? 'unknown' : 'clear';
}
export function readiness(rows: ReadonlyArray<{
    eligibility: Eligibility | null | undefined;
    gaps: readonly Gap[] | null | undefined;
}>): Readiness {
    const out: Readiness = {
        products: rows.length, ready: 0, needsFix: 0, cantTell: 0, missingDetails: 0,
        channels: { catalog: { clear: 0, blocked: 0, unknown: 0 }, google: { clear: 0, blocked: 0, unknown: 0 } },
    };
    for (const r of rows) {
        const s = productState(r.eligibility);
        if (s === 'ready')
            out.ready++;
        else if (s === 'needs_fix')
            out.needsFix++;
        else
            out.cantTell++;
        if (missesDetails(r.gaps))
            out.missingDetails++;
        for (const ch of ['catalog', 'google'] as const)
            out.channels[ch][r.eligibility ? ownVerdict(r.eligibility[ch]) : 'unknown']++;
    }
    return out;
}
export function channelsDiffer(r: Readiness): boolean {
    const a = r.channels.catalog;
    const b = r.channels.google;
    return a.clear !== b.clear || a.blocked !== b.blocked || a.unknown !== b.unknown;
}
export function titleMatches(title: string | null | undefined, query: string): boolean {
    const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return true;
    const t = norm(title ?? '');
    return words.every((w) => t.includes(w));
}
export function productNum(gid: string | null | undefined): string | null {
    const m = /^(?:gid:\/\/shopify\/Product|woo:\/\/product)\/(\d+)$/.exec(gid ?? '');
    return m ? m[1]! : null;
}
export function productGid(num: string, platform: 'shopify' | 'woocommerce' = 'shopify'): string | null {
    if (!/^\d{1,20}$/.test(num))
        return null;
    if (platform === 'shopify')
        return `gid://shopify/Product/${num}`;
    return /^[1-9]\d{0,15}$/.test(num) && Number.isSafeInteger(Number(num)) ? `woo://product/${num}` : null;
}
