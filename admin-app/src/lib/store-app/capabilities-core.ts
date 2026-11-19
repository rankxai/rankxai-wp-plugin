import { STORE_APP_ROUTE_POLICY, platformVerdict, type StorePlatformName } from './route-policy-core';
export const CAPABILITY_ROUTES = {
    attributeValues: ['GET', 'catalogue/attributes'],
    themeEmbed: ['GET', 'readiness/structured-data'],
    newBlog: ['POST', 'blog/blogs'],
    setupStart: ['POST', 'setup/start'],
    googleConnect: ['POST', 'google/connect'],
} as const satisfies Record<string, readonly [
    string,
    string
]>;
export type CapabilityName = keyof typeof CAPABILITY_ROUTES;
export interface StoreCapabilities {
    platform: StorePlatformName;
    canSpend: boolean;
    aiOrders: 'customer_journey' | 'store_revenue';
    agentFiles: 'publish' | 'read';
    rules: StorePlatformName;
    can: Record<CapabilityName, boolean>;
    why: Partial<Record<CapabilityName, string>>;
}
export function storeCapabilities(platform: StorePlatformName, canSpend: boolean): StoreCapabilities {
    const can = {} as Record<CapabilityName, boolean>;
    const why: Partial<Record<CapabilityName, string>> = {};
    for (const name of Object.keys(CAPABILITY_ROUTES) as CapabilityName[]) {
        const [method, pattern] = CAPABILITY_ROUTES[name];
        const v = platformVerdict(platform, method, pattern);
        can[name] = v.ok;
        if (!v.ok)
            why[name] = v.error;
    }
    return {
        platform,
        canSpend,
        aiOrders: platform === 'woocommerce' ? 'store_revenue' : 'customer_journey',
        agentFiles: platform === 'woocommerce' ? 'publish' : 'read',
        rules: platform,
        can,
        why,
    };
}
export function servesDataPath(platform: StorePlatformName, dataPath: string): boolean {
    const segments = dataPath.split('?')[0]!.split('/').filter(Boolean);
    const matches = Object.keys(STORE_APP_ROUTE_POLICY)
        .filter((k) => k.startsWith('GET '))
        .map((k) => k.slice(4))
        .filter((p) => {
        const parts = p.split('/');
        return parts.length === segments.length && parts.every((x, i) => x.startsWith(':') || x === segments[i]);
    })
        .sort((a, b) => a.split(':').length - b.split(':').length);
    return matches.length === 0 || platformVerdict(platform, 'GET', matches[0]!).ok;
}
