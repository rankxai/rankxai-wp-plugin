import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import type { ModalProps, PopoverProps, SaveBarFormProps } from '../../ui/types';
import { iconSvg } from './icons';
import { cx } from './prim-layout';
import { registerOverlay, runOverlayCommand, setFormDirty } from './registries';
import { SlotProvider, useSlotOwner } from './slots';
const MODAL_SLOTS = ['primary-action', 'secondary-actions'] as const;
export const Modal = forwardRef<HTMLDialogElement, ModalProps>(function Modal({ id, heading, size, children }, ref) {
    const dialog = useRef<HTMLDialogElement>(null);
    useImperativeHandle(ref, () => dialog.current!, []);
    const { ref: slotRef, scope } = useSlotOwner(MODAL_SLOTS);
    useEffect(() => registerOverlay(id, {
        show: () => {
            const d = dialog.current;
            if (d && !d.open)
                d.showModal();
        },
        hide: () => dialog.current?.close(),
        isOpen: () => !!dialog.current?.open,
    }), [id]);
    return (<dialog ref={dialog} id={id} className={cx('rx-modal', size && `rx-modal--${size}`)} aria-labelledby={heading ? `${id}-heading` : undefined}>
      <div className="rx-modal__head">
        {heading ? (<h2 className="rx-modal__heading" id={`${id}-heading`}>
            {heading}
          </h2>) : (<span />)}
        <button type="button" className="rx-modal__close" aria-label="Close" onClick={() => dialog.current?.close()}>
          {iconSvg('x')}
        </button>
      </div>
      <div className="rx-modal__body">
        <SlotProvider scope={scope}>{children}</SlotProvider>
      </div>
      <div className="rx-modal__foot">
        <span className="rx-modal__secondary" ref={slotRef('secondary-actions')}/>
        <span className="rx-modal__primary" ref={slotRef('primary-action')}/>
      </div>
    </dialog>);
});
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover({ id, maxInlineSize, children }, ref) {
    const el = useRef<HTMLDivElement>(null);
    const closedAt = useRef(0);
    useImperativeHandle(ref, () => el.current!, []);
    useEffect(() => {
        const p = el.current;
        if (!p)
            return;
        const onToggle = (e: Event) => {
            if ((e as Event & {
                newState?: string;
            }).newState === 'closed')
                closedAt.current = performance.now();
        };
        p.addEventListener('beforetoggle', onToggle);
        return () => p.removeEventListener('beforetoggle', onToggle);
    }, []);
    useEffect(() => registerOverlay(id, {
        justClosed: () => performance.now() - closedAt.current < 300,
        show: (invoker) => {
            const p = el.current as (HTMLDivElement & {
                showPopover?: () => void;
            }) | null;
            if (!p)
                return;
            if (invoker) {
                const r = invoker.getBoundingClientRect();
                p.style.top = `${Math.round(r.bottom + 4)}px`;
                p.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 16 - Math.min(p.offsetWidth || 320, window.innerWidth - 16))))}px`;
            }
            p.showPopover?.();
        },
        hide: () => (el.current as (HTMLDivElement & {
            hidePopover?: () => void;
        }) | null)?.hidePopover?.(),
        isOpen: () => !!el.current?.matches(':popover-open'),
    }), [id]);
    return (<div ref={el} id={id} className="rx-popover" style={{ maxInlineSize }} {...({ popover: 'auto' } as Record<string, string>)}>
      {children}
    </div>);
});
export function showOverlay(id: string): void {
    runOverlayCommand(id, '--show');
}
export function hideOverlay(id: string): void {
    runOverlayCommand(id, '--hide');
}
export function formIsDirty(form: HTMLFormElement): boolean {
    for (const el of Array.from(form.elements)) {
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
            const d = el.dataset.rxDefaultChecked;
            if (d !== undefined && el.checked !== (d === 'true'))
                return true;
        }
        else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const d = el.dataset.rxDefault;
            if (d !== undefined && el.value !== d)
                return true;
        }
        else if (el instanceof HTMLSelectElement) {
            const saved = Array.from(el.options).find((o) => o.dataset.rxDefaultSelected !== undefined);
            if (saved && el.value !== saved.value)
                return true;
        }
    }
    return false;
}
export function SaveBarForm({ children, onSubmit, onReset }: SaveBarFormProps) {
    const form = useRef<HTMLFormElement>(null);
    const key = useRef(Symbol('save-bar-form'));
    const [dirty, setDirty] = useState(false);
    const check = () => {
        const f = form.current;
        if (!f)
            return;
        const d = formIsDirty(f);
        setDirty(d);
        setFormDirty(key.current, d);
    };
    useEffect(check);
    useEffect(() => {
        const k = key.current;
        return () => setFormDirty(k, false);
    }, []);
    return (<form ref={form} className="rx-savebar-form" onSubmit={(e: FormEvent) => onSubmit(e)} onReset={() => {
            onReset();
            setTimeout(() => {
                for (const el of Array.from(form.current?.elements ?? [])) {
                    if (!(el instanceof HTMLSelectElement))
                        continue;
                    const saved = Array.from(el.options).find((o) => o.dataset.rxDefaultSelected !== undefined);
                    if (saved && el.value !== saved.value)
                        el.value = saved.value;
                }
                check();
            }, 0);
        }} onInput={check} onChange={check}>
      {children}
      {dirty ? (<div className="rx-savebar" role="region" aria-label="Unsaved changes">
          <span className="rx-savebar__text">Unsaved changes</span>
          <span className="rx-savebar__actions">
            <button type="reset" className="rx-button rx-button--secondary">
              Discard
            </button>
            <button type="submit" className="rx-button rx-button--primary">
              Save
            </button>
          </span>
        </div>) : null}
    </form>);
}
