import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '../../api';
import type { PickedProduct, PickProductsOptions } from '../../host-types';
interface Row {
    productId: string;
    title: string | null;
    imageUrl: string | null;
}
function Picker({ max, onDone }: {
    max: number;
    onDone: (picked: PickedProduct[] | undefined) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [query, setQuery] = useState('');
    const [q, setQ] = useState('');
    const [answer, setAnswer] = useState<{
        q: string;
        rows: Row[];
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [chosen, setChosen] = useState<Map<string, string | null>>(new Map());
    useEffect(() => {
        dialog.current?.showModal();
    }, []);
    useEffect(() => {
        const t = setTimeout(() => setQ(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);
    useEffect(() => {
        let cancelled = false;
        void api<{
            products: Row[];
        }>(`catalogue/products?filter=all&q=${encodeURIComponent(q)}&page=0`).then((r) => {
            if (cancelled)
                return;
            if (r.ok) {
                setAnswer({ q, rows: r.data?.products ?? [] });
                setError(null);
            }
            else
                setError(r.error);
        });
        return () => {
            cancelled = true;
        };
    }, [q]);
    const rows = answer && answer.q === q ? answer.rows : null;
    const toggle = (row: Row, on: boolean) => setChosen((c) => {
        const next = new Map(c);
        if (!on)
            next.delete(row.productId);
        else if (max === 1)
            return new Map([[row.productId, row.title]]);
        else if (next.size < max)
            next.set(row.productId, row.title);
        return next;
    });
    const close = (picked: PickedProduct[] | undefined) => {
        dialog.current?.close();
        onDone(picked);
    };
    return (<dialog ref={dialog} className="rx-modal rx-modal--base rx-picker" aria-labelledby="rx-picker-heading" onCancel={() => onDone(undefined)}>
      <div className="rx-modal__head">
        <h2 className="rx-modal__heading" id="rx-picker-heading">
          {max === 1 ? 'Choose a product' : 'Choose products'}
        </h2>
        <button type="button" className="rx-modal__close" aria-label="Close" onClick={() => close(undefined)}>
          ×
        </button>
      </div>
      <div className="rx-modal__body">
        <div className="rx-field">
          <label className="rx-sr-only" htmlFor="rx-picker-search">
            Search your products
          </label>
          <input id="rx-picker-search" className="rx-input rx-input--search" type="search" placeholder="Search by product title" value={query} onChange={(e) => setQuery(e.currentTarget.value)}/>
        </div>
        {max > 1 && max !== Number.MAX_SAFE_INTEGER ? <p className="rx-text rx-subdued">{`Choose up to ${max}.`}</p> : null}
        {error ? (<div className="rx-banner rx-banner--critical" role="alert">
            <div className="rx-banner__content">{error}</div>
          </div>) : rows === null ? (<span className="rx-spinner" role="status" aria-label="Loading your products"/>) : rows.length === 0 ? (<p className="rx-text rx-subdued">{q ? 'No product matches your search.' : 'No products to choose from yet.'}</p>) : (<ul className="rx-picker__list">
            {rows.map((r) => {
                const on = chosen.has(r.productId);
                const full = !on && max > 1 && chosen.size >= max;
                return (<li key={r.productId}>
                  <label className="rx-picker__row">
                    <input type={max === 1 ? 'radio' : 'checkbox'} name="rx-picker" checked={on} disabled={full || undefined} onChange={(e) => toggle(r, e.currentTarget.checked)}/>
                    <span className="rx-thumbnail" style={{ width: 32, height: 32 }}>
                      
                      {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy"/> : null}
                    </span>
                    <span>{r.title ?? 'Untitled product'}</span>
                  </label>
                </li>);
            })}
          </ul>)}
      </div>
      <div className="rx-modal__foot">
        <span className="rx-modal__secondary">
          <button type="button" className="rx-button rx-button--secondary" onClick={() => close(undefined)}>
            Cancel
          </button>
        </span>
        <span className="rx-modal__primary">
          <button type="button" className="rx-button rx-button--primary" disabled={chosen.size === 0 || undefined} onClick={() => close([...chosen].map(([id, title]) => ({ id, ...(title ? { title } : {}) })))}>
            {chosen.size > 1 ? `Add ${chosen.size} products` : 'Add'}
          </button>
        </span>
      </div>
    </dialog>);
}
export function pickProducts({ multiple }: PickProductsOptions): Promise<PickedProduct[] | undefined> {
    const max = multiple === true ? Number.MAX_SAFE_INTEGER : multiple === false ? 1 : Math.max(1, multiple);
    const mount = document.getElementById('rx-store') ?? document.body;
    const holder = document.createElement('div');
    mount.appendChild(holder);
    const root = createRoot(holder);
    return new Promise((resolve) => {
        root.render(<Picker max={max} onDone={(picked) => {
                resolve(picked);
                setTimeout(() => {
                    root.unmount();
                    holder.remove();
                }, 0);
            }}/>);
    });
}
