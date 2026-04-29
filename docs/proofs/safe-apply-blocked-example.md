# Safe Apply Blocked Example

Safe Apply is designed to fail closed when the worktree does not match the proposed edit scope.

Scenario:

- Proposed target allowlist: `["wiki/projects/Payment Router.md"]`
- Pre-existing dirty files:
  - `wiki/projects/Payment Router.md`
  - `CLAUDE.md`

Result:

```json
{
  "status": "blocked",
  "reason": "dirty files outside allowed Apply scope",
  "allowedPaths": [
    "wiki/projects/Payment Router.md"
  ],
  "violations": [
    "CLAUDE.md"
  ],
  "nextStep": "Commit, stash, or review the out-of-scope file before running Apply."
}
```

What this catches:

- The agent may be allowed to edit one project note.
- The vault already has an unrelated dirty file.
- Apply should not continue, because a later diff could mix intentional edits with unrelated local changes.

This is the difference between "the agent changed files" and "the agent changed only the files it was allowed to change."
