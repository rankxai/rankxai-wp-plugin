import type { CataloguePrice, PromptCardRow } from './prompt-card-types';
export const RIVAL_PRICE_MIN_PRICES = 3;
export const RIVAL_PRICE_MIDDLE_HALF_FROM = 8;
export interface RivalPriceRange {
    currency: string;
    lowMinor: number;
    highMinor: number;
    spread: 'middle_half' | 'all';
    prices: number;
    yours: Array<{
        catalogItemId: string;
        title: string;
        priceMinor: number;
    }>;
}
function storeCurrency(catalogue: readonly CataloguePrice[]): string | null {
    const counts = new Map<string, number>();
    for (const item of catalogue) {
        if (item.priceMinor === null || !item.currency)
            continue;
        const c = item.currency.toUpperCase();
        counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: string | null = null;
    for (const [c, n] of counts)
        if (best === null || n > (counts.get(best) ?? 0))
            best = c;
    return best;
}
function quantile(sorted: readonly number[], q: number): number {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}
export function rivalPriceRange(cards: readonly PromptCardRow[], catalogue: readonly CataloguePrice[], fallbackCurrency: string | null = null): RivalPriceRange | null {
    const currency = storeCurrency(catalogue) ?? (fallbackCurrency ? fallbackCurrency.toUpperCase() : null);
    if (!currency)
        return null;
    const rival = cards
        .filter((c) => !c.isAd && c.matchedCatalogItemId === null && c.isOwnStore !== true)
        .filter((c) => c.priceMinor !== null && Number.isFinite(c.priceMinor) && c.priceMinor > 0 && c.currency?.toUpperCase() === currency)
        .map((c) => c.priceMinor as number)
        .sort((a, b) => a - b);
    if (rival.length < RIVAL_PRICE_MIN_PRICES)
        return null;
    const middle = rival.length >= RIVAL_PRICE_MIDDLE_HALF_FROM;
    const byItem = new Map(catalogue.map((i) => [i.catalogItemId, i]));
    const shown = new Set(cards.filter((c) => !c.isAd && c.matchedCatalogItemId !== null).map((c) => c.matchedCatalogItemId as string));
    const yours = [...shown]
        .map((id) => byItem.get(id))
        .filter((i): i is CataloguePrice => !!i && i.priceMinor !== null && i.currency?.toUpperCase() === currency)
        .map((i) => ({ catalogItemId: i.catalogItemId, title: i.title, priceMinor: i.priceMinor as number }))
        .sort((a, b) => a.title.localeCompare(b.title));
    return {
        currency,
        lowMinor: middle ? quantile(rival, 0.25) : rival[0]!,
        highMinor: middle ? quantile(rival, 0.75) : rival[rival.length - 1]!,
        spread: middle ? 'middle_half' : 'all',
        prices: rival.length,
        yours,
    };
}
export function rivalPriceSentence(r: RivalPriceRange, money: (minor: number, currency: string) => string): string {
    const range = r.lowMinor === r.highMinor ? money(r.lowMinor, r.currency) : `${money(r.lowMinor, r.currency)}–${money(r.highMinor, r.currency)}`;
    const who = r.spread === 'middle_half' ? 'Most of the other stores shown' : 'The other stores shown';
    const base = `${who} sold at ${range} (${r.prices} prices).`;
    if (r.yours.length === 0)
        return base;
    if (r.yours.length === 1)
        return `${base} Yours is ${money(r.yours[0]!.priceMinor, r.currency)}.`;
    return `${base} Yours: ${r.yours.slice(0, 3).map((y) => `${y.title} ${money(y.priceMinor, r.currency)}`).join(', ')}${r.yours.length > 3 ? ` and ${r.yours.length - 3} more` : ''}.`;
}
