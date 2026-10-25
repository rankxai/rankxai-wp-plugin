export const PRIMITIVE_TAGS = {
    Badge: 's-badge',
    Banner: 's-banner',
    Box: 's-box',
    Button: 's-button',
    Checkbox: 's-checkbox',
    Choice: 's-choice',
    ChoiceList: 's-choice-list',
    Clickable: 's-clickable',
    ClickableChip: 's-clickable-chip',
    DateField: 's-date-field',
    DatePicker: 's-date-picker',
    Divider: 's-divider',
    EmptyState: 's-empty-state',
    Grid: 's-grid',
    Heading: 's-heading',
    Icon: 's-icon',
    Image: 's-image',
    Link: 's-link',
    ListItem: 's-list-item',
    Modal: 's-modal',
    NumberField: 's-number-field',
    Option: 's-option',
    OrderedList: 's-ordered-list',
    Page: 's-page',
    Paragraph: 's-paragraph',
    Popover: 's-popover',
    PressButton: 's-press-button',
    Progress: 's-progress',
    QueryContainer: 's-query-container',
    SearchField: 's-search-field',
    Section: 's-section',
    Select: 's-select',
    Spinner: 's-spinner',
    Stack: 's-stack',
    Switch: 's-switch',
    Table: 's-table',
    TableBody: 's-table-body',
    TableCell: 's-table-cell',
    TableHeader: 's-table-header',
    TableHeaderRow: 's-table-header-row',
    TableRow: 's-table-row',
    Text: 's-text',
    TextArea: 's-text-area',
    TextField: 's-text-field',
    Thumbnail: 's-thumbnail',
    UnorderedList: 's-unordered-list',
} as const;
export type PrimitiveName = keyof typeof PRIMITIVE_TAGS;
export type PrimitiveTag = (typeof PRIMITIVE_TAGS)[PrimitiveName];
export function primitiveForTag(tag: string): PrimitiveName | null {
    for (const [name, t] of Object.entries(PRIMITIVE_TAGS))
        if (t === tag)
            return name as PrimitiveName;
    return null;
}
export const SAVE_BAR_FORM = 'SaveBarForm';
