# Dead code — mistral:ministral-14b-2512

111 files · 64 ok · 44 dead · 3 error · 48 recovered · 3m01s

## src/agent/loop.ts _(verdict recovered from a malformed answer)_

- [stale] `systemPromptLogged` — declared at line 25 but never used or referenced outside of a single log statement that is never called again after the first invocation
- [stale] `FAKE_NATIVE_PROVIDER_ID` — imported at line 18 but never used in the file
- [stale] `FAKE_PROVIDER_ID` — imported at line 18 but never used in the file
- [stale] `assertFakeFixtureComplete` — imported at line 18 but never used in the file
- [stale] `createFakeNativeLanguageModel` — imported at line 18 but never used in the file
- [stale] `setNativeTools` — imported at line 16 but never used in the file
- [stale] `isNativeToolsDisabled` — imported at line 16 but never used in the file
- [stale] `runFakeLlm` — imported at line 20 but never used in the file
- [stale] `runParsedToolsLoop` — imported at line 21 but never used in the file
- [stale] `runSubAgent` — imported at line 15 but never used in the file
- [stale] `setParallelToolsDisabled` — imported at line 17 but used only in a `try` block that is immediately followed by a `finally` block that resets it, making the `try` block's usage redundant

## src/agent/parsed-tools.ts _(verdict recovered from a malformed answer)_

- [unexport] ParsedToolsResult — the interface is only used internally (line 154) and documented in docs/ (no code references outside this file).

## src/agent/stream-turn.ts _(verdict recovered from a malformed answer)_

- [unexport] RecoveringStreamOptions — used only inside this file (line 65) and documented in docs/.
- [unexport] RecoveringStreamOutcome — used only inside this file (line 66) and documented in docs/.

## src/agent/subagents/run-subagent.ts _(verdict recovered from a malformed answer)_

- [unexport] SubAgentContext — the type is used only within this file (lines 49, 116) and documented in `docs/`. No external code references it.

## src/agent/tools/index.ts _(verdict recovered from a malformed answer)_

- [stale] `QueuedToolExecution` — The type is defined but never used in the file, and no external references exist.
- [stale] `ToolExecuteFn` — The type is defined but never used in the file, and no external references exist.
- [stale] `ToolTraceEvent` — The type is defined but only used locally in `appendToolTrace`, which is never called outside this file.
- [stale] `appendToolTrace` — The function is defined but never called outside this file (only used internally in `withToolRendering`).
- [stale] `PreviewState` — The interface is only used locally in `withToolRendering` and `withConfirmation`; no external references exist.
- [stale] `withApprovalRowBudget` — The function is only used locally in `withConfirmation`; no external references exist.
- [stale] `withRationale` — The function is only used locally in `wrap`; no external references exist.
- [stale] `withSerializedExecution` — The function is only used locally in `wrap`; no external references exist.
- [stale] `createToolExecutionQueue` — The function is only used locally in `createTools`; no external references exist.
- [stale] `wrap` — The function is only used locally in `createTools`; no external references exist.

## src/agent/workspace.ts _(verdict recovered from a malformed answer)_

- [unexport] ResolvedProjectPath — exported but only used internally in this file (lines 37, 57, 65)

## src/cli/chrome/bottom-ui.ts _(verdict recovered from a malformed answer)_

- [stale] `_overlayEpochStarted` — a flag that is only set to `true` once and never checked again after initialization.
- [dead] `lastInlineCompletion` — a variable that is only set via `setInlineCompletion` but never read directly; its only usage is in `getInlineCompletionSuffix`, which is exported and used elsewhere.
- [dead] `lastSuggestions` — a variable that is only set via `setSuggestions` but never read directly; its only usage is in `drawInputArea`, which is exported and used elsewhere.
- [dead] `suggestionOverlayRows` — a variable that is only used internally in `drawInputArea` and `restoreSuggestionOverlaySequence`, but its state is fully managed by those functions and never exposed or checked externally.
- [dead] `suggestionOverlayStartRow` — a variable that is only used internally in `drawInputArea` and `restoreSuggestionOverlaySequence`, but its state is fully managed by those functions and never exposed or checked externally.
- [dead] `suggestionOverlayRestoreLines` — a variable that is only used internally in `drawInputArea` and `restoreSuggestionOverlaySequence`, but its state is fully managed by those functions and never exposed or checked externally.
- [dead] `lastFooterOutput` — a variable that is only used internally in `setupFooterUI` and `composeFooterOutput` for comparison, but its state is fully managed by those functions and never exposed or checked externally.
- [dead] `_resizeDebounce` — a variable that is only used internally in the resize handler and never exposed or checked externally.
- [dead] `_onResizeCallback` — a variable that is only used internally in the resize handler and `setOnResizeCallback`, but its state is fully managed by those functions and never exposed or checked externally.
- [unexport] `inputLineCount` — a helper function used only internally by `drawInputArea` and never exported.
- [unexport] `restoreSuggestionOverlaySequence` — a helper function used only internally by `drawInputArea` and never exported.

## src/cli/chrome/footer-status.ts _(verdict recovered from a malformed answer)_

- [dead] `lastOpenAIDailySpend` — Initialized to `{ state: 'idle', updatedAt: 0 }` but never modified except by `setOpenAIDailySpend`, which is always called with a full `OpenAIDailySpend` object. The `updatedAt` field is unused in the file (no logic checks it or uses it for time-based calculations).
- [dead] `formatDuration` — Never called or referenced outside of `estimateBucket`, which is only used in `formatQuotaStatus`. The function is not exported and no other logic depends on it.
- [dead] `padNumberText` — Only used in `formatBucketStatus`, which is only called from `formatQuotaStatus`. No other logic depends on it.
- [dead] `padDurationText` — Only used in `formatBucketStatus`, which is only called from `formatQuotaStatus`. No other logic depends on it.
- [dead] `formatBucketStatus` — Only used in `formatQuotaStatus`. No other logic depends on it.
- [dead] `estimateBucket` — Only used in `formatQuotaStatus`. No other logic depends on it.
- [dead] `joinParts` — Only used in `layoutFooterRightRows` and `singleRow` (a local function within `layoutFooterRightRows`). No other logic depends on it.
- [stale] `retryBannerInfo` — Only used in `formatEvalRunStatus`, which is only called from `layoutFooterRightRows`. However, `retryBannerInfo` is never set to a non-null value in any observable path (no evidence of it being populated outside of this file). The only reference is in `setRetryBanner`, which is called externally, but the logic in `formatEvalRunStatus` assumes it is set. If it is never set, this is dead code.

## src/cli/chrome/toggles.ts _(verdict recovered from a malformed answer)_

- [unexport] AskMode — the type is only used internally (lines 25, 47, 58) and documented but never imported or referenced outside this file.

## src/cli/command-dispatcher.ts _(verdict recovered from a malformed answer)_

- [unexport] CommandDispatchResult — only used in its own export signature; no external references.
- [stale] showFlagsHelp — never called in the file; only referenced in `showHelp()` (line 132) but not invoked.
- [dead] `if (runtime.getReadOnly?.() ?? false)` (line 100) — `runtime.getReadOnly` is optional, and the `?? false` fallback is redundant because `runtime.getReadOnly` is only called if it exists (no null/undefined risk).
- [dead] `if (runtime.skipStrayConfirmations && isScriptedConfirmation(normalized))` (line 166) — `isScriptedConfirmation` is only called here, but the condition is dead code: `skipStrayConfirmations` is an optional field, and even if set, the check is redundant because `isSlashCommand` (line 180) already filters `/y`, `/yes`, `/n`, `/no` as non-commands (they are treated as empty input or invalid commands elsewhere).

## src/cli/eval/humaneval-menu.ts _(verdict recovered from a malformed answer)_

- [unexport] buildHumanEvalPickerScreen — Only used internally by `buildHumanEvalTab`; no external references.
- [unexport] buildHumanEvalDetailScreen — Only used internally by `buildHumanEvalTab`; no external references.
- [unexport] buildAgentPrompt — Only used internally by `runOneProblem`; no external references.
- [unexport] askContinuePrompt — Only used internally by `makeRetryPrompter`; no external references.
- [unexport] RunStatus — Only used internally as a type in `runOneProblem`; no external references.
- [unexport] RunResult — Only used internally as a return type in `runOneProblem`; no external references.
- [unexport] TranscriptTurn — Only used internally in `runOneProblem`; no external references.
- [unexport] RetryStatusInfo — Only used internally in `makeRetryPrompter`; no external references.
- [stale] `_dirname` — Assigned once and never used; no external references.
- [stale] `HUMANEVAL_RUNS_DIR` — Assigned once and never exported or used outside its scope; no external references.

## src/cli/headless-prompt.ts _(verdict recovered from a malformed answer)_

- [unexport] HeadlessPromptOptions — The interface is only used as a parameter type for `runHeadlessPrompt` (line 77) and is not imported or referenced outside this file.

## src/cli/menus/action-menu.ts _(verdict recovered from a malformed answer)_

- [unexport] ActionMenuResult — The type is only used internally in `handleKey` (line 34) and documented in `docs/`. No external code references it.

## src/cli/menus/list-menu.ts _(verdict recovered from a malformed answer)_

- [unexport] ListMenuOptions — the interface is only used inside this file (line 182) and documented in docs/.
- [stale] TAB_SEP — the constant is defined (line 100) but never used in the file.
- [stale] tabCellWidth — the function is defined (line 103) but only used internally by `packTabsRight` and `computeTabWindow`.
- [stale] tabBarBudget — the function is defined (line 109) but only used internally by `computeTabWindow`.
- [stale] packTabsRight — the function is defined (line 115) but only used internally by `computeTabWindow`.
- [stale] renderTabBar — the function is defined (line 143) but only used internally by `runListMenu`.
- [stale] ESC, UP, DOWN, RIGHT, LEFT, ENTER_CR, ENTER_LF — constants defined (lines 10-15) but only used internally in `onKey` and never exported.

## src/cli/menus/menu-shell.ts _(verdict recovered from a malformed answer)_

- [unexport] MenuShellOptions — the interface is only used as a parameter type in `runMenuShell` and is not imported or referenced outside this file.

## src/cli/menus/raw-picker.ts _(verdict recovered from a malformed answer)_

- [unexport] RawKeySessionCallbacks — exported but only used internally by `runRawKeySession` (line 79)
- [unexport] RawKeySession — exported but only used internally by `runRawKeySession` (line 79)
- [unexport] RawPickerOptions — exported but only used internally by `runRawPicker` (line 146)

## src/cli/render/markdown-renderer.ts _(verdict recovered from a malformed answer)_

- [unexport] MarkdownStreamRenderer — the interface is only used by `createMarkdownStreamRenderer` inside this file, and nothing outside imports it.

## src/cli/render/transcript-record.ts _(verdict recovered from a malformed answer)_

- [unexport] TranscriptEntry — used internally (lines 38, 56, 74, 106) but never referenced outside this file.
- [unexport] TranscriptRecord — used internally (line 61) but never referenced outside this file.

## src/cli/render/transcript-renderer.ts _(verdict recovered from a malformed answer)_

- [stale] `formatPromptEcho` — re-exported but never used in this file (no local references, no evidence of use outside re-export)

## src/cli/scripted-mode.ts _(verdict recovered from a malformed answer)_

- [stale] `formatScriptedToolMenu` — imported from `./tools/tool-approval.js` but never called in this file. The file uses `formatScriptedToolMenu` only as a parameter to `parseScriptedToolChoice` (which is also imported but never called directly).
- [stale] `parseScriptedToolChoice` — imported from `./tools/tool-approval.js` but never called in this file. The file only references it in a dead code path (line 45) that is unreachable due to `lineIdx` increment logic.
- [stale] `ToolCallConfirmation` — imported as a type but never used in this file. The return type of `confirmToolCall` is hardcoded to `Promise<ToolCallConfirmation>` without referencing the type directly.
- [stale] `CliSessionMode` — imported as a return type but never used in this file. The return type of `createScriptedMode` is hardcoded to `CliSessionMode` without referencing the type directly.

## src/cli/session-modes.ts _(verdict recovered from a malformed answer)_

- [stale] `applyModelStatus` — unused in the file and not referenced outside
- [stale] `_lastAppliedModel` — only used in `applyModelChange` and `applyModelStatus`, both dead
- [stale] `warmTokenizers` — only called by `applyModelChange` and `applyModelStatus`, both dead
- [stale] `applyModelChange` — only called by `createInteractiveMode` (line 290), but the call is replaced by `applyModelStatus` (line 291) before any usage
- [stale] `refreshFooterDailySpend` — only called by `createInteractiveMode` (line 290), but the call is replaced by `applyModelStatus` (line 291) before any usage
- [stale] `applyContextUsage` — only called by `onAgentResult` and `onStepUsage`, but both are unused in the exported `createInteractiveMode` object
- [stale] `resetBottomPromptState` — only called by `createInteractiveMode` (line 290), but the call is replaced by `applyModelStatus` (line 291) before any usage

## src/cli/slash-commands.ts _(verdict recovered from a malformed answer)_

- [unexport] SLASH_COMMAND_NAMES — The array is only used internally by `getRawFilteredCommands`, `getCommandCompletion`, and `getFilteredCommands`. No external reference exists.

## src/cli/tools/tool-approval.ts _(verdict recovered from a malformed answer)_

- [unexport] ToolApprovalChoice — The type is only used internally (lines 109, 192, 270, 277) and never referenced outside this file.

## src/cli/tools/tool-invocation.ts _(verdict recovered from a malformed answer)_

- [unexport] ToolParam — used only in `TOOL_PARAMS` definition (line 27) and documented in docs.
- [unexport] HighlightRange — used only in `toolNameHighlightRanges` (line 92) and `styleToolNames` (line 123), documented in docs.
- [unexport] ParsedInvocation — used only in `parseToolInvocation` (line 159), documented in docs.
- [unexport] FieldSlot — used only internally (lines 208, 237, 247), documented in docs.
- [dead] toolCallSlots — only used internally (lines 266, 277), never exported or referenced outside this file.

## src/commands/config.ts _(verdict recovered from a malformed answer)_

- [stale] `countWrappedLines` — imported from `'../cli/menus/raw-picker.js'` but never used in this file. The `countLines` prop in `runListMenu` is passed directly as a function reference, not via `countWrappedLines`.
- [stale] `getBannerColor` — imported from `'../cli/render/banner.js'` but only used in `formatNumeric` (line 100) and `renderOverrideValue` (line 130). The `getBannerColor()` call is replaced by `chalk.dim` or `chalk.reset` in the same lines, making the import redundant.
- [stale] `redrawBanner` — imported from `'../cli/render/banner.js'` but only called at the end of `runConfigBody` (line 357). The function is not used elsewhere, and its purpose is purely cosmetic (redrawing the banner after menu exit). If the banner is not critical, this call could be removed entirely.
- [stale] `onRestore` — parameter in `runConfigCommand` (line 359) but never used in the function body or passed down to `runMenuShell`. The `runMenuShell` call does not reference it.
- [stale] `ensureStoreReady` — passed to `runMenuShell` (line 360) but not used in `runConfigBody` or any nested logic. The `runMenuShell` implementation likely handles it internally, but the file does not show its usage.
- [stale] `TabValue` — type alias (line 70) defined but only used in `loadOverrideValues` (line 80) and `cycleNumericOverride` (line 200). The type is redundant because the union `boolean | number | undefined` is already clear in context.
- [stale] `CYCLE_RIGHT` and `CYCLE_LEFT` — constants (lines 190-191) only used in `cycleOverride` (line 195). The logic is trivial and could be inlined without loss of clarity.
- [stale] `getProviderId` and `getModelId` — functions (lines 50-55) only used in `isParsedToolsForced` (line 58) and `getAvailableTabs` (line 61). The logic is simple and could be inlined.
- [stale] `isParsedToolsForced` — function (line 58) only used in `buildSettingRows` (line 230) to conditionally render `parsedTools`. The check is redundant because `isNativeToolsDisabled` already enforces this logic, and the UI should reflect the actual state.
- [stale] `Tab` — type alias (line 48) only used in `getAvailableTabs` (line 61), `loadOverrideValues` (line 75), `buildConfigTab` (line 250), and `buildSettingRows` (line 220). The type is redundant because the literal union `'global' | 'provider' | 'model'` is already clear in context.
- [stale] `OverridableKey` — type alias (line 45) only used in `SETTINGS` (line 46) and `loadOverrideValues` (line 80). The type is redundant because `keyof OverridableSettings` is already clear in context.
- [stale] `BoolSetting` and `NumericSetting` — interfaces (lines 47-68) only used in `SETTINGS` (line 46) and type checks. The interfaces are redundant because the `Setting` type already captures the union, and the discriminated union is clear in context.
- [stale] `Setting` — type alias (line 69) only used in `SETTINGS` (line 46), `visibleSettings` (line 150), and `buildSettingRows` (line 220). The type is redundant because the union `BoolSetting | NumericSetting` is already clear in context.
- [stale] `globalPath` — parameter in `saveOverrideSetting` (line 240) but unused. The function uses `readRawConfig(globalPath)` but does not pass `globalPath` to any other function or use it meaningfully.
- [stale] `_globalPath` — parameter in `saveGlobalSetting` (line 235) but unused. The function does not reference it, making it a dead parameter.
- [stale] `_direction` — parameter in `cycleGlobal` (line 205) but unused. The function ignores it and simply toggles the boolean.
- [stale] `_currentModel` — parameter in `runConfigCommand` (line 359) but unused. The function passes it directly to `runConfigBody`, where it is used.
- [stale] `currentModel` — parameter in `runConfigBody` (line 362) but unused in the `if (!process.stdin.isTTY)` block. The check is unrelated to `currentModel`.
- [stale] `ctx.getSelected()` — call in `onKey` (line 280) but redundant. The selected index is already available as `ctx.selected` in the `runListMenu` context, and the function could use `ctx.selected` directly.

## src/commands/model.ts _(verdict recovered from a malformed answer)_

- [unexport] `filterModelItems` — Re-exported but the file itself uses it internally (line 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 722, 723, 724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736, 737, 738, 739, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750, 751, 752, 753, 754, 755, 756, 757, 758, 759, 760, 761, 762, 763, 764, 765, 766, 767, 768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826, 827, 828, 829, 830, 831, 832, 833, 834, 835, 836, 837, 838, 839, 840, 841, 842, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 853, 854, 855, 856, 857, 858, 859, 860, 861, 862, 863, 864, 865, 866, 867, 868, 869, 870, 871, 872, 873, 874, 875, 876, 877, 878, 879, 880, 881, 882, 883, 884, 885, 886, 887, 888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898, 899, 900, 901, 902, 903, 904, 905, 906, 907, 908, 909, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 930, 931, 932, 933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 968, 969, 970, 971, 972, 973, 974, 975, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999, 1000

## src/commands/renderer.ts _(verdict recovered from a malformed answer)_

- [stale] `DEMO_OPTS` — The object is only used in this file and never exported, but its purpose (routing to stdout) is already implied by the `stream: "stdout"` usage in `renderTurn` calls. The variable adds no clarity or reusability.

## src/config/index.ts _(verdict recovered from a malformed answer)_

- [dead] `getApiKeyFromEnv` — The function is defined but never used within the file or referenced outside it. The `resolveApiKey` function already handles API key resolution via `process.env` and `loadConfig()`, making this redundant.
- [dead] `SYNCABLE_GLOBAL_KEYS` — The array is only used locally in `loadConfig` and `writeConfigFile`, but the logic could be inlined or handled via type inference without needing this explicit list. No external references exist.
- [dead] `DEFAULT_CONFIG` — The object is only used locally in `loadConfig` and never exported or referenced outside this file. Its values are hardcoded and could be inlined where needed.
- [dead] `cachedConfig` — The variable is only used internally in `loadConfig` and `writeConfigFile`; no external references exist. The caching logic is encapsulated and not exposed.
- [dead] `loadJsonFile` — The function is only used internally by `readRawConfig` and `loadConfig`. No external references exist, and its logic could be inlined where needed.
- [dead] `providerIds` — The array is only used locally in `loadConfig` and never referenced outside this file. Its values are hardcoded and could be inlined.
- [dead] `writeConfigMirror` — Imported from `'../store/db.js'` but never used in this file. The evidence shows it is not referenced outside either.
- [dead] `persistDbConfig` — Imported from `'../store/db-config-cache.js'` but only used in `writeConfigFile`. However, the function is not exported from this file, and no external references exist for it in the repo.
- [dead] `getDbConfigCache`, `setDbConfigCache` — Imported from `'../store/db-config-cache.js'` but only used internally in `loadConfig` and `writeConfigFile`. No external references exist.
- [dead] `registerCacheInvalidator` — Imported from `'../store/db-config-cache.js'` but only used once in a local scope (`registerCacheInvalidator(() => { cachedConfig = null; })`). No external references exist.
- [dead] `preferLocal` — The property is deleted in `loadConfig` and `writeConfigFile` but never used or referenced outside these functions. No external references exist.

## src/eval/errors.ts _(verdict recovered from a malformed answer)_

- [unexport] ApiError — The interface is only used internally (lines 47, 49) and not imported or referenced outside this file. The documentation in `docs/map/eval/errors.md` does not count as a use.

## src/eval/runner.ts _(verdict recovered from a malformed answer)_

- [unexport] EvalToolCall — used internally (lines 19, 149, 151) but never referenced outside this file
- [unexport] EvalTokenUsage — used internally (line 19) but never referenced outside this file

## src/providers/adapters/adapter-http-retry.ts _(verdict recovered from a malformed answer)_

- [unexport] FetchWithRetryOptions — exported but only used internally (line 164) and documented, never imported outside this file.

## src/providers/adapters/openai-compat-quirks.ts _(verdict recovered from a malformed answer)_

- [unexport] OpenAICompatQuirks — The interface is only used internally by `providerQuirks` and has no external references.

## src/providers/fake.ts _(verdict recovered from a malformed answer)_

- [unexport] FAKE_DEFAULT_MODEL_ID — only used in `createPlaceholderFakeLanguageModel` (line 112) and documented; no external references.
- [unexport] FakeUsage — only used internally (lines 33, 72, 90) and documented; no external references.
- [unexport] FakeModelCall — only used internally (lines 194, 295, 378) and documented; no external references.
- [unexport] FakeModelResult — only used internally (line 378) and documented; no external references.
- [unexport] FakeToolCall — only used internally (lines 35, 73, 89, 128) and documented; no external references.
- [unexport] FakeNativeModelSettings — only used internally (line 272) and documented; no external references.
- [dead] `consumedSteps` — only used in `resetFakeModelState` (line 120) and `readFixture`/`runFakeModel`/`createFakeNativeLanguageModel`; no external references, but the file itself uses it. However, `resetFakeModelState` is exported and used externally (19 refs), so it is live. **Correction: not dead.**
- [stale] `isRecord` — unused helper function (never called or referenced).
- [stale] `assertToolCall` — only used in `readFixture` (line 150), which is internal; no external references.
- [stale] `readFixture` — only used internally (lines 160, 233, 296, 380); no external references.
- [stale] `messageText` — only used internally (lines 170, 180); no external references.
- [stale] `lastUserMessage` — only used internally (lines 180, 200, 390); no external references.
- [stale] `failMatch` — only used internally (line 190); no external references.
- [stale] `assertStepMatches` — only used internally (lines 200, 297); no external references.
- [stale] `appendTrace` — only used internally (lines 300, 390); no external references.
- [stale] `lastUserMessageFromV1Prompt` — only used internally (line 300); no external references.
- [stale] `systemPromptFromV1Prompt` — only used internally (line 300); no external references.

## src/providers/model-data.ts _(verdict recovered from a malformed answer)_

- [unexport] ObservedRateLimits — exported but only used internally (line 48) and documented (docs/).
- [dead] EvalDoc — never used outside its single function (`appendEvalRun`), which is live but the interface itself is unused.
- [stale] CatalogModel — interface only used internally (lines 224, 244, 245) and documented (docs/), with no external references.

## src/providers/openai-daily-spend.ts _(verdict recovered from a malformed answer)_

- [unexport] CostsAmount — unused interface, no references outside the file
- [unexport] CostsResult — unused interface, no references outside the file
- [unexport] CostsBucket — unused interface, no references outside the file
- [unexport] CostsResponse — unused interface, no references outside the file
- [unexport] OpenAIDailySpendRefreshOptions — unused interface, no references outside the file
- [unexport] startOfUtcDay — unused function, no references outside the file
- [unexport] formatUsd — unused function, no references outside the file
- [unexport] getAdminApiKey — unused function, no references outside the file
- [unexport] resolveModelPreference — unused function, no references outside the file
- [unexport] getResults — unused function, no references outside the file
- [unexport] parseTodayCosts — unused function, no references outside the file
- [stale] `const OPENAI_COSTS_URL = 'https://api.openai.com/v1/organization/costs';` — URL is hardcoded in `fetchOpenAITodayCosts` without being exported or reused
- [stale] `const CACHE_TTL_MS = 5 * 60 * 1000;` — constant is hardcoded in `refreshOpenAIDailySpend` without being exported or reused

## src/providers/pricing-verifier.ts _(verdict recovered from a malformed answer)_

- [unexport] VerifiedRates — only used internally in this file (lines 98, 113, 119) and documented, never imported elsewhere.
- [unexport] LITELLM_PRICING_URL — only used internally (line 20) and documented, never imported elsewhere.
- [unexport] OPENROUTER_MODELS_URL — only used internally (line 35) and documented, never imported elsewhere.
- [unexport] getLiteLLMRates — only used internally (line 99) and documented, never imported elsewhere.
- [unexport] getOpenRouterRates — only used internally (line 99) and documented, never imported elsewhere.
- [unexport] getVerifiedRates — only used internally (lines 116, 121) and documented, never imported elsewhere.

## src/providers/provider-catalog.ts _(verdict recovered from a malformed answer)_

- [stale] `ZEN_FREE_IDS` — Commented logic in `isZenFreeModelId` states it is the only exception to the `-free` suffix rule, but the set contains only one entry ("big-pickle") and is unused outside this file.
- [stale] `ZEN_RETIRED_FREE_IDS` — Commented logic in `isZenFreeModelId` states it is for retired names, but the set contains only one entry ("qwen3.6-plus-free") and is unused outside this file.
- [stale] `isZenFreeModelId` — Only used internally by `PROVIDER_REGISTRY` (Zen provider) and never referenced outside this file.
- [stale] `modelIdExactBlocklist` (in NVIDIA provider) — Commented as "Listed in /models but confirmed live (2026-07-02) to 404" and unused outside this file.
- [stale] `modelTierBlocklist` (in LLM7 provider) — Only appears in the config but is unused in the file and never referenced outside.
- [stale] `defaultApiKey` (in Zen provider) — Only appears in the config but is unused in the file and never referenced outside.
- [stale] `modelsSource` (in multiple providers) — Only appears in the config but is unused in the file and never referenced outside.
- [stale] `contextWindow` (in GitHub and Cloudflare providers) — Only appears in the config but is unused in the file and never referenced outside.
- [stale] `displayName` (in GitHub, Cloudflare, and Hugging Face providers) — Only appears in the config but is unused in the file and never referenced outside.

## src/providers/provider-registry.ts _(verdict recovered from a malformed answer)_

- [stale] `LIVE_PROVIDER_IDS` — The array is never used in the file. It is only referenced in the `initProviderModels` function via `LIVE_PROVIDER_IDS.map`, but the function itself is not exported or used outside this file, and the `map` is replaced by direct calls to `initProviderModels` for specific providers in `_doInit`.

## src/providers/quota/headers.ts _(verdict recovered from a malformed answer)_

- [unexport] GroqRateLimitHeaders — exported but only used internally (lines 33, 99, 128, 156, 209)
- [unexport] GroqRateLimitInfo — exported but only used internally (line 130)
- [unexport] RateLimitBucket — exported but only used internally (line 153)
- [dead] headerNum — unused function, never called or referenced

## src/providers/types.ts _(verdict recovered from a malformed answer)_

- [unexport] RateLimits — only used internally in `ModelConfig` and documented, never imported outside this file

## src/store/db-schema.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/store/db-types.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/store/db.ts — ERROR

Mistral HTTP 429 Too Many Requests: {"object":"error","message":"Rate limit exceeded","type":"rate_limited","param":null,"code":"1300","raw_status_code":429}

## src/store/model-list-cache.ts _(verdict recovered from a malformed answer)_

- [unexport] RawCachedModel — only used internally (lines 16, 58) and documented, never referenced outside this file.
- [unexport] CacheUpdateResult — only used internally (line 58) and documented, never referenced outside this file.

## src/tokenizers/model-family.ts _(verdict recovered from a malformed answer)_

- [dead] DEEPSEEK_V4_FAMILY — The `isDeepSeekV4` function is never called in `resolveTokenizerFamily`, and the `DEEPSEEK_V4_FAMILY` constant is only referenced in tests. The `resolveTokenizerFamily` function checks `isDeepSeekV4` *before* `isDeepSeekV3`, but the `DEEPSEEK_V4_FAMILY` constant is never used in the logic flow (the function returns `DEEPSEEK_V3_FAMILY` for V3 matches, and `null` for V4 matches would fall through to the same). The `isDeepSeekV4` check is redundant because `DEEPSEEK_V4_FAMILY` is never returned.

## src/util/errors.ts _(verdict recovered from a malformed answer)_

- [unexport] isNoSuchToolError — only used internally (line 226) and documented, no external references.
- [unexport] noSuchToolName — only used internally (line 227) and documented, no external references.
- [unexport] noSuchToolAvailableList — only used internally (line 228) and documented, no external references.
- [unexport] isInvalidToolArgumentsError — only used internally (line 238) and documented, no external references.
- [unexport] invalidToolName — only used internally (line 239) and documented, no external references.
- [stale] ApiErrorDetails — interface only used internally (lines 20–21, 40, 44, 50, 54, 60, 64, 68, 72, 76, 80, 84, 90, 94, 100, 104, 110, 114, 118, 122, 126, 130, 134, 138, 142, 146, 150, 154, 158, 162, 166, 170, 174, 178, 182, 186, 190, 194, 198, 202, 206, 210, 214, 218, 222, 226, 230, 234, 238, 242, 246, 250, 254, 258, 262, 266, 270, 274, 278, 282, 286), never exported.
- [stale] OVERFLOW_PATTERNS — constant only used internally (line 152), never exported.
- [stale] TOOLS_NOT_SUPPORTED_PATTERNS — constant only used internally (line 267), never exported.

## src/util/screen-buffer.ts _(verdict recovered from a malformed answer)_

- [stale] `MAX_LINES` — The value `150` is never used in any condition or logic; it is only referenced in a comment and a comparison that is always false (the buffer is managed by `shift()` calls, not by a hard limit).
- [stale] `displayLineBufferStyled` — The array is only used internally, and its length is never explicitly checked against `MAX_LINES` in a way that would enforce the limit. The buffer is dynamically managed via `shift()` calls, making `MAX_LINES` irrelevant.
- [stale] `epochStart` — While used in logic, the variable's purpose is entirely tied to `displayLineBufferStyled` and `hasPostEpochContent`. No external documentation or comment suggests it is a "flag" or stale—it is actively used. **REVERTED: This is live code.**
- [stale] `capturing` — The variable is only used in `writeChrome` and toggled within the same function. No other logic depends on it, and its state is purely local to that function's scope.
- [stale] `hasCursorOrScreenControl` — The function is only used internally by `installScreenBuffer` and is not exported or referenced outside this file.
- [stale] `hasFullScreenErase` — The function is only used internally by `installScreenBuffer` and is not exported or referenced outside this file.
- [stale] `pushDisplayLines` — The function is only used internally by `installScreenBuffer` and is not exported or referenced outside this file.
- [stale] `SGR_SEQ` — The regex is only used internally by `wrapStyledToRows` and is not exported or referenced outside this file.

## HTTP diagnostics

- requests: 155 for 111 files (200×108 · 429×47)
- 429 responses: 47 total, of which 3 were terminal (retries exhausted, surfaced as an error)
- 429s carrying a `retry-after` header: 0/47
- backoff waits: 71, 291.5s summed across workers (not wall time)
- successful call latency: median 1.5s · max 64.4s
- rate-limit headers on 429s: 47/47 carried them — req remaining 0 of limit 30, tokens remaining absent of limit absent
- 429 window: 29.7s → 158.9s into the run

### 429 timeline (seconds into run)

```
   29.7s  src/cli/eval/eval-menu.ts
   30.5s  src/cli/eval/eval-screen.ts
   31.9s  src/cli/headless-prompt.ts
   33.0s  src/cli/eval/eval-menu.ts
   33.0s  src/cli/headless-prompt.ts
   33.0s  src/cli/eval/eval-screen.ts
   33.0s  src/cli/eval/humaneval-menu.ts
   35.1s  src/cli/headless-prompt.ts
   35.2s  src/cli/eval/eval-screen.ts
   35.2s  src/cli/eval/eval-menu.ts
   35.2s  src/cli/eval/humaneval-menu.ts
   39.3s  src/cli/headless-prompt.ts
   39.3s  src/cli/eval/eval-screen.ts
   39.3s  src/cli/eval/eval-menu.ts
   39.3s  src/cli/eval/humaneval-menu.ts
   69.4s  src/eval/errors.ts
   70.5s  src/eval/errors.ts
   73.0s  src/eval/history.ts
   73.0s  src/eval/errors.ts
   77.1s  src/eval/humaneval-data.ts
   77.1s  src/eval/history.ts
   77.1s  src/eval/errors.ts
   85.2s  src/eval/errors.ts
   85.2s  src/eval/humaneval-data.ts
   85.2s  src/eval/history.ts
  125.1s  src/store/db-schema.ts
  125.7s  src/store/db-types.ts
  126.4s  src/store/db.ts
  127.5s  src/store/db-types.ts
  127.5s  src/store/db-schema.ts
  127.5s  src/store/db.ts
  130.1s  src/store/model-list-cache.ts
  130.1s  src/store/db-schema.ts
  130.1s  src/store/db-types.ts
  130.1s  src/store/db.ts
  134.3s  src/store/db-types.ts
  134.3s  src/store/model-list-cache.ts
  134.3s  src/store/db-schema.ts
  134.3s  src/store/db.ts
  142.6s  src/store/db-types.ts
  142.6s  src/store/model-list-cache.ts
  142.6s  src/store/db-schema.ts
  142.6s  src/store/db.ts
  158.9s  src/store/db-schema.ts
  158.9s  src/store/db.ts
  159.0s  src/store/model-list-cache.ts
  158.9s  src/store/db-types.ts
```

### Terminal failures

```
  125.1s start    36.2s spent   6 requests  src/store/db-schema.ts
  125.7s start    37.1s spent   6 requests  src/store/db-types.ts
  126.4s start    35.6s spent   6 requests  src/store/db.ts
```

Requests per file: min 1 · median 1 · max 6.
A file that never hits a limit sends 1; anything above that is retry traffic.

