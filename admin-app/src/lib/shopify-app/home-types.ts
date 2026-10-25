export interface ShopifyAccountData {
    status: string | null;
    plan: string | null;
    planName: string | null;
    trialStart: string | null;
    trialEnd: string | null;
    periodEnd: string | null;
    billingInterval: 'monthly' | 'annual' | null;
    cancelAtPeriodEnd: boolean;
    scheduledPlanName: string | null;
    scheduledFree: boolean;
    onFreePlan: boolean;
    hadContract: boolean;
    trialUsed: boolean;
    planPageUrl: string;
}
export interface ShopifyHomeData {
    shop: {
        name: string | null;
        domain: string;
        primaryHost: string | null;
    };
    project: {
        id: string;
        onboardingStatus: string | null;
    } | null;
    brand: {
        brandName: string | null;
    } | null;
    account: ShopifyAccountData | null;
    connection: {
        status: string | null;
        needsReopen: boolean;
    } | null;
    readAt: string;
}
