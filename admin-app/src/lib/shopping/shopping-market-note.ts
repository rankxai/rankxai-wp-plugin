export const SHOPPING_SURFACES_ASKED_IN_US: Readonly<Record<string, readonly ('chatgpt' | 'google_ai_mode')[]>> = {
    CN: ['chatgpt'],
    HK: ['chatgpt'],
    RU: ['chatgpt', 'google_ai_mode'],
};
const SURFACE_LABEL = { chatgpt: 'ChatGPT', google_ai_mode: 'Google AI Mode' } as const;
export function shoppingSurfacesAskedInUs(countryCode: string | null | undefined): Array<'chatgpt' | 'google_ai_mode'> {
    const cc = countryCode?.trim().toUpperCase();
    return cc ? [...(SHOPPING_SURFACES_ASKED_IN_US[cc] ?? [])] : [];
}
export function shoppingMarketNote(countryCode: string | null | undefined, countryName: string | null): string | null {
    const surfaces = shoppingSurfacesAskedInUs(countryCode);
    if (surfaces.length === 0)
        return null;
    const names = surfaces.map((s) => SURFACE_LABEL[s]).join(' and ');
    return `${names} shopping answers cannot be checked in ${countryName ?? 'your country'} yet, so those checks use the answers given to shoppers in the United States.`;
}
