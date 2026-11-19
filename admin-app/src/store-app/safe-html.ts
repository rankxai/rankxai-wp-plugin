const DROP = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea', 'option', 'svg', 'math', 'template', 'noscript', 'link', 'meta', 'base', 'title', 'head']);
const KEEP = new Set([
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'a', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark', 'abbr', 'cite', 'q', 'span', 'div',
    'section', 'article', 'aside', 'header', 'footer', 'figure', 'figcaption', 'img', 'caption', 'table', 'thead', 'tbody',
    'tfoot', 'tr', 'th', 'td', 'col', 'colgroup', 'time',
]);
const ATTRS: Record<string, readonly string[]> = {
    '*': ['class', 'id'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    time: ['datetime'],
};
export function dropsWithContents(tag: string): boolean {
    return DROP.has(tag);
}
export function keepsElement(tag: string): boolean {
    return KEEP.has(tag);
}
export function allowsAttribute(tag: string, name: string): boolean {
    const n = name.toLowerCase();
    if (n.startsWith('on'))
        return false;
    return (ATTRS['*'] ?? []).includes(n) || (ATTRS[tag] ?? []).includes(n);
}
export function isSafeUrl(value: string): boolean {
    const v = value.replace(/[\u0000- \u007f]+/g, '').toLowerCase();
    const scheme = /^([a-z][a-z0-9+.-]*):/.exec(v);
    if (!scheme)
        return true;
    return scheme[1] === 'http' || scheme[1] === 'https' || scheme[1] === 'mailto';
}
function clean(node: Node, doc: Document): void {
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 8) {
            child.parentNode?.removeChild(child);
            continue;
        }
        if (child.nodeType !== 1)
            continue;
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (dropsWithContents(tag)) {
            el.parentNode?.removeChild(el);
            continue;
        }
        clean(el, doc);
        if (!keepsElement(tag)) {
            const frag = doc.createDocumentFragment();
            while (el.firstChild)
                frag.appendChild(el.firstChild);
            el.parentNode?.replaceChild(frag, el);
            continue;
        }
        for (const attr of Array.from(el.attributes)) {
            const keep = allowsAttribute(tag, attr.name) && ((attr.name !== 'href' && attr.name !== 'src') || isSafeUrl(attr.value));
            if (!keep)
                el.removeAttribute(attr.name);
        }
        if (tag === 'a' && el.getAttribute('target') === '_blank')
            el.setAttribute('rel', 'noopener noreferrer');
    }
}
export function safeHtml(html: string | null | undefined): string {
    if (!html)
        return '';
    if (typeof DOMParser === 'undefined')
        return '';
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
    clean(doc.body, doc);
    return doc.body.innerHTML;
}
