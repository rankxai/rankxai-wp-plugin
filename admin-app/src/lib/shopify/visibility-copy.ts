export type VisibilityCause = 'not_published_online_store' | 'status_draft' | 'status_archived' | 'out_of_stock_everywhere';
export const VISIBILITY_COPY: Record<VisibilityCause, {
    title: string;
    why: string;
    remedy: string;
    impact: number;
}> = {
    not_published_online_store: {
        title: 'Not published to your online store',
        why: 'A product that is not on your storefront has no public page, so nothing can link to it, index it or quote it.',
        remedy: 'Open the product in Shopify, and under Publishing add the Online Store sales channel.',
        impact: 100,
    },
    status_draft: {
        title: 'Still a draft',
        why: 'A draft product is invisible to everyone, including you when you are signed out.',
        remedy: 'Open the product in Shopify and set its status to Active.',
        impact: 95,
    },
    status_archived: {
        title: 'Archived',
        why: 'An archived product is kept for your records but removed from the storefront.',
        remedy: 'If you still sell this, open it in Shopify and set its status to Active.',
        impact: 90,
    },
    out_of_stock_everywhere: {
        title: 'Out of stock in every option',
        why: 'Shopify excludes products with no available stock from the catalogue it syndicates, so this one is not offered to assistants at all.',
        remedy: 'Restock it, or allow overselling if you can still fulfil orders.',
        impact: 70,
    },
};
