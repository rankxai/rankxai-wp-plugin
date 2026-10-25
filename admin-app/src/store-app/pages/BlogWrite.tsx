import { useState } from 'react';
import { APP_PATHS, blogArticleHref, productRefOf } from '@/lib/shopify-app/app-routes-core';
import { alreadyWritten } from '@/lib/shopify-app/article-contents-core';
import { FEATURED_PRODUCTS_MAX, STORE_ARTICLE_TYPE_COPY, guessArticleType, type StoreArticleType } from '@/lib/content/store-article-types';
import { api, toastSuccess } from '../api';
import { host } from '../host';
import { usePlan, useStore } from '../plan-context';
import { useRouter } from '../router';
import { BackLink, ErrorBanner, PagePrimaryAction, act, creditsLabel, fieldError, useLoad, usePageError, useNoSpend } from '../kit';
import { SkeletonSection } from '../components/Status';
import { PageColumns } from '../components/PageColumns';
import { LENGTHS, OwnerInputFields, blogWriteLock, lengthLabel, type BlogData } from './Blog';
import * as UI from '../ui';
function focusQuestion(i: number) {
    const el = document.getElementById(`owner-question-${i}`) as (HTMLElement & {
        focus: () => void;
    }) | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
}
export function BlogWritePage({ topic: initialTopic, product }: {
    topic: string | null;
    product: {
        num: string;
        title: string | null;
    } | null;
}) {
    const noSpend = useNoSpend();
    const { words, platform } = useStore();
    const blog = useLoad<BlogData>('blog');
    const { plan, ready: planReady, reload: reloadPlan } = usePlan();
    const { navigate } = useRouter();
    const [error, setError] = usePageError();
    const [busy, setBusy] = useState(false);
    const [topic, setTopic] = useState(initialTopic ?? (product?.title ? `Is ${product.title} right for you?` : ''));
    const [length, setLength] = useState<'short' | 'standard' | 'long'>('standard');
    const [chosenType, setChosenType] = useState<StoreArticleType | null>(null);
    const [answers, setAnswers] = useState<Partial<Record<StoreArticleType, string[]>>>({});
    const [featured, setFeatured] = useState<Array<{
        id: string;
        title: string | null;
    }>>(product ? [{ id: productRefOf(platform, product.num), title: product.title }] : []);
    const [mustInclude, setMustInclude] = useState('');
    const [avoid, setAvoid] = useState('');
    const [mode, setMode] = useState<'quick' | 'guided'>('quick');
    const [makeImage, setMakeImage] = useState(false);
    const studio = useLoad<{
        price: number | null;
    }>('images/studio');
    const looks = useLoad<{
        looks: Array<{
            purpose: string;
            name: string;
            options: unknown;
        }>;
    }>('images/looks');
    const blogLook = [...(looks.data?.looks ?? [])].reverse().find((l) => l.purpose === 'blog') ?? null;
    const imagePrice = studio.data?.price ?? null;
    const imageLock = plan?.locks.access ?? null;
    const articleType = chosenType ?? guessArticleType(topic);
    const spec = STORE_ARTICLE_TYPE_COPY[articleType];
    const unanswered = (answers[articleType] ?? []).every((v) => !v?.trim());
    const d = planReady ? blog.data : null;
    const price = d?.prices[length] ?? null;
    const noBlog = !!d && (!d.blogs || d.blogs.blogs.length === 0);
    const writeLock = blogWriteLock(plan, d) ?? (noBlog ? { locked: true as const, reason: 'Create your blog on the Blog page first.', planNeeded: null } : null);
    const duplicate = d && topic.trim() ? alreadyWritten(topic, d.articles) : null;
    async function chooseProducts() {
        try {
            const picked = await host.pickProducts({ multiple: FEATURED_PRODUCTS_MAX, productsOnly: true });
            if (picked)
                setFeatured(picked.slice(0, FEATURED_PRODUCTS_MAX).map((p) => ({ id: p.id, title: p.title ?? null })));
        }
        catch {
            setError({ message: words.pickerFailed, planLink: false });
        }
    }
    async function start() {
        const ownerInput = {
            articleType,
            answers: STORE_ARTICLE_TYPE_COPY[articleType].questions.map((_, i) => (answers[articleType]?.[i] ?? '').trim()),
            featuredProductIds: featured.map((p) => p.id),
            mustInclude: mustInclude.trim() || null,
            avoid: avoid.trim() || null,
        };
        const featuredImage = makeImage && !imageLock ? { make: true, options: blogLook?.options ?? null } : undefined;
        const r = await act(() => api<{
            briefId: string;
            imageRequested?: boolean;
        }>('blog/articles', { method: 'POST', body: { topic: topic.trim(), lengthTier: length, ownerInput, mode, featuredImage } }), setBusy, setError);
        if (r.ok && r.data) {
            const started = mode === 'guided' ? 'Research started. Your plan is ready to review in a few minutes.' : 'Writing started. It takes about 10 minutes.';
            toastSuccess(featuredImage && r.data.imageRequested === false ? `${started} The featured image could not be asked for; make it on the article’s page.` : started);
            void reloadPlan();
            navigate(APP_PATHS.blog);
        }
    }
    return (<UI.Page heading="Write an article" inlineSize="large">
      <BackLink href={APP_PATHS.blog} label="Blog"/>
      <PagePrimaryAction spends disabled={!d || !topic.trim() || !!writeLock || price === null || busy} loading={busy} onClick={() => void start()}>
        {price === null ? 'Write article' : `Write article · ${creditsLabel(price)}`}
      </PagePrimaryAction>
      <ErrorBanner error={error ?? blog.error} onDismiss={error ? () => setError(null) : undefined}/>
      {!d && (blog.loading || (blog.data && !planReady)) ? <SkeletonSection lines={6}/> : null}
      {d ? (<PageColumns main={<>
              <UI.Section heading="Topic">
                <UI.Stack gap="base">
                  <UI.TextField label="Topic" labelAccessibilityVisibility="exclusive" placeholder="How to choose a ceramic mug that keeps coffee hot" value={topic} maxLength={200} error={fieldError(error, 'topic')} onInput={(e) => setTopic(e.currentTarget.value)}/>
                  {duplicate ? (<UI.Banner tone="warning">
                      {`“${duplicate.title ?? 'An article'}” is already on your blog. `}
                      <UI.Link href={blogArticleHref(duplicate.id)}>Open it</UI.Link>
                    </UI.Banner>) : null}
                  {writeLock ? <UI.Text color="subdued">{`${writeLock.reason}${writeLock.planNeeded ? ` Available on ${writeLock.planNeeded}.` : ''}`}</UI.Text> : null}
                </UI.Stack>
              </UI.Section>
              <UI.Section heading="How do you want to write it?">
                <UI.ChoiceList name="write-mode" label="How do you want to write it?" labelAccessibilityVisibility="exclusive" values={[mode]} onChange={(e) => setMode(((e.currentTarget as unknown as {
                values: string[];
            }).values[0] as 'quick' | 'guided') ?? 'quick')}>
                  <UI.Choice value="quick" selected={mode === 'quick' || undefined}>
                    Quick
                    <UI.Text slot="details" color="subdued">We choose the title and the sections and write it straight away.</UI.Text>
                  </UI.Choice>
                  <UI.Choice value="guided" selected={mode === 'guided' || undefined}>
                    Guided
                    <UI.Text slot="details" color="subdued">After the research, you choose the title and shape the sections, then it is written. Same price.</UI.Text>
                  </UI.Choice>
                </UI.ChoiceList>
              </UI.Section>
              
              <UI.Section heading="Article details">
                <OwnerInputFields type={articleType} guessed={chosenType === null} onType={setChosenType} answers={answers[articleType] ?? []} onAnswer={(i, v) => setAnswers((a) => {
                    const list = [...(a[articleType] ?? [])];
                    list[i] = v;
                    return { ...a, [articleType]: list };
                })} featured={featured} onChooseProducts={() => void chooseProducts()} onClearProducts={() => setFeatured([])} mustInclude={mustInclude} onMustInclude={setMustInclude} avoid={avoid} onAvoid={setAvoid}/>
              </UI.Section>
            </>} side={<UI.Section heading="Your article">
              <UI.Stack gap="base">
                <UI.Select label="Length" value={length} onChange={(e) => setLength(e.currentTarget.value as typeof length)}>
                  {LENGTHS.map((l) => (<UI.Option key={l.id} value={l.id}>
                      {lengthLabel(d, l.id, l.label)}
                    </UI.Option>))}
                </UI.Select>
                <UI.UnorderedList>
                  <UI.ListItem>Researched from your topic and built on your answers.</UI.ListItem>
                  {mode === 'guided' ? (<UI.ListItem>Your plan is ready to review in a few minutes; the article about 8 minutes after you approve it.</UI.ListItem>) : (<UI.ListItem>Ready for you to review in about 10 minutes, on the Blog page.</UI.ListItem>)}
                  <UI.ListItem>You can leave this page while it is written.</UI.ListItem>
                  <UI.ListItem>Nothing is published until you choose to.</UI.ListItem>
                </UI.UnorderedList>
                <UI.Text color="subdued">You are charged only for what is delivered. If writing stops before a draft is saved, nothing is charged.</UI.Text>
                {!imageLock ? (<UI.Checkbox label={imagePrice !== null ? `Make a featured image when it is ready · ${creditsLabel(imagePrice)}` : 'Make a featured image when it is ready'} details={`Made from the finished article${blogLook ? ` in your blog look, “${blogLook.name}”` : ''}. You choose whether to use it before you publish.`} checked={makeImage || undefined} onChange={(e) => setMakeImage(e.currentTarget.checked === true)}/>) : null}
                {mode === 'quick' && unanswered && !writeLock ? (<UI.Stack gap="small-200">
                    <UI.Text type="strong">Two answers make it sound like you</UI.Text>
                    <UI.Stack gap="small-200">
                      <UI.Text>Optional. We build the article on what you know, so these two make the biggest difference:</UI.Text>
                      <UI.UnorderedList>
                        {spec.keyQuestions.map((i) => (<UI.ListItem key={i}>{spec.questions[i]}</UI.ListItem>))}
                      </UI.UnorderedList>
                      <UI.Button variant="tertiary" onClick={() => focusQuestion(spec.keyQuestions[0])}>
                        Answer them
                      </UI.Button>
                    </UI.Stack>
                  </UI.Stack>) : null}
                
                <UI.Button disabled={!topic.trim() || !!writeLock || noSpend || price === null || busy || undefined} loading={busy || undefined} onClick={() => void start()}>
                  {price === null ? 'Write article' : `Write article · ${creditsLabel(price)}`}
                </UI.Button>
              </UI.Stack>
            </UI.Section>}/>) : null}
    </UI.Page>);
}
