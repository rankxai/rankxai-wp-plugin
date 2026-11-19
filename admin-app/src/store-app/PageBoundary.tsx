import { Component, type ReactNode } from 'react';
import { api } from './api';
import { SUPPORT_EMAIL } from './pages/support-email';
import * as UI from './ui';
export function isStaleChunk(message: string): boolean {
    return /dynamically imported module|Importing a module script failed|error loading dynamically|Unable to preload CSS/i.test(message);
}
export class PageBoundary extends Component<{
    children: ReactNode;
}, {
    message: string | null;
}> {
    state = { message: null as string | null };
    static getDerivedStateFromError(error: unknown) {
        return { message: error instanceof Error ? error.message : String(error) };
    }
    componentDidCatch(error: unknown) {
        const e = error instanceof Error ? error : new Error(String(error));
        void api('client-error', {
            method: 'POST',
            body: { message: e.message, stack: e.stack ?? null, path: window.location.pathname, staleChunk: isStaleChunk(e.message) },
        }).catch(() => undefined);
    }
    render() {
        if (this.state.message === null)
            return this.props.children;
        const stale = isStaleChunk(this.state.message);
        return (<UI.Page heading={stale ? 'A new version is ready' : 'This page did not load'} inlineSize="large">
        <UI.Banner tone={stale ? 'info' : 'critical'} heading={stale ? 'Reload to carry on' : 'Something did not work'}>
          <UI.Stack gap="base">
            <UI.Paragraph>
              {stale
                ? 'We updated the app while you had it open. Reload to use this page.'
                : `Your store and your changes are safe. Reload the page to try again. We have been told about this. If it keeps happening, write to ${SUPPORT_EMAIL}.`}
            </UI.Paragraph>
            <UI.Stack direction="inline">
              <UI.Button onClick={() => window.location.reload()}>Reload</UI.Button>
            </UI.Stack>
          </UI.Stack>
        </UI.Banner>
      </UI.Page>);
    }
}
