export interface OverlayControl {
    show(invoker?: HTMLElement | null): void;
    hide(): void;
    isOpen(): boolean;
    justClosed?(): boolean;
}
const overlays = new Map<string, OverlayControl>();
export function registerOverlay(id: string, control: OverlayControl): () => void {
    overlays.set(id, control);
    return () => {
        if (overlays.get(id) === control)
            overlays.delete(id);
    };
}
export function runOverlayCommand(id: string, command: string | undefined, invoker?: HTMLElement | null): void {
    const o = overlays.get(id);
    if (!o)
        return;
    if (command === '--hide')
        o.hide();
    else if (command === '--toggle' || command === '--auto' || command === undefined) {
        if (o.isOpen())
            o.hide();
        else if (!o.justClosed?.())
            o.show(invoker);
    }
    else
        o.show(invoker);
}
const dirty = new Set<symbol>();
const dirtyListeners = new Set<() => void>();
export function setFormDirty(form: symbol, isDirty: boolean): void {
    const had = dirty.has(form);
    if (isDirty)
        dirty.add(form);
    else
        dirty.delete(form);
    if (had !== isDirty)
        for (const l of dirtyListeners)
            l();
}
export function hasUnsavedChanges(): boolean {
    return dirty.size > 0;
}
export function onDirtyChange(listener: () => void): () => void {
    dirtyListeners.add(listener);
    return () => dirtyListeners.delete(listener);
}
let askToLeave: (() => Promise<boolean>) | null = null;
export function setLeavePrompt(fn: (() => Promise<boolean>) | null): void {
    askToLeave = fn;
}
export async function confirmLeave(): Promise<boolean> {
    if (!hasUnsavedChanges())
        return true;
    return askToLeave ? askToLeave() : true;
}
export interface Toast {
    id: number;
    message: string;
}
let nextToast = 1;
let toasts: Toast[] = [];
const toastListeners = new Set<(t: Toast[]) => void>();
export function pushToast(message: string): void {
    const t = { id: nextToast++, message };
    toasts = [...toasts.slice(-2), t];
    for (const l of toastListeners)
        l(toasts);
    setTimeout(() => dismissToast(t.id), 5000);
}
export function dismissToast(id: number): void {
    const before = toasts.length;
    toasts = toasts.filter((t) => t.id !== id);
    if (toasts.length !== before)
        for (const l of toastListeners)
            l(toasts);
}
export function onToasts(listener: (t: Toast[]) => void): () => void {
    toastListeners.add(listener);
    listener(toasts);
    return () => toastListeners.delete(listener);
}
