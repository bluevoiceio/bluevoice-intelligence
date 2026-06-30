# Foundations of Data Visualization → A New Dashboard Angle for Blue Voice

*Deep-research synthesis · 2026-06-29 · fuses viz-foundations literature + Blue Voice CS/Sales materials + a live Amplitude probe (appId 602375).*

## Big Idea (the "so what")

Amplitude already answers **"what happened, and how much?"** — 100+ volume charts of events by feature and department. Nobody at Blue Voice has the view that CS and Sales actually sell and renew on: **"which *agencies* are healthy or at-risk, how much of the value they bought are they realizing, and what should we do about it this week?"** Build that — an **Account Health & Value-Realization Scorecard** (account-as-the-row, scored 0–100, prescriptive) — and you occupy the one piece of territory the existing analytics stack leaves empty. The live data already proves the need: **the high-ROI "HQ" pillars Sales closes deals on (AI Forms, Workspace, Redaction) are barely being realized post-sale.**

---

## Part 1 — Foundations of Data Visualization

### 1.1 Exploratory vs. explanatory — start here
Knaflic's central distinction: **exploratory** analysis is "turning over 100 rocks to find 1–2 gems"; **explanatory** is showing the audience the gems. Dashboards for sales/CS/ops are *explanatory* — they must carry a point of view, not dump the rock pile. ([Storytelling with Data](https://www.storytellingwithdata.com/blog/2014/04/exploratory-vs-explanatory-analysis))

### 1.2 Storytelling through data (Knaflic)
Six lessons: (1) understand context, (2) choose an appropriate visual, (3) eliminate clutter, (4) focus attention, (5) think like a designer, (6) tell a story. Three context tools force the "so what": the **3-minute story**, the **Big Idea** (one complete sentence stating your point of view + what's at stake), and **storyboarding**. ([readingraphics summary](https://readingraphics.com/book-summary-storytelling-with-data/) · [storytellingwithdata.com/books](https://www.storytellingwithdata.com/books))

- **Preattentive attributes** — position, length, color, size — are decoded in milliseconds, *before* conscious attention. Knaflic's signature move: render everything muted gray, use **one saturated color** to spotlight the series that carries the message. ([The Data School](https://www.thedataschool.co.uk/adam-sultanov/preattentive-attributes-and-gestalt-principles/))
- **Gestalt principles** group marks into structure without extra ink: proximity, similarity, **enclosure** (a shaded band binds items), **connection** (a line is the strongest grouping cue), continuity. ([Daydreaming Numbers](https://daydreamingnumbers.com/gestalt-laws-data-visualization/))

### 1.3 Encoding effectiveness & chart-type selection
**Cleveland & McGill (1984)** ranked how accurately people decode visual channels: (1) position on a common scale, (2) position on non-aligned scales, (3) length/angle, (4) area, (5) volume, (6) color saturation. Consequence: **bars beat pies** because bars use position+length (the two most accurate channels). ([summary](https://creativeartsadventure.wordpress.com/2017/01/02/cleveland-mcgill-graphical-perception-theory-experimentation-and-application-to-the-development-of-graphical-methods/))

Choose the chart by the **message**, not the data shape (FT **Visual Vocabulary**; Severino Ribecca's **Data Visualisation Catalogue**):

| Intent | Chart |
|---|---|
| Comparison / ranking | bar / grouped bar (horizontal for long labels) |
| Trend over time | line |
| **Change between two states / ranking shift** | **slope graph** / dumbbell |
| Single value vs. target | **bullet graph** / KPI tile |
| Part-to-whole | stacked bar (few segments) / treemap |
| Cumulative build-up | waterfall |
| Many series at once | **small multiples** |

([FT Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary) · [datavizcatalogue](https://datavizcatalogue.com/search.html))

- **Slope graphs (Tufte)** uniquely show rank + value + magnitude + direction of change across two time points — ideal for *"agency health last month → this month."* ([charliepark.org](https://charliepark.org/slopegraphs/))
- **Bullet graphs (Few)** pack metric + target marker + 2–5 qualitative bands into one compact, colorblind-safe row — built to replace gauges. ([Perceptual Edge spec](https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf))
- **Small multiples (Tufte)** beat "spaghetti" line charts when comparing many accounts/features. ([Wikipedia](https://en.wikipedia.org/wiki/Small_multiple))
- **Mistakes:** truncated y-axis on bars (bars must start at zero; lines may truncate), dual axes (fake correlation), >3-slice pies, 3D, too many lines. ([Datylon](https://www.datylon.com/blog/bad-data-visualization-examples))

### 1.4 Craft (Tufte & Few)
**Data-ink ratio** — maximize the non-erasable ink that encodes numbers; erase **chartjunk** (decoration that "tells the viewer nothing new"). **Lie factor / graphical integrity** — the visual must be proportional to the quantity. ([Tufte/Wikipedia](https://en.wikipedia.org/wiki/Edward_Tufte)) Few's dashboard rules: single screen, no scroll, strip decoration, prefer **sparklines + bullet graphs** over gauges. ([Formatting & Layout Matter, PDF](https://www.perceptualedge.com/articles/Whitepapers/Formatting_and_Layout_Matter.pdf))

### 1.5 Decision-oriented dashboard design
Few's three types: **strategic** (at-a-glance KPI snapshot), **analytical** (drill/compare to find causes), **operational** (real-time). A CS/sales health board is **analytical with a strategic top layer** — *not* an operational alert wall. ([Dashboard Design Course, PDF](https://www.perceptualedge.com/files/Dashboard_Design_Course.pdf))

- **Shneiderman's mantra:** *"Overview first, zoom and filter, details-on-demand."* The canonical structure for an analytical dashboard. ([Shneiderman 1996](https://www.sci.utah.edu/~kpotter/Library/Papers/shneiderman:1996:TEHI/index.html))
- **Layout:** put the most important takeaway **top-left** (NN/g F-pattern / primacy; treat as heuristic). Progressive disclosure: summary → detail on interaction. ([NN/g](https://www.nngroup.com/articles/complex-application-design/))
- **Prescriptive patterns:** **"so-what" titles** that state the conclusion ("Renewal risk concentrated in 4 declining agencies," not "Renewals by agency"); annotation/callout layers; threshold alerts **used sparingly** (alert fatigue). Every insight → a next step with an owner. ([Storytelling with Data](https://www.storytellingwithdata.com/blog/from-dashboard-to-story) · [NN/g alert fatigue](https://www.nngroup.com/videos/alert-fatigue-user-interfaces/))
- **Anti-patterns:** the "wall of charts," vanity counts, chartjunk, no prioritization/no action. *(This is precisely the trap a 53-chart volume dashboard falls into.)*

### 1.6 Metrics design — vanity → actionable
*Lean Analytics* (Croll & Yoskovitz): **"A good metric changes the way you behave."** Vanity metrics only go up, hide problems, imply no action (total event counts). Actionable metrics are **ratios, rates, cohort comparisons**. ([Boldare](https://www.boldare.com/blog/lean-startup-vanity-metrics-vs-actionable-metrics/))

- **North Star (Amplitude):** one output metric + 3–5 controllable input levers → a causal tree, not a flat KPI list. ([North Star Playbook](https://amplitude.com/resources/north-star-playbook)) **AARRR (McClure):** one decision metric per lifecycle stage. ([deck](https://mcgaw.io/wp-content/uploads/2016/04/PirateMetrics_Final.pdf))
- **"KPIs are notification thresholds"** — a metric earns dashboard space only if crossing a level triggers action. Design move: show **actual vs. target**, not a bare number. ([C. Penn](https://www.christopherspenn.com/2021/03/marketing-data-science-kpis-are-notification-thresholds/))
- **Composite-index methodology (OECD Handbook):** to collapse disparate signals into one 0–100 score — **normalize** (min-max), **weight**, **aggregate**. Use a **geometric mean** when you want to *penalize a single weak pillar* (an agency strong on Search but zero on Workspace shouldn't score "healthy"). Publish weights + a sensitivity analysis so the score is auditable. ([OECD Handbook, PDF](https://www.oecd.org/content/dam/oecd/en/publications/reports/2005/08/handbook-on-constructing-composite-indicators_g17a16e3/533411815016.pdf))
- **Balanced Scorecard (Kaplan & Norton, HBR 1992):** balance one lagging pillar against three leading ones. ([HBR](https://hbr.org/1992/01/the-balanced-scorecard-measures-that-drive-performance-2))

### 1.7 What CS & Sales actually value
- **Customer health score** = a single composite of vital signs, engineered by weighting inputs across **behavioral (adoption/usage), support (friction), relationship, financial, feedback**. Dominant pattern: **weighted 0–100 + red/yellow/green** (e.g. Healthy 71–100 / At-Risk 31–70 / Critical 0–30). Gainsight stresses deriving weights from *your own churn/renewal history*, not gut feel — treat any specific split as a template. ([Gainsight](https://www.gainsight.com/blog/customer-health-scores/))
- **Leading vs lagging:** renewal/churn are *lagging*; usage & engagement are *leading* and surface risk **60–90 days early**. Heap found accounts with **5+ monthly active power users were 35% more likely to renew**. ([Heap](https://www.heap.io/blog/from-lagging-to-leading-indicators-a-proactive-approach-to-account-health-scoring))
- **Adoption metrics:** **breadth** (feature adoption %), **depth** (power users), **stickiness** (DAU/MAU; >20% strong for B2B), **seat utilization** (falling = churn flag). **Account-level adoption predicts expansion/renewal better than user-level** — "the product became essential to the *team*, not one champion." ([Appcues](https://www.appcues.com/blog/success-with-product-adoption-metrics))
- **QBR-ready dashboard** shows: value delivered / ROI (not just usage), usage trend, adoption vs. benchmark, health, **risks + recommended actions**. Governing KPI is **Net Revenue Retention**. ([Gainsight QBR](https://www.gainsight.com/essential-guide/quarterly-business-reviews-qbrs/) · [ChurnZero](https://churnzero.com/blog/rethinking-the-quarterly-business-review/))
- **Account-as-the-row:** Totango/Vitally ingest event streams (incl. Amplitude) but **aggregate to the account** because "a renewal is decided by an account, not a click." ([Totango](https://support.totango.com/hc/en-us/articles/205468375))

---

## Part 2 — The gap (what Amplitude already covers vs. what's missing)

**Already in Amplitude** (probed 2026-06-29): *High Altitude Dashboard* (53 charts, 875 views), *Department Health Metrics* (10), *AI Form Adoption* (8), *Admin Usage* (6), plus dozens of "New User Adoption of X" line charts and one retention chart. **All event-as-the-row volume/segmentation.**

**Missing — the new angle:**
1. **Account-as-the-row composite health score** (no chart rolls breadth+depth+momentum+value+risk into one per-agency number).
2. **Momentum / leading indicators** classified into riser/decliner/new/stable — *your `lib/health.ts` already computes this; no Amplitude chart does.*
3. **Feature-breadth per account** — how many of the ~7 value pillars each agency actually touches.
4. **Friction as a churn signal** — `Card Downvoted`, `AI Forms Filled Unsuccessfully`, `Failed LogIn`, `Better Answer Clicked`, `Re-Ask…Spelling` exist as events but are never combined into a risk indicator.
5. **Prescriptive layer** — "what to do about this account," QBR-ready.

---

## Part 3 — The new dashboard: Account Health & Value-Realization Scorecard

**Grain:** Department/State (matches officer-anonymity + your existing `TEST_DEPT_RE` filter). **Type:** analytical + strategic top band (Few). **Structure:** Shneiderman overview → zoom → details.

### Five scored dimensions (each maps to real events)
| Dimension | Signal | Blue Voice events |
|---|---|---|
| **Breadth** (expansion/stickiness) | # of value pillars used / 7 | Ask Blue, AI Forms, AI Summary, Workspace, Redaction, Signoff, Notifications |
| **Depth** (engagement) | active officers, questions/officer, DAU/MAU | `New Question Asked`, `session_start`, `Successful LogIn` |
| **Momentum** (leading) | MoM Δ, riser/decliner/new/stable | already in `lib/health.ts` |
| **Value realization** (ROI/QBR) | outcomes shipped | `Form Emailed Successfully`, `Redaction Created`, `Signoff Task Reviewed`, `Artifact Exported` |
| **Friction / risk** (leading) | failure & dissatisfaction rate | `Card Downvoted`, `AI Forms Filled Unsuccessfully`, `Failed LogIn`, `Better Answer Clicked` |

**Composite:** min-max normalize each dimension → **weighted geometric mean** → 0–100, bucketed Healthy / At-Risk / Critical (OECD method; penalizes a single dead pillar). Publish the weights. This is a deliberate upgrade over a linear sum.

### Chart choices (each justified by a principle)
- **Portfolio overview band (top-left):** strategic KPIs — portfolio NRR-style health, # agencies by tier (red/yellow/green), # decliners. So-what title states the takeaway. *(primacy + KPI tiles)*
- **The scorecard table (account-as-the-row):** one row per agency, columns = the 5 dimensions, each rendered as a **bullet graph** (score vs. target band) + a **12-week sparkline**. Sortable by score/momentum. *(Few + Totango/Vitally account grain)*
- **Momentum view:** **slope graph** of health last month → this month, ranking risers/decliners — gray for stable, one color for the agencies that moved. *(Tufte slope graph + Knaflic gray-vs-color; mirrors `lib/health.ts`)*
- **Breadth matrix:** **small-multiples / heatmap** of pillar adoption per agency — instantly shows "Search-only" accounts ripe for expansion. *(Tufte small multiples)*
- **Friction panel:** ratio metrics (downvote rate, form-fail rate), threshold-flagged, used sparingly. *(actual-vs-target, alert fatigue)*
- **Prescriptive callouts:** each at-risk row gets a generated recommendation ("Search-heavy, 0 Workspace → expansion play"; "form-fill success ↓30% MoM → CSM intervention"). *(prescriptive + every insight → next step)*

### Team lenses (one board, role filters)
- **CS:** at-risk list + recommended plays, QBR export per agency.
- **Sales/expansion:** breadth gaps = upsell targets (PQA logic).
- **Marketing:** which pillars drive stickiness → messaging.
- **Ops:** friction/failure hotspots to fix.
- **Exec/general:** the strategic top band (portfolio health, NRR trend).

---

## Part 4 — Scoring how Blue Voice is performing today

Live 90-day totals (probed 2026-06-29), mapped to the value pillars the 2026 One-Pager sells:

| Pillar (event) | 90-day total | Read |
|---|---:|---|
| Search / Ask Blue (`New Question Asked`) | **34,533** | **A** — the core engine, healthy |
| Accreditation (`Signoff Task Reviewed`) | **16,016** | **A−** — strong, sticky |
| Workspace / HQ AI (`Workspace Chat Sent`) | 3,332 | **C** — modest |
| Fillable Forms — emailed (`Form Emailed Successfully`) | 2,368 | workflow used… |
| **Fillable Forms — AI-filled (`AI Forms Filled Successfully`)** | **396** | **D — the AI feature that closes deals is barely used as designed** |
| Workspace exports (`Artifact Exported`) | 172 | **D** — ROI artifacts rarely leave the building |
| Redaction (`Redaction Created`) | 157 | **D** — flagship Axon-differentiator, under-adopted |
| Friction (`Card Downvoted`) | 62 | low absolute (needs ratio vs. Card Viewed) |

**The headline:** value realization is **bimodal** — Search and Signoff are thriving, but the **high-ROI HQ pillars (AI Forms fill, Workspace artifacts, Redaction)** that Sales demos and the ROI/Risk-Pool handouts promise are **not being realized post-sale**. 2,368 forms emailed against only 396 AI-filled means agencies use the form workflow but skip the differentiated AI step. That's a renewal-risk and expansion gap hiding in plain sight — and invisible on a volume dashboard because the big numbers (34k) dominate the eye.

---

## Part 5 — What else we can do to improve

1. **Ship the scorecard** as the new top-level view — it's the one decision-oriented angle the 53-chart Amplitude stack lacks.
2. **Instrument breadth per account** — a derived "pillars adopted (0–7)" metric; it's your best expansion + churn predictor (account-level adoption > user-level).
3. **Upgrade `lib/health.ts` scoring** from linear to **normalized weighted geometric mean**, tier as red/yellow/green, and **back-test weights against real renewal outcomes** (Gainsight's discipline) rather than hand-picked weights.
4. **Add the friction ratio as a leading indicator** — downvote rate, AI-form failure rate, failed-login rate; flag the 60–90-day early warning window.
5. **Make every panel prescriptive** — so-what titles + a recommended next action per at-risk agency; export a one-click QBR pack (value delivered, trend, risks, actions).
6. **Run an enablement play on the under-realized pillars** (AI Forms, Workspace, Redaction) — the data says the product *sold* isn't the product *used*.

---

## Verification flags (from the research pass)
- Health-score **weight splits** (e.g. 40/25/20/15) and **band thresholds** are illustrative templates — Gainsight itself says derive them from your own churn data.
- "**35% more likely to renew**" is Heap's own product data (one company); directional.
- Sales benchmarks (3–6× pipeline coverage, LTV:CAC 3:1, ">20% stickiness", "60/90-day" windows) come from vendor blogs — directional, not peer-reviewed.
- F-pattern is a text-scanning finding; apply to dashboards as a heuristic. The "55% cognitive-load reduction" stat for progressive disclosure could not be traced to a primary NN/g source.

## Source index
Knaflic [SWD](https://www.storytellingwithdata.com/books) · Tufte [VDQI](https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/) · Few [Perceptual Edge library](https://www.perceptualedge.com/library.php), [Bullet Graph spec](https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf) · Cleveland & McGill 1984 · [FT Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary) · [Data Viz Catalogue](https://datavizcatalogue.com/search.html) · [Shneiderman 1996](https://www.sci.utah.edu/~kpotter/Library/Papers/shneiderman:1996:TEHI/index.html) · NN/g ([complex apps](https://www.nngroup.com/articles/complex-application-design/), [alert fatigue](https://www.nngroup.com/videos/alert-fatigue-user-interfaces/)) · Lean Analytics · Amplitude [North Star](https://amplitude.com/resources/north-star-playbook) · McClure [AARRR](https://mcgaw.io/wp-content/uploads/2016/04/PirateMetrics_Final.pdf) · [OECD Composite Indicators](https://www.oecd.org/content/dam/oecd/en/publications/reports/2005/08/handbook-on-constructing-composite-indicators_g17a16e3/533411815016.pdf) · [HBR Balanced Scorecard](https://hbr.org/1992/01/the-balanced-scorecard-measures-that-drive-performance-2) · [Gainsight health](https://www.gainsight.com/blog/customer-health-scores/) / [QBR](https://www.gainsight.com/essential-guide/quarterly-business-reviews-qbrs/) · [Heap leading indicators](https://www.heap.io/blog/from-lagging-to-leading-indicators-a-proactive-approach-to-account-health-scoring) · [Appcues adoption](https://www.appcues.com/blog/success-with-product-adoption-metrics) · [Totango scorecard](https://support.totango.com/hc/en-us/articles/205468375) · [ChurnZero QBR](https://churnzero.com/blog/rethinking-the-quarterly-business-review/)
