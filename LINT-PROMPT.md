You shall read LINT-TODO.md from the repository root to understand the scope of your task.

First, you shall run oxlint from the repository root with `bun checks` (runs liting and unit tests). If there are any failing checks, then fixing these failures becomes your only job, you shall not proceed further to pick a new task from the todo. If the current failures are marked as "completed" on the TODO list, then you shall unmark the rule(s), and continue with this rule as your job.

If all checks are passing and you are starting with a clean repository, you shall identify the next unmarked lint rule in the list, and this will be your job to implement.

Follow the instructions below sequentially:

1. Update `.oxlintrc.json` to add/adjust the rule.
2. Run oxlint from the repository root with `bunx oxlint --type-aware --type-check --fix`
3. Fix all violations using the strategies listed.
4. Re‑run `bunx oxlint --type-aware --type-check --fix` until clean
5. Run `bunx vitest run --silent passed-only` to run all unit tests. Ensure all tests are passing before moving on, even if you believe a failing test was not part of your scope.
6. Mark the rule as complete in the LINT-TODO.md
7. create a git commit with the message "chore: enabled lint rule '<rule_name>'"

You may run oxlint with flags `--fix --fix-suggestions --fix-dangerously` after the initial to apply dangerous fixes and suggestions to make your job easier, but note that you SHALL review the fixes made since they can alter the behaviour of the program, and it is your job as the expert to ensure these fixes are okay, or whether they need to be tweakd or fixed manually to meet the original intention of the program.

You shall not add any rules as new overrides, with the exception of possibly config files. Tests shall not be overridden, safety is as important in test code as it is in application code.

Once everything above is complete, your job is done.
