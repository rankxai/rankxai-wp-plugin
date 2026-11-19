export const CATALOGUE_SOURCES = ['csv', 'shopify', 'woocommerce', 'gmc_feed', 'manual', 'crawl', 'gmc_feed_url'] as const;
export type CatalogueSource = (typeof CATALOGUE_SOURCES)[number];
export const AVAILABILITY_VALUES = ['in_stock', 'out_of_stock', 'pre_order', 'backorder', 'unknown'] as const;
export type CatalogueAvailability = (typeof AVAILABILITY_VALUES)[number];
export const MAX_DESCRIPTION_CHARS = 2000;
export function boundDescription(text: string | null): string | null {
    if (text === null)
        return null;
    if (text.length <= MAX_DESCRIPTION_CHARS)
        return text;
    const cut = text.slice(0, MAX_DESCRIPTION_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > MAX_DESCRIPTION_CHARS * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
export interface CatalogueItemDraft {
    source: CatalogueSource;
    externalId: string | null;
    sku: string | null;
    gtin: string | null;
    mpn: string | null;
    title: string;
    brand: string | null;
    description: string | null;
    category: string | null;
    priceMinor: number | null;
    currency: string | null;
    priceRaw: string | null;
    url: string | null;
    imageUrl: string | null;
    isActive: boolean;
    groupId?: string | null;
    availability?: CatalogueAvailability | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    imageCount?: number | null;
    ratingValue?: number | null;
    ratingCount?: number | null;
}
export function normaliseAvailability(raw: string | null | undefined): CatalogueAvailability | null {
    if (raw === null || raw === undefined)
        return null;
    const v = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (v === '')
        return null;
    if (v === 'instock' || v === 'instockonline' || v === 'available' || v === 'true')
        return 'in_stock';
    if (v === 'outofstock' || v === 'soldout' || v === 'unavailable' || v === 'false')
        return 'out_of_stock';
    if (v === 'preorder')
        return 'pre_order';
    if (v === 'backorder' || v === 'onbackorder')
        return 'backorder';
    return 'unknown';
}
export interface CatalogueItemRejection {
    reason: 'missing_title' | 'missing_external_id' | 'sold_elsewhere';
    detail: string;
}
export type CatalogueMapResult = {
    ok: true;
    item: CatalogueItemDraft;
} | {
    ok: false;
    rejection: CatalogueItemRejection;
};
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
export function minorUnitExponent(currency: string | null | undefined): number | null {
    if (!currency)
        return null;
    const c = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c))
        return null;
    if (ZERO_DECIMAL.has(c))
        return 0;
    if (THREE_DECIMAL.has(c))
        return 3;
    return 2;
}
export function parsePriceToMinor(raw: string | number | null | undefined, currency: string | null | undefined): number | null {
    if (raw === null || raw === undefined)
        return null;
    const exponent = minorUnitExponent(currency);
    if (exponent === null)
        return null;
    const text = String(raw).trim();
    if (text === '')
        return null;
    let cleaned = text
        .replace(/[£$€¥₹₩₪₺฿]/g, '')
        .replace(/^\s*[A-Za-z]{3}\s+|\s+[A-Za-z]{3}\s*$/g, '')
        .replace(/[\s   ]/g, '');
    if (cleaned === '' || /[^\d.,-]/.test(cleaned))
        return null;
    const hasDot = cleaned.includes('.');
    const hasComma = cleaned.includes(',');
    if (hasDot && hasComma) {
        cleaned = cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',')
            ? cleaned.replace(/,/g, '')
            : cleaned.replace(/\./g, '').replace(',', '.');
    }
    else if (hasComma) {
        const parts = cleaned.split(',');
        const groupsOfThree = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
        cleaned = groupsOfThree ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
    }
    if (!/^-?\d*\.?\d+$/.test(cleaned))
        return null;
    const value = Number(cleaned);
    if (!Number.isFinite(value))
        return null;
    const scaled = value * 10 ** exponent;
    const rounded = scaled < 0 ? -Math.round(Math.abs(scaled)) : Math.round(scaled);
    return Number.isSafeInteger(rounded) ? rounded : null;
}
export interface WooProductLike {
    id: number;
    name: string;
    slug: string;
    permalink: string | null;
    status: string;
    type: string;
    sku: string;
    images: Array<{
        src: string;
        alt: string;
    }>;
    regularPrice: string;
    salePrice: string;
    price: string;
    description: string;
    shortDescription: string;
    categories: Array<{
        id: number;
        name: string;
    }>;
    meta: Record<string, string>;
    stockStatus?: string;
    averageRating?: string;
    ratingCount?: number | null;
    globalUniqueId?: string;
}
const GTIN_META_KEYS = ['_global_unique_id', '_wpm_gtin_code', '_gtin', 'gtin', '_ean', 'ean', '_upc', 'upc'];
const MPN_META_KEYS = ['_mpn', 'mpn', '_wpm_mpn_code'];
function firstMeta(meta: Record<string, string>, keys: string[]): string | null {
    for (const k of keys) {
        const v = meta[k];
        if (typeof v === 'string' && v.trim() !== '')
            return v.trim();
    }
    return null;
}
const NAMED_ENTITIES: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    ndash: '–', mdash: '—', hellip: '…', pound: '£', euro: '€', trade: '™',
    copy: '©', reg: '®', deg: '°', times: '×', middot: '·',
};
export function plainDescription(html: string): string | null {
    const text = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#(\d+);/g, (m, d: string) => {
        const code = Number(d);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
        .replace(/&#x([0-9a-fA-F]+);/g, (m, h: string) => {
        const code = Number.parseInt(h, 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
        .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
        .replace(/\s+/g, ' ')
        .trim();
    return text === '' ? null : text;
}
export function mapWooProduct(product: WooProductLike, opts: {
    storeCurrency: string | null;
}): CatalogueMapResult {
    const rawId = product.id;
    if (typeof rawId !== 'number' || !Number.isFinite(rawId) || rawId <= 0) {
        return {
            ok: false,
            rejection: {
                reason: 'missing_external_id',
                detail: `woocommerce product has no usable id (received ${JSON.stringify(rawId)})`,
            },
        };
    }
    const title = product.name?.trim() ?? '';
    if (title === '') {
        return { ok: false, rejection: { reason: 'missing_title', detail: `woocommerce product ${rawId} has no name` } };
    }
    if (product.type === 'external') {
        return { ok: false, rejection: { reason: 'sold_elsewhere', detail: `woocommerce product ${rawId} is sold on another site` } };
    }
    const rawPrice = product.price?.trim() !== '' ? product.price : product.regularPrice;
    return {
        ok: true,
        item: {
            source: 'woocommerce',
            externalId: String(rawId),
            sku: product.sku?.trim() || null,
            gtin: product.type === 'variable' ? null : (product.globalUniqueId?.trim() || firstMeta(product.meta ?? {}, GTIN_META_KEYS)),
            mpn: firstMeta(product.meta ?? {}, MPN_META_KEYS),
            title,
            brand: null,
            description: boundDescription(plainDescription(product.shortDescription || product.description || '')),
            category: product.categories?.[0]?.name?.trim() || null,
            priceMinor: parsePriceToMinor(rawPrice, opts.storeCurrency),
            currency: opts.storeCurrency ? opts.storeCurrency.trim().toUpperCase() : null,
            priceRaw: rawPrice?.trim() || null,
            url: product.permalink,
            imageUrl: product.images?.[0]?.src ?? null,
            isActive: product.status === 'publish',
            availability: normaliseAvailability(product.stockStatus),
            seoTitle: firstMeta(product.meta ?? {}, SEO_TITLE_META_KEYS),
            seoDescription: firstMeta(product.meta ?? {}, SEO_DESCRIPTION_META_KEYS),
            imageCount: Array.isArray(product.images) ? product.images.length : null,
            ratingValue: parseRating(product.averageRating),
            ratingCount: typeof product.ratingCount === 'number' && Number.isFinite(product.ratingCount)
                ? product.ratingCount
                : null,
        },
    };
}
const SEO_TITLE_META_KEYS = ['_yoast_wpseo_title', 'rank_math_title', '_seopress_titles_title'];
const SEO_DESCRIPTION_META_KEYS = ['_yoast_wpseo_metadesc', 'rank_math_description', '_seopress_titles_desc'];
function parseRating(raw: string | null | undefined): number | null {
    if (typeof raw !== 'string' || raw.trim() === '')
        return null;
    const n = Number(raw.trim());
    return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
}
export function readCommerceCurrency(capabilities: unknown): string | null {
    if (!capabilities || typeof capabilities !== 'object')
        return null;
    const commerce = (capabilities as Record<string, unknown>)['commerce'];
    if (!commerce || typeof commerce !== 'object')
        return null;
    const raw = (commerce as Record<string, unknown>)['currency'];
    if (typeof raw !== 'string')
        return null;
    const code = raw.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : null;
}
export function readCommerceWritable(capabilities: unknown): boolean {
    if (!capabilities || typeof capabilities !== 'object')
        return false;
    const commerce = (capabilities as Record<string, unknown>)['commerce'];
    if (!commerce || typeof commerce !== 'object')
        return false;
    const c = commerce as Record<string, unknown>;
    return c['present'] === true && c['canManage'] === true;
}
