export type ReviewTrigger = 'verified_fix' | 'verified_batch' | 'positive_outcome';
export interface ReviewAskState {
    askedThisSession: boolean;
}
export function shouldAskForReview(trigger: ReviewTrigger | null, state: ReviewAskState): boolean {
    if (trigger === null)
        return false;
    return !state.askedThisSession;
}
export function writeTrigger(verified: boolean | null | undefined): ReviewTrigger | null {
    return verified === true ? 'verified_fix' : null;
}
export function batchTrigger(kind: 'apply' | 'undo', counts: {
    applied: number;
    failed: number;
}): ReviewTrigger | null {
    return kind === 'apply' && counts.applied > 0 && counts.failed === 0 ? 'verified_batch' : null;
}
export function outcomeTrigger(o: {
    scanFixed: boolean;
    verdictMore: boolean;
}): ReviewTrigger | null {
    return o.scanFixed || o.verdictMore ? 'positive_outcome' : null;
}
