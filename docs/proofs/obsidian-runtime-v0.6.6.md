# Obsidian Runtime Load Proof

Brain Operator was verified inside Obsidian, not only by Node syntax checks.

Environment:

- Obsidian: 1.12.7
- Brain Operator: 0.6.6
- Vault: local markdown vault
- Claude Code CLI: installed and logged in

Runtime inspection result:

```json
{
  "vault": "ege-brain",
  "version": "0.6.6",
  "brainLoaded": true,
  "brainCommands": [
    "brain-ask:ask-brain",
    "brain-ask:ask-brain-resume",
    "brain-ask:brain-home",
    "brain-ask:brain-quick",
    "brain-ask:brain-scaffold",
    "brain-ask:evolve-dry-run",
    "brain-ask:github-connect",
    "brain-ask:pulse-agents",
    "brain-ask:ship-proposals"
  ]
}
```

What this proves:

- Obsidian can read the plugin manifest.
- Obsidian can load `main.js`.
- The plugin registers commands in Obsidian's command registry.
- The local Claude Code auth probe reports logged-in status in the Home overlay.

What this does not prove:

- It is not a marketplace review.
- It is not a guarantee every OS/Obsidian version works.
- It is not a guarantee the user's Claude Code subscription has remaining usage.
