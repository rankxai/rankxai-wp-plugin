export function resolveOnHostRedirectPath(input: string, shopHosts: readonly string[], noun: 'store' | 'site' = 'store'): {
    ok: true;
    path: string;
} | {
    ok: false;
    reason: string;
    host: string | null;
} {
    const raw = input.trim();
    if (raw === '')
        return { ok: false, reason: 'a redirect needs somewhere to point', host: null };
    if (shopHosts.length === 0) {
        return { ok: false, reason: `this ${noun}’s own addresses are not known, so nothing can be checked against them`, host: null };
    }
    let u: URL;
    try {
        u = new URL(raw, `https://${shopHosts[0]}/`);
    }
    catch {
        return { ok: false, reason: 'that target is not a valid URL', host: null };
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        return { ok: false, reason: 'that target would send visitors to another site', host: null };
    }
    const host = u.hostname.toLowerCase();
    if (!shopHosts.some((h) => h.toLowerCase() === host)) {
        return {
            ok: false,
            reason: `refusing to redirect to ${host} — a redirect on your own domain may only point back at your own ${noun}`,
            host,
        };
    }
    return { ok: true, path: (u.pathname + (u.search || '')) || '/' };
}
export function decodePercent(value: string): string {
    return value.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
        try {
            return decodeURIComponent(run);
        }
        catch {
            return run;
        }
    });
}
function splitAddress(value: string): {
    path: string;
    query: string;
} {
    const raw = value.trim().split('#')[0]!;
    const at = raw.indexOf('?');
    return at < 0 ? { path: raw, query: '' } : { path: raw.slice(0, at), query: raw.slice(at) };
}
function fold(value: string): string {
    return decodePercent(value).normalize('NFC').toLowerCase();
}
function pathKey(path: string): string {
    const folded = fold(path);
    return folded.length > 1 ? folded.replace(/\/+$/, '') || '/' : folded;
}
export function redirectAddressKey(value: string): string {
    const { path, query } = splitAddress(value);
    return query === '' ? pathKey(path) : `${pathKey(path)}\u0000${fold(query)}`;
}
export function sameRedirectAddress(a: string, b: string): boolean {
    return redirectAddressKey(a) === redirectAddressKey(b);
}
export function sameRedirectPage(a: string, b: string): boolean {
    return pathKey(splitAddress(a).path) === pathKey(splitAddress(b).path);
}
