const DESCRIPTIONS_ID = 'rx-descriptions';
export function visibleText(el: Element): string {
    let text = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.parentElement?.closest('[hidden], .rx-sr-only, [aria-hidden="true"]'))
            text += n.textContent ?? '';
    }
    return text.replace(/\s+/g, ' ').trim();
}
const fold = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function labelFits(label: string, text: string): boolean {
    return !text || fold(label).includes(fold(text));
}
let counter = 0;
function descriptionFor(el: HTMLElement, label: string): string {
    let box = document.getElementById(DESCRIPTIONS_ID);
    if (!box) {
        box = document.createElement('div');
        box.id = DESCRIPTIONS_ID;
        box.hidden = true;
        document.getElementById('rx-store')?.after(box);
    }
    let id = el.getAttribute('data-rx-desc');
    let span = id ? document.getElementById(id) : null;
    if (!span) {
        id = `rx-desc-${++counter}`;
        span = document.createElement('span');
        span.id = id;
        box.appendChild(span);
        el.setAttribute('data-rx-desc', id);
    }
    if (span.textContent !== label)
        span.textContent = label;
    return id!;
}
const MARK = 'data-rx-labelled';
export function applyLabels(root: ParentNode): void {
    const inUse = new Set<string>();
    for (const el of root.querySelectorAll<HTMLElement>(`[${MARK}]`)) {
        if (el.getAttribute('data-rx-label'))
            continue;
        el.removeAttribute('aria-label');
        el.removeAttribute('aria-describedby');
        el.removeAttribute('data-rx-desc');
        el.removeAttribute(MARK);
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-rx-label]')) {
        const label = el.getAttribute('data-rx-label') ?? '';
        if (!label)
            continue;
        el.setAttribute(MARK, '');
        if (labelFits(label, visibleText(el))) {
            if (el.getAttribute('aria-label') !== label)
                el.setAttribute('aria-label', label);
            if (el.hasAttribute('aria-describedby'))
                el.removeAttribute('aria-describedby');
        }
        else {
            if (el.hasAttribute('aria-label'))
                el.removeAttribute('aria-label');
            const id = descriptionFor(el, label);
            inUse.add(id);
            if (el.getAttribute('aria-describedby') !== id)
                el.setAttribute('aria-describedby', id);
        }
    }
    const box = document.getElementById(DESCRIPTIONS_ID);
    if (box)
        for (const span of [...box.children])
            if (!inUse.has(span.id))
                span.remove();
}
export function watchLabels(root: HTMLElement): () => void {
    let queued = false;
    const run = () => {
        queued = false;
        applyLabels(root);
    };
    const observer = new MutationObserver(() => {
        if (queued)
            return;
        queued = true;
        requestAnimationFrame(run);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-rx-label'] });
    applyLabels(root);
    return () => observer.disconnect();
}
