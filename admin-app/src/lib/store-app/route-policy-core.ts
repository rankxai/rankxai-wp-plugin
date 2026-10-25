export type StorePlatformName = 'shopify' | 'woocommerce';
export type RouteClass = 'read' | 'write' | 'spend';
export type WooSupport = {
    routeClass: RouteClass;
    woo: 'ready';
} | {
    routeClass: RouteClass;
    woo: 'pending';
    phase: string;
} | {
    routeClass: RouteClass;
    woo: 'none';
    reason: string;
};
export const STORE_APP_ROUTE_POLICY: Record<string, WooSupport> = {
    "GET overview": { routeClass: 'read', woo: 'ready' },
    "GET content": { routeClass: 'read', woo: 'ready' },
    "GET content/items/:type/:num": { routeClass: 'read', woo: 'ready' },
    "POST content/upgrades": { routeClass: 'spend', woo: 'ready' },
    "POST content/upgrades/apply-all": { routeClass: 'write', woo: 'ready' },
    "GET content/upgrades/:id": { routeClass: 'read', woo: 'ready' },
    "POST content/upgrades/:id/apply": { routeClass: 'write', woo: 'ready' },
    "POST content/upgrades/:id/discard": { routeClass: 'write', woo: 'ready' },
    "GET setup": { routeClass: 'read', woo: 'ready' },
    "GET setup/suggestions": { routeClass: 'read', woo: 'ready' },
    "POST setup/start": { routeClass: 'write', woo: 'none', reason: 'Your store is set up during onboarding, so there is nothing to start here.' },
    "GET shopping": { routeClass: 'read', woo: 'ready' },
    "POST shopping/products": { routeClass: 'write', woo: 'ready' },
    "DELETE shopping/products/:id": { routeClass: 'write', woo: 'ready' },
    "GET shopping/products/:id/prices": { routeClass: 'read', woo: 'ready' },
    "POST shopping/questions": { routeClass: 'spend', woo: 'ready' },
    "POST shopping/questions/generate": { routeClass: 'spend', woo: 'ready' },
    "GET shopping/questions/:id": { routeClass: 'read', woo: 'ready' },
    "GET shopping/buyer-queries": { routeClass: 'read', woo: 'ready' },
    "GET shopping/buyer-queries/:id": { routeClass: 'read', woo: 'ready' },
    "PATCH shopping/questions/:id/classification": { routeClass: 'write', woo: 'ready' },
    "DELETE shopping/questions/:id": { routeClass: 'write', woo: 'ready' },
    "POST shopping/questions/:id/resume": { routeClass: 'write', woo: 'ready' },
    "POST shopping/questions/:id/check": { routeClass: 'spend', woo: 'ready' },
    "POST shopping/diagnoses": { routeClass: 'spend', woo: 'ready' },
    "GET shopping/diagnoses/:id": { routeClass: 'read', woo: 'ready' },
    "POST shopping/rewrites": { routeClass: 'spend', woo: 'ready' },
    "POST shopping/rewrites/:id/apply": { routeClass: 'write', woo: 'ready' },
    "GET shopper-questions": { routeClass: 'read', woo: 'ready' },
    "POST shopper-questions": { routeClass: 'spend', woo: 'ready' },
    "POST shopper-questions/:id/check": { routeClass: 'spend', woo: 'ready' },
    "POST shopper-questions/:id/stop": { routeClass: 'write', woo: 'ready' },
    "POST shopper-questions/:id/resume": { routeClass: 'write', woo: 'ready' },
    "GET answers": { routeClass: 'read', woo: 'ready' },
    "GET competitors": { routeClass: 'read', woo: 'ready' },
    "POST answers/questions": { routeClass: 'spend', woo: 'ready' },
    "GET answers/questions/:id": { routeClass: 'read', woo: 'ready' },
    "GET answers/questions/:id/answer/:answerId": { routeClass: 'read', woo: 'ready' },
    "GET answers/questions/:id/details": { routeClass: 'read', woo: 'ready' },
    "DELETE answers/questions/:id": { routeClass: 'write', woo: 'ready' },
    "POST answers/questions/:id/check": { routeClass: 'spend', woo: 'ready' },
    "POST answers/questions/:id/resume": { routeClass: 'write', woo: 'ready' },
    "GET store-knowledge": { routeClass: 'read', woo: 'ready' },
    "POST store-knowledge/check": { routeClass: 'spend', woo: 'ready' },
    "GET readiness": { routeClass: 'read', woo: 'ready' },
    "POST readiness/check": { routeClass: 'read', woo: 'ready' },
    "GET readiness/structured-data": { routeClass: 'read', woo: 'none', reason: 'WooCommerce stores need no theme embed: we read the structured data on your product pages instead.' },
    "GET readiness/agent-files": { routeClass: 'read', woo: 'ready' },
    "PUT readiness/agent-files": { routeClass: 'write', woo: 'ready' },
    "GET ai-orders": { routeClass: 'read', woo: 'ready' },
    "PUT ai-orders/module": { routeClass: 'write', woo: 'ready' },
    "GET catalogue": { routeClass: 'read', woo: 'ready' },
    "GET catalogue/gaps": { routeClass: 'read', woo: 'ready' },
    "GET catalogue/product": { routeClass: 'read', woo: 'ready' },
    "GET catalogue/products": { routeClass: 'read', woo: 'ready' },
    "GET catalogue/products/:num": { routeClass: 'read', woo: 'ready' },
    "GET catalogue/products/:num/live": { routeClass: 'read', woo: 'ready' },
    "GET catalogue/products-summary": { routeClass: 'read', woo: 'ready' },
    "POST catalogue/scan": { routeClass: 'read', woo: 'ready' },
    "GET taxonomy/search": { routeClass: 'read', woo: 'ready' },
    "POST fixes/product": { routeClass: 'write', woo: 'ready' },
    "POST fixes/product/bulk": { routeClass: 'write', woo: 'ready' },
    "GET catalogue/attributes": { routeClass: 'read', woo: 'pending', phase: 'v1.1' },
    "POST fixes/attribute": { routeClass: 'write', woo: 'pending', phase: 'v1.1' },
    "POST fixes/attribute/bulk": { routeClass: 'write', woo: 'pending', phase: 'v1.1' },
    "GET fixes": { routeClass: 'read', woo: 'ready' },
    "POST fixes/seo": { routeClass: 'write', woo: 'ready' },
    "POST fixes/seo/suggest": { routeClass: 'spend', woo: 'ready' },
    "POST fixes/alt": { routeClass: 'write', woo: 'ready' },
    "GET catalogue/images": { routeClass: 'read', woo: 'ready' },
    "POST fixes/image/alt-suggest": { routeClass: 'spend', woo: 'ready' },
    "GET fixes/redirects": { routeClass: 'read', woo: 'ready' },
    "POST fixes/redirects": { routeClass: 'write', woo: 'ready' },
    "POST fixes/redirects/delete": { routeClass: 'write', woo: 'ready' },
    "GET fixes/redirect-suggestions": { routeClass: 'read', woo: 'ready' },
    "POST fixes/redirect-suggestions/:id/apply": { routeClass: 'write', woo: 'ready' },
    "POST fixes/redirect-suggestions/:id/dismiss": { routeClass: 'write', woo: 'ready' },
    "GET fixes/redirects/export": { routeClass: 'read', woo: 'ready' },
    "POST fixes/redirects/import": { routeClass: 'write', woo: 'ready' },
    "GET templates": { routeClass: 'read', woo: 'ready' },
    "PUT templates": { routeClass: 'write', woo: 'ready' },
    "POST templates/preview": { routeClass: 'read', woo: 'ready' },
    "POST templates/apply": { routeClass: 'write', woo: 'ready' },
    "POST fixes/apply": { routeClass: 'write', woo: 'ready' },
    "GET batches/:id": { routeClass: 'read', woo: 'ready' },
    "GET changes": { routeClass: 'read', woo: 'ready' },
    "POST changes/:id/undo": { routeClass: 'write', woo: 'ready' },
    "POST changes/batches/:id/undo": { routeClass: 'write', woo: 'ready' },
    "GET changes/batches/:id/outcome": { routeClass: 'read', woo: 'ready' },
    "GET blog": { routeClass: 'read', woo: 'ready' },
    "POST blog/blogs": { routeClass: 'write', woo: 'none', reason: 'A WordPress store has one blog, so there is no new blog to create. Use a category to group articles instead.' },
    "POST blog/articles": { routeClass: 'spend', woo: 'ready' },
    "GET blog/runs/:id": { routeClass: 'read', woo: 'ready' },
    "GET blog/plans/:id": { routeClass: 'read', woo: 'ready' },
    "POST blog/plans/:id/titles": { routeClass: 'spend', woo: 'ready' },
    "POST blog/plans/:id/approve": { routeClass: 'spend', woo: 'ready' },
    "GET blog/plan": { routeClass: 'read', woo: 'ready' },
    "POST blog/plan": { routeClass: 'spend', woo: 'ready' },
    "POST blog/plan/topics": { routeClass: 'write', woo: 'ready' },
    "POST blog/plan/topics/:id": { routeClass: 'write', woo: 'ready' },
    "GET blog/articles/:id/improve": { routeClass: 'read', woo: 'ready' },
    "POST blog/articles/:id/publication": { routeClass: 'write', woo: 'ready' },
    "POST blog/articles/:id/improve/revision": { routeClass: 'spend', woo: 'ready' },
    "POST blog/articles/:id/improve/section": { routeClass: 'spend', woo: 'ready' },
    "POST blog/articles/:id/improve/keep": { routeClass: 'write', woo: 'ready' },
    "POST blog/articles/:id/improve/discard": { routeClass: 'write', woo: 'ready' },
    "POST blog/articles/:id/improve/undo": { routeClass: 'write', woo: 'ready' },
    "GET blog/articles/:id": { routeClass: 'read', woo: 'ready' },
    "PATCH blog/articles/:id": { routeClass: 'write', woo: 'ready' },
    "POST blog/articles/:id/publish": { routeClass: 'write', woo: 'ready' },
    "GET plan": { routeClass: 'read', woo: 'ready' },
    "GET notifications": { routeClass: 'read', woo: 'ready' },
    "POST notifications/read-all": { routeClass: 'write', woo: 'ready' },
    "POST notifications/:id/read": { routeClass: 'write', woo: 'ready' },
    "GET settings": { routeClass: 'read', woo: 'ready' },
    "PATCH settings": { routeClass: 'spend', woo: 'ready' },
    "POST settings/ai-mode": { routeClass: 'write', woo: 'ready' },
    "POST settings/check-frequency": { routeClass: 'spend', woo: 'ready' },
    "GET settings/preferences": { routeClass: 'read', woo: 'ready' },
    "PUT settings/preferences": { routeClass: 'write', woo: 'ready' },
    "POST settings/home-cards": { routeClass: 'write', woo: 'ready' },
    "POST funnel/plan-page": { routeClass: 'write', woo: 'none', reason: 'This is only used in the Shopify app.' },
    "POST vitals": { routeClass: 'write', woo: 'ready' },
    "GET google": { routeClass: 'read', woo: 'ready' },
    "POST google/connect": { routeClass: 'write', woo: 'none', reason: "On WooCommerce, connect Google from your website's Settings, under Integrations." },
    "GET google/properties": { routeClass: 'read', woo: 'ready' },
    "POST google/property": { routeClass: 'write', woo: 'ready' },
    "POST google/disconnect": { routeClass: 'write', woo: 'ready' },
    "GET seo/overview": { routeClass: 'read', woo: 'ready' },
    "GET seo/listings": { routeClass: 'read', woo: 'ready' },
    "GET seo/rich": { routeClass: 'read', woo: 'ready' },
    "POST seo/refresh": { routeClass: 'read', woo: 'ready' },
    "GET blog/images": { routeClass: 'read', woo: 'ready' },
    "GET images/studio": { routeClass: 'read', woo: 'ready' },
    "POST images/generate": { routeClass: 'spend', woo: 'ready' },
    "GET images/jobs": { routeClass: 'read', woo: 'ready' },
    "GET images/gallery": { routeClass: 'read', woo: 'ready' },
    "GET images/suggestions": { routeClass: 'read', woo: 'ready' },
    "GET images/free": { routeClass: 'read', woo: 'ready' },
    "POST images/jobs/:id/apply": { routeClass: 'write', woo: 'ready' },
    "POST images/jobs/:id/discard": { routeClass: 'write', woo: 'ready' },
    "POST images/jobs/:id/formats": { routeClass: 'spend', woo: 'ready' },
    "GET images/looks": { routeClass: 'read', woo: 'ready' },
    "GET images/compare": { routeClass: 'read', woo: 'ready' },
    "POST images/looks": { routeClass: 'write', woo: 'ready' },
    "DELETE images/looks/:id": { routeClass: 'write', woo: 'ready' },
    "GET images/blog-setup": { routeClass: 'read', woo: 'ready' },
    "POST images/blog-ideas": { routeClass: 'write', woo: 'ready' },
    "GET images/blog-missing": { routeClass: 'read', woo: 'ready' },
    "POST images/blog-fill": { routeClass: 'spend', woo: 'ready' },
    "POST images/article-image-start": { routeClass: 'spend', woo: 'ready' },
    "POST images/fine-print": { routeClass: 'read', woo: 'ready' },
};
export const routeKey = (method: string, pattern: string): string => `${method} ${pattern}`;
export function routePolicy(method: string, pattern: string): WooSupport | undefined {
    return STORE_APP_ROUTE_POLICY[routeKey(method, pattern)];
}
export type PlatformVerdict = {
    ok: true;
} | {
    ok: false;
    status: 404;
    code: 'not_on_this_platform';
    error: string;
};
export function platformVerdict(platform: StorePlatformName, method: string, pattern: string): PlatformVerdict {
    if (platform === 'shopify')
        return { ok: true };
    const row = routePolicy(method, pattern);
    if (!row)
        return { ok: false, status: 404, code: 'not_on_this_platform', error: 'This is not available for your store.' };
    if (row.woo === 'ready')
        return { ok: true };
    if (row.woo === 'none')
        return { ok: false, status: 404, code: 'not_on_this_platform', error: row.reason };
    return { ok: false, status: 404, code: 'not_on_this_platform', error: 'This is not available for WooCommerce stores yet.' };
}
export function routeClassOf(method: string, pattern: string): RouteClass {
    return routePolicy(method, pattern)?.routeClass ?? 'spend';
}
export const SPEND_CONFIRM_HEADER = 'x-store-app-confirm';
export const SPEND_CONFIRM_VALUE = 'spend';
export function routeClassForPath(method: string, path: string): RouteClass {
    const segments = path.split('?')[0]!.split('/').filter(Boolean);
    let best: {
        cls: RouteClass;
        params: number;
    } | null = null;
    for (const [key, row] of Object.entries(STORE_APP_ROUTE_POLICY)) {
        const space = key.indexOf(' ');
        if (key.slice(0, space) !== method.toUpperCase())
            continue;
        const parts = key.slice(space + 1).split('/').filter(Boolean);
        if (parts.length !== segments.length)
            continue;
        let params = 0;
        let matches = true;
        for (let i = 0; i < parts.length; i++) {
            if (parts[i]!.startsWith(':'))
                params++;
            else if (parts[i] !== segments[i]) {
                matches = false;
                break;
            }
        }
        if (matches && (!best || params < best.params))
            best = { cls: row.routeClass, params };
    }
    return best?.cls ?? 'spend';
}
