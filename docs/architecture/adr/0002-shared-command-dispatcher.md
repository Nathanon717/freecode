# 0002 Shared Command Dispatcher

**Status:** Accepted
**Date:** 2026-05-19

## Context

Interactive and scripted CLI paths both needed to execute slash commands, mutate session state, handle exit behavior, and call the agent. Keeping those flows separate risked command behavior drifting between terminal use and scenario tests.

## Decision

`src/cli/command-dispatcher.ts` owns slash-command handling, session mutation, exit handling, and agent calls. Interactive and scripted loops provide mode-specific callbacks for config, scenario menus, provider listing, and tool confirmation.

## Consequences

Interactive and scripted sessions now exercise the same command semantics. Scenario coverage is more representative of real use, and future command changes should go through the dispatcher instead of being duplicated in mode-specific loops.
