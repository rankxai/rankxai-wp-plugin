import { MIN_DESCRIPTION_WORDS, type GapCode } from './catalogue-copy';
import type { StorePlatformName } from '@/lib/store-app/route-policy-core';
export interface LiveProduct {
    title: string | null;
    handle: string | null;
    status: string | null;
    vendor: string | null;
    productType: string | null;
    tags: string[];
    description: string;
    category: string | null;
    seo: {
        title: string | null;
        description: string | null;
    };
    hiddenFromSearch: boolean;
    options: string[];
    imageUrl: string | null;
    imageAlt: string | null;
    mediaCount: number | null;
    variantsCount: number | null;
    variants: Array<{
        title: string | null;
        price: string | null;
        barcode: string | null;
        sku: string | null;
        inventory: number | null;
    }>;
    currency: string | null;
}
export interface ProductSummary {
    status: string | null;
    updatedAt: string | null;
    inventory: number | null;
    tracksInventory: boolean | null;
    price: {
        min: string;
        max: string;
        currency: string;
    } | null;
    images: number | null;
    variants: number | null;
}
export type ProductSection = 'description' | 'media' | 'category' | 'variants' | 'search' | 'status' | 'organization';
export const SECTION_LABEL: Record<ProductSection, string> = {
    description: 'Title and description',
    media: 'Media',
    category: 'Category',
    variants: 'Variants',
    search: 'Search engine listing',
    status: 'Status',
    organization: 'Product organization',
};
export type FixPlace = {
    kind: 'here';
} | {
    kind: 'product';
} | {
    kind: 'admin';
    path: string;
    label: string;
};
export interface FixGuide {
    section: ProductSection;
    place: FixPlace;
    steps: string[];
}
const HERE: FixPlace = { kind: 'here' };
const PRODUCT: FixPlace = { kind: 'product' };
export const FIX_GUIDE: Record<GapCode, FixGuide> = {
    not_active: { section: 'status', place: PRODUCT, steps: ['Under Status, choose Active.', 'Save.'] },
    unlisted: { section: 'status', place: PRODUCT, steps: ['Under Status, choose Active instead of Unlisted.', 'Save.'] },
    hidden_from_search: { section: 'search', place: HERE, steps: [] },
    no_title: { section: 'description', place: PRODUCT, steps: ['Type a title that says what the product is.', 'Save.'] },
    no_image: { section: 'media', place: PRODUCT, steps: ['Under Media, choose Upload new and add a clear photo of the product.', 'Save.'] },
    no_price: { section: 'variants', place: PRODUCT, steps: ['Under Pricing, or on each variant, enter a price above zero.', 'Save.'] },
    not_published: { section: 'status', place: PRODUCT, steps: ['Under Publishing on the right, choose Manage, tick Online Store and confirm.', 'Save.'] },
    no_category: { section: 'category', place: HERE, steps: [] },
    category_too_broad: { section: 'category', place: HERE, steps: [] },
    attributes_missing: { section: 'category', place: HERE, steps: [] },
    gtin_missing: { section: 'variants', place: HERE, steps: [] },
    gtin_invalid: { section: 'variants', place: HERE, steps: [] },
    no_brand: { section: 'organization', place: PRODUCT, steps: ['Under Product organization, enter the brand in Vendor.', 'Save.'] },
    description_short: { section: 'description', place: PRODUCT, steps: [`Under Description, write at least ${MIN_DESCRIPTION_WORDS} words: what it is, who it is for, what it is made of, and how it is used.`, 'Save.'] },
    options_unnamed: { section: 'variants', place: PRODUCT, steps: ['Under Variants, edit each option and give it a name such as Size or Colour.', 'Save.'] },
    split_variants: { section: 'variants', place: { kind: 'admin', path: '/apps/agentic', label: 'Open Sales channels › Agentic' }, steps: ['Make these products variants of one product, or map them under Catalog Mapping.'] },
    seo_title_missing: { section: 'search', place: HERE, steps: [] },
    seo_description_missing: { section: 'search', place: HERE, steps: [] },
    alt_text_missing: { section: 'media', place: HERE, steps: [] },
    image_alt_poor: { section: 'media', place: HERE, steps: [] },
    image_alt_duplicate: { section: 'media', place: HERE, steps: [] },
    image_filename_camera: { section: 'media', place: { kind: 'admin', path: '/content/files', label: 'Open Content › Files' }, steps: ['Open the image and change its name to say what it shows.', 'Save.'] },
    image_too_small: { section: 'media', place: PRODUCT, steps: ['Under Media, upload a larger photo, at least 800 px on its longest side.', 'Save.'] },
};
export function fixGuideFor(code: GapCode, platform: StorePlatformName): FixGuide {
    const base = FIX_GUIDE[code];
    if (platform !== 'woocommerce' || base.place.kind === 'here')
        return base;
    return { section: base.section, place: PRODUCT, steps: ['Make the change above on the product’s edit page.', 'Choose Update.'] };
}
export function descriptionText(html: string | null | undefined): string {
    return (html ?? '')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&rsquo;/g, '’')
        .replace(/\s+/g, ' ')
        .trim();
}
export function wordCount(text: string): number {
    return text ? text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}
export function adminStoreHandle(shopDomain: string | null | undefined): string | null {
    const m = /^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/i.exec((shopDomain ?? '').trim());
    return m ? m[1]!.toLowerCase() : null;
}
const UNNAMED_OPTION = /^option\s*\d+$/i;
export function looksFixedNow(code: GapCode, live: LiveProduct): boolean | null {
    switch (code) {
        case 'no_title':
            return !!live.title?.trim();
        case 'not_active':
        case 'unlisted':
            return live.status === null ? null : live.status.toUpperCase() === 'ACTIVE';
        case 'no_image':
            return live.mediaCount === null ? null : live.mediaCount > 0;
        case 'no_price': {
            const prices = live.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
            return prices.length === 0 ? null : Math.max(...prices) > 0;
        }
        case 'description_short':
            return wordCount(live.description) >= MIN_DESCRIPTION_WORDS;
        case 'no_category':
            return !!live.category;
        case 'gtin_missing':
            if (live.variantsCount === null || live.variants.length < live.variantsCount)
                return null;
            return live.variants.every((v) => !!v.barcode?.trim());
        case 'no_brand':
            return !!live.vendor?.trim();
        case 'options_unnamed':
            return live.options.length === 0 ? null : !live.options.some((o) => UNNAMED_OPTION.test(o.trim()));
        case 'hidden_from_search':
            return !live.hiddenFromSearch;
        case 'seo_title_missing':
            return !!live.seo.title?.trim();
        case 'seo_description_missing':
            return !!live.seo.description?.trim();
        default:
            return null;
    }
}
