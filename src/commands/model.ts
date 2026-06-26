import chalk from 'chalk';
import type { Interface } from 'readline';
import { loadConfig, resolveApiKey, saveDefaultModel } from '../config/index.js';
import { getFavorites, setFavorite, getNoNativeToolsKeys, getModel } from '../providers/model-store.js';
import { ensureStoreReady } from '../providers/db.js';
import { PROVIDER_REGISTRY, initDynamicProviders } from '../providers/registry.js';
import { markModelSelected } from '../providers/model-cache.js';
import { clearModelNewFlag } from '../providers/registry.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import { countWrappedLines } from '../cli/raw-picker.js';
import { loadEvalDotsData, type EvalDotsData } from '../eval/history.js';
import { buildEvalDots } from '../cli/eval-dots.js';
import { InlineActionMenu } from '../cli/action-menu.js';
import { runListMenu, type MenuTab, type ListMenuContext } from '../cli/list-menu.js';
import { runMenuShell } from '../cli/menu-shell.js';
import { redrawBanner } from '../cli/banner.js';
import {
  type ModelMenuItem,
  type GroupMode,
  modelPreference,
  sortItemsByFavorites,
  buildDisplayList,
  filterModelItems,
  buildScreen,
  buildModelDetailScreen,
} from '../cli/model-screen.js';

// Re-exported so existing importers (and tests) keep a stable surface.
export { type ModelMenuItem, filterModelItems, buildAllItemLines } from '../cli/model-screen.js';

export async function getSelectableModels(): Promise<ModelMenuItem[]> {
  await ensureStoreReady();
  await initDynamicProviders();
  const items: ModelMenuItem[] = [];

  for (const provider of PROVIDER_REGISTRY) {
    if (!resolveApiKey(provider)) continue;
    for (const model of provider.models) {
      items.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        displayName: model.displayName,
        modelsSource: provider.modelsSource,
        isNew: model.isNew,
      });
    }
  }

  const noNativeTools = getNoNativeToolsKeys();
  for (const item of items) {
    if (noNativeTools.has(`${item.providerId}:${item.modelId}`)) item.noNativeTools = true;
    const stored = getModel(`${item.providerId}:${item.modelId}`);
    if (stored?.rateLimits) item.rateLimits = stored.rateLimits;
  }

  const pricedItems = items.filter(i => i.providerId === 'anthropic' || i.providerId === 'openai');
  const pricingResults = await Promise.all(pricedItems.map(item =>
    item.providerId === 'anthropic'
      ? getAnthropicVerifiedRates(item.modelId)
      : getOpenAIVerifiedRates(item.modelId)
  ));

  for (let i = 0; i < pricedItems.length; i++) {
    const rates = pricingResults[i];
    if (rates.confidence === 'disagree') {
      pricedItems[i].pricing = { input: null, output: null, confidence: rates.confidence };
    } else if (rates.inputPerMillion !== null && rates.outputPerMillion !== null) {
      pricedItems[i].pricing = { input: rates.inputPerMillion, output: rates.outputPerMillion, confidence: rates.confidence };
    }
  }

  return items;
}

type ModelPickResult = { item: ModelMenuItem; saveDefault: boolean } | null;

// Returns true if the interactive picker was shown (screen left blank on close),
// false for early exits that leave text output behind. The bottom-UI teardown/
// restore lifecycle is owned by runMenuShell; `onRestore` carries the session
// footer refresh that can't move into this module.
export async function runModelCommand(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void,
  onRestore?: () => void,
): Promise<boolean> {
  return runMenuShell<boolean>(rl, {
    ensureReady: ensureStoreReady,
    onRestore,
    run: () => runModelBody(rl, currentModel, setSelectedModel),
  });
}

async function runModelBody(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void,
): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('Model picker requires an interactive terminal.'));
    return false;
  }

  console.log(chalk.dim('Loading available models...'));
  const items = await getSelectableModels();

  if (items.length === 0) {
    console.log(chalk.red('No configured providers or local models are available.'));
    return false;
  }

  if (loadConfig().showEvalDots) {
    const evalData: EvalDotsData = loadEvalDotsData();
    for (const item of items) {
      const model = `${item.providerId}:${item.modelId}`;
      item.evalDots = buildEvalDots(model, evalData);
    }
  }

  const favorites = getFavorites();
  for (const item of items) {
    item.isFavorite = favorites.has(modelPreference(item));
  }
  sortItemsByFavorites(items);

  let groupMode: GroupMode = 'pretty';
  const actionMenu = new InlineActionMenu(['Select', 'View', 'Edit']);
  // Rows list-menu prepends above the body: 1 blank for single-tab, or
  // blank+bar+blank (3) for multi-tab. Reserved so the body doesn't overflow.
  let tabBarRows = 0;

  // One tab per provider. Each tab owns its own filter query, viewport, and
  // derived displayItems (that provider's models, with favorites duplicated at
  // the top via buildDisplayList). Favorites set, `items`, the shared
  // groupMode/actionMenu live in the enclosing scope and are read/written by
  // every tab.
  function buildProviderTab(providerId: string, providerName: string): MenuTab<ModelPickResult> {
    let filterQuery = '';
    let viewStart = 0;
    const providerItems = (): ModelMenuItem[] => items.filter(i => i.providerId === providerId);
    let displayItems = filterModelItems(buildDisplayList(providerItems()), filterQuery);

    // Rebuilds this tab's displayItems after a filter/group/favorite change,
    // repositioning the (base-owned) cursor onto `preferred` so it stays put.
    function refreshDisplayItems(ctx: ListMenuContext<ModelPickResult>, preferred?: ModelMenuItem): void {
      displayItems = filterModelItems(buildDisplayList(providerItems()), filterQuery);
      viewStart = 0;

      if (displayItems.length === 0) {
        ctx.setSelected(0);
        return;
      }

      if (preferred) {
        const pref = modelPreference(preferred);
        // Prefer provider-section copy so cursor stays in stable position after favorite toggle.
        let idx = displayItems.findIndex(item => modelPreference(item) === pref && !item._favSection);
        if (idx < 0) idx = displayItems.findIndex(item => modelPreference(item) === pref);
        ctx.setSelected(idx >= 0 ? idx : Math.min(ctx.getSelected(), displayItems.length - 1));
      } else {
        ctx.setSelected(Math.min(ctx.getSelected(), displayItems.length - 1));
      }
    }

    return {
      id: providerId,
      label: providerName,
      count: () => displayItems.length,
      renderBody: (selected) => {
        const { lines, newViewStart, selectedScreenIdx } = buildScreen(displayItems, selected, currentModel, viewStart, groupMode, filterQuery, tabBarRows);
        viewStart = newViewStart;
        return { lines, selectedLineIdx: selectedScreenIdx };
      },
      controls: () => {
        // Kept to one terminal row: the controls hint is pinned to a single
        // viewport line, so anything longer is clipped at the right edge.
        const lead = groupMode === 'pretty' ? 'Tab IDs' : 'Tab clean';
        return `${lead} · ↑↓ nav · ← fav · → view · Enter menu · Space default · Esc close`;
      },
      renderDetail: (selected) => buildModelDetailScreen(displayItems[selected]),
      actionMenu: {
        menu: actionMenu,
        actionHint: `  ${chalk.dim('↑/↓ action, Enter select, Esc back')}`,
        onSelect: (option, ctx) => {
          if (option === 'Select') ctx.close({ item: displayItems[ctx.getSelected()], saveDefault: false });
          else if (option === 'View') ctx.enterDetail();
          // Edit: stub — the base exits the action menu and redraws.
        },
      },
      onKey: (key, ctx) => {
        // On an empty (over-filtered) list, swallow the keys whose handlers would
        // index a non-existent item; let typing/backspace through to edit the filter.
        if (displayItems.length === 0 && (key === '\x1b[C' || key === '\r' || key === '\n' || key === '\x1b[D')) {
          return true;
        }
        // → detail and Enter → action menu are owned by the base; defer to it.
        if (key === '\x1b[C' || key === '\r' || key === '\n') return false;

        if (key === '\x1b[D') {
          // ← toggles favorite
          const item = displayItems[ctx.getSelected()];
          const pref = modelPreference(item);
          if (favorites.has(pref)) favorites.delete(pref);
          else favorites.add(pref);
          const isFav = favorites.has(pref);
          for (const baseItem of items) {
            if (modelPreference(baseItem) === pref) baseItem.isFavorite = isFav;
          }
          setFavorite(pref, isFav);
          sortItemsByFavorites(items);
          refreshDisplayItems(ctx, item);
          ctx.redraw();
          return true;
        }
        if (key === ' ') {
          if (filterQuery) {
            filterQuery += ' ';
            refreshDisplayItems(ctx, displayItems[ctx.getSelected()]);
            ctx.redraw();
          } else if (displayItems.length > 0) {
            ctx.close({ item: displayItems[ctx.getSelected()], saveDefault: true });
          }
          return true;
        }
        if (key === '\t') {
          const currentItem = displayItems[ctx.getSelected()];
          const cycle: GroupMode[] = ['pretty', 'provider'];
          groupMode = cycle[(cycle.indexOf(groupMode) + 1) % cycle.length];
          refreshDisplayItems(ctx, currentItem);
          ctx.redraw();
          return true;
        }
        if (key === '\x7f' || key === '\b') {
          if (filterQuery.length > 0) {
            filterQuery = filterQuery.slice(0, -1);
            refreshDisplayItems(ctx, displayItems[ctx.getSelected()]);
            ctx.redraw();
          }
          return true;
        }
        // Ignore stray escape sequences (e.g. Up at the tab row, which the base
        // forwards here) so their leftover bytes ("[A", "[B", …) never leak into
        // the filter query.
        if (key.startsWith('\x1b')) return false;
        const typed = [...key].filter(c => c >= ' ' && c !== '\x7f').join('');
        if (typed) {
          filterQuery += typed;
          refreshDisplayItems(ctx, displayItems[ctx.getSelected()]);
          ctx.redraw();
          return true;
        }
        return false;
      },
    };
  }

  // Provider order and names as first seen in `items`.
  const providerOrder: string[] = [];
  const providerNames = new Map<string, string>();
  for (const item of items) {
    if (!providerNames.has(item.providerId)) {
      providerOrder.push(item.providerId);
      providerNames.set(item.providerId, item.providerName);
    }
  }
  tabBarRows = providerOrder.length > 1 ? 3 : 1;
  const tabs = providerOrder.map(pid => buildProviderTab(pid, providerNames.get(pid)!));

  // Open on the current model's provider tab, positioned on that model.
  const currentItem = items.find(i => modelPreference(i) === currentModel);
  const initialTabId = currentItem ? currentItem.providerId : providerOrder[0];
  let initialSelected = 0;
  if (currentItem) {
    const di = filterModelItems(buildDisplayList(items.filter(i => i.providerId === initialTabId)), '');
    let idx = di.findIndex(i => modelPreference(i) === currentModel && !i._favSection);
    if (idx < 0) idx = di.findIndex(i => modelPreference(i) === currentModel);
    initialSelected = idx >= 0 ? idx : 0;
  }

  const result = await runListMenu<ModelPickResult>(rl, {
    tabs,
    initialTabId,
    initialSelected,
    countLines: countWrappedLines,
  });

  if (result) {
    const choice = modelPreference(result.item);
    setSelectedModel(choice);
    markModelSelected(result.item.providerId, result.item.modelId);
    clearModelNewFlag(result.item.providerId, result.item.modelId);
    if (result.saveDefault) saveDefaultModel(choice);
    console.log(chalk.blue(`Model set to: ${choice}`));
    if (result.saveDefault) console.log(chalk.green(`Default model set to: ${choice}`));
  }
  redrawBanner();
  return true;
}
