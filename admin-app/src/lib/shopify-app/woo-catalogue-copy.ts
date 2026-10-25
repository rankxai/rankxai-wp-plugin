import { CHANNEL_LABEL, GAP_COPY, type Channel, type GapCode } from './catalogue-copy';
export type CataloguePlatform = 'shopify' | 'woocommerce';
export const WOO_CHANNEL_LABEL: Record<Channel, {
    name: string;
    feeds: string;
}> = {
    catalog: { name: 'ChatGPT', feeds: 'From your product pages' },
    google: { name: 'Google', feeds: 'Google AI Mode, AI Overviews and Gemini' },
};
export function channelLabelFor(platform: CataloguePlatform): Record<Channel, {
    name: string;
    feeds: string;
}> {
    return platform === 'woocommerce' ? WOO_CHANNEL_LABEL : CHANNEL_LABEL;
}
export const WOO_GAP_COPY: Record<GapCode, {
    title: string;
    fix: string;
}> = {
    not_active: { title: 'Not published', fix: 'Publish the product (it is a draft, pending review or private).' },
    unlisted: { title: 'Hidden from your shop', fix: 'Set Catalog visibility to “Shop and search results” (Product data › Publish › Catalog visibility).' },
    hidden_from_search: { title: 'Hidden from search engines and AI shopping', fix: 'Turn off “noindex” for the product in your SEO plugin, so search engines and AI shopping assistants can show it.' },
    no_title: { title: 'No title', fix: 'Give the product a title.' },
    no_image: { title: 'No image', fix: 'Add a product image.' },
    no_price: { title: 'No price', fix: 'Set a regular price above zero (or one on each variation).' },
    not_published: { title: 'Password-protected', fix: 'Remove the product’s password (Publish › Visibility), so shoppers and AI assistants can see it.' },
    no_category: { title: 'No product category', fix: 'Choose the category that describes the product instead of “Uncategorized”.' },
    category_too_broad: { title: 'Category too broad', fix: 'Choose a more specific category.' },
    attributes_missing: { title: 'Missing details shoppers ask about', fix: 'Add attributes such as material or size.' },
    gtin_missing: { title: 'No barcode', fix: 'Add the barcode printed on the product (GTIN, UPC, EAN or ISBN) in the GTIN field, on each variation for a variable product.' },
    gtin_invalid: { title: 'Barcode is not valid', fix: 'Correct the barcode: its check digit does not match.' },
    no_brand: { title: 'No brand', fix: 'Assign a brand (Products › Brands). WooCommerce then adds it to the product’s structured data.' },
    description_short: { title: 'Short description', fix: 'Describe the product in at least 50 words: what it is, who it is for, what it is made of.' },
    options_unnamed: { title: 'Options without names', fix: 'Name each attribute.' },
    split_variants: { title: 'Looks like variants of one product', fix: 'These products share a name and differ only after a dash or slash. AI shopping groups variants of one product; make them one variable product with a variation for each.' },
    seo_title_missing: { title: 'No search title', fix: 'Write a search title for the product.' },
    seo_description_missing: { title: 'No search description', fix: 'Write a search description for the product.' },
    alt_text_missing: { title: 'Images without alt text', fix: 'Describe each image in a few words. Screen readers, image search and AI assistants read it.' },
    image_alt_poor: { title: 'Alt text that does not describe the image', fix: 'Replace it with a few words saying what the picture shows, such as the colour, the angle or the product in use.' },
    image_alt_duplicate: { title: 'Several images with the same alt text', fix: 'Give each image its own words, so each picture is described.' },
    image_filename_camera: { title: 'File names that do not describe the image', fix: 'WordPress cannot rename an uploaded file, so upload the image again under a name that says what it shows (for example blue-wool-runner.jpg), then replace it on the product.' },
    image_too_small: { title: 'Images too small to look sharp', fix: 'Upload a larger photo, at least 800 px on its longest side. From 31 January 2027 Google Shopping requires product images of at least 500 × 500 px.' },
};
export function gapCopyFor(platform: CataloguePlatform): Record<GapCode, {
    title: string;
    fix: string;
}> {
    return platform === 'woocommerce' ? WOO_GAP_COPY : GAP_COPY;
}
