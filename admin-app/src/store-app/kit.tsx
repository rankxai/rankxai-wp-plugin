import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, forgetShared, sharedRead, takePrefetched, type ApiResult } from './api';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { fmtDate } from './format';
import { host } from './host';
import * as UI from './ui';
import { usePlan, useStore } from './plan-context';
import { isAdminLink, localiseAdminLabel } from '@/lib/store-app/admin-target-core';
export interface Load<T> {
    data: T | null;
    error: string | null;
    status: number | null;
    loading: boolean;
    reload: () => Promise<void>;
    replace: (data: T) => void;
}
type LoadState<T> = {
    data: T | null;
    error: string | null;
    status: number | null;
    loading: boolean;
    path: string | null;
};
export function useLoad<T>(path: string | null): Load<T> {
    const [state, setState] = useState<LoadState<T>>({
        data: null,
        error: null,
        status: null,
        loading: path !== null,
        path,
    });
    useEffect(() => {
        if (!path)
            return;
        let cancelled = false;
        void (takePrefetched<T>(path) ?? sharedRead<T>(path) ?? api<T>(path)).then((r) => {
            if (!cancelled)
                setState({ data: r.ok ? r.data : null, error: r.ok ? null : r.error, status: r.status, loading: false, path });
        });
        return () => {
            cancelled = true;
        };
    }, [path]);
    const reload = useCallback(async () => {
        if (!path)
            return;
        setState((s) => ({ ...s, loading: true }));
        forgetShared(path);
        const r = await api<T>(path);
        setState({ data: r.ok ? r.data : null, error: r.ok ? null : r.error, status: r.status, loading: false, path });
    }, [path]);
    const replace = useCallback((data: T) => setState({ data, error: null, status: 200, loading: false, path }), [path]);
    const current = state.path === path;
    return {
        data: current ? state.data : null,
        error: current ? state.error : null,
        status: current ? state.status : null,
        loading: current ? state.loading : true,
        reload,
        replace,
    };
}
export const TABLE_PAGE_SIZE = 25;
export interface PagedTableProps {
    paginate?: boolean;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    onNextPage?: () => void;
    onPreviousPage?: () => void;
}
export function usePagedRows<T>(rows: readonly T[], pageSize: number = TABLE_PAGE_SIZE): {
    rows: T[];
    tableProps: PagedTableProps;
    page: number;
    pages: number;
} {
    const [state, setState] = useState({ page: 0, length: rows.length });
    const page = state.length === rows.length ? state.page : 0;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(page, pages - 1);
    const go = (n: number) => setState({ page: Math.max(0, Math.min(n, pages - 1)), length: rows.length });
    const tableProps: PagedTableProps = rows.length > pageSize
        ? {
            paginate: true,
            hasNextPage: current < pages - 1 || undefined,
            hasPreviousPage: current > 0 || undefined,
            onNextPage: () => go(current + 1),
            onPreviousPage: () => go(current - 1),
        }
        : {};
    return { rows: rows.slice(current * pageSize, (current + 1) * pageSize), tableProps, page: current, pages };
}
export function settled(l: {
    data: unknown;
    error: unknown;
    loading: boolean;
}): boolean {
    return l.data !== null || l.error !== null || !l.loading;
}
export function pricedLabel(label: string, credits: number | null | undefined): string {
    return credits === null || credits === undefined ? label : `${label} · ${creditsLabel(credits)}`;
}
export function lockSentence(lock: LockInfo | null | undefined, credits: number | null | undefined): string | null {
    if (lock)
        return `${lock.reason}${lock.planNeeded ? ` Available on ${lock.planNeeded}.` : ''}`;
    if (credits === null || credits === undefined)
        return 'The price could not be read just now, so checking now is unavailable.';
    return null;
}
export interface PageError {
    message: string;
    planLink: boolean;
    kind?: 'plan' | 'refused' | 'too_soon' | 'permission';
    remedy?: string | null;
    field?: string;
}
export function fieldError(error: PageError | null | undefined, field: string): string | undefined {
    return error && error.field === field ? error.message : undefined;
}
export function refusalKind(status: number, remedy: string | null, code?: string | null): PageError['kind'] {
    if (code === 'spend_not_allowed')
        return 'permission';
    if (status === 402 || remedy === 'plan')
        return 'plan';
    if (status === 429)
        return 'too_soon';
    if (status === 409)
        return 'refused';
    return undefined;
}
const NOTICE: Record<NonNullable<PageError['kind']>, {
    tone: 'info' | 'warning';
    heading: string;
}> = {
    plan: { tone: 'info', heading: 'This needs a plan' },
    too_soon: { tone: 'info', heading: 'Not yet' },
    refused: { tone: 'warning', heading: 'Not changed' },
    permission: { tone: 'info', heading: 'This needs the site owner’s permission' },
};
export function usePageError(): [
    PageError | null,
    (e: PageError | null) => void
] {
    return useState<PageError | null>(null);
}
export function ErrorBanner({ error, onDismiss }: {
    error: PageError | string | null;
    onDismiss?: () => void;
}) {
    if (!error)
        return null;
    const e: PageError = typeof error === 'string' ? { message: error, planLink: false } : error;
    if (e.field)
        return null;
    const notice = e.kind ? NOTICE[e.kind] : null;
    return (<UI.Banner tone={notice?.tone ?? 'critical'} heading={notice?.heading ?? 'Something did not work'} dismissible={onDismiss ? true : undefined} onDismiss={onDismiss}>
      <UI.Paragraph>{e.message}</UI.Paragraph>
      {e.planLink ? <UI.Link href={APP_PATHS.plan}>Go to your plan</UI.Link> : null}
      {e.remedy === 'credits' ? <CreditsLink /> : null}
    </UI.Banner>);
}
function CreditsLink() {
    const { plan } = usePlan();
    const { platform } = useStore();
    const url = platform === 'woocommerce' && plan?.account?.planPageUrl ? creditsPageUrl(plan.account.planPageUrl) : null;
    return url ? (<UI.Link href={url} target="_blank">
      Add credits
    </UI.Link>) : null;
}
export function creditsPageUrl(planPageUrl: string): string | null {
    try {
        return new URL('/settings/billing?tab=credits', planPageUrl).toString();
    }
    catch {
        return null;
    }
}
export function Loading({ label = 'Loading' }: {
    label?: string;
}) {
    return (<UI.Section>
      <UI.Stack direction="inline" gap="small-200" alignItems="center">
        <UI.Spinner accessibilityLabel={label} size="base"/>
        <UI.Text color="subdued">{label}…</UI.Text>
      </UI.Stack>
    </UI.Section>);
}
export function useNoSpend(): boolean {
    const { capabilities } = useStore();
    return capabilities?.canSpend === false;
}
export function PagePrimaryAction(props: {
    children: ReactNode;
    onClick?: () => void;
    href?: string;
    disabled?: boolean;
    loading?: boolean;
    spends?: boolean;
}) {
    const noSpend = useNoSpend();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(id);
    }, []);
    if (!ready)
        return null;
    return (<UI.Button slot="primary-action" variant="primary" href={props.href} disabled={props.disabled || (props.spends && noSpend) || undefined} loading={props.loading || undefined} onClick={props.onClick}>
      {props.children}
    </UI.Button>);
}
export function ViewTabs({ children }: {
    children: ReactNode;
}) {
    return (<UI.Box paddingBlockEnd="base">
      <UI.Stack direction="inline" gap="small-200">
        {children}
      </UI.Stack>
    </UI.Box>);
}
export function BackLink({ href, label }: {
    href: string;
    label: string;
}) {
    return (<UI.Link slot="breadcrumb-actions" href={href}>
      {label}
    </UI.Link>);
}
export interface LockInfo {
    locked: true;
    reason: string;
    planNeeded: string | null;
}
export function creditsLabel(credits: number | null | undefined): string {
    if (credits === null || credits === undefined)
        return '';
    return credits === 1 ? '1 credit' : `${credits} credits`;
}
export const SPEND_NOT_ALLOWED = 'Spending credits from here needs the site owner’s permission. The person who connected this site to RankX AI can allow it.';
export function PricedButton(props: {
    label: string;
    credits: number | null | undefined;
    lock?: LockInfo | null;
    busy?: boolean;
    variant?: 'primary' | 'secondary';
    onClick: () => void;
}) {
    const unpriced = props.credits === null || props.credits === undefined;
    const noSpend = useNoSpend();
    const disabled = !!props.lock || unpriced || noSpend || !!props.busy;
    return (<UI.Stack gap="small-200">
      <UI.Button variant={props.variant ?? 'secondary'} disabled={disabled} loading={props.busy || undefined} onClick={props.onClick}>
        {unpriced ? props.label : `${props.label} · ${creditsLabel(props.credits)}`}
      </UI.Button>
      {props.lock ? (<UI.Text color="subdued">
          {props.lock.reason}
          {props.lock.planNeeded ? ` Available on ${props.lock.planNeeded}.` : ''}
        </UI.Text>) : unpriced ? (<UI.Text color="subdued">The price could not be read just now, so this is unavailable.</UI.Text>) : noSpend ? (<UI.Text color="subdued">{SPEND_NOT_ALLOWED}</UI.Text>) : null}
    </UI.Stack>);
}
export function formatDate(iso: string | null | undefined): string {
    return fmtDate(iso);
}
export async function act<T>(run: () => Promise<ApiResult<T>>, setBusy: (b: boolean) => void, setError: (e: PageError | null) => void): Promise<ApiResult<T>> {
    setBusy(true);
    setError(null);
    const r = await run();
    setBusy(false);
    if (!r.ok)
        setError({ message: r.error ?? 'Something went wrong.', planLink: r.remedy === 'plan', remedy: r.remedy, kind: refusalKind(r.status, r.remedy, r.code), ...(r.field ? { field: r.field } : {}) });
    return r;
}
export function adminHref(path: string): {
    href: string;
    target?: '_blank';
} {
    return host.adminHref(path);
}
export function openAdmin(path: string): void {
    const a = adminHref(path);
    window.open(a.href, a.target ?? '_self', 'noopener');
}
export function AdminLink({ path, children, onOpen }: {
    path: string;
    children: ReactNode;
    onOpen?: () => void;
}) {
    const { platform } = useStore();
    const a = adminHref(path);
    if (typeof children === 'string')
        children = localiseAdminLabel(platform, path, children);
    return (<UI.Link href={a.href} target={a.target} onClick={onOpen}>
      {children}
    </UI.Link>);
}
export function AdminButton({ path, label, onOpen, variant }: {
    path: string;
    label: string;
    onOpen?: () => void;
    variant?: 'primary' | 'secondary' | 'tertiary';
}) {
    const { platform } = useStore();
    const a = adminHref(path);
    label = localiseAdminLabel(platform, path, label);
    return (<UI.Button icon="external" href={a.href} target={a.target} variant={variant} onClick={onOpen} accessibilityLabel={`${label} (opens in a new tab)`}>
      {label}
    </UI.Button>);
}
export function GoButton({ href, label, accessibilityLabel, variant }: {
    href: string;
    label: string;
    accessibilityLabel?: string;
    variant?: 'primary' | 'secondary';
}) {
    if (isAdminLink(href))
        return <AdminButton path={href} label={label} variant={variant ?? 'secondary'}/>;
    return (<UI.Button href={href} variant={variant ?? 'secondary'} accessibilityLabel={accessibilityLabel}>
      {label}
    </UI.Button>);
}
