import type { StoreHost } from '../../host-types';
import { confirmLeave, hasUnsavedChanges, pushToast } from './registries';
import { appPathFromHash, hashFromAppPath, wpAdminHref } from './hash-route';
import { sessionExpiry } from './session-expiry';
import { WP_ADMIN_SCHEME, adminLinkFor, adminTargetFromPath } from '@/lib/store-app/admin-target-core';
export interface WordPressStoreConfig {
    apiBase: string;
    sessionUrl: string;
    nonce: string;
    pageUrl: string;
    adminUrl: string;
    locale: string | null;
}
function readConfig(): WordPressStoreConfig {
    const fallback: WordPressStoreConfig = { apiBase: '', sessionUrl: '', nonce: '', pageUrl: 'admin.php?page=rankxai-store', adminUrl: '', locale: null };
    if (typeof document === 'undefined')
        return fallback;
    try {
        const raw = document.getElementById('rx-store-config')?.textContent;
        return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<WordPressStoreConfig>) } : fallback;
    }
    catch {
        return fallback;
    }
}
export const config = readConfig();
interface Session {
    token: string;
    expiresAt: number;
}
let session: Session | null = null;
let pending: Promise<string | null> | null = null;
let mintedAt = 0;
async function sessionToken(force = false): Promise<string | null> {
    if (!force && session && Date.now() < session.expiresAt - 60000)
        return session.token;
    if (force && session && Date.now() - mintedAt < 5000)
        return session.token;
    pending ??= (async () => {
        try {
            const headers: Record<string, string> = { 'X-WP-Nonce': config.nonce };
            if (force)
                headers['X-RankXAI-Renew'] = '1';
            const res = await fetch(config.sessionUrl, { method: 'POST', credentials: 'same-origin', headers });
            const json = res.ok ? ((await res.json()) as {
                token?: unknown;
                expiresAt?: unknown;
                expiresIn?: unknown;
            }) : null;
            if (json && typeof json.token === 'string' && json.token.startsWith('rxws_')) {
                const receivedAt = Date.now();
                session = { token: json.token, expiresAt: sessionExpiry(json, receivedAt) };
                mintedAt = receivedAt;
            }
            else {
                session = null;
            }
        }
        catch {
            session = null;
        }
        finally {
            pending = null;
        }
        return session?.token ?? null;
    })();
    return pending;
}
const bearer = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});
let lastHash = '';
export const host: StoreHost = {
    name: 'wordpress',
    platform: 'woocommerce',
    authorize: async () => bearer(await sessionToken()),
    retryUnauthorized: async () => {
        const fresh = await sessionToken(true);
        return fresh ? bearer(fresh) : null;
    },
    requiresCredentials: true,
    sessionEndedMessage: 'Your RankX AI session ended. Reload this page; if it keeps happening, reconnect your store in RankX AI › Settings.',
    location: () => appPathFromHash(window.location.hash),
    push: (appPath) => {
        window.history.pushState(null, '', hashFromAppPath(appPath));
        lastHash = window.location.hash;
    },
    replace: (appPath) => {
        window.history.replaceState(window.history.state, '', hashFromAppPath(appPath));
        lastHash = window.location.hash;
    },
    watch: ({ onLocation }) => {
        lastHash = window.location.hash;
        const onChange = () => {
            if (window.location.hash === lastHash)
                return;
            if (!hasUnsavedChanges()) {
                lastHash = window.location.hash;
                onLocation();
                return;
            }
            const wanted = window.location.hash;
            window.history.pushState(null, '', lastHash);
            void confirmLeave().then((leave) => {
                if (!leave)
                    return;
                window.history.pushState(null, '', wanted);
                lastHash = wanted;
                onLocation();
            });
        };
        window.addEventListener('popstate', onChange);
        window.addEventListener('hashchange', onChange);
        const beforeUnload = (e: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges())
                return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => {
            window.removeEventListener('popstate', onChange);
            window.removeEventListener('hashchange', onChange);
            window.removeEventListener('beforeunload', beforeUnload);
        };
    },
    toHref: (appPath) => `${config.pageUrl}${hashFromAppPath(appPath)}`,
    leaveConfirmation: () => new Promise<void>((resolve) => void confirmLeave().then((leave) => leave && resolve())),
    toast: (message) => pushToast(message),
    pickProducts: async (opts) => {
        const { pickProducts } = await import('./picker');
        return pickProducts(opts);
    },
    adminHref: (path) => {
        if (/^https?:\/\//i.test(path))
            return { href: path, target: '_blank' };
        if (path.startsWith(WP_ADMIN_SCHEME))
            return { href: wpAdminHref(config.adminUrl, path.slice(WP_ADMIN_SCHEME.length)) ?? config.adminUrl, target: '_blank' };
        const target = adminTargetFromPath(path);
        const link = target ? adminLinkFor('woocommerce', target) : null;
        if (link)
            return { href: wpAdminHref(config.adminUrl, link.slice(WP_ADMIN_SCHEME.length)) ?? config.adminUrl, target: '_blank' };
        if (/^[a-z-]+\.php(?:\?|$)/.test(path))
            return { href: wpAdminHref(config.adminUrl, path) ?? config.adminUrl, target: '_blank' };
        return { href: config.adminUrl, target: '_blank' };
    },
    openPlanPage: (url) => void window.open(url, '_blank', 'noopener'),
    locale: () => (config.locale ? config.locale.replace(/_/g, '-') : null),
};
