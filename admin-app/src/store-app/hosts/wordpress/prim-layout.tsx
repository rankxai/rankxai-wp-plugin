import { createContext, forwardRef, useContext, type CSSProperties, type ReactNode } from 'react';
import type { BadgeProps, BoxProps, DividerProps, EmptyStateProps, GridProps, HeadingProps, IconProps, ImageProps, ListProps, PageProps, ProgressProps, SectionProps, SpinnerProps, StackProps, TextProps, ThumbnailProps, } from '../../ui/types';
import { responsiveClass } from './dyn-css';
import { iconSvg } from './icons';
import { SlotProvider, Slotted, useSlotOwner } from './slots';
import { background, border, radius, space } from './tokens';
export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
const ALIGN: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', baseline: 'baseline', stretch: 'stretch' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', 'space-between': 'space-between', 'space-around': 'space-around', 'space-evenly': 'space-evenly' };
const PAGE_SLOTS = ['primary-action', 'secondary-actions', 'breadcrumb-actions'] as const;
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page({ heading, inlineSize, children, id }, ref) {
    const { ref: slotRef, scope } = useSlotOwner(PAGE_SLOTS);
    return (<div ref={ref} id={id} className={cx('rx-page', inlineSize && `rx-page--${inlineSize}`)}>
      <div className="rx-page__breadcrumb" ref={slotRef('breadcrumb-actions')}/>
      <div className="rx-page__header">
        {heading ? <h1 className="rx-page__title">{heading}</h1> : <span />}
        <div className="rx-page__actions">
          <span className="rx-page__secondary" ref={slotRef('secondary-actions')}/>
          <span className="rx-page__primary" ref={slotRef('primary-action')}/>
        </div>
      </div>
      <div className="rx-page__body">
        <SlotProvider scope={scope}>{children}</SlotProvider>
      </div>
    </div>);
});
const SectionDepth = createContext(0);
export const Section = forwardRef<HTMLElement, SectionProps>(function Section({ heading, accessibilityLabel, children, id }, ref) {
    const depth = useContext(SectionDepth);
    const H = depth === 0 ? 'h2' : 'h3';
    return (<section ref={ref} id={id} className={cx('rx-section', depth === 0 ? 'rx-section--card' : 'rx-section--nested')} aria-label={heading ? undefined : accessibilityLabel}>
      {heading ? <H className="rx-section__heading">{heading}</H> : null}
      <SectionDepth.Provider value={depth + 1}>
        <div className="rx-section__body">{children}</div>
      </SectionDepth.Provider>
    </section>);
});
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack({ direction, gap, alignItems, justifyContent, blockSize, children, id, slot }, ref) {
    const gapClass = responsiveClass('gap', gap);
    const style: CSSProperties = {
        gap: gapClass ? undefined : space(gap ?? 'none'),
        alignItems: alignItems ? ALIGN[alignItems] : undefined,
        justifyContent: justifyContent ? JUSTIFY[justifyContent] : undefined,
        blockSize,
    };
    return (<Slotted slot={slot}>
      <div ref={ref} id={id} className={cx('rx-stack', direction === 'inline' ? 'rx-stack--inline' : 'rx-stack--block', gapClass)} style={style}>
        {children}
      </div>
    </Slotted>);
});
export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid({ gridTemplateColumns, gap, alignItems, children, id }, ref) {
    const colsClass = responsiveClass('grid-template-columns', gridTemplateColumns);
    const gapClass = responsiveClass('gap', gap);
    const style: CSSProperties = {
        gridTemplateColumns: colsClass ? undefined : gridTemplateColumns,
        gap: gapClass ? undefined : space(gap ?? 'none'),
        alignItems: alignItems ? ALIGN[alignItems] : undefined,
    };
    return (<div ref={ref} id={id} className={cx('rx-grid', colsClass, gapClass)} style={style}>
      {children}
    </div>);
});
export const Box = forwardRef<HTMLDivElement, BoxProps>(function Box(p, ref) {
    const style: CSSProperties = {
        padding: space(p.padding),
        paddingInline: space(p.paddingInline),
        paddingBlock: space(p.paddingBlock),
        paddingBlockEnd: space(p.paddingBlockEnd),
        border: border(p.border),
        borderRadius: radius(p.borderRadius),
        background: background(p.background),
        blockSize: p.blockSize,
        inlineSize: p.inlineSize,
        maxInlineSize: p.maxInlineSize,
    };
    return (<div ref={ref} id={p.id} className="rx-box" style={style} role={p.accessibilityLabel ? 'group' : undefined} aria-label={p.accessibilityLabel}>
      {p.children}
    </div>);
});
export const QueryContainer = forwardRef<HTMLDivElement, {
    children?: ReactNode;
    id?: string;
}>(function QueryContainer({ children, id }, ref) {
    return (<div ref={ref} id={id} className="rx-query-container">
      {children}
    </div>);
});
export const Divider = forwardRef<HTMLHRElement, DividerProps>(function Divider({ id }, ref) {
    return <hr ref={ref} id={id} className="rx-divider"/>;
});
function textClass(p: TextProps, base: string): string {
    return cx(base, p.type === 'strong' && 'rx-strong', p.color === 'subdued' && 'rx-subdued', p.tone && p.tone !== 'auto' && `rx-tone-${p.tone}`);
}
export const Text = forwardRef<HTMLSpanElement, TextProps>(function Text(p, ref) {
    return (<Slotted slot={p.slot}>
      <span ref={ref} id={p.id} className={textClass(p, 'rx-text')}>
        {p.children}
      </span>
    </Slotted>);
});
export const Paragraph = forwardRef<HTMLParagraphElement, TextProps>(function Paragraph(p, ref) {
    return (<p ref={ref} id={p.id} className={textClass(p, 'rx-paragraph')}>
      {p.children}
    </p>);
});
export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading({ fontSize, accessibilityRole, children, id }, ref) {
    const depth = useContext(SectionDepth);
    const className = cx('rx-heading', fontSize && `rx-heading--${fontSize}`);
    if (accessibilityRole === 'presentation' || accessibilityRole === 'none') {
        return (<div ref={ref as never} id={id} className={className}>
        {children}
      </div>);
    }
    const H = depth === 0 ? 'h2' : depth === 1 ? 'h3' : 'h4';
    return (<H ref={ref} id={id} className={className}>
      {children}
    </H>);
});
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge({ tone, icon, children, id }, ref) {
    return (<span ref={ref} id={id} className={cx('rx-badge', `rx-badge--${tone && tone !== 'auto' ? tone : 'neutral'}`)}>
      {icon ? iconSvg(icon, 'small') : null}
      {children}
    </span>);
});
export const Icon = forwardRef<HTMLSpanElement, IconProps>(function Icon({ type, tone, size, color, id }, ref) {
    return (<span ref={ref} id={id} className={cx('rx-icon', tone && tone !== 'auto' && `rx-tone-${tone}`, color === 'subdued' && 'rx-subdued')} aria-hidden="true">
      {iconSvg(type, size ?? 'base')}
    </span>);
});
export const Image = forwardRef<HTMLImageElement, ImageProps>(function Image({ src, alt, aspectRatio, objectFit, borderRadius, id }, ref) {
    return <img ref={ref} id={id} className="rx-image" src={src} alt={alt ?? ''} loading="lazy" style={{ aspectRatio, objectFit, borderRadius: radius(borderRadius) }}/>;
});
const THUMB_SIZE: Record<string, number> = { 'small-500': 20, 'small-400': 24, 'small-300': 28, 'small-200': 32, 'small-100': 36, small: 40, base: 48, large: 64, 'large-100': 80, 'large-200': 96 };
export const Thumbnail = forwardRef<HTMLSpanElement, ThumbnailProps>(function Thumbnail({ src, alt, size, id }, ref) {
    const px = THUMB_SIZE[size ?? 'base'] ?? 48;
    return (<span ref={ref} id={id} className={cx('rx-thumbnail', !src && 'rx-thumbnail--empty')} style={{ width: px, height: px }}>
      
      {src ? <img src={src} alt={alt ?? ''} loading="lazy"/> : null}
    </span>);
});
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner({ accessibilityLabel, size, id }, ref) {
    return <span ref={ref} id={id} className={cx('rx-spinner', size && size !== 'base' && 'rx-spinner--large')} role="status" aria-label={accessibilityLabel ?? 'Loading'}/>;
});
export const Progress = forwardRef<HTMLProgressElement, ProgressProps>(function Progress({ value, max, accessibilityLabel, id }, ref) {
    return <progress ref={ref} id={id} className="rx-progress" value={value} max={max} aria-label={accessibilityLabel}/>;
});
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState({ heading, children, id }, ref) {
    return (<div ref={ref} id={id} className="rx-empty">
      {heading ? <p className="rx-empty__heading">{heading}</p> : null}
      <div className="rx-empty__body">{children}</div>
    </div>);
});
export const UnorderedList = forwardRef<HTMLUListElement, ListProps>(function UnorderedList({ children, id }, ref) {
    return (<ul ref={ref} id={id} className="rx-list">
      {children}
    </ul>);
});
export const OrderedList = forwardRef<HTMLOListElement, ListProps>(function OrderedList({ children, id }, ref) {
    return (<ol ref={ref} id={id} className="rx-list rx-list--ordered">
      {children}
    </ol>);
});
export const ListItem = forwardRef<HTMLLIElement, ListProps>(function ListItem({ children, id }, ref) {
    return (<li ref={ref} id={id}>
      {children}
    </li>);
});
