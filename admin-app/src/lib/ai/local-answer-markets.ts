export const LOCAL_ANSWER_LOCATIONS: Readonly<Record<string, number>> = {
    us: 2840, gb: 2826, uk: 2826, ca: 2124, au: 2036, ie: 2372,
    de: 2276, fr: 2250, es: 2724, it: 2380, nl: 2528,
};
export const FALLBACK_ANSWER_LOCATION = 2840;
export function answersAreLocal(countryCode: string | null | undefined): boolean {
    return (countryCode ?? 'us').toLowerCase() in LOCAL_ANSWER_LOCATIONS;
}
export function answerMarketNote(countryCode: string | null | undefined, countryName: string | null): string | null {
    if (!countryCode || answersAreLocal(countryCode))
        return null;
    const where = countryName ?? 'your country';
    return `AI answers in ${where} cannot be checked locally yet, so your AI answer checks use answers given to shoppers in the United States. They are checked locally in the United States, the United Kingdom, Ireland, Canada, Australia, Germany, France, Spain, Italy and the Netherlands.`;
}
