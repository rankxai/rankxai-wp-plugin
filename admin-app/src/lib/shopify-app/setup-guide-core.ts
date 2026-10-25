import { productIssueHref } from './app-routes-core';
export type SetupStepKey = 'password' | 'embed' | 'products' | 'publish' | 'categories' | 'barcodes';
export interface SetupStep {
    key: SetupStepKey;
    title: string;
    detail: string;
    done: boolean | null;
    action: {
        label: string;
        href: string;
        admin: boolean;
    } | null;
}
export interface SetupGuide {
    steps: SetupStep[];
    done: number;
    total: number;
    complete: boolean;
}
export interface SetupGuideInput {
    passwordProtected: boolean | null;
    gapCounts: Partial<Record<string, number>>;
    products?: number | null;
    embed?: {
        status: 'on' | 'off' | 'unknown' | 'checking';
        activateLink: string | null;
    };
}
const defaultFmt = (n: number) => n.toLocaleString('en-US');
export const GUIDE_COVERS: {
    actionKeys: readonly string[];
    gapCodes: readonly string[];
} = {
    actionKeys: ['password'],
    gapCodes: ['not_published', 'no_category', 'gtin_missing', 'gtin_invalid'],
};
export function setupGuide(input: SetupGuideInput, fmt: (n: number) => string = defaultFmt): SetupGuide {
    const count = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;
    const g = (code: string) => Math.max(0, input.gapCounts[code] ?? 0);
    const unpublished = g('not_published');
    const noCategory = g('no_category');
    const noBarcode = g('gtin_missing') + g('gtin_invalid');
    const barcodeCode = g('gtin_missing') > 0 ? 'gtin_missing' : 'gtin_invalid';
    const passwordStep: SetupStep = {
        key: 'password',
        title: 'Remove your store password',
        detail: input.passwordProtected === true
            ? 'No AI shopping assistant can show your products while your store has a password.'
            : input.passwordProtected === false
                ? 'Your store has no password.'
                : 'We can’t tell whether your store has a password. Check Online Store › Preferences.',
        done: input.passwordProtected === null ? null : !input.passwordProtected,
        action: input.passwordProtected === false ? null : { label: 'Open Online Store › Preferences', href: 'shopify://admin/online_store/preferences', admin: true },
    };
    const embedStep: SetupStep | null = input.embed
        ? {
            key: 'embed',
            title: 'Turn on extra product info for Google and AI',
            detail: input.embed.status === 'on'
                ? 'Extra product info is on in your theme.'
                : input.embed.status === 'off'
                    ? 'Turn on RankX AI in your theme editor’s app embeds, then save. It adds breadcrumbs and star ratings Google and AI assistants read.'
                    : input.embed.status === 'checking'
                        ? 'Checking whether it is on in your theme.'
                        : 'We can’t tell whether it is on. Your theme editor shows it under App embeds.',
            done: input.embed.status === 'on' ? true : input.embed.status === 'off' ? false : null,
            action: input.embed.status !== 'on' && input.embed.activateLink ? { label: 'Turn on in the theme editor', href: input.embed.activateLink, admin: true } : null,
        }
        : null;
    if (input.products === 0) {
        const steps: SetupStep[] = [passwordStep, ...(embedStep ? [embedStep] : []), {
                key: 'products',
                title: 'Add your products',
                detail: 'Your store has no active products yet. Add them under Products, and RankX AI checks each one as it is saved.',
                done: false,
                action: { label: 'Add a product', href: 'shopify://admin/products/new', admin: true },
            }];
        return { steps, done: steps.filter((s) => s.done === true).length, total: steps.length, complete: false };
    }
    const steps: SetupStep[] = [
        passwordStep,
        ...(embedStep ? [embedStep] : []),
        {
            key: 'publish',
            title: 'Publish your products to the Online Store',
            detail: unpublished > 0 ? `${count(unpublished, 'product is', 'products are')} not published to your Online Store.` : 'Every active product is published to your Online Store.',
            done: unpublished === 0,
            action: unpublished > 0 ? { label: 'Open Products', href: 'shopify://admin/products', admin: true } : null,
        },
        {
            key: 'categories',
            title: 'Add product categories',
            detail: noCategory > 0 ? `${count(noCategory, 'product has', 'products have')} no category, so Shopify can’t ask for the right details.` : 'Every product has a category.',
            done: noCategory === 0,
            action: noCategory > 0 ? { label: 'Choose categories', href: productIssueHref('no_category'), admin: false } : null,
        },
        {
            key: 'barcodes',
            title: 'Add barcodes',
            detail: noBarcode > 0 ? `${count(noBarcode, 'product needs', 'products need')} a valid barcode, which AI shopping uses to match products.` : 'Every product has a valid barcode.',
            done: noBarcode === 0,
            action: noBarcode > 0 ? { label: 'Add barcodes', href: productIssueHref(barcodeCode), admin: false } : null,
        },
    ];
    const done = steps.filter((s) => s.done === true).length;
    return { steps, done, total: steps.length, complete: steps.every((s) => s.done !== false) };
}
