import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
export type WebLinks = Record<string, string>;
export function webLinksFor(appUrl: string, projectId: string): WebLinks {
    const base = appUrl.replace(/\/+$/, '');
    const at = (path: string) => `${base}${path}?project=${encodeURIComponent(projectId)}`;
    return {
        [APP_PATHS.home]: at('/overview'),
        [APP_PATHS.aiVisibility]: at('/shopping'),
        [APP_PATHS.products]: at('/shopping/products'),
        [APP_PATHS.productImages]: at('/shopping/products'),
        [APP_PATHS.search]: at('/search-rankings'),
        [APP_PATHS.blog]: at('/content-studio'),
        [APP_PATHS.settings]: at('/settings/integrations'),
        [APP_PATHS.plan]: `${base}/settings/billing`,
    };
}
export function webLinkForPath(links: WebLinks | null | undefined, path: string): string | null {
    if (!links)
        return null;
    let best: string | null = null;
    for (const key of Object.keys(links)) {
        if ((path === key || path.startsWith(`${key}/`)) && (!best || key.length > best.length))
            best = key;
    }
    return links[best ?? APP_PATHS.home] ?? null;
}
