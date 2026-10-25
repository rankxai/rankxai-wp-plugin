import { useEffect } from 'react';
import { fmtDateTime } from '../format';
import { useLoad, type PageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import { AgentFilesSection, StructuredDataSection } from '../shopify-views/StoreFiles';
import { WooAgentFilesSection } from '../components/WooAgentFiles';
import { useStore } from '../plan-context';
import * as UI from '../ui';
type State = 'pass' | 'warn' | 'fail';
interface RichData {
    state: 'ready' | 'first_check';
    refreshing: boolean;
    readFailed?: boolean;
    readAt?: string;
    passwordProtected?: boolean | null;
    embed?: 'on' | 'off' | 'unknown';
    pages?: Array<{
        kind: 'home' | 'collection' | 'product';
        label: string;
        url: string;
        findings: Array<{
            key: string;
            state: State;
            label: string;
            why: string;
            remedy: {
                label: string;
                href: string;
            } | null;
        }>;
    }>;
    help?: {
        searchConsole: string;
        merchantCenter: string;
    };
}
const BADGE: Record<State, {
    label: string;
    tone: 'success' | 'caution' | 'warning';
}> = {
    pass: { label: 'Found', tone: 'success' },
    warn: { label: 'Missing', tone: 'caution' },
    fail: { label: 'Problem', tone: 'warning' },
};
export function RichResults({ setError }: {
    setError: (e: PageError | null) => void;
}) {
    const load = useLoad<RichData>('seo/rich');
    const { platform, capabilities } = useStore();
    const themeEmbed = capabilities ? capabilities.can.themeEmbed : platform === 'shopify';
    const publishedFiles = capabilities ? capabilities.agentFiles === 'publish' : platform === 'woocommerce';
    const d = load.data;
    useEffect(() => {
        if (!d?.refreshing)
            return;
        const id = setTimeout(() => void load.reload(), 4000);
        return () => clearTimeout(id);
    }, [d?.refreshing, load]);
    const pages = d?.pages ?? [];
    const shippingMissing = pages.some((p) => p.findings.some((f) => (f.key === 'shipping' || f.key === 'returns') && f.state !== 'pass'));
    return (<UI.Stack gap="base">
      {!d ? (load.loading ? <SkeletonSection lines={5} label="Reading what Google can see"/> : null) : (<UI.Section heading="What Google can read on your pages">
          <UI.Stack gap="base">
            <UI.Text color="subdued">
              The product, business and page details your theme and apps describe for Google, read from your live store
              {d.readAt && pages.length > 0 ? ` on ${fmtDateTime(d.readAt)}` : ''}. Google uses them for richer results, such as price, stock and ratings beside a product.
            </UI.Text>
            {d.state === 'first_check' ? (<UI.Text>{d.readFailed ? 'Your store could not be read just now. We try again on our own.' : 'Reading your store now. This takes under a minute.'}</UI.Text>) : d.passwordProtected ? (<UI.Text>Your store has a password, so neither Google nor we can read its pages. Once you remove it, this shows what Google can read on each kind of page.</UI.Text>) : pages.length === 0 ? (<UI.Text>Your pages could not be read just now. We check again every day.</UI.Text>) : (<UI.QueryContainer>
                <UI.Grid gridTemplateColumns="@container (inline-size > 760px) 1fr 1fr 1fr, 1fr" gap="base">
                  {pages.map((p) => (<UI.Box key={p.kind} padding="base" border="base" borderRadius="large">
                      <UI.Stack gap="small-200">
                        <UI.Text type="strong">{p.label}</UI.Text>
                        <UI.Link href={p.url} target="_blank">
                          {p.url.replace(/^https?:\/\//, '')}
                        </UI.Link>
                        {p.findings.map((f) => (<UI.Stack key={f.key} gap="small-100">
                            <UI.Stack direction="inline" gap="small-200" alignItems="center">
                              <UI.Badge tone={BADGE[f.state].tone}>{BADGE[f.state].label}</UI.Badge>
                              <UI.Text>{f.label}</UI.Text>
                            </UI.Stack>
                            {f.state !== 'pass' ? <UI.Text color="subdued">{f.why}</UI.Text> : null}
                            {f.remedy && f.state !== 'pass' ? (<UI.Link href={f.remedy.href} target="_blank">
                                {f.remedy.label}
                              </UI.Link>) : null}
                          </UI.Stack>))}
                      </UI.Stack>
                    </UI.Box>))}
                </UI.Grid>
              </UI.QueryContainer>)}
            {shippingMissing && d.help ? (<UI.Text color="subdued">
                Shipping and returns are set once for the whole store, in Google’s own tools: <UI.Link href={d.help.searchConsole} target="_blank">Search Console</UI.Link> or{' '}
                <UI.Link href={d.help.merchantCenter} target="_blank">Merchant Center</UI.Link>. Google then shows them on every product.
              </UI.Text>) : null}
          </UI.Stack>
        </UI.Section>)}
      
      {themeEmbed ? <StructuredDataSection /> : null}
      {publishedFiles ? <WooAgentFilesSection setError={setError}/> : <AgentFilesSection passwordProtected={d?.passwordProtected === true} setError={setError}/>}
    </UI.Stack>);
}
