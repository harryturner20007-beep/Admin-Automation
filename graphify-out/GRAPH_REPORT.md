# Graph Report - scratch-2026-11-11-5ef699  (2026-11-13)

## Corpus Check
- 190 files · ~254,345 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: .csv 37, (none) 2, .example 1)

## Summary
- 1780 nodes · 5144 edges · 79 communities (67 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 80 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `02f4df0d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- jobs.ts
- design_system.py
- JobsView.tsx
- test_skill_script_paths.py
- types.ts
- validate_data.py
- queue.ts
- test_data_contracts.py
- followup-settings.test.ts
- search_stack
- Primitives
- QuotePanel.tsx
- time.ts
- format_ascii_box
- store.ts
- NoFollowUpsDue.tsx
- test_data_contracts.py
- store.tsx
- OverviewView.tsx
- Step 4: Generate the DNA
- Hosting and handover
- auth.ts
- domain/sms.ts
- search
- server/workspace.ts
- engine.ts
- seed.ts
- BM25
- inbound/route.ts
- test_design_system_mode.py
- intake.ts
- AddQuoteDrawer.tsx
- Build plan — Quote Follow-up (independent UK garages)
- package.json
- Grid
- server/sms.ts
- Layout and blocks, in order
- ChatsView.tsx
- compilerOptions
- UI/UX Pro Max - Design Intelligence
- ui.tsx
- Design DNA Reference
- app/page.tsx
- CatalogRefreshTest
- Design DNA: Quote Follow-up
- Semantics
- database.test.ts
- InvoicesView.tsx
- Pre-Delivery Checklist (canonical — the only one)
- Quick Reference
- Motion
- Procedure
- Procedure
- DNA.md
- dependencies
- TestTextLayoutDataContracts
- TestThresholdGate
- Workflow components (quote → job → invoice)
- Principles
- lib/invoicePdf.ts
- scripts
- CatalogSummaryLineEndingsTest
- jobs.ts
- Quote list (summary cards, toolbar, table, mobile cards)
- eslint.config.mjs
- proxy.ts
- TestStackFlagWithDesignSystem
- RtlCliTest
- SyncQueue
- 1. Product Mental Model
- TestFixtureValidation
- TestMetricMath
- Color Semantics
- DESIGN DNA: Command Reference
- State Communication
- vercel.json
- AGENTS.md
- Shell, empty states and outcome recording

## God Nodes (most connected - your core abstractions)
1. `useDemo()` - 60 edges
2. `Button()` - 59 edges
3. `search()` - 54 edges
4. `QuotePanel()` - 48 edges
5. `Icon()` - 47 edges
6. `log()` - 45 edges
7. `inputClass()` - 43 edges
8. `AppState` - 42 edges
9. `useAction()` - 41 edges
10. `InlineFeedback()` - 40 edges

## Surprising Connections (you probably didn't know these)
- `Reduced Motion` --references--> `motionAllowed()`  [INFERRED]
  .design/behaviors.md → src/components/motion.tsx
- `Non-negotiables (from the project's Design DNA, `.design/` and `CLAUDE.md`)` --references--> `motionAllowed()`  [INFERRED]
  prompts/quotes-motion-polish.md → src/components/motion.tsx
- `Still required for live, unattended follow-ups` --references--> `runScheduledCheck()`  [INFERRED]
  PROGRESS.md → src/domain/automation.ts
- `How "Keep me signed in on this device" works` --references--> `signOut()`  [INFERRED]
  docs/HOSTING.md → src/server/auth.ts
- `UI redesign (2026-11-11, same branch)` --references--> `useAction()`  [INFERRED]
  PROGRESS.md → src/demo/store.tsx

## Import Cycles
- 2-file cycle: `src/domain/engine.ts -> src/domain/invoices.ts -> src/domain/engine.ts`
- 2-file cycle: `src/domain/engine.ts -> src/domain/jobs.ts -> src/domain/engine.ts`
- 3-file cycle: `src/domain/engine.ts -> src/domain/jobs.ts -> src/domain/invoices.ts -> src/domain/engine.ts`

## Communities (79 total, 12 thin omitted)

### Community 0 - "jobs.ts"
Cohesion: 0.13
Nodes (30): buildSeed(), AUTOMATIC_APPROVER, insertOutboundOnce(), markCompleted(), newId(), checkInvoiceGate(), allocateNumber(), cancelInvoice() (+22 more)

### Community 1 - "design_system.py"
Cohesion: 0.07
Nodes (11): _detect_page_type(), format_page_override_md(), generate_design_system(), _generate_intelligent_overrides(), persist_design_system(), safe_slug(), _write_persisted_file(), format_output() (+3 more)

### Community 2 - "JobsView.tsx"
Cohesion: 0.15
Nodes (42): instant, metadata, SettingsPage(), ActionButton(), Props, InviteColleagueForm(), BookJobForm(), BusinessSettings() (+34 more)

### Community 3 - "test_skill_script_paths.py"
Cohesion: 0.38
Nodes (3): resolve(), shipped_invocations(), SkillScriptPathsTest

### Community 4 - "types.ts"
Cohesion: 0.13
Nodes (17): GateInput, GateReason, OUTCOME_LABEL, HOUR_MS, AuditEvent, BookingState, InvoiceContent, InvoiceStatus (+9 more)

### Community 5 - "validate_data.py"
Cohesion: 0.07
Nodes (43): read_rows(), TestAccessibilityGuidance, TestChartsTypographyAndIcons, TestCurrentReactGuidance, TestSemanticColors, _catalog_date(), _check_app_interface_contract(), _check_catalog_contract() (+35 more)

### Community 6 - "queue.ts"
Cohesion: 0.11
Nodes (40): CalendarPage(), instant, metadata, CalendarView(), dayLabel(), ItemRow(), KIND, KINDS (+32 more)

### Community 7 - "test_data_contracts.py"
Cohesion: 0.14
Nodes (6): read_rows(), split_values(), style_identities(), TestGeneratedCatalogContract, TestLandingAndStackContract, TestStyleIdentityContract

### Community 8 - "followup-settings.test.ts"
Cohesion: 0.10
Nodes (29): Follow-up settings, automatic sending, Replies and Results redesign (2026-11-12), QUOTE, SENT, STEPS, DAY_NAMES, MODES, renderTemplate(), setGaragePaused() (+21 more)

### Community 9 - "search_stack"
Cohesion: 0.04
Nodes (24): _exact_match_diagnostic(), _exact_row_identity(), _exact_stack_identifier(), _legacy_successor_guidance(), _normalize(), _normalize_rtl_level(), _passes_threshold(), _project_row() (+16 more)

### Community 10 - "Primitives"
Cohesion: 0.06
Nodes (35): Base Size, Base Unit, Border Radius Scale, Border Width Scale, Color, Component Size Scale, Duration Scale, Easing Functions (+27 more)

### Community 11 - "QuotePanel.tsx"
Cohesion: 0.11
Nodes (44): gsap, instant, metadata, QuotesPage(), Home(), Tick(), queueReply(), HeroPreview() (+36 more)

### Community 12 - "time.ts"
Cohesion: 0.13
Nodes (30): invoiceSendKey(), invoiceWindow(), minutes(), nextOpening(), openWindowFrom(), StepWindow, stepWindow(), DeliveryTone (+22 more)

### Community 13 - "format_ascii_box"
Cohesion: 0.13
Nodes (9): ansi_ljust(), format_ascii_box(), add_wrapped(), wrap_text(), format_markdown(), hex_to_ansi(), _mode_support_labels(), section_header() (+1 more)

### Community 14 - "store.ts"
Cohesion: 0.16
Nodes (17): GET(), GET(), PRIVATE, GET(), HEADERS, SendReportItem, Invoice, issuedInvoicePdf() (+9 more)

### Community 15 - "NoFollowUpsDue.tsx"
Cohesion: 0.28
Nodes (7): animate.css@^4.1.1, three@^0.187.0, animate.css, three, hasWebGL(), NoFollowUpsDue(), Vehicle()

### Community 16 - "test_data_contracts.py"
Cohesion: 0.07
Nodes (8): DesignSystemGenerator, _resolve_dial(), apply_decision_rules(), _object_without_duplicates(), parse_decision_rules(), _validate_action(), TestReasoningMatch, TestReasoningContract

### Community 17 - "store.tsx"
Cohesion: 0.12
Nodes (22): LoadingSkeleton(), COLLECTIONS, Ctx, DemoCtx, demoDispatch(), DemoProvider(), dispatchDemo(), drafted() (+14 more)

### Community 18 - "OverviewView.tsx"
Cohesion: 0.20
Nodes (17): instant, metadata, OverviewPage(), greeting(), ICON, Kpi(), OverviewView(), SHORT (+9 more)

### Community 19 - "Step 4: Generate the DNA"
Cohesion: 0.07
Nodes (29): 1a. Detect Tech Stack, 1b. Scan Existing Code, 1c. Check for Existing Design Documentation, 1d. Check for Figma, 1e. Build Internal Baseline, 3a. Report What You Found, 3b. Ask for Existing Design Materials, 3c. Ask High-Level Questions (+21 more)

### Community 20 - "Hosting and handover"
Cohesion: 0.07
Nodes (26): 1. Accounts you need (and costs, checked November 2026; confirm on each pricing page), 2. Create the Supabase project, 3. Deploy on Vercel, 4. Make yourself platform admin, onboard the first garage, 5. Security model (what protects what), 6. Backups and restore, 7. Errors and monitoring, 8. Known limits (+18 more)

### Community 21 - "auth.ts"
Cohesion: 0.05
Nodes (79): nextConfig, next, AdminLoginPage(), instant, metadata, AdminPage(), date(), instant (+71 more)

### Community 22 - "domain/sms.ts"
Cohesion: 0.15
Nodes (12): twilio, smsSegments(), Claim, LedgerProvider, SendLedger, SendRequest, SendResult, SmsProvider (+4 more)

### Community 23 - "search"
Cohesion: 0.07
Nodes (7): search(), TestSearchDomains, TestImeGuidance, read_rows(), RtlDataContractTest, RtlFilterTest, TestStyleTaxonomy

### Community 24 - "server/workspace.ts"
Cohesion: 0.42
Nodes (9): AppLayout(), migrateState(), load(), write(), currentMember(), Loaded, loadWorkspace(), saveWorkspace() (+1 more)

### Community 25 - "engine.ts"
Cohesion: 0.09
Nodes (42): Done in Phase 1, approveAndSendAll(), emptyState(), reply(), applyDeliveryStatus(), approveMessage(), CATEGORY_TASK, CheckOutcome (+34 more)

### Community 26 - "seed.ts"
Cohesion: 0.10
Nodes (33): vitest, buildSeedState(), DEMO_GARAGE_ID, DEMO_STAFF, DEMO_START, garage, more, seedQuotes (+25 more)

### Community 27 - "BM25"
Cohesion: 0.06
Nodes (17): BM25, _contains_phrase(), detect_domain(), _domain_keywords(), _file_signature(), _get_bm25(), _load_csv(), _load_csv_snapshot() (+9 more)

### Community 28 - "inbound/route.ts"
Cohesion: 0.39
Nodes (6): POST(), XML, POST(), twilioErrorText(), EMPTY_TWIML, verifyTwilio()

### Community 29 - "test_design_system_mode.py"
Cohesion: 0.06
Nodes (16): _button_outline_text_color(), _contrast_ratio(), _derive_dark_palette(), _filter_anti_patterns_for_mode(), format_master_md(), _palette_is_dark(), _query_wants_dark(), _relative_luminance() (+8 more)

### Community 30 - "intake.ts"
Cohesion: 0.16
Nodes (22): AddQuoteDrawer(), EMPTY, Form, KIND_LABEL, addCatalogueItem(), addQuote(), catalogueErrors(), FieldErrors (+14 more)

### Community 31 - "AddQuoteDrawer.tsx"
Cohesion: 0.18
Nodes (29): InvoiceDocument(), Changes(), CompletionForm(), JobPanel(), LinesList(), KIND, QuoteWork(), SavedServicePicker() (+21 more)

### Community 32 - "Build plan — Quote Follow-up (independent UK garages)"
Cohesion: 0.25
Nodes (7): Build plan — Quote Follow-up (independent UK garages), Design principle, Phase 1 — Clickable sales demo (this session), Phase 2 — Staff pilot, Phase 3 — Live SMS and deployment, Phase 4 — Reporting and optional AI, Still needs a real account or live verification (owner: you)

### Community 33 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, tailwindcss@4.3.3, @tailwindcss/turbopack@4.3.3, @types/node@^24.19.2, @types/react@^19, @types/react-dom@^19, @types/three@^0.187.0, typescript@^5 (+11 more)

### Community 35 - "Grid"
Cohesion: 0.11
Nodes (18): Breakpoints, Color Modes, Columns, Default Mode, Density, Grid, Gutters, Mapping Strategy (+10 more)

### Community 36 - "server/sms.ts"
Cohesion: 0.24
Nodes (20): How it works, normaliseUkMobile(), deliveryLabel(), approveAndSendText(), checkWithProvider(), connectSmsNumber(), ConnectState, member() (+12 more)

### Community 37 - "Layout and blocks, in order"
Cohesion: 0.11
Nodes (18): 10) Toast (`Toast.tsx`), 1) Shell (`Shell.tsx`), 2) Page header, 3) Automation strip, 4) Summary cards (Needs follow-up · Awaiting reply · Accepted), 5) List toolbar, 6) Quote table (768px and up) and quote cards (below 768px), 7) Detail panel (`QuotePanel.tsx`) (+10 more)

### Community 38 - "ChatsView.tsx"
Cohesion: 0.05
Nodes (58): Known limitations (deliberate for Phase 1), Needs you (not doable by Claude), Next: Phase 2 (staff pilot), Product redesign, quote intake and simulated automation (2026-11-11, same branch), Progress, Status: Phase 1 done (2026-11-11), Phase 2 not started, Still required for live, unattended follow-ups, UI redesign (2026-11-11, same branch) (+50 more)

### Community 39 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 40 - "UI/UX Pro Max - Design Intelligence"
Cohesion: 0.11
Nodes (17): Before Delivering App UI, Example Workflow, If a search returns 0 results, Output Formats, Query Contract, Rule Categories by Priority, Running the search tool, Step 1: Analyze User Requirements (+9 more)

### Community 41 - "ui.tsx"
Cohesion: 0.14
Nodes (15): react, ResetDemo(), Shell(), SyncBadge(), TABS, User, Toast(), IconName (+7 more)

### Community 42 - "Design DNA Reference"
Cohesion: 0.12
Nodes (15): Colors, Components, Deep Reference, Design DNA Reference, Design System, Forbidden, Layout, Motion (+7 more)

### Community 43 - "app/page.tsx"
Cohesion: 0.15
Nodes (20): FEATURES, metadata, STEPS, FAQ, INCLUDED, metadata, PricingPage(), STEPS (+12 more)

### Community 45 - "Design DNA: Quote Follow-up"
Cohesion: 0.13
Nodes (15): 10. Tech Stack & Libraries, 11. References, 2. Design Principles, 3. Primitives, 4. Scales & Systems, 5. Semantics, 6. Components, 7. Patterns (+7 more)

### Community 46 - "Semantics"
Cohesion: 0.13
Nodes (14): Body Variants, Code Usage, Component External Margins, Component Internal Padding, Component-to-Elevation Mapping, Elevation Semantics, Heading Levels, Layout Gaps (+6 more)

### Community 47 - "database.test.ts"
Cohesion: 0.29
Nodes (4): @electric-sql/pglite@^0.5.16, @electric-sql/pglite, as(), save()

### Community 48 - "InvoicesView.tsx"
Cohesion: 0.13
Nodes (18): instant, InvoicesPage(), metadata, CARDS, dayLabel(), Filter, InvoiceRow(), InvoicesView() (+10 more)

### Community 49 - "Pre-Delivery Checklist (canonical — the only one)"
Cohesion: 0.15
Nodes (12): Accessibility, Common Rules for Professional UI + Pre-Delivery Checklist, Icons & Visual Elements, Interaction, Interaction (App), Layout, Layout & Spacing, Light/Dark Mode (+4 more)

### Community 50 - "Quick Reference"
Cohesion: 0.15
Nodes (12): 10. Charts & Data (LOW), 1. Accessibility (CRITICAL), 2. Touch & Interaction (CRITICAL), 3. Performance (HIGH), 4. Style Selection (HIGH), 5. Layout & Responsive (HIGH), 6. Typography & Color (MEDIUM), 7. Animation (MEDIUM) (+4 more)

### Community 51 - "Motion"
Cohesion: 0.15
Nodes (12): Behaviors, Click / Tap, Enter / Exit Animations, Focus Management, Hover, Interaction Feedback, Keyboard Navigation, Micro-Interactions (+4 more)

### Community 52 - "Procedure"
Cohesion: 0.17
Nodes (11): Compressed Reference Staleness Check, DESIGN DNA: Check, Monorepo Awareness, Parse Arguments, Procedure, Rules, Step 1: Load the Design DNA, Step 2: Identify Target Files (+3 more)

### Community 53 - "Procedure"
Cohesion: 0.17
Nodes (11): DESIGN DNA: Update DNA, Parse Arguments, Procedure, Rules, Step 1: Read Current DNA, Step 2: Gather Input, Step 3: Interpret the Feedback, Step 4: Apply the Update (+3 more)

### Community 57 - "DNA.md"
Cohesion: 0.20
Nodes (6): Button, Controls: button, input, status label, plate label, Input / select / textarea, Plate label, Status label, Detail panel

### Community 58 - "dependencies"
Cohesion: 0.18
Nodes (11): dependencies, gsap@^3.15.1, next@16.4.6, pdf-lib@^1.17.1, react@19.3.0, react-dom@19.3.0, @supabase/supabase-js@^2.119.0, twilio@^6.3.0 (+3 more)

### Community 62 - "Workflow components (quote → job → invoice)"
Cohesion: 0.29
Nodes (7): Auth card, Charges editor, Invoice states, Jobs list, Progress strip, Record panel (`SidePanel`), Workflow components (quote → job → invoice)

### Community 63 - "Principles"
Cohesion: 0.29
Nodes (6): 1. The queue is the work, 2. Say exactly what happens, 3. Quiet surfaces, clear state, 4. Never lose the user's place, 5. Readable numbers, Principles

### Community 64 - "lib/invoicePdf.ts"
Cohesion: 0.23
Nodes (12): A4, ACCENT, buildInvoicePdf(), INK, LINE, money(), MUTED, PdfInput (+4 more)

### Community 65 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, start, test, typecheck

### Community 68 - "jobs.ts"
Cohesion: 0.13
Nodes (28): instant, JobsPage(), metadata, JobsView(), squash(), TONE, bookingErrors(), BookingInput (+20 more)

### Community 69 - "Quote list (summary cards, toolbar, table, mobile cards)"
Cohesion: 0.33
Nodes (5): Mobile cards (< 768px), Quote list (summary cards, toolbar, table, mobile cards), Summary cards, Table, Toolbar

### Community 71 - "eslint.config.mjs"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.4.6, eslint, eslint-config-next

### Community 72 - "proxy.ts"
Cohesion: 0.33
Nodes (4): @supabase/ssr@^0.12.7, @supabase/ssr, config, PUBLIC

### Community 76 - "SyncQueue"
Cohesion: 0.24
Nodes (5): clone(), Op, SyncQueue, SyncStatus, SaveResult

### Community 77 - "1. Product Mental Model"
Cohesion: 0.40
Nodes (5): 1. Product Mental Model, Core Objects, Information Architecture, Navigation Model, What is this product?

### Community 81 - "Color Semantics"
Cohesion: 0.33
Nodes (6): Brand Colors, Color Semantics, Cross-Mode Mapping, Feedback Colors, Interactive Colors, Neutral Assignments

### Community 83 - "State Communication"
Cohesion: 0.40
Nodes (5): Errors, Loading, State Communication, Success, Validation Timing

### Community 87 - "Shell, empty states and outcome recording"
Cohesion: 0.40
Nodes (4): Empty states, Outcome recording, Shell, empty states and outcome recording, Sidebar shell

## Knowledge Gaps
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Icon()` connect `QuotePanel.tsx` to `JobsView.tsx`, `jobs.ts`, `queue.ts`, `ChatsView.tsx`, `followup-settings.test.ts`, `ui.tsx`, `Primitives`, `app/page.tsx`, `Design DNA: Quote Follow-up`, `InvoicesView.tsx`, `OverviewView.tsx`, `intake.ts`, `AddQuoteDrawer.tsx`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Icon()` (e.g. with `Required Libraries` and `Icon Sizes`) actually correct?**
  _`Icon()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `jobs.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12941176470588237 - nodes in this community are weakly interconnected._
- **Why does `Design DNA: Quote Follow-up` connect `Design DNA: Quote Follow-up` to `DNA.md`, `1. Product Mental Model`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `design_system.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0701344243132671 - nodes in this community are weakly interconnected._
- **Why does `Required Libraries` connect `Design DNA: Quote Follow-up` to `QuotePanel.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._