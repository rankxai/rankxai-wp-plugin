export const PLAN_FREQUENCIES = [7, 14, 30] as const;
export type PlanFrequency = (typeof PLAN_FREQUENCIES)[number];
export const PLAN_CAP_MAX = 31;
export const PLAN_TOPICS_MAX = 50;
export const PLAN_LENGTHS = ['short', 'standard', 'long'] as const;
export type PlanLength = (typeof PLAN_LENGTHS)[number];
export function frequencyLabel(days: number): string {
    if (days === 7)
        return 'Every week';
    if (days === 14)
        return 'Every 2 weeks';
    if (days === 30)
        return 'Every month';
    return `Every ${days} days`;
}
export function allowedFrequencies(floorDays: number): PlanFrequency[] {
    return PLAN_FREQUENCIES.filter((d) => d >= floorDays);
}
export function runLine(state: string, failReason: string | null): {
    label: string;
    tone: 'info' | 'success' | 'warning' | 'neutral';
    detail: string | null;
} {
    switch (state) {
        case 'planned':
            return { label: 'Planned', tone: 'neutral', detail: null };
        case 'pending_research':
            return { label: 'Researching', tone: 'info', detail: null };
        case 'generating':
            return { label: 'Being written', tone: 'info', detail: null };
        case 'publishing':
            return { label: 'Being saved', tone: 'info', detail: null };
        case 'done':
        case 'done_publish_failed':
            return { label: 'Ready for your review', tone: 'success', detail: null };
        case 'done_needs_edits':
            return { label: 'Needs your edits', tone: 'warning', detail: 'It was written and saved, and one check needs a fix before it is published.' };
        case 'cancelled':
            return { label: 'Cancelled', tone: 'neutral', detail: failLine(failReason) };
        case 'failed':
            return { label: 'Not written', tone: 'warning', detail: failLine(failReason) };
        default:
            return { label: 'In progress', tone: 'info', detail: null };
    }
}
export function failLine(reason: string | null): string | null {
    switch (reason) {
        case null:
            return null;
        case 'insufficient_credits':
            return 'There were not enough credits. Nothing was charged; the next article is tried on schedule.';
        case 'subscription_inactive':
            return 'Your plan is not active, so nothing was written or charged.';
        case 'client_budget_exceeded':
            return 'This store’s credit allowance for the month was used up. Nothing was charged.';
        case 'research_unusable':
            return 'The research found no sources good enough to write from, so this topic was left out. Nothing was charged.';
        case 'research_failed':
        case 'generation_failed':
        case 'dispatch_failed':
            return 'Writing could not finish. Nothing was charged; the next topic is written on schedule.';
        case 'pending_research_stalled':
        case 'generating_stalled':
        case 'publish_stalled':
            return 'It stopped making progress and was closed, so the next one can start.';
        case 'brief_archived':
        case 'item_cancelled':
            return 'It was removed before it was finished.';
        default:
            return 'It could not be written. The next topic is written on schedule.';
    }
}
export function skipLine(reason: string | null): string | null {
    switch (reason) {
        case null:
        case 'not_due':
            return null;
        case 'monthly_cap_reached':
            return 'This month’s articles are written. The next one starts next month, or raise the monthly limit.';
        case 'run_in_flight':
            return 'The last article is still being written.';
        case 'project_busy':
            return 'You are writing an article yourself; the plan waits for it.';
        case 'no_topic_available':
            return 'There are no topics left. Add some below.';
        case 'plan_feature_missing':
            return 'Writing articles is included in every paid plan.';
        default:
            return null;
    }
}
export function monthlyCeiling(cap: number, pricePerArticle: number | null): number | null {
    return pricePerArticle === null ? null : cap * pricePerArticle;
}
