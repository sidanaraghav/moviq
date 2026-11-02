# CoziCut — agent working agreement

## Product

CoziCut helps people prepare event-performance mixes. A user provides source media, selects time ranges, arranges clips, makes small edits, and exports a single audio or video mix.

The initial target is a private, audio-first wedding beta. Build the core workflow before pursuing public-scale features.

## Ownership and collaboration

- The user is the product owner. They set product priorities and approve material scope, external accounts, paid spend, and deployment.
- Codex owns day-to-day implementation across backend and UI, including small design decisions that are consistent with the documented architecture.
- Do not independently add features, alter the scope, choose paid services, or introduce new dependencies without a user request.
- Do not scaffold the entire application in one change. Keep work to one vertical slice or explicitly requested task.
- For non-trivial work, begin with a short plan and name the files likely to change. Continue through the agreed plan without waiting between checkpoints; pause only if the plan changes product scope or architecture.

## Current execution mode

Until the user explicitly requests learning mode, work autonomously through the active delivery plan. Ask for user intervention only when one of these is required:

- A product decision with materially different outcomes.
- Credentials, account access, domain ownership, or other user-owned external state.
- A paid service, a chargeable infrastructure resource, or a deployment to an external environment.
- A destructive or irreversible operation beyond normal project edits.
- User acceptance testing of a completed, externally visible workflow.

## Initial architecture (subject to change by the user)

- `backend/`: Java 21 and Spring Boot.
- `frontend/`: React/TypeScript UI, designed and implemented with Codex assistance.
- FFmpeg performs trim, fade, normalization, and export work.
- Start locally; deploy only after the local workflow is proven.
- Start audio-first. Authentication, payments, background queues, cloud storage, and video rendering are later milestones.

## Engineering rules

- Prefer a simple monolith and clear package boundaries over microservices.
- Keep media processing behind an interface so FFmpeg process execution can be mocked in tests.
- Never put secrets, real media, generated exports, or large binaries in Git.
- Validate all user-controlled paths, URLs, durations, file sizes, and process arguments.
- Use `ProcessBuilder` argument lists; never construct an FFmpeg shell command by string concatenation.
- Write or update focused tests with every behavior change when practical.
- Run the relevant build/test/lint commands and report their outcome before declaring work complete.
- Make small, descriptive Git commits only when asked by the user.
- Keep `docs/local-setup.md` current whenever a local or remote dependency, setup command, environment variable, deployment step, port, or infrastructure decision changes.

## UI rules

- The UI must make the core path obvious: add source → choose range → arrange → preview → export.
- Prefer accessible, responsive, calm interfaces over feature-heavy editor chrome.
- Before a substantial UI change, state the user flow and show a compact implementation plan.
- Avoid adding a component library unless requested; use a small, consistent local design system first.

## Learning mode — opt-in only

Use this section only when the user explicitly asks to learn or understand a change:

1. Explain the concepts and trade-offs before coding.
2. Break the task into small checkpoints.
3. Let the user implement backend changes when they want to; review their diff and give targeted feedback.
4. For UI work, implement only the requested slice and explain the important files, data flow, and how to verify it.
5. End with the next smallest useful task, not a large roadmap.

## Definition of done

A task is done only when the requested behavior works locally, relevant checks pass, the changed code is explainable, and the README or docs are updated if the developer workflow changed.
