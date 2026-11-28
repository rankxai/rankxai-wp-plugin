export const PRICES_IN_USD_NOTE = 'Prices are in US dollars. Shopify shows them and bills you in your store’s currency.';
export function usdPerMonth(cents: number | null): string {
    if (cents === null)
        return '';
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} USD/month`;
}
export const REINSTALL_TRIAL_NOTE = 'Your free trial continues from when RankX AI was first installed on this store. Trial credits are given once per store, so reinstalling did not add any.';
export function trialCreditsBeforeThisInstall(trialGrantedAt: string | null, lastInstalledAt: string | null): boolean {
    if (!trialGrantedAt || !lastInstalledAt)
        return false;
    return Date.parse(trialGrantedAt) < Date.parse(lastInstalledAt);
}
