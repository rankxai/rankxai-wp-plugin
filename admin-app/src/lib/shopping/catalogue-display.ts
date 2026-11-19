import { minorUnitExponent } from './catalogue-item';
import type { DeactivationWithheldReason } from './catalogue-sync-reasons';
export type { DeactivationWithheldReason };
const WITHHELD_COPY: Record<DeactivationWithheldReason, string> = {
    incomplete_read: 'The source could not be read in full, so products missing from it were kept rather than retired. Your catalogue may still list products the source no longer has.',
    unstable_identity: 'This source identifies products by name only, so a renamed product is indistinguishable from a removed one. Nothing was retired. Add an ID column to your file to enable this.',
};
export function deactivationWithheldCopy(reason: string): string {
    return (WITHHELD_COPY[reason as DeactivationWithheldReason] ??
        'Some products were kept rather than retired because this run could not safely confirm they were gone.');
}
const SOURCE_LABELS: Record<string, string> = {
    woocommerce: 'WooCommerce',
    csv: 'File import',
    gmc_feed: 'Merchant Center feed',
    shopify: 'Shopify',
    manual: 'Added by hand',
    crawl: 'Your product pages',
    gmc_feed_url: 'Your Merchant Center feed',
};
export function sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? source;
}
export function formatPrice(minor: number | null | undefined, currency: string | null | undefined, locale?: string): string {
    if (minor === null || minor === undefined)
        return '—';
    const exponent = minorUnitExponent(currency);
    if (exponent === null)
        return '—';
    const major = minor / 10 ** exponent;
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency!.trim().toUpperCase() }).format(major);
    }
    catch {
        return `${major.toFixed(exponent)} ${currency!.trim().toUpperCase()}`;
    }
}
export function hostLabel(siteUrl: string): string {
    try {
        return new URL(siteUrl).hostname;
    }
    catch {
        return siteUrl.replace(/^[a-z]+:\/\//i, '').replace(/[/?#].*$/, '');
    }
}
