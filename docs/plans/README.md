# Plans

This directory holds implementation plans for multi-session work. A plan is a single markdown file split into phases, where each phase is meant to be completed in a separate session.

## Format

**Introduction**

Start the plan with an introduction covering context that stays relevant across every phase:

- What the work is and why it's being done.
- Key invariants or decisions that are already locked in.
- Optionally, include files confirmed to be irrelevant to the task, so future sessions can skip reading them and save tokens.

The introduction should also instruct whoever completes a phase to update the plan afterward:

- Mark the phase as done.
- Remove any details that were only needed for implementing that phase and won't matter for later phases.
- Add a short notes section if anything important came up or changed during implementation.

**Phases**

After the introduction, split the work into numbered phases.

- Split along session boundaries: each phase should be small enough to finish in one session.
- Aim for phases that touch mostly different files, with as little overlap between phases as possible.
- Each phase must end with `npm test` passing.
- Each phase may optionally include an in-app verification step for the user to perform manually.
