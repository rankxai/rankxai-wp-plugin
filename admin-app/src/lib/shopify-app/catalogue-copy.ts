export type Channel = 'catalog' | 'google';
export const CHANNELS: readonly Channel[] = ['catalog', 'google'];
export const CHANNEL_LABEL: Record<Channel, {
    name: string;
    feeds: string;
}> = {
    catalog: { name: 'ChatGPT', feeds: 'Through Shopify’s product catalog' },
    google: { name: 'Google', feeds: 'Google AI Mode, AI Overviews and Gemini' },
};
export type BlockCode = 'store_password' | 'not_active' | 'unlisted' | 'hidden_from_search' | 'no_title' | 'no_image' | 'no_price' | 'not_published' | 'crawler_blocked';
export type UnknownCode = 'store_password_unread' | 'status_unread' | 'hidden_unread' | 'images_unread' | 'price_unread' | 'published_unread' | 'other_storefront' | 'crawler_unread';
export const STORE_LEVEL_BLOCKS: ReadonlySet<BlockCode> = new Set<BlockCode>(['store_password', 'crawler_blocked']);
export const STORE_LEVEL_UNKNOWNS: ReadonlySet<UnknownCode> = new Set<UnknownCode>(['store_password_unread', 'crawler_unread']);
export interface ChannelVerdict {
    verdict: 'clear' | 'blocked' | 'unknown';
    blocks: BlockCode[];
    unknowns: UnknownCode[];
}
export type Eligibility = Record<Channel, ChannelVerdict>;
export type GapCode = 'not_active' | 'unlisted' | 'hidden_from_search' | 'no_title' | 'no_image' | 'no_price' | 'not_published' | 'no_category' | 'category_too_broad' | 'attributes_missing' | 'gtin_missing' | 'gtin_invalid' | 'no_brand' | 'description_short' | 'options_unnamed' | 'split_variants' | 'seo_title_missing' | 'seo_description_missing' | 'alt_text_missing' | 'image_alt_poor' | 'image_alt_duplicate' | 'image_filename_camera' | 'image_too_small';
export type GapGroup = 'cant_be_shown' | 'missing_details' | 'search_basics' | 'images';
export interface Gap {
    code: GapCode;
    detail?: {
        attributes?: string[];
        variants?: number;
        images?: number;
    };
}
export const GAP_META: Record<GapCode, {
    group: GapGroup;
    severity: number;
    effort: number;
}> = {
    not_active: { group: 'cant_be_shown', severity: 100, effort: 1 },
    unlisted: { group: 'cant_be_shown', severity: 100, effort: 1 },
    hidden_from_search: { group: 'cant_be_shown', severity: 100, effort: 1 },
    no_title: { group: 'cant_be_shown', severity: 100, effort: 1 },
    no_image: { group: 'cant_be_shown', severity: 100, effort: 3 },
    no_price: { group: 'cant_be_shown', severity: 100, effort: 2 },
    not_published: { group: 'cant_be_shown', severity: 100, effort: 1 },
    no_category: { group: 'missing_details', severity: 40, effort: 1 },
    category_too_broad: { group: 'missing_details', severity: 15, effort: 1 },
    attributes_missing: { group: 'missing_details', severity: 15, effort: 2 },
    gtin_missing: { group: 'missing_details', severity: 40, effort: 2 },
    gtin_invalid: { group: 'missing_details', severity: 40, effort: 2 },
    no_brand: { group: 'missing_details', severity: 15, effort: 1 },
    description_short: { group: 'missing_details', severity: 15, effort: 3 },
    options_unnamed: { group: 'missing_details', severity: 5, effort: 1 },
    split_variants: { group: 'missing_details', severity: 15, effort: 2 },
    seo_title_missing: { group: 'search_basics', severity: 5, effort: 1 },
    seo_description_missing: { group: 'search_basics', severity: 5, effort: 1 },
    alt_text_missing: { group: 'images', severity: 5, effort: 1 },
    image_alt_poor: { group: 'images', severity: 4, effort: 1 },
    image_alt_duplicate: { group: 'images', severity: 2, effort: 1 },
    image_filename_camera: { group: 'images', severity: 2, effort: 1 },
    image_too_small: { group: 'images', severity: 4, effort: 3 },
};
export const MIN_DESCRIPTION_WORDS = 50;
export const GAP_COPY: Record<GapCode, {
    title: string;
    fix: string;
}> = {
    not_active: { title: 'Draft or archived', fix: 'Set the product’s status to Active.' },
    unlisted: { title: 'Unlisted', fix: 'Set the product to Active. An unlisted product is kept out of search, every AI shopping channel and your own store search.' },
    hidden_from_search: { title: 'Hidden from search engines and AI shopping', fix: 'Show the product to search engines again. While it is hidden, Shopify keeps it out of every AI shopping channel too.' },
    no_title: { title: 'No title', fix: 'Give the product a title.' },
    no_image: { title: 'No image', fix: 'Add at least one photo of the product.' },
    no_price: { title: 'No price', fix: 'Set a price above zero.' },
    not_published: { title: 'Not published to your online store', fix: 'Publish the product to your Online Store sales channel.' },
    no_category: { title: 'No product category', fix: 'Choose the category that describes the product.' },
    category_too_broad: { title: 'Category too broad', fix: 'Choose a more specific category, so Shopify can ask for the right details.' },
    attributes_missing: { title: 'Missing details shoppers ask about', fix: 'Choose them from Shopify’s list for the category, for example material or size. Set details on each product below.' },
    gtin_missing: { title: 'No barcode', fix: 'Add the barcode printed on the product (UPC, EAN or ISBN).' },
    gtin_invalid: { title: 'Barcode is not valid', fix: 'Correct the barcode: its check digit does not match.' },
    no_brand: { title: 'No brand', fix: 'Set the vendor (brand).' },
    description_short: { title: 'Short description', fix: `Describe the product in at least ${MIN_DESCRIPTION_WORDS} words: what it is, who it is for, what it is made of.` },
    options_unnamed: { title: 'Options without names', fix: 'Name the options (for example Size or Colour) instead of "Option 1".' },
    split_variants: { title: 'Looks like variants of one product', fix: 'These products share a name and differ only after a dash or slash. AI shopping groups variants of one product; make them variants of one product, or map them in Catalog Mapping (Sales channels › Agentic).' },
    seo_title_missing: { title: 'No search title', fix: 'Write a search title.' },
    seo_description_missing: { title: 'No search description', fix: 'Write a search description.' },
    alt_text_missing: { title: 'Images without alt text', fix: 'Describe each image in a few words. Screen readers, image search and AI assistants read it.' },
    image_alt_poor: { title: 'Alt text that does not describe the image', fix: 'Replace it with a few words saying what the picture shows, such as the colour, the angle or the product in use.' },
    image_alt_duplicate: { title: 'Several images with the same alt text', fix: 'Give each image its own words, so each picture is described.' },
    image_filename_camera: { title: 'File names that do not describe the image', fix: 'Rename the file to say what it shows, for example blue-wool-runner.jpg. Search engines read file names.' },
    image_too_small: { title: 'Images too small to look sharp', fix: 'Shopify never enlarges an image, so when a shopper zooms in, a small one looks soft. Upload a larger photo, at least 800 px on its longest side (Shopify suggests 2,048 × 2,048 px for square images). From 31 January 2027 Google Shopping requires product images of at least 500 × 500 px.' },
};
