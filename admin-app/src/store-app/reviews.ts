import { batchTrigger, outcomeTrigger, shouldAskForReview, writeTrigger, type ReviewTrigger } from '@/lib/shopify-app/review-prompt-core';
import { toastSuccess } from './api';
import { host } from './host';
const state = { askedThisSession: false };
function ask(trigger: ReviewTrigger | null): void {
    if (!shouldAskForReview(trigger, state))
        return;
    state.askedThisSession = true;
    host.requestReview?.();
}
export function toastWrite(verified: boolean | null | undefined, confirmed: string, saved: string): void {
    toastSuccess(verified ? confirmed : saved);
    ask(writeTrigger(verified));
}
export function askAfterBatch(kind: 'apply' | 'undo', counts: {
    applied: number;
    failed: number;
}): void {
    ask(batchTrigger(kind, counts));
}
export function askAfterOutcome(o: {
    scanFixed: boolean;
    verdictMore: boolean;
}): void {
    ask(outcomeTrigger(o));
}
