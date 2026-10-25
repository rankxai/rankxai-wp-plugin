import type { StorePlatformName } from '@/lib/store-app/route-policy-core';
export interface StoreRating {
    value: number;
    count: number | null;
}
export const RATINGS_MIN_RIVALS = 3;
export type RatingsGap = {
    state: 'no_rating';
} | {
    state: 'not_enough';
    rivals: number;
    own: StoreRating;
} | {
    state: 'compare';
    own: StoreRating;
    rivalMedian: number;
    rivalMedianVotes: number | null;
    rivals: number;
};
export function ratingsGapSentence(g: RatingsGap, fmt: (n: number) => string = (n) => String(n), platform: StorePlatformName = 'shopify'): string {
    if (g.state === 'no_rating') {
        return platform === 'woocommerce'
            ? 'This product has no rating yet, so there is nothing to compare. Product reviews (WooCommerce’s own, or a review plugin) collect the rating that shopping answers read.'
            : 'This product has no rating from a review app, so there is nothing to compare. A review app (from the Shopify App Store) collects reviews and shows the rating that shopping answers read.';
    }
    const own = `${g.own.value.toFixed(1)} stars${g.own.count !== null ? ` from ${fmt(g.own.count)} reviews` : ''}`;
    if (g.state === 'not_enough')
        return `Your rating: ${own}. Fewer than ${RATINGS_MIN_RIVALS} of the other stores’ cards in these answers carried a rating, so there is nothing to compare yet.`;
    const theirs = `${g.rivalMedian.toFixed(1)} stars${g.rivalMedianVotes !== null ? ` from ${fmt(g.rivalMedianVotes)} reviews` : ''}`;
    return `Your rating: ${own}. The other stores’ rated products in these answers: typically ${theirs} (median of ${fmt(g.rivals)} cards).`;
}
