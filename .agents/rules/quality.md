# Repository rules

## File size and ownership

- Optimize for reading: use named intermediate values for compound decisions,
  explicit branches for different scenarios, and one statement per line. Avoid
  nested ternaries and compressed multi-statement handlers.
- Exported parsers should have explicit return contracts. Separate untrusted
  input parsing, authorization, database work, and rendering at real boundaries.
- Use Prettier for edited code. Do not compress code to satisfy the file-size
  guideline; extract a cohesive responsibility when expansion reveals complexity.
- Separate logical steps with a blank line, such as input reading, validation,
  calculation, and return. Use braces for conditional branches, including early
  returns and throws. Keep related declarations together; do not add a blank line
  after every statement.
- Start object literals with a newline when their properties benefit from separate
  lines; Prettier preserves that layout. Its print width is a preference, not a hard
  limit, and it does not introduce logical grouping. Do not use `prettier-ignore`
  for ordinary code formatting.

- Give each source file one clear responsibility. Split along real boundaries
  such as route, service, repository, validation, or UI component, rather than
  splitting code just to meet a line count.
- At roughly 250 lines, review whether the file has acquired a second
  responsibility. Above 350 lines, split it or explain in the change summary
  why keeping it together is clearer. Generated files and cohesive migrations
  are exceptions.
- Avoid unrelated refactors and avoid leaving unused scaffolding after a
  design changes.

## Review and verification

- Self-review every change before reporting it: read the final diff, remove
  dead code, and check error paths, data safety, and compatibility with existing
  behavior.
- For schema or migration changes, check what happens on an existing database,
  whether data can be lost, and whether a rollback is safe. Do not run a
  destructive rollback on data that must be preserved.
- Run checks that cover the changed behavior. Use focused tests for meaningful
  logic, then typecheck, lint, or build when the change crosses app boundaries.
  Do not add tests that only repeat a trivial implementation.
- For plugin changes, review discovery in source and built packages, absence of
  duplicate registration, explicit MCP exposure, and HTTP/MCP permission parity.
  Use the focused [plugin review checklist](../../docs/development/plugin-actions.md#проверка-изменений).
- Report what changed, what was verified, and any remaining risk or decision.
