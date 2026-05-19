# components/ui

Shadcn/UI primitives are **owned** by this project — copy/pasted into this folder via the shadcn CLI (or the `shadcn` MCP server in Claude Code). Components added here live alongside the codebase and are versioned with it.

```bash
# from apps/web/
npx shadcn@latest add button input label dialog dropdown-menu select tabs toast
```

Customize tokens via `apps/web/src/styles/globals.css` and `apps/web/tailwind.config.ts`. Per the developer's design taste rules (CLAUDE.md §3.6), do not ship default unmodified shadcn — set color, motion, and density appropriate to the OrderMyPhones brand.
