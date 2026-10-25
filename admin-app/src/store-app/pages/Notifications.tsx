import { useState } from 'react';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { api, toastSuccess } from '../api';
import { useRouter } from '../router';
import { BackLink, ErrorBanner, act, formatDate, useLoad, usePageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import * as UI from '../ui';
interface Notification {
    id: string;
    category: string;
    severity: 'critical' | 'warning' | 'info';
    isActionable: boolean;
    title: string;
    body: string | null;
    link: string | null;
    groupCount: number;
    readAt: string | null;
    createdAt: string;
}
export function NotificationsPage() {
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const list = useLoad<{
        unread: number | null;
        notifications: Notification[];
    }>(`notifications?filter=${filter}`);
    const { navigate } = useRouter();
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState(false);
    const items = list.data?.notifications ?? [];
    async function open(n: Notification) {
        if (!n.readAt)
            await api(`notifications/${n.id}/read`, { method: 'POST' });
        if (n.link)
            navigate(n.link);
        else
            void list.reload();
    }
    return (<UI.Page heading="Notifications" inlineSize="large">
      <BackLink href={APP_PATHS.home} label="Home"/>
      <ErrorBanner error={error ?? list.error} onDismiss={error ? () => setError(null) : undefined}/>
      <UI.Section>
        <UI.Stack direction="inline" gap="small-200" alignItems="center">
          
          <UI.PressButton pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </UI.PressButton>
          <UI.PressButton pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
            {list.data?.unread ? `Unread (${list.data.unread})` : 'Unread'}
          </UI.PressButton>
          <UI.Button variant="tertiary" disabled={busy || !list.data?.unread} onClick={() => void act(() => api('notifications/read-all', { method: 'POST', body: { before: new Date().toISOString() } }), setBusy, setError).then(async (r) => {
            if (r.ok) {
                toastSuccess('All marked as read');
                await list.reload();
            }
        })}>
            Mark all as read
          </UI.Button>
        </UI.Stack>
      </UI.Section>
      {!list.data && list.loading ? <SkeletonSection lines={4}/> : null}
      {list.data ? (<UI.Section>
          {items.length === 0 ? (<UI.Paragraph>{filter === 'unread' ? 'Nothing unread.' : 'No notifications yet.'}</UI.Paragraph>) : (<UI.Stack gap="base">
              {items.map((n) => (<UI.Clickable key={n.id} onClick={() => void open(n)} padding="base" border="base" borderRadius="base">
                  <UI.Stack gap="small-200">
                    
                    <UI.Grid gridTemplateColumns="minmax(0, 1fr) auto" gap="small-200" alignItems="center">
                      <UI.Stack direction="inline" gap="small-200" alignItems="center">
                        {!n.readAt ? <UI.Badge tone="info">New</UI.Badge> : null}
                        
                        {n.severity === 'critical' ? <UI.Badge tone="warning">Needs attention</UI.Badge> : null}
                        <UI.Text type="strong">{n.title}</UI.Text>
                      </UI.Stack>
                      {n.link ? <UI.Icon type="chevron-right" color="subdued"/> : null}
                    </UI.Grid>
                    {n.body ? <UI.Text color="subdued">{n.body}</UI.Text> : null}
                    <UI.Text color="subdued">
                      {formatDate(n.createdAt)}
                      {n.groupCount > 1 ? ` · ${n.groupCount} times` : ''}
                    </UI.Text>
                  </UI.Stack>
                </UI.Clickable>))}
            </UI.Stack>)}
        </UI.Section>) : null}
    </UI.Page>);
}
