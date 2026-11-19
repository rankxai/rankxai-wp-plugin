import { useId, useState } from 'react';
import { parseMarkdown, type Block, type ListItem } from '@/components/prompt-tracker/response-markdown';
import type { AssistantCheckStatus } from '@/lib/shopify-app/assistant-status';
import { MAX_RANGE_DAYS, assistantsIn, clampRange, mergeChecksByDay, rangeEntries, rangeLine, searchesAcross, shiftDay, type DayStatus } from '@/lib/shopify-app/answer-range-core';
import { blogNewHref } from '@/lib/shopify-app/app-routes-core';
import { boldHeading, cleanAnswerMarkdown, isEmptyParagraph, plainAnswerText } from '@/lib/shopify-app/answer-text-core';
import { adminLocale, fmtDate, fmtDateTime } from '../format';
import { GoButton, useLoad } from '../kit';
import { usePaged } from './Pager';
import { useModal } from './FixModals';
import { SkeletonSection } from './Status';
import * as UI from '../ui';
type Tone = 'success' | 'neutral' | 'info' | 'warning';
export const STATUS_BADGE: Record<AssistantCheckStatus, {
    label: string;
    tone: Tone;
}> = {
    named: { label: 'Named you', tone: 'success' },
    not_named: { label: 'Didn’t name you', tone: 'neutral' },
    no_verdict: { label: 'Couldn’t read the answer', tone: 'neutral' },
    checking: { label: 'Checking…', tone: 'info' },
    failed: { label: 'Couldn’t check · not charged', tone: 'neutral' },
    not_checked_yet: { label: 'Not checked yet', tone: 'neutral' },
};
const DAY_BADGE: Record<DayStatus, {
    label: string;
    tone: Tone;
}> = { ...STATUS_BADGE, not_asked: { label: 'Not asked this time', tone: 'neutral' } };
export function StatusBadge({ status }: {
    status: AssistantCheckStatus;
}) {
    const b = STATUS_BADGE[status];
    return <UI.Badge tone={b.tone}>{b.label}</UI.Badge>;
}
export function latestSummary(latest: Array<{
    label: string;
    status: AssistantCheckStatus;
}>): string {
    const named = latest.filter((a) => a.status === 'named').map((a) => a.label);
    const answered = latest.filter((a) => a.status === 'named' || a.status === 'not_named' || a.status === 'no_verdict').length;
    const checking = latest.some((a) => a.status === 'checking');
    if (named.length > 0)
        return `Named by ${named.join(', ')}`;
    if (answered > 0)
        return `Not named (${answered} ${answered === 1 ? 'answer' : 'answers'})`;
    return checking ? 'Checking…' : 'Not checked yet';
}
const plain = plainAnswerText;
function Items({ items, ordered }: {
    items: ListItem[];
    ordered: boolean;
}) {
    const children = items.map((it, i) => (<UI.ListItem key={i}>
      {plain(it.text)}
      {it.children.length > 0 ? <Items items={it.children} ordered={false}/> : null}
    </UI.ListItem>));
    return ordered ? <UI.OrderedList>{children}</UI.OrderedList> : <UI.UnorderedList>{children}</UI.UnorderedList>;
}
function BlockView({ block }: {
    block: Block;
}) {
    switch (block.type) {
        case 'heading':
            return <UI.Heading>{plain(block.text)}</UI.Heading>;
        case 'paragraph': {
            const heading = boldHeading(block.text);
            return heading ? <UI.Text type="strong">{heading}</UI.Text> : <UI.Paragraph>{plain(block.text)}</UI.Paragraph>;
        }
        case 'list':
            return <Items items={block.items} ordered={block.ordered}/>;
        case 'table':
            return (<UI.Table variant="auto">
          <UI.TableHeaderRow>
            {block.headers.map((h, i) => (<UI.TableHeader key={i} listSlot={i === 0 ? 'primary' : 'labeled'}>
                {plain(h)}
              </UI.TableHeader>))}
          </UI.TableHeaderRow>
          <UI.TableBody>
            {block.rows.map((row, r) => (<UI.TableRow key={r}>
                {row.map((cell, c) => (<UI.TableCell key={c}>{plain(cell)}</UI.TableCell>))}
              </UI.TableRow>))}
          </UI.TableBody>
        </UI.Table>);
    }
}
export function AnswerText({ text }: {
    text: string;
}) {
    const blocks = parseMarkdown(cleanAnswerMarkdown(text)).filter((b) => b.type !== 'paragraph' || !isEmptyParagraph(b.text));
    return (<UI.Stack gap="base">
      {blocks.map((b, i) => (<BlockView key={i} block={b}/>))}
    </UI.Stack>);
}
export interface DayAnswerView {
    platform: string;
    label: string;
    status: DayStatus;
    answerId: string | null;
    checkedAt: string | null;
    searches?: string[] | null;
}
export interface AnswerCheckView {
    key: string;
    checkedAt: string;
    answered: number;
    namedBy: string[];
    answers: DayAnswerView[];
}
export interface AnswerDetailView {
    excerpt: string | null;
    hasText: boolean;
    othersNamed: string[];
    sources: Array<{
        domain: string;
        url: string;
        title: string | null;
    }>;
    brands?: Array<{
        name: string;
        domain: string | null;
        kind: 'brand' | 'product';
    }>;
    citedSources?: Array<{
        url: string;
        domain: string;
        title: string | null;
        publisher: string | null;
        publishedAt: string | null;
    }>;
    searchedPages?: Array<{
        url: string;
        title: string | null;
        domain: string | null;
    }>;
    searches?: string[];
    searchesReported?: boolean;
    checkUrl?: string | null;
    model?: string | null;
}
export interface AnswerDaysData {
    question: {
        id: string;
        text: string;
    };
    checks: AnswerCheckView[];
    keptDays: number;
}
const DAY_MS = 86400000;
function localDay(d: Date): number {
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / DAY_MS);
}
function dayKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayLabel(iso: string, now: Date): string {
    const d = new Date(iso);
    const n = localDay(d);
    const today = localDay(now);
    return n === today ? 'Today' : n === today - 1 ? 'Yesterday' : new Intl.DateTimeFormat(adminLocale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}
function moreList(names: string[], shown = 3): string {
    return names.length > shown ? `${names.slice(0, shown).join(', ')} +${names.length - shown}` : names.join(', ');
}
const notKept = (keptDays: number) => `We keep the words of each answer for ${keptDays} days, so this one is no longer stored. Who it named and the sites it used stay.`;
const FEED_PAGE = 12;
type FeedRange = {
    kind: 'last';
    days: 7 | 14 | 30;
} | {
    kind: 'custom';
    from: string;
    to: string;
    shortened: boolean;
};
const LAST_RANGES = [7, 14, 30] as const;
function shortDay(day: string): string {
    return new Intl.DateTimeFormat(adminLocale(), { day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00`));
}
export function AnswerDays({ questionId, questionText, checks, keptDays, intro }: {
    questionId: string;
    questionText: string;
    checks: AnswerCheckView[];
    keptDays: number;
    intro?: string | null;
}) {
    const [range, setRange] = useState<FeedRange>({ kind: 'last', days: 7 });
    const [page, setPage] = useState(0);
    const [only, setOnly] = useState<string[]>([]);
    const [open, setOpen] = useState<{
        check: AnswerCheckView;
        answer: DayAnswerView;
    } | null>(null);
    const modal = useModal('answer');
    const pickerId = `answer-range-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const now = new Date();
    const today = dayKey(now.toISOString());
    const days: AnswerCheckView[] = mergeChecksByDay(checks, dayKey, (a) => a.label);
    const from = range.kind === 'last' ? shiftDay(today, -(range.days - 1)) : range.from;
    const to = range.kind === 'last' ? today : range.to;
    const assistants = assistantsIn(days);
    const inRange = rangeEntries(days, from, to, only);
    const latestDay = days.find((d) => rangeEntries([d], d.key, d.key, only).length > 0) ?? null;
    const fallback = inRange.length === 0 && latestDay ? rangeEntries([latestDay], latestDay.key, latestDay.key, only) : null;
    const entries = fallback ?? inRange;
    const pages = Math.max(1, Math.ceil(entries.length / FEED_PAGE));
    const current = Math.min(page, pages - 1);
    const shown = entries.slice(current * FEED_PAGE, (current + 1) * FEED_PAGE);
    const ids = shown.map((e) => e.answer.answerId).filter((x): x is string => x !== null);
    const details = useLoad<{
        details: Record<string, AnswerDetailView>;
    }>(ids.length ? `answers/questions/${questionId}/details?ids=${ids.join(',')}` : null);
    const detailState = details.error ? 'error' : details.data ? 'ready' : 'loading';
    const groups: Array<{
        day: AnswerCheckView;
        answers: DayAnswerView[];
    }> = [];
    for (const e of shown) {
        const last = groups[groups.length - 1];
        if (last && last.day.key === e.day.key)
            last.answers.push(e.answer);
        else
            groups.push({ day: e.day, answers: [e.answer] });
    }
    const rangeLabel = range.kind === 'last' ? `Last ${range.days} days` : `${shortDay(range.from)} – ${shortDay(range.to)}`;
    const whose = only.length === 0 ? '' : ` from ${assistants.filter((a) => only.includes(a.platform)).map((a) => a.label).join(' and ')}`;
    function choose(next: FeedRange) {
        setRange(next);
        setPage(0);
    }
    function toggleAssistant(platform: string | null) {
        setOnly((cur) => (platform === null ? [] : cur.includes(platform) ? cur.filter((p) => p !== platform) : [...cur, platform]));
        setPage(0);
    }
    function chooseCustom(value: string) {
        const [a, b] = value.split('--');
        if (!a || !b)
            return;
        choose({ kind: 'custom', ...clampRange(a, b) });
        UI.hideOverlay(pickerId);
    }
    function read(check: AnswerCheckView, answer: DayAnswerView) {
        setOpen({ check, answer });
        modal.show();
    }
    return (<>
      <UI.Section heading="What AI assistants said">
        <UI.Stack gap="base">
          {intro ? <UI.Text color="subdued">{intro}</UI.Text> : null}
          {days.length === 0 ? (<UI.Paragraph>Not asked yet. The assistants are asked on the next check, and each answer appears here.</UI.Paragraph>) : (<>
              
              <UI.Stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                <UI.Stack direction="inline" gap="small-200" alignItems="center">
                  {LAST_RANGES.map((n) => (<UI.PressButton key={n} pressed={range.kind === 'last' && range.days === n} onClick={() => choose({ kind: 'last', days: n })}>
                      {`Last ${n} days`}
                    </UI.PressButton>))}
                  <UI.Button icon="calendar" commandFor={pickerId} command="--toggle">
                    {range.kind === 'custom' ? rangeLabel : 'Choose dates'}
                  </UI.Button>
                </UI.Stack>
                {assistants.length > 1 ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                    <UI.PressButton pressed={only.length === 0} onClick={() => toggleAssistant(null)}>
                      All assistants
                    </UI.PressButton>
                    {assistants.map((a) => (<UI.PressButton key={a.platform} pressed={only.includes(a.platform)} onClick={() => toggleAssistant(a.platform)}>
                        {a.label}
                      </UI.PressButton>))}
                  </UI.Stack>) : null}
              </UI.Stack>
              <UI.Popover id={pickerId} maxInlineSize="360px">
                <UI.Box padding="base">
                  <UI.Stack gap="small-200">
                    <UI.Text color="subdued">{`Choose up to ${MAX_RANGE_DAYS} days.`}</UI.Text>
                    <UI.DatePicker type="range" key={`${from}-${to}`} defaultView={to.slice(0, 7)} allow={`${shiftDay(today, -(keptDays - 1))}--${today}`} value={`${from}--${to}`} onChange={(e) => chooseCustom((e.currentTarget as unknown as {
            value: string;
        }).value)}/>
                  </UI.Stack>
                </UI.Box>
              </UI.Popover>
              <UI.Text color="subdued">
                {fallback
                ? `No answers${whose} in ${range.kind === 'last' ? `the last ${range.days} days` : 'these dates'}. The latest are from ${fmtDate(latestDay!.checkedAt)}.`
                : `${rangeLabel}${whose}: ${rangeLine(entries)}${range.kind === 'custom' && range.shortened ? ` Only the last ${MAX_RANGE_DAYS} days of your dates are shown.` : ''}`}
              </UI.Text>
              {groups.map((g) => (<UI.Stack key={g.day.key} gap="small-200">
                  <UI.Stack direction="inline" gap="small-200" alignItems="center">
                    <UI.Text type="strong">{dayLabel(g.day.checkedAt, now)}</UI.Text>
                    <UI.Text color="subdued">{`Checked ${fmtDateTime(g.day.checkedAt)}`}</UI.Text>
                  </UI.Stack>
                  <UI.Grid gridTemplateColumns="repeat(auto-fill, minmax(min(340px, 100%), 1fr))" gap="base">
                    {g.answers.map((a) => (<AnswerCard key={a.platform} a={a} detail={a.answerId ? (details.data?.details[a.answerId] ?? null) : null} detailState={detailState} keptDays={keptDays} onRead={() => read(g.day, a)}/>))}
                  </UI.Grid>
                </UI.Stack>))}
              {pages > 1 ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                  <UI.Button icon="chevron-left" disabled={current === 0 || undefined} onClick={() => setPage(current - 1)}>
                    Newer
                  </UI.Button>
                  <UI.Text color="subdued">{`${current * FEED_PAGE + 1}–${Math.min((current + 1) * FEED_PAGE, entries.length)} of ${entries.length}`}</UI.Text>
                  <UI.Button icon="chevron-right" disabled={current >= pages - 1 || undefined} onClick={() => setPage(current + 1)}>
                    Older
                  </UI.Button>
                </UI.Stack>) : null}
            </>)}
        </UI.Stack>
        <UI.Modal id={modal.id} heading={open ? `${open.answer.label} · ${fmtDateTime(open.answer.checkedAt ?? open.check.checkedAt)}` : 'Answer'} size="large">
          {open ? (<AnswerChat questionId={questionId} questionText={questionText} answer={open.answer} detail={open.answer.answerId ? (details.data?.details[open.answer.answerId] ?? null) : null} keptDays={keptDays}/>) : null}
          <UI.Button slot="secondary-actions" commandFor={modal.id} command="--hide">
            Close
          </UI.Button>
        </UI.Modal>
      </UI.Section>
      
      {days.length > 0 ? (<SearchesSection key={`${fallback ? 'latest' : rangeLabel}|${whose}`} entries={entries} scope={fallback ? `Latest answers${whose}` : `${rangeLabel}${whose}`}/>) : null}
    </>);
}
function SearchesSection({ entries, scope }: {
    entries: Array<{
        answer: DayAnswerView;
    }>;
    scope: string;
}) {
    const { searches, answersReporting } = searchesAcross(entries.map((e) => ({ answer: { ...e.answer, searches: e.answer.searches ?? null } })), (a) => a.label);
    const { rows: list, pager } = usePaged(searches);
    if (searches.length === 0)
        return null;
    return (<UI.Section heading="Searches AI assistants ran">
      <UI.Stack gap="base">
        <UI.Text color="subdued">
          {`${scope}: what the assistants searched the web for before answering, from ${answersReporting} ${answersReporting === 1 ? 'answer' : 'answers'}. Their answers are written from the pages these searches found.`}
        </UI.Text>
        {list.length > 0 ? (<UI.Table variant="auto">
            <UI.TableHeaderRow>
              <UI.TableHeader listSlot="primary">Search</UI.TableHeader>
              <UI.TableHeader listSlot="labeled">Answers</UI.TableHeader>
              <UI.TableHeader listSlot="secondary">Searched by</UI.TableHeader>
              <UI.TableHeader listSlot="inline">Action</UI.TableHeader>
            </UI.TableHeaderRow>
            <UI.TableBody>
              {list.map((s) => (<UI.TableRow key={s.query}>
                  <UI.TableCell>{s.query}</UI.TableCell>
                  <UI.TableCell>{`${s.answers} of ${answersReporting}`}</UI.TableCell>
                  <UI.TableCell>{s.by.join(', ')}</UI.TableCell>
                  <UI.TableCell>
                    <GoButton href={blogNewHref(s.query)} label="Write a post" accessibilityLabel={`Write a blog post about: ${s.query}`}/>
                  </UI.TableCell>
                </UI.TableRow>))}
            </UI.TableBody>
          </UI.Table>) : null}
        {pager}
      </UI.Stack>
    </UI.Section>);
}
function DayBadge({ status }: {
    status: DayStatus;
}) {
    const b = DAY_BADGE[status];
    return <UI.Badge tone={b.tone}>{b.label}</UI.Badge>;
}
function AnswerCard({ a, detail, detailState, keptDays, onRead }: {
    a: DayAnswerView;
    detail: AnswerDetailView | null;
    detailState: 'loading' | 'ready' | 'error';
    keptDays: number;
    onRead: () => void;
}) {
    return (<UI.Box padding="base" border="base" borderRadius="large" background="base">
      <UI.Stack gap="small-200">
        <UI.Stack direction="inline" gap="small-200" alignItems="center">
          <UI.Text type="strong">{a.label}</UI.Text>
          <DayBadge status={a.status}/>
        </UI.Stack>
        {a.answerId ? (detail ? (<>
              {detail.excerpt ? <UI.Paragraph>{detail.excerpt}</UI.Paragraph> : <UI.Text color="subdued">{notKept(keptDays)}</UI.Text>}
              {detail.othersNamed.length > 0 ? <UI.Text color="subdued">{`Named: ${moreList(detail.othersNamed)}`}</UI.Text> : null}
              {detail.sources.length > 0 ? <UI.Text color="subdued">{`Sites: ${moreList(detail.sources.map((s) => s.domain), 2)}`}</UI.Text> : null}
              <UI.Stack direction="inline">
                <UI.Button onClick={onRead}>{detail.hasText ? 'Read the answer' : 'See brands and sites'}</UI.Button>
              </UI.Stack>
            </>) : (<UI.Text color="subdued">{detailState === 'error' ? 'This answer could not be read just now.' : 'Reading the answer…'}</UI.Text>)) : (<UI.Text color="subdued">
            {a.status === 'checking'
                ? 'Its answer appears here when it arrives.'
                : a.status === 'failed'
                    ? 'This assistant could not be reached on this day. It was not charged.'
                    : 'This assistant was not asked on this day.'}
          </UI.Text>)}
      </UI.Stack>
    </UI.Box>);
}
const DOMAIN_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const SEARCHED_SHOWN = 5;
function sourceDate(raw: string | null): string | null {
    if (!raw)
        return null;
    const d = new Date(raw.replace(' +00:00', 'Z').replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : fmtDate(d.toISOString());
}
function AnswerChat({ questionId, questionText, answer, detail, keptDays }: {
    questionId: string;
    questionText: string;
    answer: DayAnswerView;
    detail: AnswerDetailView | null;
    keptDays: number;
}) {
    const text = useLoad<{
        text: string | null;
    }>(detail?.hasText && answer.answerId ? `answers/questions/${questionId}/answer/${answer.answerId}` : null);
    const [allSearched, setAllSearched] = useState(false);
    const named = answer.status === 'named';
    const brands = detail?.brands ?? [];
    const sources = detail?.citedSources ?? [];
    const searched = detail?.searchedPages ?? [];
    const searches = detail?.searches ?? [];
    return (<UI.QueryContainer>
      
      <UI.Grid gridTemplateColumns="@container (inline-size > 720px) 2fr 1fr, 1fr" gap="large">
        <UI.Stack gap="base">
          <UI.Stack alignItems="end">
            <UI.Box background="subdued" padding="base" borderRadius="large" maxInlineSize="85%">
              <UI.Stack gap="small-100">
                <UI.Text color="subdued">Question asked</UI.Text>
                <UI.Text>{questionText}</UI.Text>
              </UI.Stack>
            </UI.Box>
          </UI.Stack>
          <UI.Stack direction="inline" gap="small-200" alignItems="center">
            <UI.Text type="strong">{answer.label}</UI.Text>
            <DayBadge status={answer.status}/>
            {detail?.model ? <UI.Text color="subdued">{`Model: ${detail.model}`}</UI.Text> : null}
          </UI.Stack>
          {detail && !detail.hasText ? (<UI.Text color="subdued">{notKept(keptDays)}</UI.Text>) : text.data ? (text.data.text ? (<AnswerText text={text.data.text}/>) : (<UI.Text color="subdued">{notKept(keptDays)}</UI.Text>)) : text.error ? (<UI.Paragraph>{text.error}</UI.Paragraph>) : (<SkeletonSection lines={6} label="Reading the answer"/>)}
          {detail?.checkUrl ? (<UI.Stack direction="inline">
              <UI.Link href={detail.checkUrl} target="_blank">{`Ask ${answer.label} this question yourself`}</UI.Link>
            </UI.Stack>) : null}
        </UI.Stack>
        <UI.Stack gap="base">
          <UI.Stack gap="small-200">
            <UI.Heading>Brands named</UI.Heading>
            {named ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                <UI.Badge tone="success">You</UI.Badge>
                <UI.Text>Your store was named</UI.Text>
              </UI.Stack>) : null}
            {brands.length > 0 ? (brands.map((b) => {
            const nameIsAddress = DOMAIN_NAME.test(b.name);
            const site = b.domain ?? (nameIsAddress ? b.name.toLowerCase() : null);
            return (<UI.Stack key={b.name} direction="inline" gap="small-200" alignItems="center">
                    {site ? (<UI.Link href={`https://${site}`} target="_blank">
                        {b.name}
                      </UI.Link>) : (<UI.Text>{b.name}</UI.Text>)}
                    {site && !nameIsAddress ? <UI.Text color="subdued">{site}</UI.Text> : null}
                    {b.kind === 'product' ? <UI.Badge tone="neutral">Product</UI.Badge> : null}
                  </UI.Stack>);
        })) : named ? null : (<UI.Text color="subdued">No brands were named.</UI.Text>)}
          </UI.Stack>
          <UI.Divider />
          <UI.Stack gap="small-200">
            <UI.Heading>{sources.length > 0 ? `Sources it cited (${sources.length})` : 'Sources it cited'}</UI.Heading>
            {sources.length > 0 ? (sources.map((src) => {
            const meta = [src.publisher && src.publisher !== src.domain ? src.publisher : null, sourceDate(src.publishedAt)].filter(Boolean).join(' · ');
            return (<UI.Stack key={src.url} gap="small-100">
                    <UI.Link href={src.url} target="_blank">
                      {src.title ?? src.domain}
                    </UI.Link>
                    <UI.Text color="subdued">{meta ? `${src.domain} · ${meta}` : src.domain}</UI.Text>
                  </UI.Stack>);
        })) : (<UI.Text color="subdued">This answer did not list its sources.</UI.Text>)}
          </UI.Stack>
          {searched.length > 0 ? (<>
              <UI.Divider />
              <UI.Stack gap="small-200">
                <UI.Heading>{`Pages it searched (${searched.length})`}</UI.Heading>
                <UI.Text color="subdued">What its search returned, cited or not.</UI.Text>
                {(allSearched ? searched : searched.slice(0, SEARCHED_SHOWN)).map((p) => (<UI.Stack key={p.url} gap="small-100">
                    <UI.Link href={p.url} target="_blank">
                      {p.title ?? p.domain ?? p.url}
                    </UI.Link>
                    {p.domain ? <UI.Text color="subdued">{p.domain.replace(/^www\./i, '')}</UI.Text> : null}
                  </UI.Stack>))}
                {searched.length > SEARCHED_SHOWN ? (<UI.Stack direction="inline">
                    <UI.Button variant="tertiary" onClick={() => setAllSearched((v) => !v)}>
                      {allSearched ? 'Show fewer' : `Show all ${searched.length}`}
                    </UI.Button>
                  </UI.Stack>) : null}
              </UI.Stack>
            </>) : null}
          {searches.length > 0 ? (<>
              <UI.Divider />
              <UI.Stack gap="small-200">
                <UI.Heading>Searches it ran</UI.Heading>
                <UI.UnorderedList>
                  {searches.map((q) => (<UI.ListItem key={q}>{q}</UI.ListItem>))}
                </UI.UnorderedList>
              </UI.Stack>
            </>) : null}
        </UI.Stack>
      </UI.Grid>
    </UI.QueryContainer>);
}
export function TwinAnswers({ brandId }: {
    brandId: string;
}) {
    const load = useLoad<AnswerDaysData>(`answers/questions/${brandId}`);
    if (!load.data) {
        return load.error ? (<UI.Section heading="What AI assistants said">
        <UI.Paragraph>{load.error}</UI.Paragraph>
      </UI.Section>) : (<SkeletonSection lines={4} label="Reading the answers"/>);
    }
    return <AnswerDays questionId={brandId} questionText={load.data.question.text} checks={load.data.checks} keptDays={load.data.keptDays}/>;
}
