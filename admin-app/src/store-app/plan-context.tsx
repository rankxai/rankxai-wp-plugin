import { createContext, useContext, type ReactNode } from 'react';
import { settled, useLoad, type LockInfo } from './kit';
import { host } from './host';
import { wordsFor, type StoreWords } from './vocabulary';
import type { StoreCapabilities } from '@/lib/store-app/capabilities-core';
import type { StorePlatformName } from '@/lib/store-app/route-policy-core';
export interface PlanData {
    store?: StoreCapabilities;
    account: {
        status: string | null;
        planName: string | null;
        planPageUrl: string;
    } | null;
    card: {
        kind: string;
        title: string;
        body: string;
        date: string | null;
        action: {
            label: string;
            url: string;
        } | null;
    };
    plans: Array<{
        planCode: string;
        name: string;
        priceMonthlyCents: number | null;
        maxQuestions: number | null;
        maxProducts: number | null;
    }>;
    usage: {
        brandQuestions: number;
        shoppingQuestions: number;
        products: number;
    };
    locks: {
        access: LockInfo | null;
        brandQuestions: LockInfo | null;
        shoppingQuestions: LockInfo | null;
        products: LockInfo | null;
    };
    credits: {
        available: number | null;
        monthly: number | null;
        nextCreditDate: string | null;
        low: boolean;
        paused: boolean;
        asWork: string[];
    } | null;
    firstCheck: {
        line: string;
        credits?: number;
        grantedAt: string;
    } | null;
}
interface PlanValue {
    plan: PlanData | null;
    ready: boolean;
    reload: () => Promise<void>;
}
const PlanContext = createContext<PlanValue>({ plan: null, ready: false, reload: async () => undefined });
export function PlanProvider({ children }: {
    children: ReactNode;
}) {
    const load = useLoad<PlanData>('plan');
    return <PlanContext.Provider value={{ plan: load.data, ready: settled(load), reload: load.reload }}>{children}</PlanContext.Provider>;
}
export function usePlan(): PlanValue {
    return useContext(PlanContext);
}
export function useStore(): {
    platform: StorePlatformName;
    capabilities: StoreCapabilities | null;
    words: StoreWords;
} {
    const { plan } = usePlan();
    const platform = plan?.store?.platform ?? host.platform ?? 'shopify';
    return { platform, capabilities: plan?.store ?? null, words: wordsFor(platform) };
}
export function planToName(plan: PlanData | null): string | null {
    return plan?.locks.access?.planNeeded ?? plan?.plans.slice().sort((a, b) => (a.priceMonthlyCents ?? 0) - (b.priceMonthlyCents ?? 0))[0]?.name ?? null;
}
