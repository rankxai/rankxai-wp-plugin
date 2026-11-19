import type { StorePlatformName } from '@/lib/store-app/route-policy-core';
export interface StoreWords {
    platform: string;
    admin: string;
    collection: string;
    collections: string;
    Collections: string;
    homeListingPlace: string;
    fileLibrary: string;
    redirectRule: string;
    agentFilesPublisher: string;
    billing: string;
    billingIssue: string;
    reconnect: string;
    pickerFailed: string;
    productSource: string;
    categorySearch: string;
    imageHost: string;
    trialPromo: string;
    homeListingButton: string;
    pausedBadge: string;
    reconnectBanner: string;
    redirectExample: string;
    livePrice: string;
    storefront: string;
    bulkTips: Readonly<Record<string, string>>;
    files: string;
    filesPlace: string;
    renameImage: string;
}
const SHOPIFY: StoreWords = {
    platform: 'Shopify',
    admin: 'your Shopify admin',
    collection: 'collection',
    collections: 'collections',
    Collections: 'Collections',
    homeListingPlace: 'your Online Store preferences',
    fileLibrary: 'Content › Files in your Shopify admin',
    redirectRule: 'Shopify follows a redirect only then, so an address that still opens a page is refused.',
    agentFilesPublisher: 'the files Shopify publishes for them',
    billing: 'Shopify bills your plan with your store’s bill.',
    billingIssue: 'Credits can be spent again once the billing issue with Shopify is resolved.',
    reconnect: 'Reopen the app from your Shopify admin to connect it again.',
    pickerFailed: 'Shopify’s product picker did not open. Please try again.',
    productSource: 'Shopify',
    categorySearch: 'Search Shopify’s categories',
    imageHost: 'Shopify',
    trialPromo: 'And which stores win. Choose a plan to start your 7-day free trial; Shopify bills you only if you keep it.',
    homeListingButton: 'Edit in Preferences',
    pausedBadge: 'Plan paused by Shopify',
    reconnectBanner: 'Close and reopen RankX AI from your Shopify admin to reconnect.',
    redirectExample: '/collections/all',
    livePrice: 'Shopify shows the live one',
    storefront: 'Online Store',
    files: 'Files',
    filesPlace: 'Content › Files',
    renameImage: 'In Content › Files, open the image and change its URL handle. The image then moves to a new web address, so copies of the old one elsewhere, such as in emails, stop showing it.',
    bulkTips: {
        not_published: 'Many at once: tick them in your products list and use its bulk actions to include them in Online Store.',
        not_active: 'Many at once: tick them in your products list and choose Set as active from its bulk actions.',
    },
};
const WOOCOMMERCE: StoreWords = {
    platform: 'WooCommerce',
    admin: 'your WordPress dashboard',
    collection: 'category',
    collections: 'categories',
    Collections: 'Categories',
    homeListingPlace: 'your SEO plugin’s settings, or Settings › General in WordPress',
    fileLibrary: 'your WordPress Media Library',
    redirectRule: 'A redirect from an address that still opens a page would hide that page, so it is refused.',
    agentFilesPublisher: 'the files your site publishes for them through the RankX AI plugin',
    billing: 'Your plan is billed to your card by RankX AI.',
    billingIssue: 'Credits can be spent again once the payment for your plan goes through. Manage billing to update your card.',
    reconnect: 'Reconnect your store in RankX AI › Settings › WordPress.',
    pickerFailed: 'The product picker did not open. Please try again.',
    productSource: 'your store',
    categorySearch: 'Search your product categories',
    imageHost: 'WordPress',
    trialPromo: 'And which stores win. Choose a plan to start checking.',
    homeListingButton: 'Open WordPress settings',
    pausedBadge: 'Plan paused',
    reconnectBanner: 'Reconnect your store in RankX AI › Settings › WordPress.',
    redirectExample: '/shop/',
    livePrice: 'your store shows the live one',
    storefront: 'shop',
    files: 'Media Library',
    filesPlace: 'Media › Library',
    renameImage: 'WordPress cannot rename an uploaded file, so upload the image again under that name, then replace it on the product.',
    bulkTips: {},
};
export function wordsFor(platform: StorePlatformName): StoreWords {
    return platform === 'woocommerce' ? WOOCOMMERCE : SHOPIFY;
}
