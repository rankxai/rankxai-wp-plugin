import { VISIBILITY_COPY, type VisibilityCause } from '@/lib/shopify/visibility-copy';
import { fixModeFor } from './fix-index-core';
import { adminPlace, type AdminTarget } from '@/lib/store-app/admin-target-core';
import type { StorePlatformName } from '@/lib/store-app/route-policy-core';
import { HIDDEN_ISSUE_CODES, productIssueHref, searchHref } from './app-routes-core';
export type HiddenIssueCode = (typeof HIDDEN_ISSUE_CODES)[number];
export function isHiddenIssueCode(code: string): code is HiddenIssueCode {
    return (HIDDEN_ISSUE_CODES as readonly string[]).includes(code);
}
export function issueHref(code: string): string {
    return fixModeFor(code) === 'search' ? searchHref('listings', { issue: code.replace(/^seo_/, '') }) : productIssueHref(code);
}
export interface HiddenIssue<T> {
    code: HiddenIssueCode;
    title: string;
    why: string;
    fix: string;
    items: T[];
}
const APP_REMEDY: Partial<Record<HiddenIssueCode, string>> = {
    status_draft: 'On the product’s page, set its status to Active.',
    status_archived: 'If you still sell it, set its status to Active on the product’s page.',
};
export function hiddenIssues<T extends {
    group: string;
    cause?: string | null;
}>(items: readonly T[]): Array<HiddenIssue<T>> {
    return HIDDEN_ISSUE_CODES.map((code) => {
        const copy = VISIBILITY_COPY[code as VisibilityCause];
        return { code, title: copy.title, why: copy.why, fix: APP_REMEDY[code] ?? copy.remedy, items: items.filter((i) => i.group === 'visibility' && i.cause === code) };
    }).filter((g) => g.items.length > 0);
}
export const ADMIN_LINKS = {
    preferences: 'shopify://admin/online_store/preferences',
    policies: 'shopify://admin/settings/legal',
    agentic: 'shopify://admin/apps/agentic',
    themes: 'shopify://admin/themes',
    settings: 'shopify://admin/settings',
} as const;
const STORE_SETTING_LINK: Record<string, {
    href: string;
    label: string;
}> = {
    password: { href: ADMIN_LINKS.preferences, label: 'Open Online Store › Preferences' },
    policy_missing: { href: ADMIN_LINKS.policies, label: 'Open Settings › Policies' },
    account_standing: { href: ADMIN_LINKS.settings, label: 'Open Settings' },
    agentic_switch: { href: ADMIN_LINKS.agentic, label: 'Open Sales channels › Agentic' },
    collection_links: { href: ADMIN_LINKS.themes, label: 'Open Online Store › Themes' },
};
export function storeSettingLink(code: string, platform: StorePlatformName = 'shopify', policies?: readonly string[]): {
    href: string;
    label: string;
} | null {
    if (platform === 'woocommerce') {
        const termsOnly = (code === 'policy_missing' || code === 'policy_unread') && !!policies && policies.length > 0 && policies.every((p) => p === 'terms');
        const target: AdminTarget | undefined = termsOnly ? { kind: 'store_pages' } : WOO_STORE_SETTING[code];
        const place = target ? adminPlace('woocommerce', target) : null;
        return place ? { href: place.link, label: `Open ${place.label}` } : null;
    }
    return STORE_SETTING_LINK[code] ?? null;
}
const WOO_STORE_SETTING: Record<string, AdminTarget> = {
    coming_soon: { kind: 'site_visibility' },
    coming_soon_unread: { kind: 'site_visibility' },
    search_engines_discouraged: { kind: 'reading' },
    policy_missing: { kind: 'policies' },
    policy_unread: { kind: 'policies' },
};
