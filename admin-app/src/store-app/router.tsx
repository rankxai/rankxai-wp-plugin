import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isAppHref, legacyRedirect, matchAppPath, type AppPage } from '@/lib/shopify-app/app-routes-core';
import { host } from './host';
interface RouterValue {
    page: AppPage;
    path: string;
    search: string;
    navigate: (href: string) => void;
}
const RouterContext = createContext<RouterValue | null>(null);
function current(): {
    path: string;
    search: string;
} {
    const loc = host.location();
    const moved = legacyRedirect(loc.path, loc.search);
    if (moved)
        host.replace(moved);
    return host.location();
}
let activeNavigate: ((href: string) => void) | null = null;
export function navigateApp(href: string): boolean {
    if (!activeNavigate || !isAppHref(href))
        return false;
    activeNavigate(href);
    return true;
}
export function RouterProvider({ children }: {
    children: ReactNode;
}) {
    const [loc, setLoc] = useState(current);
    const navigate = useCallback((href: string) => {
        if (!isAppHref(href))
            return;
        const go = () => {
            const given = new URL(href, 'https://app.invalid');
            const url = new URL(legacyRedirect(given.pathname, given.search) ?? given.pathname + given.search, 'https://app.invalid');
            const now = host.location();
            if (url.pathname + url.search !== now.path + now.search)
                host.push(url.pathname + url.search);
            setLoc(current());
            window.scrollTo(0, 0);
        };
        void (async () => {
            await host.leaveConfirmation();
            go();
        })();
    }, []);
    useEffect(() => {
        activeNavigate = navigate;
        const stop = host.watch({ onLocation: () => setLoc(current()), onNavigate: (href) => isAppHref(href) && navigate(href) });
        return () => {
            stop();
            if (activeNavigate === navigate)
                activeNavigate = null;
        };
    }, [navigate]);
    const value: RouterValue = { page: matchAppPath(loc.path, loc.search, { aiOrders: host.platform === 'woocommerce' }), path: loc.path, search: loc.search, navigate };
    return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}
export function useRouter(): RouterValue {
    const v = useContext(RouterContext);
    if (!v)
        throw new Error('useRouter outside RouterProvider');
    return v;
}
