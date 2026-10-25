const APP_BASE = '/shopify';
export function appPathFromHash(hash: string): {
    path: string;
    search: string;
} {
    const raw = hash.replace(/^#/, '') || '/';
    const q = raw.indexOf('?');
    const rest = q >= 0 ? raw.slice(0, q) : raw;
    const search = q >= 0 ? raw.slice(q) : '';
    const clean = `/${rest.replace(/^\/+/, '')}`.replace(/\/+$/, '');
    return { path: clean === '' || clean === '/' ? APP_BASE : `${APP_BASE}${clean}`, search };
}
export function hashFromAppPath(appPath: string): string {
    const rest = appPath.startsWith(APP_BASE) ? appPath.slice(APP_BASE.length) : appPath;
    return `#${rest.startsWith('/') ? rest : `/${rest}`}`;
}
const SAFE_SCHEME = /^(?:https?|mailto|tel):/i;
export function hrefKind(href: string): 'web' | 'other' | 'unsafe' {
    let start = 0;
    while (start < href.length && href.charCodeAt(start) <= 0x20)
        start++;
    const bare = href.slice(start).replace(/[\t\n\r]/g, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(bare))
        return SAFE_SCHEME.test(bare) ? (/^https?:/i.test(bare) ? 'web' : 'other') : 'unsafe';
    return 'other';
}
export function wpAdminHref(adminUrl: string, rest: string): string | null {
    if (!adminUrl)
        return null;
    let base: URL;
    let to: URL;
    try {
        base = new URL(adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`);
        to = new URL(rest, base);
    }
    catch {
        return null;
    }
    if (to.origin !== base.origin || !to.pathname.startsWith(base.pathname))
        return null;
    return to.href;
}
