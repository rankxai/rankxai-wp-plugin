import { aiVisibilityHref, aiVisibilityTabs, type AiVisibilityTab } from '@/lib/shopify-app/app-routes-core';
import { useRouter } from '../router';
import { ViewTabs } from '../kit';
import { AiOrdersTab } from '../shopify-views/AiOrdersTab';
import { WooAiOrdersTab } from '../components/WooAiOrders';
import { useStore } from '../plan-context';
import { CompetitorsTab } from './CompetitorsTab';
import { ShopperQuestionsTab } from './ShopperQuestions';
import { StoreKnowledgeTab } from './StoreKnowledgeTab';
import * as UI from '../ui';
export function AiVisibilityPage({ tab }: {
    tab: AiVisibilityTab;
}) {
    const { navigate } = useRouter();
    const { platform, capabilities } = useStore();
    const storeRevenue = capabilities ? capabilities.aiOrders === 'store_revenue' : platform === 'woocommerce';
    return (<UI.Page heading="AI search" inlineSize="large">
      <ViewTabs>
        {aiVisibilityTabs(storeRevenue).map((t) => (<UI.PressButton key={t.id} pressed={t.id === tab} onClick={() => navigate(aiVisibilityHref(t.id))}>
            {t.label}
          </UI.PressButton>))}
      </ViewTabs>
      {tab === 'orders' ? (storeRevenue ? <WooAiOrdersTab /> : <AiOrdersTab />) : tab === 'competitors' ? <CompetitorsTab /> : tab === 'store' ? <StoreKnowledgeTab /> : <ShopperQuestionsTab />}
    </UI.Page>);
}
