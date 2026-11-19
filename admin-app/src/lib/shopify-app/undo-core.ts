const UNDOABLE_STATUSES: ReadonlySet<string> = new Set(['applied', 'applied_unverified', 'undo_failed']);
export const UNDOABLE_STATUS_LIST: readonly string[] = [...UNDOABLE_STATUSES];
export const UNDO_CLAIM_STALE_MS = 5 * 60000;
export const UNDO_IN_PROGRESS_NOTICE = 'This change is already being undone. Refresh in a moment to see the result.';
export function mergeUndoIds(prior: readonly string[], added: readonly string[]): string[] {
    const out = [...prior];
    for (const id of added)
        if (!out.includes(id))
            out.push(id);
    return out;
}
export const UNDO_NOT_RECORDED_NOTICE = 'This change is on your store, but we could not add it to Changes, so it cannot be undone from the app.';
export function withUndoState(message: string | null, landed: boolean, change: {
    id: string;
} | null): string | null {
    if (!landed || change)
        return message;
    return message ? `${message} ${UNDO_NOT_RECORDED_NOTICE}` : UNDO_NOT_RECORDED_NOTICE;
}
export function isUndoable(change: {
    status: string;
    undone_at?: string | null;
    undoneAt?: string | null;
}): boolean {
    return UNDOABLE_STATUSES.has(change.status) && !(change.undone_at ?? change.undoneAt);
}
export const CHANGES_STEP = 500;
export const CHANGES_MAX = 5000;
export function changesLimit(asked: string | null): number {
    const n = Number(asked);
    return Number.isInteger(n) && n > CHANGES_STEP ? Math.min(n, CHANGES_MAX) : CHANGES_STEP;
}
export interface UndoLogRow {
    remote_id: string | null;
    fields_changed: string[] | null;
}
export function rowsStillToRevert<T extends UndoLogRow>(written: readonly T[], restored: readonly UndoLogRow[]): T[] {
    return written.filter((row) => {
        const onObject = restored.filter((r) => r.remote_id === row.remote_id);
        if (onObject.length === 0)
            return true;
        const fields = row.fields_changed ?? [];
        if (fields.length === 0)
            return false;
        const covered = new Set(onObject.flatMap((r) => r.fields_changed ?? []));
        return !fields.every((f) => covered.has(f));
    });
}
