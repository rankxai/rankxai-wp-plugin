import { useStore } from '../plan-context';
import { APP_PATHS, searchHref } from '@/lib/shopify-app/app-routes-core';
import { storeSettingLink } from '@/lib/shopify-app/product-issues-core';
import { AdminLink, BackLink, ErrorBanner, formatDate, useLoad, usePageError } from '../kit';
import { CheckAgainAction } from '../components/CheckAgain';
import { SkeletonSection, StatusBadge } from '../components/Status';
import type { CatalogueData } from './CatalogueFixes';
import * as UI from '../ui';
function StoreRequirementsSection() {
    const { platform, words } = useStore();
    const cat = useLoad<CatalogueData>('catalogue');
    const items = (cat.data?.blockers ?? []).filter((b) => b.code !== 'password');
    if (!cat.data?.scan || items.length === 0)
        return null;
    return (<UI.Section heading="What AI shopping needs from your store">
      <UI.Stack gap="base">
        <UI.Text color="subdued">Settings on your store, not on your products. Each link opens the page of your admin where you change it, in a new tab.</UI.Text>
        {items.map((b, i) => {
            const link = storeSettingLink(b.code, platform, b.policies);
            return (<UI.Stack key={b.code} gap="small-200">
              {i > 0 ? <UI.Divider /> : null}
              <UI.Stack direction="inline" gap="small-200" alignItems="center">
                <UI.Text type="strong">{b.title}</UI.Text>
                {b.kind === 'blocks' ? (<StatusBadge status="cant_be_shown" label="Blocks AI shopping"/>) : b.kind === 'cant_check' ? (<StatusBadge status="cant_tell" label="Check it yourself"/>) : (<StatusBadge status="needs_attention" label={b.code === 'collection_links' ? 'Needs your theme developer' : 'Needs attention'}/>)}
              </UI.Stack>
              <UI.Text color="subdued">{b.body}</UI.Text>
              {link ? <AdminLink path={link.href}>{link.label}</AdminLink> : platform === 'shopify' ? <UI.Text color="subdued">{`Reopen RankX AI from ${words.admin}`}</UI.Text> : null}
            </UI.Stack>);
        })}
      </UI.Stack>
    </UI.Section>);
}
interface Readiness {
    host: string | null;
    storefront: {
        state: 'password' | 'not_served' | 'served' | 'unknown';
        title: string;
        body: string;
        tone: 'warning' | 'info' | 'success';
        checkedAt: string | null;
        files: Array<{
            path: string;
            state: string;
            status: number;
        }>;
    };
    signals: {
        state: 'ok' | 'none' | 'unreadable';
        row: {
            capturedAt: string;
            robots: string;
            llms: string;
            homepage: string;
            blanketDisallow: boolean | null;
        } | null;
    };
    adminLinks: {
        agentic: string;
        policies: string;
    };
}
const STATE_BADGE: Record<string, {
    label: string;
    tone: 'success' | 'warning' | 'info';
}> = {
    served: { label: 'Readable', tone: 'success' },
    password: { label: 'Password-protected', tone: 'warning' },
    not_served: { label: 'Files not published', tone: 'info' },
    unknown: { label: 'Not checked', tone: 'info' },
};
const FILE_STATE: Record<string, string> = {
    served: 'Published',
    password: 'Behind the store password',
    not_served: 'Not published by your theme',
    unknown: 'Could not be checked just now',
};
const SIGNAL: Record<string, string> = { present: 'Found', absent: 'Not found', unknown: 'Could not be read' };
export function StoreSetupPage() {
    const { platform } = useStore();
    const passwordLink = storeSettingLink('password', platform);
    const data = useLoad<Readiness>('readiness');
    const [error, setError] = usePageError();
    const d = data.data;
    const badge = d ? STATE_BADGE[d.storefront.state] : null;
    return (<UI.Page heading="How AI assistants read your store" inlineSize="large">
      <BackLink href={APP_PATHS.settings} label="Settings"/>
      <CheckAgainAction running={false} setError={setError} onStarted={() => data.reload()}/>
      <ErrorBanner error={error ?? data.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && data.loading ? <SkeletonSection lines={4} label="Reading your store"/> : null}
      {d && badge ? (<>
          <UI.Section heading="Your storefront">
            <UI.Stack gap="small-200">
              
              <UI.Text color="subdued">Whether AI assistants can open your store and read what it publishes for them.</UI.Text>
              <UI.Badge tone={badge.tone}>{badge.label}</UI.Badge>
              <UI.Text type="strong">{d.storefront.title}</UI.Text>
              <UI.Paragraph>{d.storefront.body}</UI.Paragraph>
              {d.storefront.checkedAt ? <UI.Text color="subdued">Checked {formatDate(d.storefront.checkedAt)}</UI.Text> : null}
              {d.storefront.files.map((f) => (<UI.Text key={f.path} color="subdued">
                  {f.path}: {FILE_STATE[f.state] ?? f.state}
                </UI.Text>))}
              {d.storefront.state === 'password' && passwordLink ? <AdminLink path={passwordLink.href}>{passwordLink.label}</AdminLink> : null}
            </UI.Stack>
          </UI.Section>

          <StoreRequirementsSection />

          
          <UI.Section heading="Structured data, llms.txt and agents.md">
            <UI.Stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
              <UI.Text>These are now in SEO › Rich results, beside what Google can read on your pages.</UI.Text>
              <UI.Button href={searchHref('rich')}>Open Rich results</UI.Button>
            </UI.Stack>
          </UI.Section>

          <UI.Section heading="Daily site watch">
            {d.signals.state === 'unreadable' ? (<UI.Paragraph>We could not read the latest watch just now.</UI.Paragraph>) : !d.signals.row ? (<UI.Paragraph>The daily watch has not run for your store yet.</UI.Paragraph>) : d.storefront.state === 'password' ? (<UI.Stack gap="small-200">
                <UI.Paragraph>Your store is password-protected, so the watch sees the password page instead of your files. It reports them once the password is removed.</UI.Paragraph>
                <UI.Text color="subdued">Checked {formatDate(d.signals.row.capturedAt)}</UI.Text>
              </UI.Stack>) : (<UI.Stack gap="small-200">
                <UI.Text>robots.txt: {SIGNAL[d.signals.row.robots] ?? d.signals.row.robots}</UI.Text>
                <UI.Text>llms.txt: {SIGNAL[d.signals.row.llms] ?? d.signals.row.llms}</UI.Text>
                <UI.Text>Home page: {SIGNAL[d.signals.row.homepage] ?? d.signals.row.homepage}</UI.Text>
                {d.signals.row.blanketDisallow ? <UI.Text>Your robots.txt asks every crawler to stay away.</UI.Text> : null}
                <UI.Text color="subdued">Checked {formatDate(d.signals.row.capturedAt)}</UI.Text>
              </UI.Stack>)}
          </UI.Section>

        </>) : null}
    </UI.Page>);
}
