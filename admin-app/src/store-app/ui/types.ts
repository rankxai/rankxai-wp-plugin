import type { ComponentType, ReactNode, Ref } from 'react';
export type SizeToken = 'small-500' | 'small-400' | 'small-300' | 'small-200' | 'small-100' | 'small' | 'base' | 'large' | 'large-100' | 'large-200' | 'large-300' | 'large-400' | 'large-500';
export type SpaceToken = SizeToken | 'none';
export type ColorToken = 'subdued' | 'base' | 'strong';
export type ToneToken = 'auto' | 'neutral' | 'info' | 'success' | 'caution' | 'warning' | 'critical';
export type Responsive<T extends string> = T | `@container${string}`;
export type SizeValue = string;
export type IconName = 'alert-triangle' | 'arrow-down' | 'arrow-right' | 'arrow-up' | 'calendar' | 'check-circle' | 'chevron-left' | 'chevron-right' | 'circle' | 'collection' | 'delete' | 'external' | 'home' | 'info' | 'lock' | 'page' | 'plus' | 'product' | 'refresh' | 'undo' | 'x';
export interface PressEvent {
    preventDefault(): void;
    stopPropagation(): void;
}
export interface ValueEvent {
    currentTarget: {
        value: string;
    };
}
export interface CheckedEvent {
    currentTarget: {
        checked: boolean;
    };
}
export interface ValuesEvent {
    currentTarget: {
        values: string[];
    };
}
export interface SubmitEvent {
    preventDefault(): void;
}
export interface FocusHandle {
    focus(): void;
}
interface Base {
    children?: ReactNode;
    id?: string;
    slot?: string;
}
type LabelVisibility = 'visible' | 'exclusive';
interface FieldBase extends Base {
    label?: string;
    labelAccessibilityVisibility?: LabelVisibility;
    details?: ReactNode;
    error?: string;
    disabled?: boolean;
    name?: string;
}
interface BoxStyle {
    padding?: Responsive<SpaceToken> | `${SpaceToken} ${SpaceToken}`;
    paddingInline?: SpaceToken;
    paddingBlock?: SpaceToken;
    paddingBlockEnd?: SpaceToken;
    border?: 'base' | 'none' | 'large' | `base ${ColorToken}` | string;
    borderRadius?: SizeToken | 'none' | 'max';
    background?: ColorToken | 'transparent';
    blockSize?: SizeValue;
    inlineSize?: SizeValue;
    maxInlineSize?: SizeValue;
}
export interface BadgeProps extends Base {
    tone?: ToneToken;
    icon?: IconName;
}
export interface BannerProps extends Base {
    tone?: Exclude<ToneToken, 'neutral' | 'caution'>;
    heading?: string;
    dismissible?: boolean;
    onDismiss?: () => void;
}
export interface BoxProps extends Base, BoxStyle {
    accessibilityLabel?: string;
}
export type ButtonVariant = 'auto' | 'primary' | 'secondary' | 'tertiary';
export type OverlayCommand = '--show' | '--hide' | '--toggle' | '--auto';
export interface ButtonProps extends Base {
    onClick?: (e: PressEvent) => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: ButtonVariant;
    tone?: 'auto' | 'neutral' | 'critical';
    icon?: IconName;
    href?: string;
    target?: string;
    accessibilityLabel?: string;
    commandFor?: string;
    command?: OverlayCommand;
    type?: 'button' | 'submit' | 'reset';
}
export interface CheckboxProps extends FieldBase {
    checked?: boolean;
    onChange?: (e: CheckedEvent) => void;
    accessibilityLabel?: string;
}
export interface ChoiceProps extends Base {
    value: string;
    selected?: boolean;
    disabled?: boolean;
}
export interface ChoiceListProps extends FieldBase {
    values?: string[];
    multiple?: boolean;
    onChange?: (e: ValuesEvent) => void;
}
export interface ClickableProps extends Base, Pick<BoxStyle, 'padding' | 'border' | 'borderRadius' | 'background'> {
    onClick?: (e: PressEvent) => void;
    accessibilityLabel?: string;
    disabled?: boolean;
    href?: string;
}
export interface ClickableChipProps extends Base {
    onClick?: (e: PressEvent) => void;
    accessibilityLabel?: string;
}
export interface DateFieldProps extends FieldBase {
    value?: string;
    allow?: string;
    onChange?: (e: ValueEvent) => void;
}
export interface DatePickerProps extends Base {
    type?: 'single' | 'multiple' | 'range';
    value?: string;
    defaultView?: string;
    allow?: string;
    onChange?: (e: ValueEvent) => void;
}
export type DividerProps = Pick<Base, 'id' | 'slot'>;
export interface EmptyStateProps extends Base {
    heading?: string;
}
export interface GridProps extends Base {
    gridTemplateColumns?: Responsive<string>;
    gap?: Responsive<SpaceToken>;
    alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
}
export interface HeadingProps extends Base {
    fontSize?: SizeToken;
    accessibilityRole?: 'heading' | 'presentation' | 'none';
}
export interface IconProps extends Pick<Base, 'id' | 'slot'> {
    type?: IconName;
    tone?: ToneToken;
    size?: 'small' | 'base';
    color?: ColorToken;
}
export interface ImageProps extends Pick<Base, 'id' | 'slot'> {
    src?: string;
    alt?: string;
    aspectRatio?: string;
    objectFit?: 'cover' | 'contain';
    borderRadius?: SizeToken | 'none' | 'max';
}
export interface LinkProps extends Base {
    href?: string;
    target?: string;
    accessibilityLabel?: string;
    onClick?: (e: PressEvent) => void;
}
export type ListProps = Base;
export interface ModalProps extends Base {
    id: string;
    heading?: string;
    size?: 'small' | 'base' | 'large' | 'large-100';
}
export interface NumberFieldProps extends FieldBase {
    value?: string;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (e: ValueEvent) => void;
}
export interface OptionProps extends Base {
    value: string;
    defaultSelected?: boolean;
    disabled?: boolean;
}
export interface PageProps extends Base {
    heading?: string;
    inlineSize?: 'small' | 'base' | 'large';
}
export interface PopoverProps extends Base {
    id: string;
    maxInlineSize?: SizeValue;
}
export interface PressButtonProps extends Base {
    pressed?: boolean;
    onClick?: (e: PressEvent) => void;
    accessibilityLabel?: string;
    disabled?: boolean;
}
export interface ProgressProps extends Pick<Base, 'id' | 'slot'> {
    value?: number;
    max?: number;
    accessibilityLabel?: string;
}
export interface SearchFieldProps extends FieldBase {
    value?: string;
    placeholder?: string;
    onInput?: (e: ValueEvent) => void;
}
export interface SectionProps extends Base {
    heading?: string;
    accessibilityLabel?: string;
}
export interface SelectProps extends FieldBase {
    value?: string;
    onChange?: (e: ValueEvent) => void;
}
export interface SpinnerProps extends Pick<Base, 'id' | 'slot'> {
    accessibilityLabel?: string;
    size?: 'base' | 'large' | 'large-100';
}
export interface StackProps extends Base {
    direction?: 'block' | 'inline';
    gap?: Responsive<SpaceToken>;
    alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
    justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
    blockSize?: SizeValue;
}
export interface SwitchProps extends FieldBase {
    checked?: boolean;
    onChange?: (e: CheckedEvent) => void;
}
export interface TableProps extends Base {
    variant?: 'auto' | 'table' | 'list';
    loading?: boolean;
    paginate?: boolean;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    onNextPage?: () => void;
    onPreviousPage?: () => void;
}
export interface TableHeaderProps extends Base {
    listSlot?: 'primary' | 'secondary' | 'kicker' | 'inline' | 'labeled';
    format?: 'base' | 'numeric' | 'currency';
}
export interface TableRowProps extends Base {
    clickDelegate?: string;
}
export type TableSectionProps = Base;
export interface TextProps extends Base {
    color?: ColorToken;
    type?: 'strong' | 'generic' | 'address' | 'redundant';
    tone?: ToneToken;
}
export interface TextFieldProps extends FieldBase {
    value?: string;
    defaultValue?: string;
    placeholder?: string;
    maxLength?: number;
    readOnly?: boolean;
    onInput?: (e: ValueEvent) => void;
    onChange?: (e: ValueEvent) => void;
    ref?: Ref<FocusHandle>;
}
export interface TextAreaProps extends FieldBase {
    value?: string;
    defaultValue?: string;
    placeholder?: string;
    maxLength?: number;
    rows?: number;
    readOnly?: boolean;
    onInput?: (e: ValueEvent) => void;
    onChange?: (e: ValueEvent) => void;
}
export interface ThumbnailProps extends Pick<Base, 'id' | 'slot'> {
    src?: string;
    alt?: string;
    size?: SizeToken;
}
export interface SaveBarFormProps {
    children?: ReactNode;
    onSubmit: (e: SubmitEvent) => void;
    onReset: () => void;
}
type C<P> = ComponentType<P>;
export interface StorePrimitives {
    Badge: C<BadgeProps>;
    Banner: C<BannerProps>;
    Box: C<BoxProps>;
    Button: C<ButtonProps>;
    Checkbox: C<CheckboxProps>;
    Choice: C<ChoiceProps>;
    ChoiceList: C<ChoiceListProps>;
    Clickable: C<ClickableProps>;
    ClickableChip: C<ClickableChipProps>;
    DateField: C<DateFieldProps>;
    DatePicker: C<DatePickerProps>;
    Divider: C<DividerProps>;
    EmptyState: C<EmptyStateProps>;
    Grid: C<GridProps>;
    Heading: C<HeadingProps>;
    Icon: C<IconProps>;
    Image: C<ImageProps>;
    Link: C<LinkProps>;
    ListItem: C<ListProps>;
    Modal: C<ModalProps>;
    NumberField: C<NumberFieldProps>;
    Option: C<OptionProps>;
    OrderedList: C<ListProps>;
    Page: C<PageProps>;
    Paragraph: C<TextProps>;
    Popover: C<PopoverProps>;
    PressButton: C<PressButtonProps>;
    Progress: C<ProgressProps>;
    QueryContainer: C<Base>;
    SearchField: C<SearchFieldProps>;
    Section: C<SectionProps>;
    Select: C<SelectProps>;
    Spinner: C<SpinnerProps>;
    Stack: C<StackProps>;
    Switch: C<SwitchProps>;
    Table: C<TableProps>;
    TableBody: C<TableSectionProps>;
    TableCell: C<TableSectionProps>;
    TableHeader: C<TableHeaderProps>;
    TableHeaderRow: C<TableSectionProps>;
    TableRow: C<TableRowProps>;
    Text: C<TextProps>;
    TextArea: C<TextAreaProps>;
    TextField: ComponentType<TextFieldProps>;
    Thumbnail: C<ThumbnailProps>;
    UnorderedList: C<ListProps>;
    SaveBarForm: ComponentType<SaveBarFormProps>;
    showOverlay(id: string): void;
    hideOverlay(id: string): void;
    fieldInput(field: FocusHandle | null): HTMLInputElement | HTMLTextAreaElement | null;
}
