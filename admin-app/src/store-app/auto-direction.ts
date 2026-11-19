export const AUTO_DIRECTION_SELECTOR = 's-table-cell, s-text, s-paragraph, input[type="text"], input:not([type]), input[type="search"], textarea';
export const SHADOW_FIELD_SELECTOR = 's-text-field, s-text-area, s-search-field';
export function markAutoDirection(el: Element): boolean {
    let changed = false;
    if (el.matches(AUTO_DIRECTION_SELECTOR) && !el.hasAttribute('dir')) {
        el.setAttribute('dir', 'auto');
        changed = true;
    }
    if (el.matches(SHADOW_FIELD_SELECTOR)) {
        const inner = el.shadowRoot?.querySelector('input, textarea');
        if (inner && !inner.hasAttribute('dir')) {
            inner.setAttribute('dir', 'auto');
            changed = true;
        }
    }
    return changed;
}
function markTree(root: ParentNode): void {
    for (const el of root.querySelectorAll(`${AUTO_DIRECTION_SELECTOR}, ${SHADOW_FIELD_SELECTOR}`))
        markAutoDirection(el);
}
export function installAutoDirection(root: Document | Element = document): void {
    if (typeof MutationObserver === 'undefined')
        return;
    let queued = false;
    const run = () => { queued = false; markTree(root); };
    const observer = new MutationObserver(() => {
        if (queued)
            return;
        queued = true;
        requestAnimationFrame(run);
    });
    observer.observe(root instanceof Document ? root.documentElement : root, { childList: true, subtree: true });
    run();
}
