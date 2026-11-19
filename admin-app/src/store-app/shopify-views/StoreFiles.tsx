import { useEffect, useState } from 'react';
import { api } from '../api';
import { host } from '../host';
import { AdminLink, useLoad } from '../kit';
import { embedStatusFromExtensions, type EmbedStatus } from '@/lib/shopify-app/structured-data-core';
import * as UI from '../ui';
interface StructuredDataInfo {
    activateLink: string | null;
    mainThemeId: string | null;
    status: EmbedStatus | null;
}
async function readEmbedStatus(mainThemeId: string | null): Promise<EmbedStatus> {
    try {
        const fromBridge = host.appExtensions ? embedStatusFromExtensions(await host.appExtensions(), mainThemeId) : 'unknown';
        if (fromBridge !== 'unknown')
            return fromBridge;
    }
    catch {
    }
    const r = await api<StructuredDataInfo>('readiness/structured-data?read=1');
    return r.ok && r.data?.status ? r.data.status : 'unknown';
}
const EMBED_BADGE: Record<EmbedStatus, {
    label: string;
    tone: 'success' | 'info' | 'neutral';
    body: string;
}> = {
    on: { label: 'On', tone: 'success', body: 'It is on in your live theme.' },
    off: { label: 'Off', tone: 'info', body: 'Turn it on in your theme editor, then save. It takes a few seconds.' },
    unknown: { label: 'Not checked', tone: 'neutral', body: 'We could not check it just now. Your theme editor shows it under App embeds.' },
};
export function StructuredDataSection() {
    const info = useLoad<StructuredDataInfo>('readiness/structured-data');
    const [status, setStatus] = useState<EmbedStatus | 'checking'>('checking');
    const [round, setRound] = useState(0);
    const mainThemeId = info.data?.mainThemeId ?? null;
    const loaded = !info.loading;
    useEffect(() => {
        if (!loaded)
            return;
        let cancelled = false;
        void readEmbedStatus(mainThemeId).then((s) => {
            if (!cancelled)
                setStatus(s);
        });
        return () => {
            cancelled = true;
        };
    }, [loaded, mainThemeId, round]);
    useEffect(() => {
        const again = () => setRound((n) => n + 1);
        window.addEventListener('focus', again);
        return () => window.removeEventListener('focus', again);
    }, []);
    const badge = status === 'checking' ? null : EMBED_BADGE[status];
    return (<UI.Section heading="Extra product info for Google and AI">
      <UI.Stack gap="small-200">
        <UI.Paragraph>
          Shopify and your theme already describe your products and your business to search engines. This adds what they leave out: breadcrumbs, and, if you
          choose, product star ratings from your reviews app. It leaves out what it can see your theme already prints. Free on every plan.
        </UI.Paragraph>
        
        {badge ? <UI.Badge tone={badge.tone}>{badge.label}</UI.Badge> : <UI.Badge tone="neutral">Checking</UI.Badge>}
        <UI.Paragraph>{badge ? badge.body : 'Checking whether it is on in your live theme.'}</UI.Paragraph>
        {info.data?.activateLink ? (<AdminLink path={info.data.activateLink}>{status === 'on' ? 'Open the theme editor' : 'Turn on in the theme editor'}</AdminLink>) : null}
        <UI.Stack direction="inline">
          <UI.Button variant="tertiary" disabled={status === 'checking' || undefined} onClick={() => {
            setStatus('checking');
            setRound((n) => n + 1);
        }}>
            Check theme again
          </UI.Button>
        </UI.Stack>
      </UI.Stack>
    </UI.Section>);
}
interface AgentFilesInfo {
    paths: string[];
    host: string | null;
    templateFile: string;
    live: {
        state: 'read' | 'unreadable';
        status: number | null;
        score: {
            score: number;
            max: number;
        } | null;
        missing: string[];
        customisedByRankx: boolean;
        text: string | null;
    };
}
export function AgentFilesSection({ passwordProtected }: {
    passwordProtected: boolean;
}) {
    const info = useLoad<AgentFilesInfo>('readiness/agent-files');
    const [showLive, setShowLive] = useState(false);
    const d = info.data;
    return (<UI.Section heading="llms.txt and agents.md">
      <UI.Stack gap="small-200">
        <UI.Paragraph>Shopify publishes /llms.txt and /agents.md for your store, the files AI assistants read to learn what it is. Free on every plan.</UI.Paragraph>
        
        <UI.Text color="subdued">Google says llms.txt will neither help nor harm a store in Google Search. AI assistants and shopping agents may read it.</UI.Text>
        {passwordProtected ? <UI.Paragraph>Your store is password-protected, so assistants cannot read these files until you remove the password.</UI.Paragraph> : null}
        {!d && info.loading ? <UI.Text color="subdued">Reading your file…</UI.Text> : null}
        {!d && !info.loading ? <UI.Paragraph>We could not read your file just now.</UI.Paragraph> : null}
        {d ? (<>
            <UI.Text type="strong">Your file now</UI.Text>
            {d.live.state === 'read' && d.live.score ? (<UI.Text>
                {d.live.customisedByRankx ? 'Your store serves the file you added from RankX AI. ' : ''}
                It covers {d.live.score.score} of {d.live.score.max} things assistants look for.
                {d.live.missing.length > 0 ? ` Missing: ${d.live.missing.slice(0, 4).join('; ')}.` : ''}
              </UI.Text>) : (<UI.Text color="subdued">
                {passwordProtected ? 'We cannot read it while your store has a password.' : 'We could not read it from your store just now.'}
              </UI.Text>)}
            {d.live.text ? (<>
                <UI.Button variant="tertiary" onClick={() => setShowLive((v) => !v)}>{showLive ? 'Hide your current file' : 'View your current file'}</UI.Button>
                {showLive ? <UI.TextArea label="Current file (read only)" value={d.live.text} rows={10} readOnly/> : null}
              </>) : null}

            <UI.Text color="subdued">Shopify writes this file from your store. To fill a gap, add the detail to your store (your policies, product details or store contact), and it appears here.</UI.Text>
            <UI.Stack direction="inline">
              <UI.Button variant="tertiary" onClick={() => void info.reload()}>Check my file</UI.Button>
            </UI.Stack>
          </>) : null}
      </UI.Stack>
    </UI.Section>);
}
