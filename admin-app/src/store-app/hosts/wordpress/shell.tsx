import { useEffect, useRef, useState } from 'react';
import { NAV_ITEMS, APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { useRouter } from '../../router';
import { host } from './host';
import { dismissToast, onToasts, setLeavePrompt, type Toast } from './registries';
import { usePlan, useStore } from '../../plan-context';
import { webLinkForPath } from '@/lib/store-app/web-links-core';
import { SPEND_NOT_ALLOWED } from '../../kit';
export function WordPressNav() {
    const { path, navigate } = useRouter();
    const { capabilities } = useStore();
    const { plan } = usePlan();
    const webLink = webLinkForPath(plan?.webLinks, path);
    const items = [{ href: APP_PATHS.home, label: 'Home' }, ...NAV_ITEMS];
    const current = items.reduce<string | null>((best, i) => ((path === i.href || path.startsWith(`${i.href}/`)) && (!best || i.href.length > best.length) ? i.href : best), null);
    return (<>
      <nav className="rx-tabs" aria-label="RankX AI">
        {items.map((i) => (<a key={i.href} className={i.href === current ? 'rx-tab is-current' : 'rx-tab'} href={host.toHref(i.href)} aria-current={i.href === current ? 'page' : undefined} onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                    return;
                e.preventDefault();
                navigate(i.href);
            }}>
            {i.label}
          </a>))}
        {webLink ? (<a className="rx-tab rx-tab--out" href={webLink} target="_blank" rel="noopener noreferrer">
            Open in RankX AI<span className="rx-sr-only"> (opens in a new tab)</span>
          </a>) : null}
      </nav>
      
      {capabilities?.canSpend === false ? <div className="rx-spend-notice" role="note">{SPEND_NOT_ALLOWED}</div> : null}
    </>);
}
export function Toasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    useEffect(() => onToasts(setToasts), []);
    return (<div className="rx-toasts" aria-live="polite" role="status">
      {toasts.map((t) => (<div key={t.id} className="rx-toast">
          <span>{t.message}</span>
          <button type="button" className="rx-toast__dismiss" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            ×
          </button>
        </div>))}
    </div>);
}
export function LeavePrompt() {
    const dialog = useRef<HTMLDialogElement>(null);
    const resolver = useRef<((leave: boolean) => void) | null>(null);
    useEffect(() => {
        setLeavePrompt(() => new Promise<boolean>((resolve) => {
            resolver.current?.(false);
            resolver.current = resolve;
            if (!dialog.current?.open)
                dialog.current?.showModal();
        }));
        return () => setLeavePrompt(null);
    }, []);
    const answer = (leave: boolean) => {
        dialog.current?.close();
        resolver.current?.(leave);
        resolver.current = null;
    };
    return (<dialog ref={dialog} className="rx-modal rx-modal--small" aria-labelledby="rx-leave-heading" onCancel={() => answer(false)}>
      <div className="rx-modal__head">
        <h2 className="rx-modal__heading" id="rx-leave-heading">
          Leave without saving?
        </h2>
      </div>
      <div className="rx-modal__body">
        <p className="rx-paragraph">Your changes on this page have not been saved.</p>
      </div>
      <div className="rx-modal__foot">
        <span className="rx-modal__secondary">
          <button type="button" className="rx-button rx-button--secondary" onClick={() => answer(false)}>
            Stay
          </button>
        </span>
        <span className="rx-modal__primary">
          <button type="button" className="rx-button rx-button--critical rx-button--primary" onClick={() => answer(true)}>
            Leave
          </button>
        </span>
      </div>
    </dialog>);
}
