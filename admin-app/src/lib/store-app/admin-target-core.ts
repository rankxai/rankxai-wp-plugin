import type { StorePlatformName } from './route-policy-core';
export type AdminTarget = {
    kind: 'product';
    id: string | number;
} | {
    kind: 'products';
} | {
    kind: 'product_new';
} | {
    kind: 'category';
    id: string | number;
} | {
    kind: 'categories';
} | {
    kind: 'post';
    id: string | number;
} | {
    kind: 'media';
} | {
    kind: 'pages';
} | {
    kind: 'preferences';
} | {
    kind: 'policies';
} | {
    kind: 'store_pages';
} | {
    kind: 'themes';
} | {
    kind: 'settings';
} | {
    kind: 'site_visibility';
} | {
    kind: 'reading';
};
export const WP_ADMIN_SCHEME = 'wp-admin://';
export const SHOPIFY_ADMIN_SCHEME = 'shopify://admin';
export function isAdminLink(href: string | null | undefined): boolean {
    return !!href && (href.startsWith(SHOPIFY_ADMIN_SCHEME) || href.startsWith(WP_ADMIN_SCHEME));
}
const REF_KINDS: Partial<Record<AdminTarget['kind'], readonly string[]>> = {
    product: ['Product', 'product'],
    category: ['Collection', 'category'],
    post: ['Article', 'post'],
};
export function trailingId(id: string | number, kinds?: readonly string[]): string | null {
    const s = String(id).trim();
    const m = /^(?:gid:\/\/shopify\/([A-Za-z]+)\/|woo:\/\/([a-z_]+)\/)?(\d{1,20})$/.exec(s);
    if (!m || /^0+$/.test(m[3]!))
        return null;
    const kind = m[1] ?? m[2];
    if (kind && kinds && !kinds.includes(kind))
        return null;
    return m[3]!;
}
const SHOPIFY: Record<AdminTarget['kind'], {
    path: (id: string | null) => string | null;
    label: string;
}> = {
    product: { path: (id) => (id ? `/products/${id}` : null), label: 'Products' },
    products: { path: () => '/products', label: 'Products' },
    product_new: { path: () => '/products/new', label: 'Products › Add product' },
    category: { path: (id) => (id ? `/collections/${id}` : null), label: 'Collections' },
    categories: { path: () => '/collections', label: 'Collections' },
    post: { path: (id) => (id ? `/articles/${id}` : null), label: 'Blog posts' },
    media: { path: () => '/content/files', label: 'Content › Files' },
    pages: { path: () => '/pages', label: 'Online Store › Pages' },
    preferences: { path: () => '/online_store/preferences', label: 'Online Store › Preferences' },
    policies: { path: () => '/settings/legal', label: 'Settings › Policies' },
    store_pages: { path: () => '/settings/legal', label: 'Settings › Policies' },
    themes: { path: () => '/themes', label: 'Online Store › Themes' },
    settings: { path: () => '/settings', label: 'Settings' },
    site_visibility: { path: () => '/online_store/preferences', label: 'Online Store › Preferences' },
    reading: { path: () => null, label: '' },
};
const WOOCOMMERCE: Record<AdminTarget['kind'], {
    path: (id: string | null) => string | null;
    label: string;
}> = {
    product: { path: (id) => (id ? `post.php?post=${id}&action=edit` : null), label: 'Products' },
    products: { path: () => 'edit.php?post_type=product', label: 'Products' },
    product_new: { path: () => 'post-new.php?post_type=product', label: 'Products › Add New' },
    category: { path: (id) => (id ? `term.php?taxonomy=product_cat&tag_ID=${id}&post_type=product` : null), label: 'Products › Categories' },
    categories: { path: () => 'edit-tags.php?taxonomy=product_cat&post_type=product', label: 'Products › Categories' },
    post: { path: (id) => (id ? `post.php?post=${id}&action=edit` : null), label: 'Posts' },
    media: { path: () => 'upload.php', label: 'Media › Library' },
    pages: { path: () => 'edit.php?post_type=page', label: 'Pages' },
    preferences: { path: () => 'options-general.php', label: 'Settings › General' },
    policies: { path: () => 'options-privacy.php', label: 'Settings › Privacy' },
    store_pages: { path: () => 'admin.php?page=wc-settings&tab=advanced', label: 'WooCommerce › Settings › Advanced' },
    themes: { path: () => 'themes.php', label: 'Appearance › Themes' },
    settings: { path: () => 'admin.php?page=wc-settings', label: 'WooCommerce › Settings' },
    site_visibility: { path: () => 'admin.php?page=wc-settings&tab=site-visibility', label: 'WooCommerce › Settings › Site visibility' },
    reading: { path: () => 'options-reading.php', label: 'Settings › Reading' },
};
export function adminLinkFor(platform: StorePlatformName, target: AdminTarget): string | null {
    const id = 'id' in target ? trailingId(target.id, REF_KINDS[target.kind]) : null;
    if (platform === 'woocommerce') {
        const p = WOOCOMMERCE[target.kind].path(id);
        return p ? `${WP_ADMIN_SCHEME}${p}` : null;
    }
    const p = SHOPIFY[target.kind].path(id);
    return p ? `${SHOPIFY_ADMIN_SCHEME}${p}` : null;
}
export function adminPlace(platform: StorePlatformName, target: AdminTarget): {
    link: string;
    label: string;
} | null {
    const link = adminLinkFor(platform, target);
    if (!link)
        return null;
    return { link, label: (platform === 'woocommerce' ? WOOCOMMERCE : SHOPIFY)[target.kind].label };
}
export function adminTargetFromPath(path: string): AdminTarget | null {
    const p = path.replace(/^shopify:\/\/admin/, '').replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
    let m: RegExpExecArray | null;
    if (p === '/products')
        return { kind: 'products' };
    if (p === '/products/new')
        return { kind: 'product_new' };
    if ((m = /^\/products\/(\d{1,20})$/.exec(p)))
        return { kind: 'product', id: m[1]! };
    if (p === '/collections')
        return { kind: 'categories' };
    if ((m = /^\/collections\/(\d{1,20})$/.exec(p)))
        return { kind: 'category', id: m[1]! };
    if ((m = /^\/articles\/(\d{1,20})$/.exec(p)))
        return { kind: 'post', id: m[1]! };
    if (p === '/content/files')
        return { kind: 'media' };
    if (p === '/pages')
        return { kind: 'pages' };
    if (p === '/online_store/preferences')
        return { kind: 'preferences' };
    if (p === '/settings/legal')
        return { kind: 'policies' };
    if (p === '/themes' || p.startsWith('/themes/'))
        return { kind: 'themes' };
    if (p === '/settings')
        return { kind: 'settings' };
    return null;
}
export function localiseAdminLabel(platform: StorePlatformName, path: string, label: string): string {
    if (platform === 'shopify' || !label.startsWith('Open '))
        return label;
    const target = adminTargetFromPath(path);
    const place = target ? adminPlace(platform, target) : null;
    return place ? `Open ${place.label}` : label;
}
