import { useState } from 'react';
import { blogNewHref, blogArticleHref } from '@/lib/shopify-app/app-routes-core';
import { PLAN_CAP_MAX, PLAN_LENGTHS, frequencyLabel, monthlyCeiling, type PlanLength } from '@/lib/shopify-app/blog-plan-core';
import { api, toastSuccess } from '../api';
import { usePlan } from '../plan-context';
import { act, creditsLabel, fieldError, formatDate, useLoad, type PageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import { fmtNumber } from '../format';
import { PageColumns } from '../components/PageColumns';
import { blogWriteLock, lengthLabel, type BlogData } from './Blog';
import * as UI from '../ui';
interface PlanData {
    plan: {
        enabled: boolean;
        frequencyDays: number;
        monthlyCap: number;
        length: PlanLength;
        reviewFirst: boolean;
        frequencies: number[];
        floorDays: number;
        waiting: string | null;
        writtenThisMonth: number;
        nextFrom: string | null;
        topics: Array<{
            id: string;
            topic: string;
            mine: boolean;
        }>;
        runs: Array<{
            id: string;
            topic: string;
            label: string;
            tone: 'info' | 'success' | 'warning' | 'neutral';
            detail: string | null;
            itemId: string | null;
            startedAt: string | null;
        }>;
    };
}
const LENGTH_NAMES: Record<PlanLength, string> = { short: 'Short', standard: 'Standard', long: 'Long' };
export function BlogScheduleView({ blog, error, setError }: {
    blog: BlogData | null;
    error: PageError | null;
    setError: (e: PageError | null) => void;
}) {
    const load = useLoad<PlanData>('blog/plan');
    const { plan: billing } = usePlan();
    const [busy, setBusy] = useState<string | null>(null);
    const [topic, setTopic] = useState('');
    const p = load.data?.plan ?? null;
    const lock = blogWriteLock(billing, blog);
    const price = p && blog ? blog.prices[p.length] ?? null : null;
    const ceiling = p ? monthlyCeiling(p.monthlyCap, price) : null;
    async function save(patch: Record<string, unknown>, done: string) {
        const r = await act(() => api('blog/plan', { method: 'POST', body: patch }), (b) => setBusy(b ? 'save' : null), setError);
        if (r.ok) {
            toastSuccess(done);
            await load.reload();
        }
    }
    async function add(text: string) {
        const r = await act(() => api('blog/plan/topics', { method: 'POST', body: { topic: text } }), (b) => setBusy(b ? 'add' : null), setError);
        if (r.ok) {
            setTopic('');
            toastSuccess('Topic added');
            await load.reload();
        }
    }
    async function change(id: string, c: 'up' | 'down' | 'remove') {
        const r = await act(() => api(`blog/plan/topics/${id}`, { method: 'POST', body: { change: c } }), (b) => setBusy(b ? `${c}:${id}` : null), setError);
        if (r.ok)
            await load.reload();
    }
    if (!p)
        return load.loading ? <SkeletonSection lines={6} label="Reading the plan"/> : null;
    const planned = new Set(p.topics.map((t) => t.topic.toLowerCase()));
    const ideas = (blog?.ideas ?? []).filter((i) => !planned.has(i.topic.toLowerCase())).slice(0, 5);
    return (<PageColumns main={<>
          <UI.Section heading="Topics">
            <UI.Stack gap="base">
              <UI.Text color="subdued">Written in this order, one per period. When your list runs out, the plan picks topics from your store’s products and the questions shoppers ask.</UI.Text>
              <UI.Stack direction="inline" gap="small-200" alignItems="end">
                <UI.Box inlineSize="100%" maxInlineSize="560px">
                  <UI.TextField label="Add a topic" value={topic} maxLength={200} placeholder="How to store a snowboard over the summer" error={fieldError(error, 'topic')} onInput={(e) => setTopic(e.currentTarget.value)}/>
                </UI.Box>
                <UI.Button disabled={topic.trim().length < 3 || busy !== null || undefined} loading={busy === 'add' || undefined} onClick={() => void add(topic)}>
                  Add
                </UI.Button>
              </UI.Stack>
              {p.topics.length === 0 ? (<UI.Text color="subdued">No topics planned yet.</UI.Text>) : (<UI.Stack gap="small-200">
                  {p.topics.map((t, i) => (<UI.Box key={t.id} padding="small-200" border="base" borderRadius="base">
                      <UI.Grid gridTemplateColumns="auto minmax(0, 1fr) auto" gap="small-200" alignItems="center">
                        <UI.Badge>{String(i + 1)}</UI.Badge>
                        <UI.Stack gap="small-100">
                          <UI.Text>{t.topic}</UI.Text>
                          <UI.Text color="subdued">{t.mine ? 'Your topic' : 'From your store'}</UI.Text>
                        </UI.Stack>
                        <UI.Stack direction="inline" gap="small-100">
                          <UI.Button variant="tertiary" icon="arrow-up" disabled={i === 0 || busy !== null || undefined} accessibilityLabel={`Move ${t.topic} up`} onClick={() => void change(t.id, 'up')}/>
                          <UI.Button variant="tertiary" icon="arrow-down" disabled={i === p.topics.length - 1 || busy !== null || undefined} accessibilityLabel={`Move ${t.topic} down`} onClick={() => void change(t.id, 'down')}/>
                          <UI.Button variant="tertiary" icon="delete" disabled={busy !== null || undefined} accessibilityLabel={`Remove ${t.topic}`} onClick={() => void change(t.id, 'remove')}/>
                        </UI.Stack>
                      </UI.Grid>
                    </UI.Box>))}
                </UI.Stack>)}
              {ideas.length > 0 ? (<UI.Stack gap="small-200">
                  <UI.Text type="strong">Ideas from your buyers’ questions</UI.Text>
                  {ideas.map((i) => (<UI.Stack key={i.key} direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                      <UI.Text>{i.topic}</UI.Text>
                      <UI.Button variant="tertiary" icon="plus" disabled={busy !== null || undefined} accessibilityLabel={`Add ${i.topic} to the plan`} onClick={() => void add(i.topic)}>
                        Add
                      </UI.Button>
                    </UI.Stack>))}
                </UI.Stack>) : null}
            </UI.Stack>
          </UI.Section>

          <UI.Section heading="Written by the plan">
            {p.runs.length === 0 ? (<UI.Paragraph>Nothing yet. Each article appears here as it is written, and waits for you on the Blog page.</UI.Paragraph>) : (<UI.Table variant="auto">
                <UI.TableHeaderRow>
                  <UI.TableHeader listSlot="primary">Topic</UI.TableHeader>
                  <UI.TableHeader listSlot="secondary">State</UI.TableHeader>
                  <UI.TableHeader listSlot="labeled">Started</UI.TableHeader>
                </UI.TableHeaderRow>
                <UI.TableBody>
                  {p.runs.map((r) => (<UI.TableRow key={r.id}>
                      <UI.TableCell>
                        <UI.Stack gap="small-100">
                          {r.itemId ? <UI.Link href={blogArticleHref(r.itemId)}>{r.topic}</UI.Link> : <UI.Text>{r.topic}</UI.Text>}
                          {r.detail ? <UI.Text color="subdued">{r.detail}</UI.Text> : null}
                        </UI.Stack>
                      </UI.TableCell>
                      <UI.TableCell>
                        <UI.Badge tone={r.tone === 'neutral' ? undefined : r.tone}>{r.label}</UI.Badge>
                      </UI.TableCell>
                      <UI.TableCell>{r.startedAt ? formatDate(r.startedAt) : ''}</UI.TableCell>
                    </UI.TableRow>))}
                </UI.TableBody>
              </UI.Table>)}
          </UI.Section>
        </>} side={<UI.Section heading="Write on a schedule">
          <UI.Stack gap="base">
            <UI.Switch label="Write articles on a schedule" details={lock ? `${lock.reason}${lock.planNeeded ? ` Available on ${lock.planNeeded}.` : ''}` : p.enabled ? 'On' : 'Off'} checked={p.enabled || undefined} disabled={!!lock || busy !== null || undefined} onChange={(e) => void save({ enabled: e.currentTarget.checked === true }, e.currentTarget.checked === true ? 'The plan is on' : 'The plan is paused')}/>
            <UI.Select label="How often" value={String(p.frequencyDays)} disabled={busy !== null || undefined} error={fieldError(error, 'frequencyDays')} onChange={(e) => void save({ frequencyDays: Number(e.currentTarget.value) }, 'Saved')}>
              {(p.frequencies.includes(p.frequencyDays) ? p.frequencies : [p.frequencyDays, ...p.frequencies]).map((d) => (<UI.Option key={d} value={String(d)}>
                  {frequencyLabel(d)}
                </UI.Option>))}
            </UI.Select>
            <UI.Select label="Length" value={p.length} disabled={busy !== null || undefined} error={fieldError(error, 'length')} onChange={(e) => void save({ length: e.currentTarget.value }, 'Saved')}>
              {PLAN_LENGTHS.map((l) => (<UI.Option key={l} value={l}>
                  {blog ? lengthLabel(blog, l, LENGTH_NAMES[l]) : LENGTH_NAMES[l]}
                </UI.Option>))}
            </UI.Select>
            <UI.NumberField label="At most, articles a month" value={String(p.monthlyCap)} min={1} max={PLAN_CAP_MAX} step={1} disabled={busy !== null || undefined} error={fieldError(error, 'monthlyCap')} onChange={(e) => {
                const n = Number(e.currentTarget.value);
                if (Number.isInteger(n) && n !== p.monthlyCap)
                    void save({ monthlyCap: n }, 'Saved');
            }}/>
            <UI.UnorderedList>
              <UI.ListItem>Each article waits for your review on the Blog page. Nothing is published without your click.</UI.ListItem>
              <UI.ListItem>{price !== null ? `Each article costs ${creditsLabel(price)}, charged only when it is written.` : 'Each article is charged only when it is written.'}</UI.ListItem>
              {ceiling !== null ? <UI.ListItem>{`At most ${fmtNumber(ceiling)} credits a month.`}</UI.ListItem> : null}
            </UI.UnorderedList>
            {p.enabled ? (<UI.Stack gap="small-100">
                <UI.Text>{`${p.writtenThisMonth} of ${p.monthlyCap} written this month.`}</UI.Text>
                {p.nextFrom ? <UI.Text color="subdued">{`The next article starts on or after ${formatDate(p.nextFrom)}.`}</UI.Text> : null}
                {p.waiting ? <UI.Text color="subdued">{p.waiting}</UI.Text> : null}
              </UI.Stack>) : null}
            {!p.reviewFirst ? <UI.Text color="subdued">This store was set to publish each article as soon as it is written. Saving here sets it back to waiting for your review.</UI.Text> : null}
            <UI.Text color="subdued">
              Prefer to shape each one yourself? <UI.Link href={blogNewHref()}>Write an article</UI.Link> and choose Guided.
            </UI.Text>
          </UI.Stack>
        </UI.Section>}/>);
}
