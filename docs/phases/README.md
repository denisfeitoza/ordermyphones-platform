# Project Phases — OrderMyPhones.com

This folder maps **Schedule B** of the [Software Development Agreement](../contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md) into concrete engineering plans. Each phase document declares: scope, entry criteria, deliverables, exit criteria, risks, and the artifacts produced.

| # | Phase | Window | Doc |
|---|---|---|---|
| 1 | Discovery, technical specification, UX/UI design | Weeks 1–3 | [PHASE-1-DISCOVERY-AND-DESIGN.md](PHASE-1-DISCOVERY-AND-DESIGN.md) |
| 2 | Backend, database, supplier API integrations | Weeks 4–8 | [PHASE-2-BACKEND-AND-INTEGRATIONS.md](PHASE-2-BACKEND-AND-INTEGRATIONS.md) |
| 3 | Frontend: landing, catalog, checkout, customer portal, admin dashboard | Weeks 9–13 | [PHASE-3-FRONTEND-AND-PORTAL.md](PHASE-3-FRONTEND-AND-PORTAL.md) |
| 4 | QA, end-to-end testing, deployment, Final Delivery | Weeks 14–17 | [PHASE-4-QA-AND-DEPLOYMENT.md](PHASE-4-QA-AND-DEPLOYMENT.md) |

## Conventions used in every phase doc

Each phase document follows the same structure so the Client can compare progress consistently:

1. **Goal** — one paragraph describing what "done" looks like.
2. **Scope** — bulleted list of in-scope work mapped to the Agreement clauses.
3. **Out of scope** — what is explicitly **not** in this phase (deferred or out of contract).
4. **Entry criteria** — what must be true before work starts.
5. **Deliverables** — concrete artifacts produced (files, environments, dashboards).
6. **Exit criteria** — what must be true for the phase to be accepted.
7. **Workstreams & sequencing** — the order in which the work is executed.
8. **Risks & mitigations** — top engineering and delivery risks.
9. **Client interaction points** — explicit checkpoints where Client input is required (per Section 4 of the Agreement).
10. **Artifacts produced in the repository** — file paths created or updated during the phase.

## Cadence and reporting

- **Weekly check-in (30 min).** Status, risks, blockers, decisions needed.
- **End-of-phase review (60–90 min).** Walkthrough of deliverables, sign-off on exit criteria, decision to proceed to the next phase.
- **Async written summary** at every milestone, archived alongside each phase document.

## Change management

Modifications to scope, timeline, or fees trigger a Change Order (Section 8 of the Agreement). The CO is filed in [`../contract/`](../contract/) and the affected phase documents are amended in the same commit.
