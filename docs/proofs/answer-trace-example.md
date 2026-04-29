# Answer Trace Example

Brain Operator's core product is not the answer alone. It is the answer plus the run trace.

Example trace shape:

```json
{
  "schema": "brain-operator.agent-trace",
  "version": 1,
  "runId": "trace-demo-payment-router",
  "agent": "claude",
  "mode": "ask",
  "query": "What blocks shipping the payment router task?",
  "catalog": {
    "total": 42,
    "included": 42,
    "omitted": 0
  },
  "searched": [
    { "kind": "Glob", "query": "wiki/**/*.md" },
    { "kind": "Grep", "query": "payment router" },
    { "kind": "Grep", "query": "failing task" }
  ],
  "read": [
    "wiki/projects/Payment Router.md",
    "01_Projects/failing-task.md",
    "AGENTS.md"
  ],
  "cited": [
    "wiki/projects/Payment Router.md",
    "01_Projects/failing-task.md"
  ],
  "missing": [
    "Payment Router Rollout Checklist"
  ],
  "warnings": [
    "Answer cited one wiki link that does not resolve."
  ],
  "createdAt": "2026-04-29T12:00:00.000Z"
}
```

What the trace catches:

- The agent searched the project and task notes before answering.
- The answer used two real files as citations.
- The answer mentioned one missing page: `[[Payment Router Rollout Checklist]]`.
- Another agent can resume from the trace without trusting the raw prior conversation.

Normal chat usually hides this retrieval path. Brain Operator makes it reviewable.
