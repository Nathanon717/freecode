# Architecture Decision Records

Use this directory for decisions that future maintainers need to understand before changing a boundary, workflow, or user-visible behavior.

Create an ADR when reversing the decision later would require discussion, migration, or careful coordination. Do not create ADRs for routine fixes, small refactors, typo fixes, or implementation notes that belong near the code.

Older simplification notes were ported here. For future simplification work, capture the durable boundary or policy as an ADR instead of keeping a running ledger.

## Format

Copy `template.md` and name the file with a four-digit sequence and a short slug, for example `0005-provider-routing-order.md`.

Keep ADRs short:

- Context: what pressure or confusion led to the decision.
- Decision: the boundary or policy now in force.
- Consequences: what becomes easier, what tradeoffs remain, and what future changes must account for.
