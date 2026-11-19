import { createContext, forwardRef, useContext, useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { isAppHref } from '@/lib/shopify-app/app-routes-core';
import type { BannerProps, ButtonProps, CheckboxProps, ChoiceListProps, ChoiceProps, ClickableChipProps, ClickableProps, DateFieldProps, DatePickerProps, FocusHandle, LinkProps, NumberFieldProps, OptionProps, PressButtonProps, SearchFieldProps, SelectProps, SwitchProps, TextAreaProps, TextFieldProps, } from '../../ui/types';
import { navigateApp } from '../../router';
import { hrefKind } from './hash-route';
import { host } from './host';
import { iconSvg } from './icons';
import { cx } from './prim-layout';
import { runOverlayCommand } from './registries';
import { SlotProvider, Slotted, useSlotOwner } from './slots';
import { background, border, radius, space } from './tokens';
function resolveHref(href: string | undefined): {
    href: string | undefined;
    inApp: boolean;
    external: boolean;
    target: string | undefined;
} {
    if (!href)
        return { href: undefined, inApp: false, external: false, target: undefined };
    if (isAppHref(href))
        return { href: host.toHref(href), inApp: true, external: false, target: undefined };
    if (href.startsWith('shopify://') || href.startsWith('wp-admin://'))
        return { href: host.adminHref(href).href, inApp: false, external: true, target: '_blank' };
    const kind = hrefKind(href);
    if (kind === 'unsafe')
        return { href: undefined, inApp: false, external: false, target: undefined };
    return { href, inApp: false, external: kind === 'web', target: kind === 'web' ? '_blank' : undefined };
}
function linkClick(href: string | undefined, target: string | undefined, onClick: ((e: MouseEvent) => void) | undefined) {
    return (e: MouseEvent<HTMLElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || !href || !isAppHref(href) || target === '_blank')
            return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
            return;
        e.preventDefault();
        navigateApp(href);
    };
}
const relFor = (target: string | undefined) => (target === '_blank' ? 'noopener noreferrer' : undefined);
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, target, accessibilityLabel, onClick, children, id, slot }, ref) {
    const r = resolveHref(href);
    const to = target ?? r.target;
    return (<Slotted slot={slot}>
      <a ref={ref} id={id} className="rx-link" href={r.href} target={to} rel={relFor(to)} data-rx-label={accessibilityLabel} onClick={linkClick(href, to, onClick as never)}>
        {children}
        {to === '_blank' ? <span className="rx-sr-only"> (opens in a new tab)</span> : null}
      </a>
    </Slotted>);
});
function buttonClass(variant: ButtonProps['variant'], tone: ButtonProps['tone'], slot: string | undefined, iconOnly: boolean): string {
    const v = variant ?? (slot === 'primary-action' ? 'primary' : 'secondary');
    return cx('rx-button', `rx-button--${v === 'auto' ? 'secondary' : v}`, tone === 'critical' && 'rx-button--critical', iconOnly && 'rx-button--icon');
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(p, ref) {
    const { href, target, slot, icon, loading, disabled, children, commandFor, command, accessibilityLabel } = p;
    const iconOnly = !!icon && (children === undefined || children === null || children === '');
    const className = buttonClass(p.variant, p.tone, slot, iconOnly);
    const body = (<>
      {loading ? <span className="rx-spinner rx-spinner--inline" aria-hidden="true"/> : icon ? iconSvg(icon, 'small') : null}
      {children ? <span className="rx-button__label">{children}</span> : null}
    </>);
    if (href && !disabled) {
        const r = resolveHref(href);
        const to = target ?? r.target;
        return (<Slotted slot={slot}>
        <a ref={ref as never} id={p.id} className={className} href={r.href} target={to} rel={relFor(to)} data-rx-label={accessibilityLabel} onClick={linkClick(href, to, p.onClick as never)}>
          {body}
        </a>
      </Slotted>);
    }
    return (<Slotted slot={slot}>
      <button ref={ref} id={p.id} type={p.type ?? 'button'} className={className} disabled={disabled || loading || undefined} aria-busy={loading || undefined} data-rx-label={accessibilityLabel} aria-controls={commandFor} onClick={(e) => {
            p.onClick?.(e);
            if (commandFor && !e.defaultPrevented)
                runOverlayCommand(commandFor, command, e.currentTarget);
        }}>
        {body}
      </button>
    </Slotted>);
});
export const PressButton = forwardRef<HTMLButtonElement, PressButtonProps>(function PressButton({ pressed, onClick, accessibilityLabel, disabled, children, id }, ref) {
    return (<button ref={ref} id={id} type="button" className={cx('rx-press', pressed && 'is-pressed')} aria-pressed={!!pressed} data-rx-label={accessibilityLabel} disabled={disabled || undefined} onClick={onClick}>
      {children}
    </button>);
});
export const Clickable = forwardRef<HTMLButtonElement, ClickableProps>(function Clickable(p, ref) {
    const style = { padding: space(p.padding), border: border(p.border), borderRadius: radius(p.borderRadius), background: background(p.background) };
    if (p.href) {
        const r = resolveHref(p.href);
        return (<a ref={ref as never} id={p.id} className="rx-clickable" style={style} href={r.href} target={r.target} rel={relFor(r.target)} data-rx-label={p.accessibilityLabel} onClick={linkClick(p.href, r.target, p.onClick as never)}>
        {p.children}
      </a>);
    }
    return (<button ref={ref} id={p.id} type="button" className="rx-clickable" style={style} data-rx-label={p.accessibilityLabel} disabled={p.disabled || undefined} onClick={p.onClick}>
      {p.children}
    </button>);
});
export const ClickableChip = forwardRef<HTMLButtonElement, ClickableChipProps>(function ClickableChip({ onClick, accessibilityLabel, children, id }, ref) {
    return (<button ref={ref} id={id} type="button" className="rx-chip" data-rx-label={accessibilityLabel} onClick={onClick}>
      {children}
    </button>);
});
export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner({ tone, heading, dismissible, onDismiss, children, id }, ref) {
    const t = tone && tone !== 'auto' ? tone : 'info';
    return (<div ref={ref} id={id} className={cx('rx-banner', `rx-banner--${t}`)} role={t === 'critical' ? 'alert' : 'status'}>
      <span className="rx-banner__icon">{iconSvg(t === 'success' ? 'check-circle' : 'alert-triangle', 'small')}</span>
      <div className="rx-banner__content">
        {heading ? <p className="rx-banner__heading">{heading}</p> : null}
        <div className="rx-banner__body">{children}</div>
      </div>
      {dismissible ? (<button type="button" className="rx-banner__dismiss" aria-label="Dismiss" onClick={onDismiss}>
          {iconSvg('x', 'small')}
        </button>) : null}
    </div>);
});
interface FieldFrame {
    label?: string;
    labelHidden?: boolean;
    details?: ReactNode;
    error?: string;
    inputId: string;
    children: ReactNode;
}
function Frame({ label, labelHidden, details, error, inputId, children }: FieldFrame) {
    return (<div className={cx('rx-field', error && 'has-error')}>
      {label ? (<label className={cx('rx-field__label', labelHidden && 'rx-sr-only')} htmlFor={inputId}>
          {label}
        </label>) : null}
      {children}
      {details ? (<div className="rx-field__details" id={`${inputId}-details`}>
          {details}
        </div>) : null}
      {error ? (<div className="rx-field__error" id={`${inputId}-error`}>
          {iconSvg('alert-triangle', 'small')}
          <span>{error}</span>
        </div>) : null}
    </div>);
}
const describedBy = (id: string, details: unknown, error: unknown) => [details ? `${id}-details` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
function held<T extends EventTarget>(e: {
    currentTarget: T;
}): {
    currentTarget: T;
} {
    return { currentTarget: e.currentTarget };
}
function useCommit<E extends HTMLElement>(onChange: ((e: {
    currentTarget: {
        value: string;
    };
}) => void) | undefined) {
    const el = useRef<E | null>(null);
    const handler = useRef(onChange);
    useEffect(() => {
        handler.current = onChange;
    });
    useEffect(() => {
        const node = el.current;
        if (!node)
            return;
        const listen = (e: Event) => handler.current?.({ currentTarget: e.currentTarget as unknown as {
                value: string;
            } });
        node.addEventListener('change', listen);
        return () => node.removeEventListener('change', listen);
    }, []);
    return el;
}
function mergeRefs<T>(...refs: Array<((v: T | null) => void) | {
    current: T | null;
} | null | undefined>) {
    return (v: T | null) => {
        for (const r of refs) {
            if (typeof r === 'function')
                r(v);
            else if (r)
                r.current = v;
        }
    };
}
export const TextField = forwardRef<FocusHandle, TextFieldProps>(function TextField(p, ref) {
    const id = useId();
    const commit = useCommit<HTMLInputElement>(p.onChange);
    return (<Frame label={p.label} labelHidden={p.labelAccessibilityVisibility === 'exclusive'} details={p.details} error={p.error} inputId={id}>
      <input ref={mergeRefs(commit, ref as never)} id={id} className="rx-input" type="text" name={p.name} value={p.value ?? (p.defaultValue === undefined ? '' : undefined)} defaultValue={p.value === undefined ? p.defaultValue : undefined} data-rx-default={p.defaultValue} placeholder={p.placeholder} maxLength={p.maxLength} readOnly={p.readOnly || undefined} disabled={p.disabled || undefined} aria-invalid={p.error ? true : undefined} aria-describedby={describedBy(id, p.details, p.error)} onChange={(e) => p.onInput?.(held(e))}/>
    </Frame>);
});
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(p, ref) {
    const autoId = useId();
    const id = p.id ?? autoId;
    const commit = useCommit<HTMLTextAreaElement>(p.onChange);
    return (<Frame label={p.label} labelHidden={p.labelAccessibilityVisibility === 'exclusive'} details={p.details} error={p.error} inputId={id}>
      <textarea ref={mergeRefs(commit, ref)} id={id} className="rx-input rx-textarea" name={p.name} rows={p.rows ?? 3} value={p.value ?? (p.defaultValue === undefined ? '' : undefined)} defaultValue={p.value === undefined ? p.defaultValue : undefined} data-rx-default={p.defaultValue} placeholder={p.placeholder} maxLength={p.maxLength} readOnly={p.readOnly || undefined} disabled={p.disabled || undefined} aria-invalid={p.error ? true : undefined} aria-describedby={describedBy(id, p.details, p.error)} onChange={(e) => p.onInput?.(held(e))}/>
    </Frame>);
});
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(p, ref) {
    const id = useId();
    return (<Slotted slot={p.slot}>
      <Frame label={p.label} labelHidden={p.labelAccessibilityVisibility === 'exclusive'} details={p.details} error={p.error} inputId={id}>
        <span className="rx-search">
          <input ref={ref} id={id} className="rx-input rx-input--search" type="search" value={p.value ?? ''} placeholder={p.placeholder} disabled={p.disabled || undefined} onChange={(e) => p.onInput?.(held(e))}/>
        </span>
      </Frame>
    </Slotted>);
});
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(p, ref) {
    const id = useId();
    return (<Frame label={p.label} labelHidden={p.labelAccessibilityVisibility === 'exclusive'} details={p.details} error={p.error} inputId={id}>
      <input ref={ref} id={id} className="rx-input rx-input--number" type="number" name={p.name} value={p.value ?? ''} min={p.min} max={p.max} step={p.step} disabled={p.disabled || undefined} aria-invalid={p.error ? true : undefined} aria-describedby={describedBy(id, p.details, p.error)} onChange={(e) => p.onChange?.(held(e))}/>
    </Frame>);
});
function allowRange(allow: string | undefined): {
    min?: string;
    max?: string;
} {
    if (!allow)
        return {};
    const [from, to] = allow.split('--');
    return { min: from || undefined, max: to || undefined };
}
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(p, ref) {
    const id = useId();
    const range = allowRange(p.allow);
    return (<Frame label={p.label} labelHidden={p.labelAccessibilityVisibility === 'exclusive'} details={p.details} error={p.error} inputId={id}>
      <input ref={ref} id={id} className="rx-input rx-input--date" type="date" name={p.name} value={p.value ?? ''} min={range.min} max={range.max} disabled={p.disabled || undefined} aria-invalid={p.error ? true : undefined} aria-describedby={describedBy(id, p.details, p.error)} onChange={(e) => p.onChange?.(held(e))}/>
    </Frame>);
});
export const DatePicker = forwardRef<HTMLDivElement, DatePickerProps>(function DatePicker(p, ref) {
    const id = useId();
    const [from = '', to = ''] = (p.value ?? '').split('--');
    const range = allowRange(p.allow);
    const send = (f: string, t: string) => p.onChange?.({ currentTarget: { value: p.type === 'range' ? `${f}--${t}` : f } });
    if (p.type !== 'range') {
        return (<div ref={ref} id={p.id} className="rx-datepicker">
        <input className="rx-input rx-input--date" type="date" aria-label="Date" value={from} min={range.min} max={range.max} onChange={(e) => send(e.currentTarget.value, '')}/>
      </div>);
    }
    return (<div ref={ref} id={p.id} className="rx-datepicker rx-datepicker--range">
      <label className="rx-field__label" htmlFor={`${id}-from`}>
        From
      </label>
      <input id={`${id}-from`} className="rx-input rx-input--date" type="date" value={from} min={range.min} max={to || range.max} onChange={(e) => send(e.currentTarget.value, to)}/>
      <label className="rx-field__label" htmlFor={`${id}-to`}>
        To
      </label>
      <input id={`${id}-to`} className="rx-input rx-input--date" type="date" value={to} min={from || range.min} max={range.max} onChange={(e) => send(from, e.currentTarget.value)}/>
    </div>);
});
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(p, ref) {
    const id = useId();
    return (<Frame label={p.label} labelHidden={p.labelAccessibilityVisibility === 'exclusive'} details={p.details} error={p.error} inputId={id}>
      <select ref={ref} id={id} className="rx-select" name={p.name} value={p.value} disabled={p.disabled || undefined} aria-invalid={p.error ? true : undefined} aria-describedby={describedBy(id, p.details, p.error)} onChange={(e) => p.onChange?.(held(e))}>
        {p.children}
      </select>
    </Frame>);
});
export const Option = forwardRef<HTMLOptionElement, OptionProps>(function Option({ value, defaultSelected, disabled, children }, ref) {
    return (<option ref={ref} value={value} disabled={disabled || undefined} data-rx-default-selected={defaultSelected ? '' : undefined}>
      {children}
    </option>);
});
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(p, ref) {
    const id = useId();
    return (<div className={cx('rx-check', p.error && 'has-error')}>
      <input ref={ref} id={id} type="checkbox" className="rx-check__input" name={p.name} checked={!!p.checked} disabled={p.disabled || undefined} aria-label={p.label ? undefined : p.accessibilityLabel} aria-describedby={describedBy(id, p.details, p.error)} onChange={(e) => p.onChange?.(held(e))}/>
      {p.label ? (<label htmlFor={id} className={cx('rx-check__label', p.labelAccessibilityVisibility === 'exclusive' && 'rx-sr-only')}>
          {p.label}
        </label>) : null}
      {p.details ? (<div className="rx-field__details rx-check__details" id={`${id}-details`}>
          {p.details}
        </div>) : null}
      {p.error ? (<div className="rx-field__error rx-check__details" id={`${id}-error`}>
          {p.error}
        </div>) : null}
    </div>);
});
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(p, ref) {
    const id = useId();
    return (<div className="rx-switch">
      <input ref={ref} id={id} type="checkbox" role="switch" className="rx-switch__input" checked={!!p.checked} disabled={p.disabled || undefined} aria-describedby={p.details ? `${id}-details` : undefined} onChange={(e) => p.onChange?.(held(e))}/>
      <label htmlFor={id} className={cx('rx-switch__label', p.labelAccessibilityVisibility === 'exclusive' && 'rx-sr-only')}>
        {p.label}
      </label>
      {p.details ? (<div className="rx-field__details rx-switch__details" id={`${id}-details`}>
          {p.details}
        </div>) : null}
    </div>);
});
interface ChoiceGroup {
    name: string;
    values: string[];
    multiple: boolean;
    disabled: boolean;
    toggle: (value: string, on: boolean) => void;
}
const ChoiceContext = createContext<ChoiceGroup | null>(null);
export const ChoiceList = forwardRef<HTMLFieldSetElement, ChoiceListProps>(function ChoiceList(p, ref) {
    const autoName = useId();
    const values = p.values ?? [];
    const group: ChoiceGroup = {
        name: p.name ?? autoName,
        values,
        multiple: !!p.multiple,
        disabled: !!p.disabled,
        toggle: (value, on) => {
            const next = p.multiple ? (on ? [...values.filter((v) => v !== value), value] : values.filter((v) => v !== value)) : [value];
            p.onChange?.({ currentTarget: { values: next } });
        },
    };
    return (<fieldset ref={ref} className={cx('rx-choices', p.error && 'has-error')}>
      {p.label ? <legend className={cx('rx-field__label', p.labelAccessibilityVisibility === 'exclusive' && 'rx-sr-only')}>{p.label}</legend> : null}
      <ChoiceContext.Provider value={group}>
        <div className="rx-choices__list">{p.children}</div>
      </ChoiceContext.Provider>
      {p.details ? <div className="rx-field__details">{p.details}</div> : null}
      {p.error ? <div className="rx-field__error">{p.error}</div> : null}
    </fieldset>);
});
const CHOICE_SLOTS = ['details'] as const;
export const Choice = forwardRef<HTMLInputElement, ChoiceProps>(function Choice({ value, selected, disabled, children }, ref) {
    const group = useContext(ChoiceContext);
    const id = useId();
    const { ref: slotRef, scope } = useSlotOwner(CHOICE_SLOTS);
    const checked = group ? group.values.includes(value) : !!selected;
    return (<div className="rx-choice">
      <input ref={ref} id={id} className="rx-choice__input" type={group?.multiple ? 'checkbox' : 'radio'} name={group?.name} value={value} checked={checked} disabled={disabled || group?.disabled || undefined} aria-describedby={`${id}-details`} onChange={(e) => group?.toggle(value, e.currentTarget.checked)}/>
      <label htmlFor={id} className="rx-choice__label">
        <SlotProvider scope={scope}>{children}</SlotProvider>
      </label>
      <div className="rx-choice__details" id={`${id}-details`} ref={slotRef('details')}/>
    </div>);
});
