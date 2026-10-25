import { api } from '../api';
import { host } from '../host';
import { APP_PATHS } from '@/lib/shopify-app/app-routes-core';
import { usePlan, useStore } from '../plan-context';
import { fmtNumber, fmtCount } from '../format';
import { BackLink, PagePrimaryAction, formatDate } from '../kit';
import { SkeletonSection } from '../components/Status';
import { PageColumns } from '../components/PageColumns';
import * as UI from '../ui';
function money(cents: number | null): string {
    if (cents === null)
        return '';
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/month`;
}
export function PlanPage() {
    const { plan } = usePlan();
    const { platform, words } = useStore();
    if (!plan) {
        return (<UI.Page heading="Plan" inlineSize="large">
        <BackLink href={APP_PATHS.settings} label="Settings"/>
        <SkeletonSection lines={3} label="Loading your plan"/>
      </UI.Page>);
    }
    const action = plan.card.action;
    const open = async (url: string) => {
        if (platform === 'shopify')
            await Promise.race([api('funnel/plan-page', { method: 'POST' }), new Promise((r) => setTimeout(r, 600))]);
        host.openPlanPage(url);
    };
    const change = action ?? (plan.account?.planPageUrl ? { label: 'Change plan', url: plan.account.planPageUrl } : null);
    const current = plan.plans.find((p) => p.name === plan.account?.planName) ?? null;
    return (<UI.Page heading="Plan" inlineSize="large">
      <BackLink href={APP_PATHS.settings} label="Settings"/>
      {change ? (<PagePrimaryAction onClick={() => void open(change.url)}>{change.label}</PagePrimaryAction>) : null}
      
      <PageColumns main={<>
            <UI.Section heading="Credits">
              {plan.credits ? (<UI.Stack gap="small-200">
                  
                  {plan.credits.available === null ? (<UI.Text type="strong">Credits could not be read just now</UI.Text>) : (<UI.Stack direction="inline" gap="small-200" alignItems="baseline">
                      <UI.Heading fontSize="large-300" accessibilityRole="presentation">
                        {fmtNumber(plan.credits.available)}
                      </UI.Heading>
                      <UI.Text color="subdued">{plan.credits.paused ? (plan.credits.available === 1 ? 'credit, paused' : 'credits, paused') : plan.credits.available === 1 ? 'credit available' : 'credits available'}</UI.Text>
                      {plan.credits.low && !plan.credits.paused && plan.card.kind !== 'choose' && plan.card.kind !== 'free' ? <UI.Badge tone="caution">Running low</UI.Badge> : null}
                    </UI.Stack>)}
                  
                  {plan.credits.paused && plan.credits.available !== null ? (<UI.Text color="subdued">
                      {plan.account?.status === 'paused'
                        ? words.billingIssue
                        : 'Credits are spent only while you are on a paid plan.'}
                    </UI.Text>) : null}
                  
                  {plan.credits.monthly ? (<UI.Text>
                      {plan.account?.status === 'trial' ? 'After your free trial, your plan adds ' : 'Your plan adds '}
                      {fmtNumber(plan.credits.monthly)} credits each month
                      {plan.credits.nextCreditDate ? `, next on ${formatDate(plan.credits.nextCreditDate)}` : ''}.
                    </UI.Text>) : null}
                  {plan.credits.asWork.length > 0 ? (<UI.UnorderedList>
                      {plan.credits.asWork.map((w) => (<UI.ListItem key={w}>{w}</UI.ListItem>))}
                    </UI.UnorderedList>) : null}
                  
                  {plan.credits.low && !plan.credits.paused && plan.card.kind !== 'choose' && plan.card.kind !== 'free' ? (<UI.Text>{`Running low until ${plan.credits.nextCreditDate ? formatDate(plan.credits.nextCreditDate) : 'your next monthly credits'}. A bigger plan adds more each month.`}</UI.Text>) : null}
                  {plan.firstCheck && firstCheckRecent(plan.firstCheck.grantedAt) ? (<UI.Text color="subdued">
                      {plan.firstCheck.credits
                        ? `Your first check (${fmtCount(plan.firstCheck.credits, 'credit', 'credits')}) was covered by RankX AI on ${formatDate(plan.firstCheck.grantedAt)}.`
                        : plan.firstCheck.line}
                    </UI.Text>) : null}
                </UI.Stack>) : (<UI.Paragraph>Credits could not be read just now.</UI.Paragraph>)}
            </UI.Section>

            <UI.Section heading="Plans">
              <UI.Table variant="auto">
                <UI.TableHeaderRow>
                  <UI.TableHeader listSlot="primary">Plan</UI.TableHeader>
                  <UI.TableHeader listSlot="secondary">Price</UI.TableHeader>
                  <UI.TableHeader listSlot="labeled">Products monitored</UI.TableHeader>
                  <UI.TableHeader listSlot="labeled">Questions per kind</UI.TableHeader>
                </UI.TableHeaderRow>
                <UI.TableBody>
                  
                  {platform === 'shopify' ? (<UI.TableRow>
                      <UI.TableCell>Free</UI.TableCell>
                      <UI.TableCell>$0</UI.TableCell>
                      <UI.TableCell>None</UI.TableCell>
                      <UI.TableCell>None</UI.TableCell>
                    </UI.TableRow>) : null}
                  {plan.plans
                .slice()
                .sort((a, b) => (a.priceMonthlyCents ?? 0) - (b.priceMonthlyCents ?? 0))
                .map((p) => (<UI.TableRow key={p.planCode}>
                        <UI.TableCell>{plan.account?.planName === p.name ? <UI.Stack direction="inline" gap="small-200" alignItems="center"><UI.Text>{p.name}</UI.Text><UI.Badge tone="success">Your plan</UI.Badge></UI.Stack> : p.name}</UI.TableCell>
                        <UI.TableCell>{money(p.priceMonthlyCents)}</UI.TableCell>
                        <UI.TableCell>{p.maxProducts !== null ? fmtNumber(p.maxProducts) : 'Unlimited'}</UI.TableCell>
                        <UI.TableCell>{p.maxQuestions !== null ? fmtNumber(p.maxQuestions) : 'Unlimited'}</UI.TableCell>
                      </UI.TableRow>))}
                </UI.TableBody>
              </UI.Table>
              <UI.Text color="subdued">Free checks your products for what AI shopping needs and fixes them one at a time. Paid plans also monitor products and track AI Shopping and AI answer questions (the limit applies to each kind), and include every feature. {words.billing}</UI.Text>
            </UI.Section>
          </>} side={<>
            <UI.Section heading={plan.card.title}>
              <UI.Paragraph>{plan.card.body.replace('{date}', formatDate(plan.card.date))}</UI.Paragraph>
            </UI.Section>

            <UI.Section heading="What you are using">
              <UI.Stack gap="small-200">
                <UsageLine label="Products monitored" used={plan.usage.products} max={current?.maxProducts ?? null}/>
                <UsageLine label="AI Shopping questions" used={plan.usage.shoppingQuestions} max={current?.maxQuestions ?? null}/>
                <UsageLine label="AI answer questions" used={plan.usage.brandQuestions} max={current?.maxQuestions ?? null}/>
                {[plan.locks.products, plan.locks.shoppingQuestions, plan.locks.brandQuestions].filter(Boolean).map((l, i) => (<UI.Text key={i} color="subdued">
                    {l!.reason}
                  </UI.Text>))}
              </UI.Stack>
            </UI.Section>
          </>}/>
    </UI.Page>);
}
function UsageLine({ label, used, max }: {
    label: string;
    used: number;
    max: number | null;
}) {
    return (<UI.Stack gap="small-100">
      <UI.Stack direction="inline" justifyContent="space-between" gap="small-200">
        <UI.Text>{label}</UI.Text>
        <UI.Text color="subdued">{max !== null ? `${fmtNumber(used)} of ${fmtNumber(max)}` : fmtNumber(used)}</UI.Text>
      </UI.Stack>
      {max !== null && max > 0 ? <UI.Progress value={Math.min(used, max)} max={max} accessibilityLabel={`${label}: ${used} of ${max}`}/> : null}
    </UI.Stack>);
}
function firstCheckRecent(grantedAt: string): boolean {
    const t = Date.parse(grantedAt);
    return Number.isFinite(t) && Date.now() - t < 30 * 24 * 60 * 60 * 1000;
}
