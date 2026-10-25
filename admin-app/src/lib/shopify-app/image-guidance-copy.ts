import type { StorePlatformName } from '@/lib/store-app/route-policy-core';
export const MIN_LONGEST_SIDE = 800;
export const TOO_SMALL_GUIDANCE = `Shopify never enlarges an image, so when a shopper zooms in, a small one is stretched and looks soft. Upload a larger photo of the same view on the product’s page, at least ${MIN_LONGEST_SIDE.toLocaleString('en-US')} px on its longest side: Shopify suggests 2,048 × 2,048 px for square images and Google recommends about 1,500 × 1,500 px.`;
export const OVERSIZED_GUIDANCE = 'Shopify sends shoppers a resized, compressed copy of this file at the size each page needs, so replacing it with a smaller export would not make your pages faster. A large original is fine: it keeps zoom and product images sharp. Replace it only if you want smaller files in your Shopify library.';
export const WOO_TOO_SMALL_GUIDANCE = `A small image is stretched when a shopper zooms in, so it looks soft. Upload a larger photo of the same view on the product’s page, at least ${MIN_LONGEST_SIDE.toLocaleString('en-US')} px on its longest side: Google recommends about 1,500 × 1,500 px.`;
export const WOO_OVERSIZED_GUIDANCE = 'A large original is fine: it keeps zoom sharp, and WordPress makes smaller copies of it for your pages. Replace it only if you want smaller files in your Media Library.';
export function tooSmallGuidance(platform: StorePlatformName): string {
    return platform === 'woocommerce' ? WOO_TOO_SMALL_GUIDANCE : TOO_SMALL_GUIDANCE;
}
export function oversizedGuidance(platform: StorePlatformName): string {
    return platform === 'woocommerce' ? WOO_OVERSIZED_GUIDANCE : OVERSIZED_GUIDANCE;
}
