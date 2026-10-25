import type { embedStatusFromExtensions } from '@/lib/shopify-app/structured-data-core';
export interface PickedProduct {
    id: string;
    title?: string;
}
export interface PickProductsOptions {
    multiple: number | boolean;
    productsOnly?: boolean;
}
export type ScopeAnswer = 'granted' | 'declined';
export type AppExtensions = Parameters<typeof embedStatusFromExtensions>[0];
export interface StoreHost {
    readonly name: 'shopify' | 'wordpress' | 'web';
    readonly platform: 'shopify' | 'woocommerce' | null;
    authorize(): Promise<Record<string, string>>;
    retryUnauthorized(res: Response): Promise<Record<string, string> | null>;
    readonly sessionEndedMessage: string;
    readonly requiresCredentials?: boolean;
    location(): {
        path: string;
        search: string;
    };
    push(appPath: string): void;
    replace(appPath: string): void;
    watch(handlers: {
        onLocation: () => void;
        onNavigate: (href: string) => void;
    }): () => void;
    toHref(appPath: string): string;
    leaveConfirmation(): Promise<void>;
    toast(message: string): void;
    pickProducts(opts: PickProductsOptions): Promise<PickedProduct[] | undefined>;
    adminHref(path: string): {
        href: string;
        target?: '_blank';
    };
    openPlanPage(url: string): void;
    locale(): string | null;
    requestScopes?(scopes: string[]): Promise<ScopeAnswer>;
    requestReview?(): void;
    appExtensions?(): Promise<AppExtensions>;
    appApiKey?(): string | null;
}
