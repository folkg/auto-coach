You shall read LINT-TODO.md from the repository root to understand the scope of your task. Then you shall identify the next unmarked lint rule in the list, and this will be your job to implement.

Once you have identified your rule, follow the instructions below sequentially:
1. Update `.oxlintrc.json` to add/adjust the rule.
2. Run oxlint from the repository root with `bunx oxlint --type-aware --type-check --fix`
3. Fix all violations using the strategies listed.
4. Re‑run `bunx oxlint --type-aware --type-check --fix` until clean
5. Run `bunx vitest run --silent passed-only` to run all unit tests. Ensure all tests are passing before moving on, even if you believe a failing test was not part of your scope.
6. Mark the rule as complete in the LINT-TODO.md
7. create a git commit with the message "chore: enabled lint rule '<rule_name>'"

Once everything above is complete, your job is done.
