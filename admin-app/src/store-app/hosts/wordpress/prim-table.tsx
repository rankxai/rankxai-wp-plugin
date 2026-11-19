import { Children, createContext, forwardRef, isValidElement, useContext, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import type { TableHeaderProps, TableProps, TableRowProps, TableSectionProps } from '../../ui/types';
import { iconSvg } from './icons';
import { cx } from './prim-layout';
import { SlotProvider, useSlotOwner } from './slots';
interface Column {
    listSlot: NonNullable<TableHeaderProps['listSlot']> | 'labeled';
    format: TableHeaderProps['format'];
    label: string;
}
const ColumnsContext = createContext<Column[]>([]);
const CellIndex = createContext(0);
function textOf(node: ReactNode): string {
    if (typeof node === 'string' || typeof node === 'number')
        return String(node);
    if (Array.isArray(node))
        return node.map(textOf).join('');
    if (isValidElement(node))
        return textOf((node.props as {
            children?: ReactNode;
        }).children);
    return '';
}
function columnsFrom(children: ReactNode, headerRowType: unknown): Column[] {
    for (const child of Children.toArray(children)) {
        if (isValidElement(child) && child.type === headerRowType) {
            return Children.toArray((child.props as {
                children?: ReactNode;
            }).children)
                .filter(isValidElement)
                .map((h) => {
                const p = (h as ReactElement<TableHeaderProps>).props;
                return { listSlot: p.listSlot ?? 'labeled', format: p.format, label: textOf(p.children) };
            });
        }
    }
    return [];
}
const TABLE_SLOTS = ['filters'] as const;
export const TableHeaderRow = forwardRef<HTMLTableSectionElement, TableSectionProps>(function TableHeaderRow({ children }, ref) {
    return (<thead ref={ref}>
      <tr>{children}</tr>
    </thead>);
});
export const Table = forwardRef<HTMLDivElement, TableProps>(function Table(p, ref) {
    const columns = columnsFrom(p.children, TableHeaderRow);
    const { ref: slotRef, scope } = useSlotOwner(TABLE_SLOTS);
    const paged = p.paginate && (p.hasNextPage || p.hasPreviousPage);
    return (<div ref={ref} id={p.id} className={cx('rx-table', p.variant !== 'table' && 'rx-table--auto', p.variant === 'list' && 'rx-table--list', p.loading && 'is-loading')} aria-busy={p.loading || undefined}>
      <div className="rx-table__filters" ref={slotRef('filters')}/>
      <div className="rx-table__scroll">
        <table className="rx-table__table">
          <ColumnsContext.Provider value={columns}>
            <SlotProvider scope={scope}>{p.children}</SlotProvider>
          </ColumnsContext.Provider>
        </table>
      </div>
      {paged ? (<div className="rx-table__pager">
          <button type="button" className="rx-button rx-button--secondary rx-button--icon" aria-label="Previous page" disabled={!p.hasPreviousPage || undefined} onClick={p.onPreviousPage}>
            {iconSvg('chevron-left', 'small')}
          </button>
          <button type="button" className="rx-button rx-button--secondary rx-button--icon" aria-label="Next page" disabled={!p.hasNextPage || undefined} onClick={p.onNextPage}>
            {iconSvg('chevron-right', 'small')}
          </button>
        </div>) : null}
    </div>);
});
export const TableHeader = forwardRef<HTMLTableCellElement, TableHeaderProps>(function TableHeader({ format, children }, ref) {
    return (<th ref={ref} scope="col" className={cx('rx-th', format === 'numeric' || format === 'currency' ? 'rx-num' : null)}>
      {children}
    </th>);
});
export const TableBody = forwardRef<HTMLTableSectionElement, TableSectionProps>(function TableBody({ children }, ref) {
    return <tbody ref={ref}>{children}</tbody>;
});
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"]';
export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow({ clickDelegate, children }, ref) {
    const onClick = clickDelegate
        ? (e: MouseEvent<HTMLTableRowElement>) => {
            if ((e.target as HTMLElement).closest(INTERACTIVE))
                return;
            document.getElementById(clickDelegate)?.click();
        }
        : undefined;
    let index = 0;
    return (<tr ref={ref} className={cx(clickDelegate && 'rx-row--link')} onClick={onClick}>
      {Children.map(children, (child) => (isValidElement(child) ? <CellIndex.Provider value={index++}>{child}</CellIndex.Provider> : child))}
    </tr>);
});
export const TableCell = forwardRef<HTMLTableCellElement, TableSectionProps>(function TableCell({ children }, ref) {
    const columns = useContext(ColumnsContext);
    const col = columns[useContext(CellIndex)];
    const numeric = col?.format === 'numeric' || col?.format === 'currency';
    return (<td ref={ref} className={cx('rx-td', numeric && 'rx-num')} data-slot={col?.listSlot ?? 'labeled'} data-label={col?.label || undefined}>
      {children}
    </td>);
});
