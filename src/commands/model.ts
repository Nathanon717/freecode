import chalk from 'chalk';
import type { Interface } from 'readline';
import { loadConfig, resolveApiKey, saveDefaultModel } from '../config/index.js';
import { getFavorites, setFavorite, getNoNativeToolsKeys, getModel, getRemovedKeys, setRemoved } from '../providers/model-data.js';
import { ensureStoreReady } from '../store/db.js';
import { PROVIDER_REGISTRY, initDynamicProviders, blocklistModelPermanently } from '../providers/provider-registry.js';
import { purgeBlocklistedStoredModels } from '../providers/blocklist-purge.js';
import { markModelSelected } from '../store/model-list-cache.js';
import { clearModelNewFlag } from '../providers/provider-registry.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import { countWrappedLines } from '../cli/menus/raw-picker.js';
import { loadEvalDotsData, type EvalDotsData } from '../eval/history.js';
import { buildEvalDots } from '../cli/eval/eval-dots.js';
import { InlineActionMenu } from '../cli/menus/action-menu.js';
import { runListMenu, type MenuTab, type ListMenuContext } from '../cli/menus/list-menu.js';
import { runMenuShell } from '../cli/menus/menu-shell.js';
import { redrawBanner } from '../cli/render/banner.js';
import {
  type ModelMenuItem,
  modelPreference,
  sortItemsAlphabetically,
  filterModelItems,
  buildScreen,
  buildModelDetailScreen,
} from '../cli/menus/model-screen.js';
import { isBackspaceKey } from '../util/keyboard.js';
import { hasExactTokenizer } from '../tokenizers/count.js';

// Re-exported so existing importers (and tests) keep a stable surface.
export { type ModelMenuItem, filterModelItems, buildAllItemLines } from '../cli/menus/model-screen.js';

// `includeRemoved` keeps user-removed models in the returned list (flagged
// `removed`) so the picker can show them on its removed tab. Every other caller
// wants the visible-only default.
export async function getSelectableModels(includeRemoved = false): Promise<ModelMenuItem[]> {
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
        exactTokenizer: hasExactTokenizer(model.id),
      });
    }
  }

  const noNativeTools = getNoNativeToolsKeys();
  for (const item of items) {
    if (noNativeTools.has(`${item.providerId}:${item.modelId}`)) item.noNativeTools = true;
    const stored = getModel(`${item.providerId}:${item.modelId}`);
    if (stored?.rateLimits) item.rateLimits = stored.rateLimits;
    if (stored?.contextWindow !== undefined) item.contextWindow = stored.contextWindow;
    if (stored?.nativeTools !== undefined) item.nativeTools = stored.nativeTools;
    if (stored?.settings) item.settings = stored.settings;
  }

  const removedKeys = getRemovedKeys();
  for (const item of items) {
    if (removedKeys.has(`${item.providerId}:${item.modelId}`)) item.removed = true;
  }
  const visibleItems = items.filter(item => !item.removed);

  const pricedItems = visibleItems.filter(i => i.providerId === 'anthropic' || i.providerId === 'openai');
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

  return includeRemoved ? items : visibleItems;
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
  const allItems = await getSelectableModels(true);
  // Two live arrays: Remove/Restore move an item between them and the tabs,
  // which read through getters, pick the change up on the next render.
  const items = allItems.filter(i => !i.removed);
  const removedItems = allItems.filter(i => i.removed);

  if (allItems.length === 0) {
    console.log(chalk.red('No configured providers or local models are available.'));
    return false;
  }

  if (loadConfig().showEvalDots) {
    const evalData: EvalDotsData = loadEvalDotsData();
    for (const item of allItems) {
      const model = `${item.providerId}:${item.modelId}`;
      item.evalDots = buildEvalDots(model, evalData);
    }
  }

  const favorites = getFavorites();
  for (const item of allItems) {
    item.isFavorite = favorites.has(modelPreference(item));
  }
  sortItemsAlphabetically(items);
  sortItemsAlphabetically(removedItems);

  const actionMenu = new InlineActionMenu(['Select', 'View', 'Edit', 'Remove']);
  // Separate instance: the menu carries its own selection state, and the
  // removed tab swaps Remove for Restore and adds Remove Fully.
  const removedActionMenu = new InlineActionMenu(['Select', 'View', 'Edit', 'Restore', 'Remove Fully']);
  // Remove Fully is irreversible, so it swaps in this menu rather than acting on the
  // first Enter. Cancel is first so the destructive option is never the default.
  const confirmMenu = new InlineActionMenu(['Cancel', 'Delete permanently']);
  // Rows list-menu prepends above the body: 1 blank for single-tab, or
  // blank+bar+blank (3) for multi-tab. Reserved so the body doesn't overflow.
  let tabBarRows = 0;

  // Unified tab builder. Provider tabs pass showProviderHeaders=false (tab IS the provider).
  // The favourites and removed tabs pass showProviderHeaders=true to group models by provider name.
  // `isRemovedTab` swaps Remove for Restore and drops the fav/default keys, which
  // are meaningless (and would mutate the wrong array) for a removed model.
  function buildModelTab(
    tabId: string,
    label: string,
    getBaseItems: () => ModelMenuItem[],
    showProviderHeaders: boolean,
    getGlobalItems?: () => ModelMenuItem[],
    isRemovedTab = false,
  ): MenuTab<ModelPickResult> {
    let filterQuery = '';
    let viewStart = 0;
    let displayItems = filterModelItems(getBaseItems(), filterQuery);
    // Removed tab only: true while the Remove Fully confirmation is showing, which
    // swaps both the action menu and its hint line. Cleared on every fresh Enter so
    // an Esc out of the confirmation can't leave the next open stuck in it.
    let confirming = false;
    let pendingFullRemoval: ModelMenuItem | null = null;

    function refreshDisplayItems(ctx: ListMenuContext<ModelPickResult>, preferred?: ModelMenuItem): void {
      const sourceItems = (filterQuery && getGlobalItems) ? getGlobalItems() : getBaseItems();
      displayItems = filterModelItems(sourceItems, filterQuery);
      viewStart = 0;

      if (displayItems.length === 0) {
        ctx.setSelected(0);
        return;
      }

      if (preferred) {
        const pref = modelPreference(preferred);
        const idx = displayItems.findIndex(item => modelPreference(item) === pref);
        ctx.setSelected(idx >= 0 ? idx : Math.min(ctx.getSelected(), displayItems.length - 1));
      } else {
        ctx.setSelected(Math.min(ctx.getSelected(), displayItems.length - 1));
      }
    }

    return {
      id: tabId,
      label,
      isFiltered: () => !!filterQuery,
      count: () => displayItems.length,
      renderBody: (selected) => {
        const effectiveHeaders = (filterQuery && getGlobalItems) ? true : showProviderHeaders;
        const emptyMessage = isRemovedTab && !filterQuery ? 'No removed models' : undefined;
        const { lines, newViewStart, selectedScreenIdx } = buildScreen(displayItems, selected, currentModel, viewStart, filterQuery, tabBarRows, effectiveHeaders, emptyMessage);
        viewStart = newViewStart;
        return { lines, selectedLineIdx: selectedScreenIdx };
      },
      controls: isRemovedTab
        ? '↑↓ nav · → view · Enter menu · Esc close'
        : '↑↓ nav · ← fav · → view · Enter menu · Space default · Esc close',
      renderDetail: (selected) => buildModelDetailScreen(displayItems[selected]),
      actionMenu: {
        // Getters, not fixed values: list-menu reads both on every render and key,
        // so the confirmation can swap itself in without the base knowing about it.
        get menu(): InlineActionMenu {
          if (confirming) return confirmMenu;
          return isRemovedTab ? removedActionMenu : actionMenu;
        },
        get actionHint(): string {
          if (confirming && pendingFullRemoval) {
            return `  ${chalk.yellow(`Permanently blocklist ${modelPreference(pendingFullRemoval)} and delete its eval history, call log, and saved settings?`)}`;
          }
          return `  ${chalk.dim('↑/↓ action, Enter select, Esc back')}`;
        },
        onSelect: (option, ctx) => {
          if (confirming) {
            const item = pendingFullRemoval;
            confirming = false;
            pendingFullRemoval = null;
            if (option === 'Delete permanently' && item) {
              const pref = modelPreference(item);
              blocklistModelPermanently(item.providerId, item.modelId);
              void purgeBlocklistedStoredModels([
                { key: pref, provider: item.providerId, modelId: item.modelId },
              ]);
              const idx = removedItems.findIndex(i => modelPreference(i) === pref);
              if (idx !== -1) removedItems.splice(idx, 1);
              refreshDisplayItems(ctx);
            }
            return;
          }
          if (option === 'Select') ctx.close({ item: displayItems[ctx.getSelected()], saveDefault: false });
          else if (option === 'View') ctx.enterDetail();
          else if (option === 'Remove Fully') {
            pendingFullRemoval = displayItems[ctx.getSelected()];
            confirming = true;
            // Reopens the action menu with confirmMenu now selected by the getter.
            ctx.openAction();
          }
          else if (option === 'Remove' || option === 'Restore') {
            const removing = option === 'Remove';
            const from = removing ? items : removedItems;
            const to = removing ? removedItems : items;
            const item = displayItems[ctx.getSelected()];
            const pref = modelPreference(item);
            setRemoved(pref, removing);
            item.removed = removing;
            const idx = from.findIndex(i => modelPreference(i) === pref);
            if (idx !== -1) to.push(...from.splice(idx, 1));
            sortItemsAlphabetically(to);
            refreshDisplayItems(ctx);
          }
          // Edit: stub — the base exits the action menu and redraws.
        },
      },
      onKey: (key, ctx) => {
        // On an empty (over-filtered) list, swallow the keys whose handlers would
        // index a non-existent item; let typing/backspace through to edit the filter.
        if (displayItems.length === 0 && (key === '\x1b[C' || key === '\r' || key === '\n' || key === '\x1b[D')) {
          return true;
        }
        // → detail and Enter → action menu are owned by the base; defer to it. Clear
        // any confirmation state first so the base opens the normal menu — Esc out of
        // a confirmation leaves `confirming` set and the base never tells us about it.
        if (key === '\r' || key === '\n') {
          confirming = false;
          pendingFullRemoval = null;
        }
        if (key === '\x1b[C' || key === '\r' || key === '\n') return false;

        if (key === '\x1b[D') {
          // ← toggles favorite (not offered for removed models)
          if (isRemovedTab) return true;
          const item = displayItems[ctx.getSelected()];
          const pref = modelPreference(item);
          if (favorites.has(pref)) favorites.delete(pref);
          else favorites.add(pref);
          const isFav = favorites.has(pref);
          for (const baseItem of items) {
            if (modelPreference(baseItem) === pref) baseItem.isFavorite = isFav;
          }
          setFavorite(pref, isFav);
          sortItemsAlphabetically(items);
          refreshDisplayItems(ctx, item);
          ctx.redraw();
          return true;
        }
        if (key === ' ') {
          if (filterQuery) {
            filterQuery += ' ';
            refreshDisplayItems(ctx, displayItems[ctx.getSelected()]);
            ctx.redraw();
          } else if (displayItems.length > 0 && !isRemovedTab) {
            ctx.close({ item: displayItems[ctx.getSelected()], saveDefault: true });
          }
          return true;
        }
        if (isBackspaceKey(key)) {
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

  const providerTabs = providerOrder.map(pid =>
    buildModelTab(pid, providerNames.get(pid)!, () => items.filter(i => i.providerId === pid), false, () => items),
  );
  const favTab = favorites.size > 0
    ? buildModelTab('favorites', '♥', () => items.filter(i => i.isFavorite), true, () => items)
    : null;
  // Removed models, grouped by provider like favourites. No global-filter escape:
  // typing here must never surface non-removed models. Pinned last in the bar.
  // Always present, so a model removed mid-session has somewhere to land.
  const removedTab = buildModelTab('removed', '⊘', () => removedItems, true, undefined, true);
  const tabs = [...(favTab ? [favTab] : []), ...providerTabs, removedTab];
  tabBarRows = tabs.length > 1 ? 3 : 1;

  // If the current model is a favourite, open on the favourites tab; otherwise open on its provider tab.
  const currentItem = items.find(i => modelPreference(i) === currentModel);
  const openOnFav = favTab && currentItem?.isFavorite;
  const initialTabId = openOnFav ? 'favorites' : (currentItem?.providerId ?? providerOrder[0]);
  let initialSelected = 0;
  if (currentItem) {
    const tabItems = openOnFav
      ? items.filter(i => i.isFavorite)
      : items.filter(i => i.providerId === initialTabId);
    const di = filterModelItems(tabItems, '');
    const idx = di.findIndex(i => modelPreference(i) === currentModel);
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
