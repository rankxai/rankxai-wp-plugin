import { useEffect, useState } from 'react';
import { embedStatusFromExtensions, themeEditorActivateLink, type EmbedStatus } from '@/lib/shopify-app/structured-data-core';
import { AdminLink } from '../kit';
import { host } from '../host';
import * as UI from '../ui';
export type EmbedReading = EmbedStatus | 'checking';
export function useEmbedStatus(): EmbedReading {
    const [status, setStatus] = useState<EmbedReading>('checking');
    const [round, setRound] = useState(0);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            let next: EmbedStatus = 'unknown';
            try {
                if (host.appExtensions)
                    next = embedStatusFromExtensions(await host.appExtensions(), null);
            }
            catch {
            }
            if (!cancelled)
                setStatus(next);
        })();
        return () => {
            cancelled = true;
        };
    }, [round]);
    useEffect(() => {
        const again = () => setRound((n) => n + 1);
        window.addEventListener('focus', again);
        return () => window.removeEventListener('focus', again);
    }, []);
    return status;
}
export function embedActivateLink(): string | null {
    const key = host.appApiKey?.() ?? null;
    return key ? themeEditorActivateLink(key) : null;
}
const BADGE: Record<EmbedReading, {
    label: string;
    tone: 'success' | 'info' | 'neutral';
}> = {
    on: { label: 'Extra product info on', tone: 'success' },
    off: { label: 'Extra product info off', tone: 'info' },
    unknown: { label: 'Extra product info not checked', tone: 'neutral' },
    checking: { label: 'Checking extra product info', tone: 'neutral' },
};
export function EmbedStatusLine({ status, withLink = true }: {
    status: EmbedReading;
    withLink?: boolean;
}) {
    const b = BADGE[status];
    const link = status === 'on' || !withLink ? null : embedActivateLink();
    return (<UI.Stack direction="inline" gap="small-200" alignItems="center">
      <UI.Badge tone={b.tone}>{b.label}</UI.Badge>
      {link && status !== 'checking' ? <AdminLink path={link}>Turn on in the theme editor</AdminLink> : null}
    </UI.Stack>);
}
