export interface PromptCardRow {
    checkId: string;
    position: number | null;
    title: string | null;
    priceMinor: number | null;
    currency: string | null;
    seller: string | null;
    merchants: string | null;
    matchedCatalogItemId: string | null;
    isOwnStore: boolean | null;
    isAd: boolean;
    ratingValue: number | null;
    ratingVotes: number | null;
    imageUrl: string | null;
    url: string | null;
    reason?: string | null;
}
export interface CataloguePrice {
    catalogItemId: string;
    title: string;
    priceMinor: number | null;
    currency: string | null;
}
