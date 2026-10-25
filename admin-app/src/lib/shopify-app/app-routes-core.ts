export const AI_ORDERS_ENABLED = false;
const ALL_AI_VISIBILITY_TABS = [
    { id: 'shopping', label: 'Shopper questions' },
    { id: 'store', label: 'What AI says about you' },
    { id: 'competitors', label: 'Competitors' },
    { id: 'monitored', label: 'Monitored products' },
    { id: 'answers', label: 'AI answers' },
    { id: 'orders', label: 'AI orders' },
] as const;
export type AiVisibilityTab = (typeof ALL_AI_VISIBILITY_TABS)[number]['id'];
const RETIRED_AI_VISIBILITY_TABS: ReadonlySet<string> = new Set(['monitored', 'answers']);
export const AI_VISIBILITY_TABS: ReadonlyArray<(typeof ALL_AI_VISIBILITY_TABS)[number]> = ALL_AI_VISIBILITY_TABS.filter((t) => !RETIRED_AI_VISIBILITY_TABS.has(t.id) && (t.id !== 'orders' || AI_ORDERS_ENABLED));
export function aiVisibilityTabs(withOrders: boolean): ReadonlyArray<(typeof ALL_AI_VISIBILITY_TABS)[number]> {
    return withOrders ? ALL_AI_VISIBILITY_TABS.filter((t) => !RETIRED_AI_VISIBILITY_TABS.has(t.id)) : AI_VISIBILITY_TABS;
}
export const SEARCH_TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'listings', label: 'Listings' },
    { id: 'content', label: 'Content' },
    { id: 'rich', label: 'Rich results' },
    { id: 'links', label: 'Links' },
    { id: 'google', label: 'Google' },
] as const;
export type SearchTab = (typeof SEARCH_TABS)[number]['id'];
export type AppPage = {
    name: 'home';
} | {
    name: 'ai-visibility';
    tab: AiVisibilityTab;
} | {
    name: 'shopping-question';
    id: string;
} | {
    name: 'answer-question';
    id: string;
} | {
    name: 'products';
    view?: 'monitored' | null;
} | {
    name: 'product-issue';
    code: string;
} | {
    name: 'changes';
} | {
    name: 'product-images';
    product: string | null;
} | {
    name: 'product';
    num: string;
} | {
    name: 'search';
    tab: SearchTab;
    product?: string | null;
    issue?: string | null;
    bulk?: boolean;
    select?: boolean;
    target?: string | null;
} | {
    name: 'content-item';
    type: 'article' | 'page' | 'product' | 'collection';
    num: string;
} | {
    name: 'store-setup';
} | {
    name: 'blog';
    view?: 'plan' | null;
} | {
    name: 'blog-new';
    topic: string | null;
    product?: {
        num: string;
        title: string | null;
    } | null;
} | {
    name: 'article';
    id: string;
} | {
    name: 'blog-plan';
    briefId: string;
} | {
    name: 'settings';
} | {
    name: 'plan';
} | {
    name: 'notifications';
} | {
    name: 'not-found';
};
export const APP_BASE = '/shopify';
export const APP_PATHS = {
    home: '/shopify',
    aiVisibility: '/shopify/ai-visibility',
    products: '/shopify/products',
    changes: '/shopify/settings/changes',
    productImages: '/shopify/images',
    search: '/shopify/search',
    storeSetup: '/shopify/settings/advanced',
    blog: '/shopify/blog',
    blogNew: '/shopify/blog/new',
    settings: '/shopify/settings',
    plan: '/shopify/settings/plan',
    notifications: '/shopify/notifications',
} as const;
export const NAV_ITEMS: ReadonlyArray<{
    href: string;
    label: string;
}> = [
    { href: APP_PATHS.aiVisibility, label: 'AI search' },
    { href: APP_PATHS.products, label: 'Products' },
    { href: APP_PATHS.productImages, label: 'Image studio' },
    { href: APP_PATHS.search, label: 'SEO' },
    { href: APP_PATHS.blog, label: 'Blog' },
    { href: APP_PATHS.settings, label: 'Settings' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISSUE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const TEMPLATE_TARGET = /^[a-z]+\.[a-z_]{1,40}$/;
export const HIDDEN_ISSUE_CODES = ['status_draft', 'status_archived', 'out_of_stock_everywhere'] as const;
export function productIssueHref(code: string): string {
    return ISSUE_CODE.test(code) ? `${APP_PATHS.products}/issues/${code}` : APP_PATHS.products;
}
export function blogArticleHref(id: string): string {
    return `${APP_PATHS.blog}/articles/${id}`;
}
export function shoppingQuestionHref(id: string): string {
    return `${APP_PATHS.aiVisibility}/questions/${id}`;
}
export function answerQuestionHref(id: string): string {
    return `${APP_PATHS.aiVisibility}/answers/${id}`;
}
export function aiVisibilityHref(tab: AiVisibilityTab): string {
    return tab === AI_VISIBILITY_TABS[0].id ? APP_PATHS.aiVisibility : `${APP_PATHS.aiVisibility}?tab=${tab}`;
}
export function blogHref(view?: 'plan'): string {
    return view ? `${APP_PATHS.blog}?view=${view}` : APP_PATHS.blog;
}
export function productsHref(view?: 'monitored'): string {
    return view ? `${APP_PATHS.products}?view=${view}` : APP_PATHS.products;
}
const PRODUCT_REF = /^(?:gid:\/\/shopify\/Product|woo:\/\/product)\/(\d{1,20})$/;
export function productHref(idOrNum: string): string {
    const num = /^\d{1,20}$/.test(idOrNum) ? idOrNum : (PRODUCT_REF.exec(idOrNum)?.[1] ?? null);
    return num ? `${APP_PATHS.products}/${num}` : APP_PATHS.products;
}
export function productImagesHref(idOrNum?: string | null): string {
    const num = !idOrNum ? null : /^\d{1,20}$/.test(idOrNum) ? idOrNum : (PRODUCT_REF.exec(idOrNum)?.[1] ?? null);
    return num ? `${APP_PATHS.productImages}/${num}` : APP_PATHS.productImages;
}
export const STUDIO_GALLERY_PATH = 'images/gallery?filter=all';
export function productImagesDataPath(num: string, platform: 'shopify' | 'woocommerce' = 'shopify'): string {
    return `catalogue/images?productId=${encodeURIComponent(productRefOf(platform, num))}`;
}
export function productRefOf(platform: 'shopify' | 'woocommerce', num: string): string {
    return platform === 'woocommerce' ? `woo://product/${num}` : `gid://shopify/Product/${num}`;
}
export function blogPlanHref(briefId: string): string {
    return UUID.test(briefId) ? `${APP_PATHS.blog}/plan/${briefId}` : APP_PATHS.blog;
}
export function blogNewHref(topic?: string | null, product?: {
    num: string;
    title: string | null;
} | null): string {
    const q = new URLSearchParams();
    const t = (topic ?? '').trim();
    if (t)
        q.set('topic', t.slice(0, 200));
    if (product && /^\d{1,20}$/.test(product.num)) {
        q.set('product', product.num);
        if (product.title)
            q.set('productTitle', product.title.slice(0, 200));
    }
    const s = q.toString();
    return s ? `${APP_PATHS.blogNew}?${s}` : APP_PATHS.blogNew;
}
export function contentItemHref(type: string, num: string): string {
    return /^(?:article|page|product|collection)$/.test(type) && /^\d+$/.test(num) ? `${APP_PATHS.search}/content/${type}/${num}` : searchHref('content');
}
export function searchHref(tab: SearchTab, opts: {
    issue?: string | null;
    bulk?: boolean;
    select?: boolean;
    target?: string | null;
} = {}): string {
    const q = new URLSearchParams();
    if (tab !== SEARCH_TABS[0].id)
        q.set('tab', tab);
    if (tab === 'listings' && opts.issue && ISSUE_CODE.test(opts.issue))
        q.set('issue', opts.issue);
    if (tab === 'listings' && opts.issue && opts.select && ISSUE_CODE.test(opts.issue))
        q.set('select', '1');
    if (tab === 'listings' && opts.bulk)
        q.set('mode', 'bulk');
    if (tab === 'listings' && opts.bulk && opts.target && TEMPLATE_TARGET.test(opts.target))
        q.set('target', opts.target);
    const qs = q.toString();
    return qs ? `${APP_PATHS.search}?${qs}` : APP_PATHS.search;
}
function tabOf<T extends string>(tabs: ReadonlyArray<{
    id: T;
}>, value: string | null): T {
    return tabs.find((t) => t.id === value)?.id ?? tabs[0]!.id;
}
export function legacyRedirect(pathname: string, search = ''): string | null {
    const path = pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(search);
    const withQuery = (to: string, drop: string[] = []) => {
        for (const k of drop)
            params.delete(k);
        const q = params.toString();
        return q ? `${to}${to.includes('?') ? '&' : '?'}${q}` : to;
    };
    if (path === `${APP_BASE}/fixes`)
        return withQuery(APP_PATHS.products);
    if (path === `${APP_BASE}/fixes/changes`)
        return withQuery(APP_PATHS.changes);
    if (path === `${APP_BASE}/products/changes`)
        return withQuery(APP_PATHS.changes);
    if (path === `${APP_BASE}/changes`)
        return withQuery(APP_PATHS.changes);
    if (path === `${APP_BASE}/products/images`) {
        const raw = (params.get('product') ?? (params.get('products') ?? '').split(',')[0] ?? '').trim();
        return withQuery(productImagesHref(/^\d{1,20}$/.test(raw) ? raw : null), ['product', 'products']);
    }
    if (path === `${APP_BASE}/store-setup`)
        return withQuery(APP_PATHS.storeSetup);
    if (path === `${APP_BASE}/plan`)
        return withQuery(APP_PATHS.plan);
    if (path === APP_PATHS.aiVisibility && params.get('tab') === 'readiness')
        return withQuery(APP_PATHS.storeSetup, ['tab']);
    if (path === APP_PATHS.aiVisibility && params.get('tab') === 'answers')
        return withQuery(APP_PATHS.aiVisibility, ['tab']);
    if (path === APP_PATHS.search && params.get('tab') === 'titles') {
        params.set('tab', 'listings');
        return withQuery(APP_PATHS.search);
    }
    if (path === APP_PATHS.search && params.get('tab') === 'templates') {
        params.set('tab', 'listings');
        params.set('mode', 'bulk');
        return withQuery(APP_PATHS.search);
    }
    if (path === APP_PATHS.search && !params.get('tab') && params.get('product')) {
        params.set('tab', 'listings');
        return withQuery(APP_PATHS.search);
    }
    if (path === APP_PATHS.aiVisibility && params.get('tab') === 'monitored') {
        params.set('view', 'monitored');
        return withQuery(APP_PATHS.products, ['tab']);
    }
    return null;
}
export function matchAppPath(pathname: string, search = '', opts: {
    aiOrders?: boolean;
} = {}): AppPage {
    const moved = legacyRedirect(pathname, search);
    if (moved) {
        const url = new URL(moved, 'https://app.invalid');
        return matchAppPath(url.pathname, url.search, opts);
    }
    const path = pathname.replace(/\/+$/, '') || '/';
    if (path !== APP_BASE && !path.startsWith(`${APP_BASE}/`))
        return { name: 'not-found' };
    const segs = path.slice(APP_BASE.length).split('/').filter(Boolean);
    const params = new URLSearchParams(search);
    if (segs.length === 0)
        return { name: 'home' };
    const [a, b, c] = segs;
    if (a === 'ai-visibility') {
        if (segs.length === 1)
            return { name: 'ai-visibility', tab: tabOf(aiVisibilityTabs(opts.aiOrders === true), params.get('tab')) };
        if (b === 'questions' && c && UUID.test(c) && segs.length === 3)
            return { name: 'shopping-question', id: c };
        if (b === 'answers' && c && UUID.test(c) && segs.length === 3)
            return { name: 'answer-question', id: c };
        return { name: 'not-found' };
    }
    if (a === 'images') {
        if (segs.length === 1)
            return { name: 'product-images', product: null };
        if (b && /^\d{1,20}$/.test(b) && segs.length === 2)
            return { name: 'product-images', product: b };
        return { name: 'not-found' };
    }
    if (a === 'products') {
        if (segs.length === 1)
            return params.get('view') === 'monitored' ? { name: 'products', view: 'monitored' } : { name: 'products' };
        if (b && /^\d{1,20}$/.test(b) && segs.length === 2)
            return { name: 'product', num: b };
        if (b === 'issues' && c && ISSUE_CODE.test(c) && segs.length === 3)
            return { name: 'product-issue', code: c };
        return { name: 'not-found' };
    }
    if (a === 'search' && b === 'content' && segs.length === 4) {
        const [, , type, num] = segs;
        if ((type === 'article' || type === 'page' || type === 'product' || type === 'collection') && /^\d+$/.test(num!))
            return { name: 'content-item', type, num: num! };
        return { name: 'not-found' };
    }
    if (a === 'search' && segs.length === 1) {
        const product = params.get('product');
        const tab = tabOf(SEARCH_TABS, params.get('tab'));
        const issue = params.get('issue');
        return {
            name: 'search',
            tab,
            product: product && /^\d+$/.test(product) ? product : null,
            ...(tab === 'listings' ? { issue: issue && ISSUE_CODE.test(issue) ? issue : null, bulk: params.get('mode') === 'bulk' } : {}),
            ...(tab === 'listings' && params.get('select') === '1' && issue && ISSUE_CODE.test(issue) ? { select: true } : {}),
            ...(tab === 'listings' && params.get('mode') === 'bulk' && TEMPLATE_TARGET.test(params.get('target') ?? '') ? { target: params.get('target') } : {}),
        };
    }
    if (a === 'blog' && segs.length === 1)
        return params.get('view') === 'plan' ? { name: 'blog', view: 'plan' } : { name: 'blog' };
    if (a === 'blog' && b === 'new' && segs.length === 2) {
        const topic = (params.get('topic') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const num = params.get('product') ?? '';
        const title = (params.get('productTitle') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        return { name: 'blog-new', topic: topic || null, product: /^\d{1,20}$/.test(num) ? { num, title: title || null } : null };
    }
    if (a === 'blog' && b === 'articles' && c && UUID.test(c) && segs.length === 3)
        return { name: 'article', id: c };
    if (a === 'blog' && b === 'plan' && c && UUID.test(c) && segs.length === 3)
        return { name: 'blog-plan', briefId: c };
    if (a === 'settings' && segs.length === 1)
        return { name: 'settings' };
    if (a === 'settings' && b === 'plan' && segs.length === 2)
        return { name: 'plan' };
    if (a === 'settings' && b === 'advanced' && segs.length === 2)
        return { name: 'store-setup' };
    if (a === 'settings' && b === 'changes' && segs.length === 2)
        return { name: 'changes' };
    if (a === 'notifications' && segs.length === 1)
        return { name: 'notifications' };
    return { name: 'not-found' };
}
export function isAppHref(href: string): boolean {
    return href === APP_BASE || href.startsWith(`${APP_BASE}/`) || href.startsWith(`${APP_BASE}?`);
}
export function dataPathsFor(page: AppPage, platform: 'shopify' | 'woocommerce' = 'shopify'): string[] {
    switch (page.name) {
        case 'home':
            return ['overview', 'images/free', 'plan'];
        case 'ai-visibility':
            return page.tab === 'orders'
                ? ['ai-orders?days=30', 'plan']
                : page.tab === 'competitors'
                    ? ['competitors', 'plan']
                    : page.tab === 'store'
                        ? ['store-knowledge', 'plan']
                        : ['shopper-questions', 'answers', 'shopping', 'plan'];
        case 'shopping-question':
            return [`shopping/questions/${page.id}`, 'shopping', 'plan'];
        case 'answer-question':
            return [`answers/questions/${page.id}`, 'plan'];
        case 'products':
            return page.view === 'monitored' ? ['shopping', 'plan'] : ['catalogue', 'fixes', 'catalogue/products?filter=all&q=&page=0', 'plan'];
        case 'product-issue':
            return (HIDDEN_ISSUE_CODES as readonly string[]).includes(page.code)
                ? ['fixes', 'plan']
                : ['catalogue', `catalogue/gaps?code=${page.code}&page=0`, 'plan'];
        case 'changes':
            return ['changes', 'plan'];
        case 'product-images':
            return page.product ? ['images/studio', productImagesDataPath(page.product, platform), 'plan'] : ['images/studio', STUDIO_GALLERY_PATH, 'images/suggestions', 'plan'];
        case 'product':
            return [`catalogue/products/${page.num}`, 'plan'];
        case 'search':
            return page.tab === 'overview'
                ? ['seo/overview', 'plan']
                : page.tab === 'content'
                    ? ['content', 'plan']
                    : page.tab === 'google'
                        ? ['google', 'plan']
                        : page.tab === 'rich'
                            ? ['seo/rich', 'readiness/structured-data', 'readiness/agent-files', 'plan']
                            : page.tab === 'links'
                                ? ['fixes', 'fixes/redirects', 'fixes/redirect-suggestions', 'plan']
                                : page.bulk
                                    ? ['templates', 'plan']
                                    : ['seo/listings?type=&issue=all&sort=impact&q=&page=0', 'plan'];
        case 'content-item':
            return [`content/items/${page.type}/${page.num}`, 'plan'];
        case 'store-setup':
            return ['readiness', 'catalogue', 'plan'];
        case 'blog':
            return page.view === 'plan' ? ['blog', 'blog/plan', 'plan'] : ['blog', 'plan'];
        case 'blog-new':
            return ['blog', 'plan'];
        case 'article':
            return [`blog/articles/${page.id}`, 'blog', 'plan'];
        case 'blog-plan':
            return [`blog/plans/${page.briefId}`, 'plan'];
        case 'plan':
            return ['plan'];
        case 'settings':
            return ['settings', 'settings/preferences', 'plan'];
        case 'notifications':
            return ['notifications?filter=all', 'plan'];
        default:
            return ['plan'];
    }
}
