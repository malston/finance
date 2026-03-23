# Paivot-Graph: Complete Software Delivery Lifecycle Guide

A practitioner's guide to the Paivot-Graph methodology -- from product idea through epic delivery -- as orchestrated by Claude Code.

---

## Table of Contents

1. [What Is Paivot-Graph?](#what-is-paivot-graph)
2. [The Three Pillars: Tools](#the-three-pillars-tools)
3. [The Outer Loop: Discovery Through Delivery](#the-outer-loop-discovery-through-delivery)
4. [Phase 1: Discovery & Framing (D&F)](#phase-1-discovery--framing-df)
5. [Phase 2: Backlog Creation](#phase-2-backlog-creation)
6. [Phase 3: Backlog Review (Anchor Gate)](#phase-3-backlog-review-anchor-gate)
7. [Phase 4: Execution Loop](#phase-4-execution-loop)
8. [Phase 5: Epic Completion Gate](#phase-5-epic-completion-gate)
9. [Phase 6: Retrospective & Knowledge Capture](#phase-6-retrospective--knowledge-capture)
10. [The Inner Loop: Story Delivery](#the-inner-loop-story-delivery)
11. [Backlog Maintenance & Bug Triage](#backlog-maintenance--bug-triage)
12. [Knowledge Management](#knowledge-management)
13. [User Interactions Reference](#user-interactions-reference)
14. [Worked Example: Financial Risk Monitor Staleness Policy](#worked-example-financial-risk-monitor-staleness-policy)
15. [Configuration & Tuning](#configuration--tuning)

---

## What Is Paivot-Graph?

Paivot-Graph is a Claude Code plugin (v1.47.0) that turns a single AI assistant into a full software delivery organization. It does this by orchestrating specialized AI agents through a structured methodology that enforces quality at every stage.

**The core insight:** Software delivery fails not because individual tasks are hard, but because coordination between planning, implementation, and review breaks down. Paivot-Graph solves this with structural enforcement -- gates that cannot be bypassed, agents that cannot see each other's work, and a dispatcher that never writes code itself.

**What you get:**

- A Balanced Leadership Team (BA, Designer, Architect) that asks you the right questions before building the wrong thing
- A Senior PM that translates requirements into self-contained stories so developers never need external context
- Ephemeral developer agents that implement one story at a time with proof of passing tests
- An adversarial Anchor reviewer that catches gaps before they become production incidents
- A git-native issue tracker that works across branches and worktrees
- An Obsidian-compatible knowledge vault that accumulates institutional memory across sessions

**What it replaces:** The ad-hoc pattern of "describe what you want, hope the AI builds it right, debug when it doesn't." Instead, you get a repeatable process where quality is structural, not aspirational.

---

## The Three Pillars: Tools

Paivot-Graph coordinates three CLI tools. Understanding what each does (and doesn't do) is essential.

### pvg -- The Orchestrator

`pvg` is the brain. It manages the execution loop, enforces scope guards, runs quality checks, and coordinates agent lifecycles.

| Command                      | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `pvg loop setup [--epic ID]` | Start the execution loop targeting an epic                  |
| `pvg loop next --json`       | Get the next dispatch decision (the SINGLE source of truth) |
| `pvg loop cancel`            | Stop the loop                                               |
| `pvg loop recover`           | Clean up after context compaction (mandatory)               |
| `pvg story deliver <id>`     | Mark a story as delivered                                   |
| `pvg story accept <id>`      | Accept a delivered story                                    |
| `pvg story reject <id>`      | Reject a story back to open                                 |
| `pvg lint`                   | Check backlog for artifact collisions (duplicate PRODUCES)  |
| `pvg rtm check`              | Requirement Traceability Matrix -- verify D&F coverage      |
| `pvg verify [paths]`         | Scan source files for stubs, thin files, TODOs              |
| `pvg doctor`                 | Diagnostic checks on vault configuration                    |
| `pvg settings [key=value]`   | View or change project settings                             |
| `pvg dispatcher on\|off`     | Toggle dispatcher mode                                      |

**Key concept:** When the execution loop is running, you don't decide what happens next -- `pvg loop next --json` does. It returns a JSON decision (`act`, `epic_complete`, `epic_blocked`, `wait`, `rotate`, `complete`) that tells the dispatcher exactly what to do. This prevents the common failure mode of cherry-picking work across epics or skipping review steps.

### nd -- The Issue Tracker

`nd` is a git-native issue tracker that stores stories as markdown files in a vault. It supports dependencies, labels, comments, epic hierarchies, and full-text search.

| Command                                       | Purpose                                         |
| --------------------------------------------- | ----------------------------------------------- |
| `nd create "title" --type=task --parent=EPIC` | Create a story under an epic                    |
| `nd list [--status X] [--parent X]`           | Query the backlog                               |
| `nd show <id>`                                | View a single story in full                     |
| `nd ready`                                    | Show unblocked, actionable stories              |
| `nd blocked`                                  | Show stories waiting on dependencies            |
| `nd dep add <story> <blocker>`                | Create a hard dependency                        |
| `nd dep cycles`                               | Detect circular dependencies (must return zero) |
| `nd graph [epic-id]`                          | Visualize dependency DAG                        |
| `nd labels add <id> delivered`                | Mark story as delivered                         |
| `nd close <id> --reason="..."`                | Close an accepted story                         |
| `nd epic status <id>`                         | Show epic progress                              |
| `nd epic close-eligible`                      | List epics ready to close                       |
| `nd update <id> --append-notes "..."`         | Add breadcrumb notes (compaction-safe)          |

**Key concept:** The nd vault lives in a branch-independent location (`$(git rev-parse --git-common-dir)/paivot/nd-vault`) so that multiple worktrees and branches share the same live backlog state. This is critical for parallel agent execution -- two developer agents on different branches must see the same story statuses.

### vlt -- The Knowledge Vault

`vlt` is a CLI for Obsidian-compatible vaults. It manages persistent knowledge that survives across sessions.

| Command                                                         | Purpose                     |
| --------------------------------------------------------------- | --------------------------- |
| `vlt vault="Claude" read file="Note Title"`                     | Read a vault note           |
| `vlt vault="Claude" search query="term"`                        | Search the vault            |
| `vlt vault="Claude" create name="..." path="..." content="..."` | Create a note               |
| `vlt vault="Claude" append file="..." content="..."`            | Append to a note            |
| `vlt vault=".vault/knowledge" ...`                              | Access project-scoped vault |

**Key concept:** Knowledge lives in two tiers. The global vault ("Claude") holds cross-project conventions and methodology. The project vault (`.vault/knowledge/`) holds project-specific decisions, patterns, and debug insights. System-scoped changes go through a proposal workflow; project-scoped changes are direct.

---

## The Outer Loop: Discovery Through Delivery

The full lifecycle has six phases. Each phase has a structural gate that must pass before the next begins.

```
Phase 1: Discovery & Framing (D&F)
   BA → Designer → Architect → [Optional: Specialist Challengers]
   Gate: Three documents produced (BUSINESS.md, DESIGN.md, ARCHITECTURE.md)
         │
Phase 2: Backlog Creation
   Sr PM creates epics and stories from D&F documents
   Gate: pvg lint + pvg rtm check pass (structural, deterministic)
         │
Phase 3: Backlog Review
   Anchor adversarially reviews the backlog
   Gate: Anchor returns APPROVED (binary -- no conditional pass)
         │
Phase 4: Execution Loop ←──────────────────────────────┐
   Developer implements → PM-Acceptor reviews → repeat  │
   Gate: All stories in epic accepted                    │
         │                                               │
Phase 5: Epic Completion                                 │
   E2e verification + Anchor milestone review + merge    │
   Gate: Tests pass + Anchor validates + merged to main  │
         │                                               │
Phase 6: Retrospective                                   │
   Extract learnings → vault notes → UAT script          │
   Then: rotate to next epic ─────────────────────────────┘
```

---

## Phase 1: Discovery & Framing (D&F)

**What:** Three specialized agents ask you questions until they understand the problem well enough to document it.

**Why:** Building software without understanding the problem produces software that solves the wrong problem. D&F forces the hard conversations -- "what does the user actually need?" "what are the real constraints?" "is this technically feasible?" -- before any code is written.

**How it works:**

### Step 1: Engage the BA

You describe what you want to build. The dispatcher spawns a Business Analyst agent.

```
You: "Use Paivot. I need a staleness policy for our scoring pipeline that
     handles weekends and market holidays."
```

The BA asks clarifying questions (at least one round, often 2-3):

```
BA (via dispatcher): "I have some questions before I can document this:
  1. What happens today when Friday's data is still the latest on Saturday?
  2. Are there specific regulatory requirements around data freshness?
  3. Who are the stakeholders that would see stale-data alerts?
  4. What does 'handled' mean -- suppress scores? show warnings? both?"
```

You answer. The BA may ask follow-up questions. When satisfied, the BA produces **BUSINESS.md** -- a document capturing business goals, constraints, success criteria, and non-functional requirements.

### Step 2: Engage the Designer

The dispatcher spawns a Designer agent with BUSINESS.md as input.

The Designer asks questions about user experience (at least 2 rounds, covering 4+ topics: user types, pain points, workflows, vision, constraints, patterns):

```
Designer (via dispatcher): "Based on BUSINESS.md, I have questions:
  1. When a user sees a stale score, what action should they take?
  2. Should the staleness indicator be per-domain or composite only?
  3. What time format do users expect -- relative ('2h ago') or absolute?
  4. Should alerts fire differently on weekends vs weekdays?"
```

You answer. The Designer produces **DESIGN.md** -- personas, journeys, design principles, interface specifications.

### Step 3: Engage the Architect

The dispatcher spawns an Architect agent with BUSINESS.md + DESIGN.md as input.

The Architect asks about technical feasibility and constraints:

```
Architect (via dispatcher): "Questions about implementation:
  1. Does the scoring pipeline currently track source timestamps?
  2. Is there an existing market calendar we can use?
  3. What's the database schema for score persistence?
  4. How is the alert evaluation currently triggered?"
```

You answer. The Architect produces **ARCHITECTURE.md** -- tech stack decisions, component design, data architecture, integration patterns.

### Optional: Specialist Review

If `pvg settings dnf.specialist_review=true`, each document gets an adversarial review:

1. BA-Challenger reviews BUSINESS.md for omissions, hallucinations, scope creep
2. Designer-Challenger reviews DESIGN.md for unmet user needs, contradictions
3. Architect-Challenger reviews ARCHITECTURE.md for untraceable decisions, drift

Each challenger returns APPROVED or REJECTED. Rejected documents loop back to the creator for revision (up to `dnf.max_iterations`, default 3). If still rejected after max iterations, remaining issues are escalated to you for a decision.

**Your interaction during D&F:** Answer questions. That's it. You don't write documents, make architecture decisions, or design interfaces. The agents do that work; you provide the domain knowledge they lack.

---

## Phase 2: Backlog Creation

**What:** The Sr PM agent reads all three D&F documents and creates a backlog of epics and stories.

**Why:** The gap between "we know what to build" and "developers can build it" is enormous. The Sr PM bridges that gap by creating self-contained stories where every piece of context a developer needs is embedded directly in the story -- no "see ARCHITECTURE.md section 4.2" references.

**How it works:**

The dispatcher spawns the Sr PM agent with BUSINESS.md + DESIGN.md + ARCHITECTURE.md.

The Sr PM follows a 7-phase process:

1. **Analyze D&F documents** -- extract goals, personas, constraints, architectural decisions
2. **Identify gaps** -- flag contradictions between documents, ask you to resolve
3. **Create epics** -- one per major theme, with embedded business/design/architecture context
4. **Create stories** -- vertical slices (not horizontal layers), each self-contained
5. **Verify coverage** -- every tagged requirement in D&F docs has a covering story
6. **Set dependencies** -- walking skeleton first, then feature slices
7. **Final checklist** -- INVEST compliance, terminology audit, zero dependency cycles

### Key principles enforced by the Sr PM:

**Self-contained stories:** A developer agent reads only the story. It never opens BUSINESS.md, DESIGN.md, or ARCHITECTURE.md. All relevant context is embedded.

**Walking skeleton first:** Every epic starts with a thin end-to-end slice that proves integration works before features are added.

**Vertical slices, not horizontal layers:** Each story delivers user-visible value. "Build the database layer" is wrong. "User can register and see confirmation" is right.

**E2e capstone story:** Every epic ends with an e2e integration test story (blocked by all other stories) that exercises the full system with no mocks.

**Boundary maps (PRODUCES/CONSUMES):** Each story declares what files/functions it creates (PRODUCES) and what it uses from upstream stories (CONSUMES). This creates a verifiable contract between stories.

### Structural gates (must pass before Anchor review):

```bash
pvg lint       # Checks for duplicate PRODUCES declarations across stories
pvg rtm check  # Verifies every tagged D&F requirement has a covering story
```

Both are deterministic. If they fail, the Sr PM fixes the backlog and re-runs them.

---

## Phase 3: Backlog Review (Anchor Gate)

**What:** The Anchor agent adversarially reviews the complete backlog.

**Why:** The Sr PM is the author. The Anchor is the skeptic. Having the same agent both create and review work is a conflict of interest. The Anchor catches systemic issues -- missing walking skeletons, horizontal layers masquerading as vertical slices, integration gaps, INVEST violations -- that the creator is blind to.

**How it works:**

The dispatcher spawns the Anchor agent with the full backlog.

The Anchor checks:

- Walking skeleton present in every milestone epic
- All stories are vertical slices (not horizontal layers)
- Integration tests required (no mocks in integration stories)
- E2e capstone story exists and is blocked by all other stories
- Stories are atomic (not touching >3 files or >2 architectural layers)
- D&F coverage is complete (every requirement represented)
- Mandatory skills annotated where applicable
- Zero dependency cycles
- Boundary maps (PRODUCES/CONSUMES) are consistent
- Terminology matches ARCHITECTURE.md exactly

The Anchor returns **APPROVED** or **REJECTED**. There is no conditional pass.

If rejected, the Anchor provides up to 5 prioritized issues (stated as general rules, not just instances). The Sr PM fixes all violations (applying the Feedback Generalization Protocol: for each issue, identify the general rule, sweep the entire backlog, fix all violations), then resubmits.

**Your interaction:** None during this phase. It's fully automated between Sr PM and Anchor.

---

## Phase 4: Execution Loop

**What:** Stories are implemented one at a time by ephemeral developer agents, then reviewed by ephemeral PM-Acceptor agents.

**Why:** This is where code gets written. The execution loop enforces a cadence: implement, prove it works, get it reviewed, move on. No story ships without evidence of passing tests. No story is accepted without independent review.

**How it works:**

### Starting the loop

```
You: "/piv-loop"          # Run all epics in priority order
You: "/piv-loop FRM-1twb" # Run a specific epic
```

The dispatcher calls `pvg loop setup` and enters the iteration cycle.

### Each iteration

1. The dispatcher calls `pvg loop next --json`
2. The response is a JSON decision:

| Decision        | Meaning              | Action                               |
| --------------- | -------------------- | ------------------------------------ |
| `act`           | Work is available    | Spawn developer or PM-Acceptor agent |
| `epic_complete` | All stories accepted | Run epic completion gate             |
| `epic_blocked`  | No actionable work   | Escalate to you                      |
| `wait`          | Agents are working   | Do nothing (background agents)       |
| `rotate`        | Epic gate passed     | Move to next epic                    |
| `complete`      | All epics done       | Celebrate                            |

3. Priority within the loop: **delivered stories first** (PM-Acceptor), then **rejected stories** (developer rework), then **ready stories** (new development)

### Concurrency limits

The loop respects stack-dependent limits to prevent resource exhaustion:

- **Heavy stacks** (Rust, iOS, C#, CloudFlare Workers): max 2 developers + 1 PM = 3 total
- **Light stacks** (Python, JS/TS): max 4 developers + 2 PMs = 6 total

### What you see during execution

The dispatcher reports status at natural milestones:

```
Dispatcher: "Developer agent claimed FRM-s4e8 (staleness-aware fetch).
            Working in worktree on branch story/FRM-s4e8."

Dispatcher: "FRM-s4e8 delivered. 12 tests passing. Spawning PM-Acceptor."

Dispatcher: "PM-Acceptor accepted FRM-s4e8. Closing story. 14/16 stories complete."

Dispatcher: "FRM-x0bk rejected. PM found: integration test uses mock instead of
            real DB. Returning to developer for rework."
```

**Your interaction during execution:** Mostly passive monitoring. You intervene when:

- A story is blocked and needs your input
- A developer reports a DISCOVERED_BUG that needs triage decisions
- The loop hits `epic_blocked` with no actionable work

---

## Phase 5: Epic Completion Gate

**What:** A three-step structural gate that validates the epic before merging to main.

**Why:** Individual story acceptance catches story-level issues. The epic gate catches integration issues -- tests that pass in isolation but fail together, boundary map violations that only surface when all stories are merged, and e2e paths that were never exercised.

**How it works:**

### Step 1: E2e Verification

```bash
pvg verify --check-e2e  # Must find > 0 e2e test files
# Full test suite runs (unit + integration + e2e)
# All tests must pass
```

### Step 2: Anchor Milestone Review

The Anchor agent (in milestone review mode) validates:

- E2e tests exist and were actually executed (not skipped)
- No mocks in integration or e2e tests
- Mandatory skills were consulted (from story annotations)
- Boundary maps (PRODUCES/CONSUMES) are satisfied
- Hard-TDD two-commit pattern verified (if applicable)

Returns **VALIDATED** or **GAPS_FOUND**.

### Step 3: Merge to Main

- If `workflow.solo_dev=true` (default): direct merge, push, clean up branches
- If `workflow.solo_dev=false`: create a PR for your approval

**Your interaction:** Approve the PR (if not solo_dev mode). Otherwise, this is automated.

---

## Phase 6: Retrospective & Knowledge Capture

**What:** After an epic completes, a Retro agent extracts learnings from all accepted stories and writes them to the knowledge vault.

**Why:** Lessons learned during implementation -- unexpected bugs, architectural insights, tool quirks -- are valuable but volatile. They live in conversation context that gets compacted away. The retro captures them as durable vault notes that future sessions can reference.

**How it works:**

The dispatcher spawns a Retro agent targeting the completed epic.

The Retro agent:

1. Reads all accepted stories and their delivery proof (raw data, not summaries)
2. Categorizes learnings: Testing, Architecture, Tooling, Process, External Dependencies, Performance, Hard-TDD
3. Writes vault notes to `.vault/knowledge/` with actionable frontmatter
4. Generates a UAT script (human-readable verification guide for the completed epic)

```
You: "/vault-capture"   # Manual trigger to capture session knowledge
```

**Your interaction:** Review the retro output. Optionally trigger additional knowledge capture with `/vault-capture`.

After the retro, `pvg loop next --json` returns `rotate`, and the loop moves to the next highest-priority epic.

---

## The Inner Loop: Story Delivery

Inside the execution loop, each story follows a precise lifecycle.

### Story States

```
open → in_progress → delivered → closed (accepted)
                         ↓
                    open + rejected (rework)
```

### Developer Agent Lifecycle (Ephemeral)

1. **Claim:** Developer reads the story (all context is embedded)
2. **Branch:** Creates `story/STORY-ID` branch from `epic/EPIC-ID`
3. **Implement:** Writes code and tests (following TDD if `hard-tdd` label)
4. **Verify:** Runs `pvg verify <changed-files>` to catch stubs/thin files
5. **Prove:** Runs full test suite, records output as proof
6. **Deliver:** `pvg story deliver <id>` (adds `delivered` label)
7. **Dispose:** Agent is destroyed (ephemeral -- no persistent state)

### PM-Acceptor Agent Lifecycle (Ephemeral)

1. **Review:** Reads the story's acceptance criteria and developer's proof
2. **Tier 1:** Runs `pvg verify` (deterministic -- catches stubs immediately)
3. **Tier 2:** Examines CI evidence (test results, coverage)
4. **Tier 3:** LLM judgment (does the implementation match the AC?)
5. **Tier 4:** Escalate to you (if unable to determine)
6. **Decision:**
   - **Accept:** `pvg story accept <id>` -- closes story, merges branch to epic, checks if epic is now complete
   - **Reject:** `pvg story reject <id> --feedback "..."` -- returns to open with detailed notes
7. **Dispose:** Agent is destroyed

### Rejection and Rework

When a story is rejected, the PM-Acceptor writes detailed feedback explaining what's wrong and what the next developer agent needs to fix. The rejected story gets priority in the next loop iteration (delivered > rejected > ready).

### Breadcrumb Notes (Compaction Safety)

Long-running stories may span context compactions. To preserve progress:

```bash
nd update <id> --append-notes "COMPLETED: fetch_latest_with_time. IN PROGRESS: alert gating. NEXT: e2e test."
```

These notes survive compaction and are read by the next developer agent via `pvg loop recover`.

---

## Backlog Maintenance & Bug Triage

### Adding Work Mid-Execution

Use the `/intake` command to add feedback or new requirements without disrupting the execution loop:

```
You: "/intake We need to handle market holidays, not just weekends."
```

The dispatcher collects context, delegates to the Sr PM, and presents new stories for your triage.

### Bug Discovery

Bugs found during execution follow a triage flow:

**Centralized (default):** Developer or PM-Acceptor produces a `DISCOVERED_BUG` block. The Sr PM creates a structured bug story with AC, finds the right epic, and sets dependencies.

**Fast-track** (opt-in via `pvg settings bug_fast_track=true`): PM-Acceptor can create P0 bugs directly with guardrails.

All bugs are Priority 0 (P0) -- they block the current epic.

### Backlog Health

```bash
pvg nd list --status=open       # Open work
pvg nd ready                    # Unblocked stories
pvg nd blocked                  # Blocked stories (with reasons)
pvg nd stale --days=14          # Neglected stories
pvg nd stats                    # Aggregate metrics
pvg nd dep cycles               # Must always return zero
```

---

## Knowledge Management

Paivot-Graph maintains institutional memory across three tiers:

| Tier    | Location                         | Scope            | Governance                                                  |
| ------- | -------------------------------- | ---------------- | ----------------------------------------------------------- |
| System  | Global Obsidian vault ("Claude") | All projects     | `/vault-evolve` (propose) + `/vault-triage` (accept/reject) |
| Project | `.vault/knowledge/` in repo      | One project      | Direct edits via `vlt`                                      |
| Session | `~/.claude/projects/*/memory/`   | One conversation | Managed by Claude Code                                      |

### What gets captured:

- **Decisions:** "We chose 66h off-hours staleness to cover full weekends" (with rationale)
- **Patterns:** "Time-bounded DB queries prevent stale data from entering the scoring pipeline"
- **Debug insights:** "psycopg2 INTERVAL parameterization requires explicit casting"
- **Project context:** "Finnhub free tier doesn't support historical candles"

### When to capture:

- After making a non-obvious decision
- After solving a non-obvious bug
- After discovering a reusable pattern
- After a retro completes an epic

### Commands:

```
You: "/vault-capture"    # Capture knowledge from current session
You: "/vault-evolve"     # Refine existing vault content
You: "/vault-triage"     # Review pending proposals in _inbox/
You: "/vault-status"     # Health check -- note counts, pending proposals
```

---

## User Interactions Reference

Here's every way you interact with Paivot-Graph, organized by phase.

### Starting a Project

| You say                                | What happens                           |
| -------------------------------------- | -------------------------------------- |
| "Use Paivot. [describe what you want]" | Enters dispatcher mode, spawns BA      |
| "Use Paivot, light D&F. [describe]"    | Fewer questioning rounds, same process |
| "Skip D&F. Here's the backlog..."      | Direct to Sr PM (brownfield projects)  |

### During D&F

| You say                                  | What happens                                        |
| ---------------------------------------- | --------------------------------------------------- |
| [Answer BA/Designer/Architect questions] | Agent incorporates answers, may ask follow-ups      |
| "That's out of scope"                    | Agent adjusts document boundaries                   |
| "I don't know, use your judgment"        | Agent makes a decision and documents the assumption |

### Backlog Phase

| You say                  | What happens                           |
| ------------------------ | -------------------------------------- |
| [Review backlog summary] | Sr PM presents epics and story counts  |
| "Add a story for X"      | Sr PM creates an additional story      |
| "Split this epic"        | Sr PM restructures                     |
| "Remove this"            | Sr PM removes and adjusts dependencies |

### Execution Phase

| You say                      | What happens                           |
| ---------------------------- | -------------------------------------- |
| `/piv-loop`                  | Start unattended execution loop        |
| `/piv-loop FRM-abc`          | Target a specific epic                 |
| `/piv-cancel-loop`           | Stop the loop                          |
| "Pick the next ready story"  | Manual story assignment (outside loop) |
| "Review the delivered story" | Manual PM-Acceptor spawn               |

### Maintenance

| You say                  | What happens              |
| ------------------------ | ------------------------- |
| `/intake [feedback]`     | Add work to backlog       |
| `/vault-capture`         | Capture session knowledge |
| `/vault-status`          | Check vault health        |
| `/vault-triage`          | Review pending proposals  |
| `pvg settings key=value` | Change project settings   |

### Settings That Matter

| Setting                 | Default | Purpose                               |
| ----------------------- | ------- | ------------------------------------- |
| `workflow.solo_dev`     | true    | Direct merge vs PR on epic completion |
| `dnf.specialist_review` | false   | Enable D&F challenger agents          |
| `dnf.max_iterations`    | 3       | Max challenger review rounds          |
| `bug_fast_track`        | false   | Let PM-Acceptor create bugs directly  |
| `architecture.c4`       | false   | Enable C4 architecture diagrams       |

---

## Worked Example: Financial Risk Monitor Staleness Policy

This example traces the actual delivery of the "Time-Aware Staleness Policy" feature through the Paivot-Graph lifecycle in the financial-risk-monitor project. It shows how the methodology works in practice.

### Context

The Financial Risk Monitor scores systemic market risk across four domains every 5 minutes. On weekends, scoring would fail because Friday's data exceeded the 2-hour staleness window. The project needed a time-aware policy that relaxes staleness during off-hours.

### Phase 1: Discovery & Framing

**User input:**

> "The scoring pipeline needs to handle weekends. Friday's data should produce scores through Monday morning."

**BA questions (round 1):**

- What happens today when Friday's data is stale? (Scorers return None, dashboard shows "--")
- Are market holidays a concern? (No, just weekends for now)
- Who sees the impact? (Internal dashboard users)

**BA output:** BUSINESS.md documenting the weekend scoring gap, stakeholder impact, and success criteria ("scores remain visible through Monday opening").

**Designer questions:**

- Should the dashboard show when data is from Friday? (Yes, "as of" timestamps)
- Should alerts fire on weekends? (No, suppress false alerts)
- Per-domain or composite staleness display? (Per-domain)

**Designer output:** DESIGN.md with "as of" timestamp display design, per-domain freshness indicators, alert suppression UX.

**Architect questions:**

- Where is staleness currently checked? (`fetch_latest_with_time` in scorers)
- Is there a market calendar? (No, use simple day-of-week + time logic)
- Where should the window config live? (YAML, alongside existing scoring config)

**Architect output:** ARCHITECTURE.md with `is_market_hours()` function design, 66-hour off-hours window calculation, `scoring_config.yaml` staleness block schema, `data_time` parameter for score writes.

### Phase 2: Backlog Creation

The Sr PM read all three documents and created epic **FRM-1twb** ("Time-Aware Staleness Policy") with 16 stories:

| #   | Story                                                        | Type           |
| --- | ------------------------------------------------------------ | -------------- |
| 1   | Walking skeleton: `is_market_hours()` + config-driven window | Vertical slice |
| 2   | `get_staleness_hours()` returning market/off-hours values    | Feature        |
| 3   | Integrate staleness hours into `_run_scoring_pass`           | Feature        |
| 4   | Private credit scorer uses staleness window                  | Feature        |
| 5   | AI concentration scorer uses staleness window                | Feature        |
| 6   | Energy/geo scorer uses staleness window                      | Feature        |
| 7   | Contagion scorer uses staleness window                       | Feature        |
| 8   | Composite scorer passes through staleness                    | Feature        |
| 9   | `write_score(data_time=)` preserves source timestamps        | Feature        |
| 10  | Alert evaluation gated behind `is_market_hours()`            | Feature        |
| 11  | `format-score-age.ts` for "as of" display                    | Feature        |
| 12  | Dashboard per-domain timestamp display                       | Feature        |
| 13  | Weekend staleness Playwright e2e test                        | Feature        |
| 14  | Unit tests for `is_market_hours()` edge cases                | Testing        |
| 15  | Unit tests for `get_staleness_hours()`                       | Testing        |
| 16  | **E2e capstone: full pipeline staleness test**               | Capstone       |

**Key structural choices:**

- Walking skeleton first (story 1) proves the config-to-scorer integration
- Vertical slices: each scorer story delivers a working scorer, not a "database layer"
- E2e capstone (story 16) blocked by all 15 other stories
- Every story embeds relevant architecture decisions (66h window, `data_time` parameter, YAML schema)

**Structural gates passed:**

```bash
pvg lint       # No artifact collisions
pvg rtm check  # All D&F requirements covered
```

### Phase 3: Anchor Review

The Anchor reviewed the backlog and returned **APPROVED** on the first pass. (In practice, the Anchor might reject and iterate -- here the Sr PM's pre-submission checklist caught issues beforehand.)

### Phase 4: Execution

The loop processed stories in dependency order:

```
Iteration 1: Developer implements is_market_hours() + config loading
  → 8 unit tests pass, delivered, PM-Acceptor accepts

Iteration 2-3: Two scorers in parallel (private_credit, ai_concentration)
  → Each delivered with tests, accepted

Iteration 4-5: Two more scorers (energy_geo, contagion)
  → energy_geo rejected: scorer returns None when CL=F data missing
  → Developer reworks with minimum_components threshold
  → Redelivered, accepted

...iterations 6-15: remaining stories...

Iteration 16: E2e capstone (all blockers resolved)
  → Developer writes test_e2e_staleness.py
  → 9 e2e tests against real TimescaleDB
  → Delivered, PM-Acceptor reviews
```

**Bug discovered during execution:** Backfill script missing commodity tickers (CL=F, NG=F). Sr PM triaged as P0 bug, developer fixed, accepted.

**Code review feedback:** PR #24 received 8 Copilot comments + 11 comprehensive review findings. Fixed in two commit rounds (f341c30, 21d5739).

### Phase 5: Epic Completion

```bash
pvg verify --check-e2e           # Found test_e2e_staleness.py (9 tests)
python -m pytest -v              # 293 tests pass (280 unit + 4 integration + 9 e2e)
# Anchor milestone review: VALIDATED
# Merged to main via PR #22
```

### Phase 6: Retrospective

Learnings captured to vault:

- **Decision:** "66h off-hours staleness covers full weekend" (with calculation: Fri 4PM to Mon 9:30AM = 65.5h, rounded to 66h)
- **Decision:** "Per-domain timestamps expose true staleness" (dashboard shows source time, not wall clock)
- **Pattern:** "Time-bounded DB queries prevent stale data scoring"
- **Debug:** "Finnhub quotes use exchange timestamps not wall clock"
- **Debug:** "psycopg2 INTERVAL parameterization pitfall" (requires explicit casting)

### Value Delivered

| Without Paivot-Graph                                   | With Paivot-Graph                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| "Make weekends work" -- vague, one-shot implementation | 3 D&F documents capturing business, design, and architecture decisions |
| Ad-hoc implementation, missed edge cases               | 16 stories with explicit AC, caught energy/geo minimum_components gap  |
| No test strategy upfront                               | 9 e2e tests + 280 unit tests, all against real database                |
| Knowledge lost when conversation ends                  | 6 vault notes preserving decisions, patterns, debug insights           |
| "It works on my machine"                               | Structural gates: lint, RTM, verify, Anchor review                     |

---

## Configuration & Tuning

### First-Time Setup

```bash
# Install tools (via mise or go install)
mise install pvg nd vlt

# Initialize project vault
pvg nd root --ensure

# Seed vault with methodology
pvg seed

# Check health
pvg doctor
```

### Per-Project Settings

```bash
pvg settings                          # View all
pvg settings workflow.solo_dev=true   # Direct merge (solo developer)
pvg settings dnf.specialist_review=false  # Skip D&F challengers (faster)
pvg settings bug_fast_track=false     # Centralized bug triage
```

### Recovery After Context Compaction

Claude Code compacts context as it approaches limits. After compaction:

```bash
pvg loop recover  # MANDATORY -- cleans up orphaned agents, resets stuck stories
```

The loop recover command removes agent worktrees, deletes merged branches, resets orphaned `in_progress` stories to `open`, and outputs a recovery summary so the dispatcher can resume.

### Worktree Isolation

For parallel developer agents, each gets an isolated git worktree:

```
main repo: /project/
worktree 1: /project/.claude/worktrees/agent-1/ (branch: story/FRM-s4e8)
worktree 2: /project/.claude/worktrees/agent-2/ (branch: story/FRM-x0bk)
```

The nd vault is shared (branch-independent), but code changes are isolated.

---

## Summary: Why This Works

Paivot-Graph succeeds because it makes quality structural rather than aspirational:

1. **Separation of concerns:** The agent that writes code never reviews it. The agent that creates stories never approves the backlog. The dispatcher never writes code.

2. **Gates, not guidelines:** `pvg lint` doesn't suggest fixing artifact collisions -- it blocks execution until they're fixed. The Anchor doesn't recommend changes -- it returns APPROVED or REJECTED.

3. **Self-contained stories:** Developers never read external documents. Every piece of context is embedded. This eliminates the most common failure mode: "I didn't know about that requirement."

4. **Ephemeral agents:** Developer and PM-Acceptor agents are spawned for one story and destroyed. No accumulated bias, no context bleed between stories.

5. **Compaction-safe state:** The nd vault, breadcrumb notes, and knowledge vault all survive context compaction. The conversation may be forgotten; the work is not.

6. **Knowledge accumulation:** Every session leaves the project smarter. Decisions are documented. Bugs are catalogued. Patterns are reusable. The next session starts with institutional memory, not a blank slate.
