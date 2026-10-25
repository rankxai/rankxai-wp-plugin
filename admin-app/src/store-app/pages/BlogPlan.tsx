import { useStore } from '../plan-context';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../router';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { HEADING_MAX, SECTION_NOTE_MAX, SECTIONS_MAX, TITLE_MAX } from '@/lib/shopify-app/guided-article-core';
import { api, toastSuccess } from '../api';
import { host } from '../host';
import { BackLink, ErrorBanner, PagePrimaryAction, act, fieldError, useLoad, usePageError } from '../kit';
import { SkeletonSection } from '../components/Status';
import { PageColumns } from '../components/PageColumns';
import * as UI from '../ui';
interface PlanView {
    briefId: string;
    topic: string;
    state: 'awaiting' | 'approved';
    researchDone: boolean;
    sections: Array<{
        id: string;
        heading: string;
        keyPoints: string[];
    }>;
    keyQuestions: string[];
    angle: string | null;
    articleType: string | null;
    featured: Array<{
        id: string;
        title: string | null;
    }>;
    titles: string[] | null;
    titleRefreshesLeft: number;
    chosenTitle: string | null;
}
interface Sec {
    key: string;
    id: string | null;
    heading: string;
    keyPoints: string[];
    note: string;
    products: Array<{
        id: string;
        title: string | null;
    }>;
}
const OWN = '__own__';
const WRITER = '__writer__';
let seq = 0;
const newKey = () => `s${++seq}`;
const shownPoint = (k: string) => k.replace(/\s*\[[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/gi, '').trim();
export function BlogPlanPage({ briefId }: {
    briefId: string;
}) {
    const load = useLoad<{
        plan: PlanView;
    }>(`blog/plans/${briefId}`);
    const [error, setError] = usePageError();
    const lp = load.data?.plan ?? null;
    return (<UI.Page heading="Your article plan" inlineSize="large">
      <BackLink href={APP_PATHS.blog} label="Blog"/>
      <ErrorBanner error={error ?? load.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!lp && load.loading ? <SkeletonSection lines={8} label="Reading the plan"/> : null}
      {lp && lp.state === 'approved' ? (<UI.Section>
          <UI.Stack gap="small-200">
            <UI.Paragraph>This plan is approved and the article is being written from it.</UI.Paragraph>
            <UI.Stack direction="inline">
              <UI.Button href={APP_PATHS.blog}>Follow it on the Blog page</UI.Button>
            </UI.Stack>
          </UI.Stack>
        </UI.Section>) : lp && !lp.researchDone ? (<UI.Section>
          <UI.Paragraph>The research for this article is still running. The plan is ready in a few minutes; the Blog page shows when.</UI.Paragraph>
        </UI.Section>) : lp ? (<PlanEditor key={lp.briefId} initial={lp} error={error} setError={setError}/>) : null}
    </UI.Page>);
}
function PlanEditor({ initial, error, setError }: {
    initial: PlanView;
    error: ReturnType<typeof usePageError>[0];
    setError: ReturnType<typeof usePageError>[1];
}) {
    const { words } = useStore();
    const briefId = initial.briefId;
    const { navigate } = useRouter();
    const [plan, setPlan] = useState<PlanView>(initial);
    const [busy, setBusy] = useState<string | null>(null);
    const [choice, setChoice] = useState<string>(initial.titles?.[0] ?? '');
    const [ownTitle, setOwnTitle] = useState('');
    const [sections, setSections] = useState<Sec[]>(() => initial.sections.map((s) => ({ key: newKey(), id: s.id, heading: s.heading, keyPoints: s.keyPoints, note: '', products: [] })));
    const asked = useRef(false);
    const p = plan;
    async function suggest(refresh: boolean) {
        const r = await act(() => api<{
            plan: PlanView;
        }>(`blog/plans/${briefId}/titles`, { method: 'POST', body: { refresh } }), (b) => setBusy(b ? 'titles' : null), setError);
        if (r.ok && r.data) {
            setPlan(r.data.plan);
            if (r.data.plan.titles?.[0] && (choice === '' || refresh))
                setChoice(r.data.plan.titles[0]);
        }
    }
    useEffect(() => {
        if (asked.current || initial.titles)
            return;
        asked.current = true;
        void suggest(false);
    }, []);
    const update = (key: string, patch: Partial<Sec>) => setSections((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    const move = (key: string, by: -1 | 1) => setSections((all) => {
        const list = [...all];
        const i = list.findIndex((s) => s.key === key);
        const j = i + by;
        if (i < 0 || j < 0 || j >= list.length)
            return list;
        [list[i], list[j]] = [list[j]!, list[i]!];
        return list;
    });
    const remove = (key: string) => setSections((all) => all.filter((s) => s.key !== key));
    const add = () => setSections((all) => [...all, { key: newKey(), id: null, heading: '', keyPoints: [], note: '', products: [] }]);
    async function pinProducts(key: string) {
        try {
            const picked = await host.pickProducts({ multiple: 3, productsOnly: true });
            if (picked)
                update(key, { products: picked.slice(0, 3).map((x) => ({ id: x.id, title: x.title ?? null })) });
        }
        catch {
            setError({ message: words.pickerFailed, planLink: false });
        }
    }
    const title = choice === OWN ? ownTitle.trim() || null : choice === WRITER || choice === '' ? null : choice;
    const filled = sections.filter((s) => s.heading.trim());
    async function approve() {
        const body = {
            title,
            sections: filled.map((s) => ({ id: s.id, heading: s.heading.trim(), keyPoints: s.keyPoints, note: s.note.trim() || null, productIds: s.products.map((x) => x.id) })),
        };
        const r = await act(() => api<{
            outcome: string;
        }>(`blog/plans/${briefId}/approve`, { method: 'POST', body }), (b) => setBusy(b ? 'approve' : null), setError);
        if (r.ok) {
            toastSuccess(r.data?.outcome === 'queued' ? 'Plan approved. It is written after the article before it.' : 'Plan approved. Writing the article.');
            navigate(APP_PATHS.blog);
        }
    }
    const canWrite = filled.length > 0 && !(choice === OWN && !ownTitle.trim());
    return (<>
      <PagePrimaryAction spends disabled={!canWrite || busy !== null} loading={busy === 'approve'} onClick={() => void approve()}>
        Write the article
      </PagePrimaryAction>
      <PageColumns main={<>
            <UI.Section heading="Title">
              <UI.Stack gap="base">
                {busy === 'titles' && !p.titles ? <UI.Text color="subdued">Suggesting titles…</UI.Text> : null}
                <UI.ChoiceList name="plan-title" label="Title" labelAccessibilityVisibility="exclusive" values={[choice || WRITER]} onChange={(e) => setChoice((e.currentTarget as unknown as {
            values: string[];
        }).values[0] ?? WRITER)}>
                  {(p.titles ?? []).map((t, i) => (<UI.Choice key={t} value={t} selected={choice === t || undefined}>
                      {t}
                      {i === 0 ? <UI.Text slot="details" color="subdued">Recommended</UI.Text> : null}
                    </UI.Choice>))}
                  <UI.Choice value={OWN} selected={choice === OWN || undefined}>
                    Write my own
                  </UI.Choice>
                  <UI.Choice value={WRITER} selected={choice === WRITER || choice === '' || undefined}>
                    Let the writer choose
                  </UI.Choice>
                </UI.ChoiceList>
                {choice === OWN ? <UI.TextField label="Your title" value={ownTitle} maxLength={TITLE_MAX} onInput={(e) => setOwnTitle(e.currentTarget.value)}/> : null}
                {p.titles ? (<UI.Stack direction="inline" gap="small-200" alignItems="center">
                    <UI.Button variant="tertiary" disabled={p.titleRefreshesLeft <= 0 || busy !== null || undefined} loading={busy === 'titles' || undefined} onClick={() => void suggest(true)}>
                      Suggest other titles
                    </UI.Button>
                    <UI.Text color="subdued">{p.titleRefreshesLeft > 0 ? `${p.titleRefreshesLeft} more ${p.titleRefreshesLeft === 1 ? 'time' : 'times'}` : 'No more new suggestions for this article'}</UI.Text>
                  </UI.Stack>) : busy !== 'titles' ? (<UI.Button variant="tertiary" disabled={busy !== null || undefined} onClick={() => void suggest(false)}>
                    Suggest titles
                  </UI.Button>) : null}
              </UI.Stack>
            </UI.Section>

            <UI.Section heading={`Sections (${filled.length})`}>
              <UI.Stack gap="base">
                <UI.Text color="subdued">The research planned these. Rename, reorder or remove them, add your own, and say what you know about any of them: it is written in where you put it.</UI.Text>
                {fieldError(error, 'sections') ? <UI.Banner tone="critical">{fieldError(error, 'sections')}</UI.Banner> : null}
                {sections.map((s, i) => (<UI.Box key={s.key} padding="base" border="base" borderRadius="base">
                    <UI.Stack gap="small-200">
                      <UI.Grid gridTemplateColumns="auto minmax(0, 1fr) auto" gap="small-200" alignItems="end">
                        <UI.Badge>{String(i + 1)}</UI.Badge>
                        <UI.TextField label="Section heading" labelAccessibilityVisibility="exclusive" value={s.heading} maxLength={HEADING_MAX} placeholder="Section heading" onInput={(e) => update(s.key, { heading: e.currentTarget.value })}/>
                        <UI.Stack direction="inline" gap="small-100">
                          <UI.Button variant="tertiary" icon="arrow-up" disabled={i === 0 || undefined} accessibilityLabel={`Move section ${i + 1} up`} onClick={() => move(s.key, -1)}/>
                          <UI.Button variant="tertiary" icon="arrow-down" disabled={i === sections.length - 1 || undefined} accessibilityLabel={`Move section ${i + 1} down`} onClick={() => move(s.key, 1)}/>
                          <UI.Button variant="tertiary" icon="delete" disabled={sections.length <= 1 || undefined} accessibilityLabel={`Remove section ${i + 1}`} onClick={() => remove(s.key)}/>
                        </UI.Stack>
                      </UI.Grid>
                      {s.keyPoints.length > 0 ? (<UI.UnorderedList>
                          {s.keyPoints.slice(0, 4).map((k) => (<UI.ListItem key={k}>
                              <UI.Text color="subdued">{shownPoint(k)}</UI.Text>
                            </UI.ListItem>))}
                        </UI.UnorderedList>) : null}
                      <UI.TextArea label="What you know about this (optional)" value={s.note} rows={2} maxLength={SECTION_NOTE_MAX} placeholder="What you recommend, what you have seen, the mistakes people make" onInput={(e) => update(s.key, { note: e.currentTarget.value })}/>
                      <UI.Stack direction="inline" gap="small-200" alignItems="center">
                        <UI.Button variant="tertiary" icon="product" onClick={() => void pinProducts(s.key)}>
                          {s.products.length ? 'Change products' : 'Feature a product here'}
                        </UI.Button>
                        {s.products.map((x) => (<UI.Badge key={x.id}>{x.title ?? 'A product'}</UI.Badge>))}
                      </UI.Stack>
                    </UI.Stack>
                  </UI.Box>))}
                {sections.length < SECTIONS_MAX ? (<UI.Stack direction="inline">
                    <UI.Button icon="plus" onClick={add}>
                      Add a section
                    </UI.Button>
                  </UI.Stack>) : null}
              </UI.Stack>
            </UI.Section>
          </>} side={<>
            <UI.Section heading="Your article">
              <UI.Stack gap="small-200">
                <UI.Text type="strong">{p.topic}</UI.Text>
                {p.articleType ? <UI.Text color="subdued">{p.articleType}</UI.Text> : null}
                {p.featured.length > 0 ? <UI.Text color="subdued">{`Featuring ${p.featured.map((f) => f.title ?? 'a product').join(', ')}`}</UI.Text> : null}
                <UI.UnorderedList>
                  <UI.ListItem>It is written from this plan, your answers and the research, in about 8 minutes.</UI.ListItem>
                  <UI.ListItem>Reviewing the plan costs nothing extra: the article’s credits pay for it.</UI.ListItem>
                  <UI.ListItem>Nothing is published until you choose to.</UI.ListItem>
                </UI.UnorderedList>
                <UI.Button variant="primary" disabled={!canWrite || busy !== null || undefined} loading={busy === 'approve' || undefined} onClick={() => void approve()}>
                  Write the article
                </UI.Button>
              </UI.Stack>
            </UI.Section>
            {p.keyQuestions.length > 0 ? (<UI.Section heading="What shoppers ask">
                <UI.Stack gap="small-200">
                  <UI.Text color="subdued">The research found these questions. The article answers them.</UI.Text>
                  <UI.UnorderedList>
                    {p.keyQuestions.map((q) => (<UI.ListItem key={q}>{q}</UI.ListItem>))}
                  </UI.UnorderedList>
                </UI.Stack>
              </UI.Section>) : null}
            {p.angle ? (<UI.Section heading="Its angle">
                <UI.Paragraph>{p.angle}</UI.Paragraph>
              </UI.Section>) : null}
          </>}/>
    </>);
}
