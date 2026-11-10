---
name: feature-plan
description: Investigate a feature idea for boltzmann4d and, if the user wants to go ahead, file a GitHub issue with the feature request plus an attached implementation plan. Read-only; never changes code. Use when the user says "/feature-plan", "suggest a feature", "plan a feature", "should we add X", or "write up an issue for X".
---

# Feature suggestion and planning

Turn a feature idea into a researched GitHub issue with an implementation plan attached. The output is an issue and a plan, never code.

## Hard rule: read-only

- Do not edit, create or delete files in the repo, and do not commit, branch, push or open PRs. That includes `.agents/plans/`: whoever implements the issue copies the plan there.
- Shell commands are for reading only (`git log`, `grep`, `gh issue list`, …). Do not run installs, builds, formatters or tests that write files.
- The only things this skill creates are the GitHub issue, its plan comment, and (if available) a private plan artifact. Scratch files go in the agent's scratchpad or temp directory, never the repo.

## Workflow

**1. Understand the idea.** If the user gave no idea, ask for one. If they asked for suggestions instead, propose 3–5 candidates drawn from `docs/specs/` requirements not yet built, active plans in `.agents/plans/`, open issues, and gaps against the Java app in `vendor/boltzmann3d`, then let them pick one.

**2. Investigate.** Read before proposing:

- `AGENTS.md` (stack, layout, UI and porting rules).
- The relevant spec in `docs/specs/` (start from its `README.md`); collect the requirement IDs (`SIM-3`, `STAT-12`, …) that apply.
- Active plans in `.agents/plans/` and archived ones that touch the same area; note overlaps and dependencies.
- Open and closed issues: `gh issue list --state all --search "<keywords>"`. If one already covers the idea, say so and offer to extend it instead of filing a duplicate.
- The current code in `packages/` and `apps/web/`, and the Java reference in `vendor/boltzmann3d/src/edu/byu/chem/boltzmann/` if the feature exists there.
- For broad sweeps, delegate the reading to a read-only search subagent and keep only its conclusions.

**3. Report and ask.** Give the user a short write-up in chat:

- What the feature is and who it helps (teacher, student, developer).
- What exists today, with file links, and the spec IDs it covers.
- One recommended approach, with the main alternatives and why not.
- Rough size, risks (physics parity, worker protocol, performance, mobile/touch), and open questions.

Then ask whether to file it. Stop here if they say no or want changes; iterate on the write-up until they say go. Filing is publishing, so never create the issue without an explicit yes.

**4. File the issue.** Create it with `gh issue create` (or the GitHub MCP tools), label `enhancement` (plus `accessibility`, `documentation`, … where they fit). Write the body to a scratch file and pass `--body-file`. Body shape, following existing issues such as joshuata/boltzmann4d#46:

```markdown
<One paragraph: what the user can do after this ships, and why it matters.>

## Proposal

<The recommended approach and the key reasons for it.>

## Shape of the work

- **<Area>:** <what changes, at the level of packages and behaviour>
- ...

Depends on <plans/issues>. Relates to <spec IDs> in `docs/specs/<file>.md`.

The detailed implementation plan is attached below.
```

**5. Attach the plan.** Write the plan in the same shape as `.agents/plans/*.md`, so it can be dropped in there later:

```markdown
# NNNN: <Title>

_Not started._ Tracked in joshuata/boltzmann4d#<issue>. <Dependencies.>

## Goal

<Outcome in user terms, citing spec IDs.>

## Decisions

- <Each decision and why; mark ones still needing the user's call.>

## Steps

1. <Ordered, independently landable steps: files/packages touched, what done looks like.>

## Testing

- <Unit tests, parity tests (`mise run test:parity`) if physics changes, benchmarks if hot paths change, manual checks in the browser at phone and desktop widths.>

## Open questions

- <...>
```

Leave `NNNN` as is; the implementer picks the next free number. Then attach it in both places:

- **Issue comment (always):** `gh issue comment <n> --body-file <plan>`, so the plan lives on GitHub for any agent.
- **Artifact (when the agent has an Artifact/publish tool):** publish the plan as a private artifact page titled "Plan: <title>", and edit the issue body's last line to link it (`gh issue edit <n> --body-file …`). Tell the user the link is private until they share it.

**6. Finish.** Reply with the issue URL, the plan comment URL and the artifact URL, and nothing else to do: no branch, no code.

## Writing style

- Plain, short sentences; soft-wrapped Markdown (no hard line breaks in prose).
- Cite files as repo paths and requirements by spec ID; refer to issues as `joshuata/boltzmann4d#N`.
- Respect the project rules the plan must follow: engine stays pure, physics changes keep parity green, sidebar data flows through `SimulationClient`, controls come from `@boltzmann4d/ui`.
