import type { ShopifyAccountData, ShopifyHomeData } from './home-types';
export interface ConnectionBadge {
    tone: 'success' | 'warning' | 'critical';
    label: string;
    needsAction: boolean;
}
export function connectionBadge(connection: ShopifyHomeData['connection']): ConnectionBadge {
    if (!connection)
        return { tone: 'critical', label: 'Not connected', needsAction: true };
    if (connection.needsReopen)
        return { tone: 'warning', label: 'Needs reopening', needsAction: true };
    if (connection.status === 'connected')
        return { tone: 'success', label: 'Connected', needsAction: false };
    return { tone: 'warning', label: 'Not connected', needsAction: true };
}
export function planPageUrl(shopDomain: string, appHandle: string): string {
    const store = shopDomain.toLowerCase().replace(/\.myshopify\.com$/, '');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(store) || !/^[a-z0-9-]+$/.test(appHandle))
        throw new Error('invalid store or app handle');
    return `https://admin.shopify.com/store/${store}/charges/${appHandle}/pricing_plans`;
}
export function shopifyPlanDisplayName(planCode: string | null, name: string | null): string | null {
    if (!planCode || planCode === 'shopify_free' || !name)
        return null;
    return name.replace(/^Shopify\s+/, '');
}
export type PlanCardKind = 'choose' | 'free' | 'trial' | 'active' | 'paused' | 'lapsed' | 'unknown';
export interface PlanCard {
    kind: PlanCardKind;
    title: string;
    body: string;
    date: string | null;
    action: {
        label: string;
        url: string;
    } | null;
    tone: 'info' | 'success' | 'warning';
}
export function webPlanCardState(account: ShopifyAccountData | null, now: number = Date.now()): PlanCard {
    if (!account) {
        return { kind: 'unknown', title: 'Your plan', body: 'We could not read your plan just now.', date: null, action: null, tone: 'warning' };
    }
    const choose = { label: 'Choose a plan', url: account.planPageUrl };
    const manage = { label: 'Manage billing', url: account.planPageUrl };
    const name = account.planName;
    const trialEnded = account.status === 'trial_expired' || (account.status === 'trial' && !!account.trialEnd && Date.parse(account.trialEnd) < now);
    if (account.status === 'trial' && !trialEnded) {
        return {
            kind: 'trial', title: name ? `${name} · free trial` : 'Free trial', tone: 'info', date: account.trialEnd, action: choose,
            body: account.trialEnd ? 'Your free trial ends on {date}. Choose a plan to keep checking after it.' : 'You are on your free trial.',
        };
    }
    if (account.status === 'paused') {
        return { kind: 'paused', title: 'Your plan is on hold', tone: 'warning', date: null, action: manage, body: 'Checks and fixes start again once your plan is resumed in billing.' };
    }
    if (account.status === 'past_due' && name) {
        return { kind: 'active', title: name, tone: 'warning', date: null, action: manage, body: 'Your last payment did not go through. Update your card in billing to keep your plan.' };
    }
    if ((account.status === 'active' || account.status === 'active_free') && name) {
        const date = account.periodEnd;
        let body = date ? 'Renews on {date}.' : 'Your plan is active.';
        if (date && account.cancelAtPeriodEnd)
            body = 'Your plan ends on {date}.';
        else if (date && account.scheduledPlanName)
            body = `Changes to ${account.scheduledPlanName} on {date}.`;
        return { kind: 'active', title: name, tone: 'success', date: account.status === 'active_free' && !account.periodEnd ? null : date, action: manage, body };
    }
    if (trialEnded || account.status === 'expired' || account.status === 'canceled') {
        return {
            kind: 'lapsed', title: 'No plan', tone: 'warning', date: null, action: choose,
            body: 'Your trial or plan has ended. Choose a plan to keep checking how AI assistants show your products.',
        };
    }
    return { kind: 'choose', title: 'Choose a plan', tone: 'info', date: null, action: choose, body: 'Choose a plan to start checking how AI assistants show your products.' };
}
export function storePlanCardState(platform: 'shopify' | 'woocommerce', account: ShopifyAccountData | null, opts: {
    firstCheckDone?: boolean;
} = {}): PlanCard {
    return platform === 'shopify' ? planCardState(account, opts) : webPlanCardState(account);
}
export function planCardState(account: ShopifyAccountData | null, opts: {
    firstCheckDone?: boolean;
} = {}): PlanCard {
    if (!account) {
        return { kind: 'unknown', title: 'Your plan', body: 'We could not read your plan just now.', date: null, action: null, tone: 'warning' };
    }
    const choose = { label: 'Choose a plan', url: account.planPageUrl };
    const change = { label: 'Change plan', url: account.planPageUrl };
    const name = account.planName;
    if (account.status === 'paused') {
        return {
            kind: 'paused', title: 'Your plan is on hold', tone: 'warning', date: null, action: change,
            body: 'Shopify has paused your plan because of a billing issue on your store. Checks and fixes start again once it is resolved.',
        };
    }
    if (account.status === 'trial' && name && account.hadContract) {
        if (account.cancelAtPeriodEnd) {
            return {
                kind: 'trial', title: `${name} · free trial`, tone: 'warning', date: account.trialEnd, action: choose,
                body: account.trialEnd
                    ? 'Your free trial ends on {date} and your plan is cancelled, so Shopify will not bill you. Choose a plan to keep it.'
                    : 'Your plan is cancelled. Choose a plan to keep it.',
            };
        }
        return {
            kind: 'trial', title: `${name} · free trial`, tone: 'info', date: account.trialEnd, action: change,
            body: account.trialEnd ? 'Your free trial ends on {date}. Shopify starts billing your plan then.' : 'You are on your free trial.',
        };
    }
    if (account.status === 'active' && name) {
        const date = account.periodEnd;
        let body = date ? 'Renews on {date}.' : 'Your plan is active.';
        if (date && account.scheduledFree)
            body = 'Changes to the Free plan on {date}. Your plan stays active until then.';
        else if (date && account.cancelAtPeriodEnd)
            body = 'Your plan ends on {date}.';
        else if (date && account.scheduledPlanName)
            body = `Changes to ${account.scheduledPlanName} on {date}.`;
        return { kind: 'active', title: name, tone: 'success', date, action: change, body };
    }
    if (account.onFreePlan) {
        return {
            kind: 'free', title: 'Free plan', tone: 'info', date: null, action: change,
            body: 'Your product check and single fixes are free. Choose a paid plan to check how ChatGPT and Google AI Mode show your products.',
        };
    }
    if (account.hadContract && account.cancelAtPeriodEnd) {
        return {
            kind: 'lapsed', title: 'No plan', tone: 'warning', date: null, action: choose,
            body: 'Your previous plan was cancelled when the app was uninstalled. Choose a plan to start checking how ChatGPT and AI Mode show your products again.',
        };
    }
    if (account.hadContract) {
        return {
            kind: 'lapsed', title: 'No plan', tone: 'warning', date: null, action: choose,
            body: 'Your trial or plan has ended. Choose a plan to keep checking how ChatGPT and AI Mode show your products.',
        };
    }
    const keep = opts.firstCheckDone === true;
    if (account.trialUsed) {
        return {
            kind: 'choose', title: keep ? 'Choose a plan to keep checking' : 'Choose a plan', tone: 'info', date: null, action: choose,
            body: keep
                ? 'Your first check is included. After it, nothing more is checked until you choose a plan.'
                : 'Choose a plan to start checking how ChatGPT and AI Mode show your products.',
        };
    }
    if (keep) {
        return {
            kind: 'choose', title: 'Choose a plan to keep checking', tone: 'info', date: null, action: choose,
            body: 'Your first check is included. After it, nothing more is checked until you choose a plan. Your 7-day free trial includes 1,000 credits, and Shopify bills you only if you keep the plan after 7 days.',
        };
    }
    return {
        kind: 'choose', title: 'Start your 7-day free trial', tone: 'info', date: null, action: choose,
        body: 'Choose a plan to start. Your trial includes 1,000 credits, and Shopify bills you only if you keep the plan after 7 days.',
    };
}
export function onFreePlanOf(row: {
    plan_handle?: string | null;
    last_plan_handle?: string | null;
} | null | undefined, freeHandle = 'free'): boolean {
    if (!row)
        return false;
    if (row.plan_handle)
        return row.plan_handle === freeHandle;
    return row.last_plan_handle === freeHandle;
}
export function cameFromPlanPage(search: string): boolean {
    return /(?:^|[?&])plan_handle=[a-z0-9_-]+(?:&|$)/i.test(search);
}
export const DISMISSIBLE_HOME_CARDS = ['plan_promo', 'setup_guide'] as const;
export const COLLAPSIBLE_HOME_CARDS = ['setup_guide'] as const;
export type HomeCard = (typeof DISMISSIBLE_HOME_CARDS)[number];
export interface HomeCardsState {
    dismissed: HomeCard[];
    collapsed: HomeCard[];
}
export const NO_HOME_CARDS_PUT_AWAY: HomeCardsState = { dismissed: [], collapsed: [] };
export function parseHomeCardChange(body: unknown): {
    card: HomeCard;
    state: 'dismissed' | 'collapsed' | 'expanded';
} | null {
    if (!body || typeof body !== 'object')
        return null;
    const { card, state } = body as {
        card?: unknown;
        state?: unknown;
    };
    if (typeof card !== 'string' || typeof state !== 'string')
        return null;
    if (state === 'dismissed')
        return (DISMISSIBLE_HOME_CARDS as readonly string[]).includes(card) ? { card: card as HomeCard, state } : null;
    if (state === 'collapsed' || state === 'expanded')
        return (COLLAPSIBLE_HOME_CARDS as readonly string[]).includes(card) ? { card: card as HomeCard, state } : null;
    return null;
}
export function readHomeCards(row: {
    dismissed_cards?: unknown;
    collapsed_cards?: unknown;
} | null | undefined): HomeCardsState {
    const pick = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v.filter((x): x is HomeCard => typeof x === 'string' && allowed.includes(x)) : []);
    return { dismissed: pick(row?.dismissed_cards, DISMISSIBLE_HOME_CARDS), collapsed: pick(row?.collapsed_cards, COLLAPSIBLE_HOME_CARDS) };
}
