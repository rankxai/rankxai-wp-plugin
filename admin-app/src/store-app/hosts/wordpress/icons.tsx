import type { IconName } from '../../ui/types';
const PATHS: Record<IconName, string> = {
    'alert-triangle': 'M10 3.2 17.6 16.4H2.4Z M10 8.2v3.6 M10 14.1v.1',
    'arrow-down': 'M10 4v12 M5 11l5 5 5-5',
    'arrow-right': 'M4 10h12 M11 5l5 5-5 5',
    'arrow-up': 'M10 16V4 M5 9l5-5 5 5',
    calendar: 'M4 5.5h12v10.5H4Z M4 8.5h12 M7 3.5v3 M13 3.5v3',
    'check-circle': 'M10 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4Z M6.8 10.2l2.2 2.2 4.2-4.4',
    'chevron-left': 'M12.5 4.5 7 10l5.5 5.5',
    'chevron-right': 'M7.5 4.5 13 10l-5.5 5.5',
    circle: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z',
    collection: 'M4 5.5h12v3H4Z M5 8.5v7.5h10V8.5 M8.5 11.5h3',
    delete: 'M4 6h12 M8 6V4h4v2 M5.5 6l.8 10h7.4l.8-10 M8.5 9v4.5 M11.5 9v4.5',
    external: 'M11 4h5v5 M16 4l-7 7 M14 11.5V16H4V6h4.5',
    home: 'M3.5 9.5 10 4l6.5 5.5 M5.5 8v8h9V8 M8.5 16v-4h3v4',
    info: 'M10 2.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4Z M10 9v4.6 M10 6.4v.1',
    lock: 'M5.5 9h9v7.5h-9Z M7.5 9V6.5a2.5 2.5 0 0 1 5 0V9',
    page: 'M5.5 3.5h6l3 3v10h-9Z M11.5 3.5v3h3 M7.5 10h5 M7.5 13h5',
    plus: 'M10 4v12 M4 10h12',
    product: 'M3.5 10.5 10 4h6v6l-6.5 6.5Z M13 6.8v.1',
    refresh: 'M15.5 8A6 6 0 0 0 4.6 7 M4.5 12a6 6 0 0 0 10.9 1 M15.5 4v4h-4 M4.5 16v-4h4',
    undo: 'M7.5 5 4 8.5 7.5 12 M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9',
    x: 'M5 5l10 10 M15 5 5 15',
};
export function iconSvg(type: IconName | undefined, size: 'small' | 'base' = 'base') {
    const d = type ? PATHS[type] : undefined;
    if (!d)
        return null;
    const px = size === 'small' ? 16 : 20;
    return (<svg className="rx-icon__svg" width={px} height={px} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d}/>
    </svg>);
}
