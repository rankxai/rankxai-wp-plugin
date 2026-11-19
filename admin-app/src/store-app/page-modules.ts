import type { AppPage } from '@/lib/shopify-app/app-routes-core';
export const PAGE_LOADERS = {
    home: () => import('./pages/Home'),
    'ai-visibility': () => import('./pages/AiVisibility'),
    'shopping-question': () => import('./pages/ShoppingQuestion'),
    'answer-question': () => import('./pages/AnswerQuestion'),
    products: () => import('./pages/Products'),
    'product-issue': () => import('./pages/ProductIssue'),
    search: () => import('./pages/Search'),
    'content-item': () => import('./pages/ContentItem'),
    'store-setup': () => import('./pages/StoreSetup'),
    changes: () => import('./pages/Changes'),
    'product-images': () => import('./pages/ProductImages'),
    product: () => import('./pages/Product'),
    blog: () => import('./pages/Blog'),
    'blog-new': () => import('./pages/BlogWrite'),
    'blog-plan': () => import('./pages/BlogPlan'),
    article: () => import('./pages/Article'),
    plan: () => import('./pages/Plan'),
    settings: () => import('./pages/Settings'),
    notifications: () => import('./pages/Notifications'),
} as const;
export type PageModuleName = keyof typeof PAGE_LOADERS;
export function preloadPage(name: AppPage['name']): void {
    const loader = (PAGE_LOADERS as Partial<Record<string, () => Promise<unknown>>>)[name];
    if (loader)
        void loader().catch(() => undefined);
}
