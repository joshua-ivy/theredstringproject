# Website Build Rules for Codex

These rules exist to prevent generic AI-generated websites, vague feature cards, filler marketing copy, and UI sections that look polished but do not help a real user.

The goal is not to make the site look “techy.”
The goal is to make the site immediately useful, clear, trustworthy, and specific.

---

## 1. No Generic Feature-Card Filler

Do not create vague cards like:

- “Firebase Native”
- “Admin First”
- “Scalable Architecture”
- “AI Powered”
- “Secure by Design”
- “Built for Speed”
- “Modern Dashboard”
- “Enterprise Ready”
- “Cloud Native”
- “Seamless Workflow”

These are banned unless they are tied to a specific user-visible benefit, actual workflow, or implemented feature.

Bad:

> Firebase Native  
> Firestore, Storage, Functions v2, scheduled discovery, Cloud Tasks, Auth, and Hosting.

Why bad:
- It lists tools instead of value.
- It explains nothing to the user.
- It sounds like internal developer notes.
- It does not help someone decide what to do next.

Better:

> Daily AI + Data Center Briefing  
> Get a short, ranked summary of the most important AI infrastructure, power, cooling, chip, and hyperscale data center stories without digging through RSS feeds.

Better:

> Admin Review Queue  
> New articles are collected automatically, but publishing controls stay behind an authenticated admin view so low-quality or duplicate stories do not hit the public site.

---

## 2. Every Section Must Pass the “User Value Test”

Before adding any homepage section, card, block, badge, hero statement, or CTA, answer:

1. Who is this for?
2. What question does it answer?
3. What action should the user take after reading it?
4. Is this describing the product from the user's point of view?
5. Is this backed by a real feature in the codebase?

If the answer is unclear, do not add the section.

---

## 3. Write for the Visitor, Not the Developer

Visitors do not care that the app uses:

- Firebase
- Firestore
- Cloud Functions
- Next.js
- Auth
- Cloud Tasks
- SSR
- APIs
- Admin SDK
- Tailwind
- React Server Components

Only mention technology when it directly explains a user benefit.

Bad:

> Built with Firestore and Cloud Functions.

Better:

> New articles are collected automatically throughout the day, then grouped into clean topic feeds so readers do not have to search multiple sites.

Bad:

> Server-side admin checks.

Better:

> Publishing tools are hidden from the public site and only available to approved admins.

---

## 4. Avoid Fake SaaS Copy

Do not make the site sound bigger than it is.

Avoid:
- “Enterprise-grade”
- “Mission-critical”
- “World-class”
- “Transform your workflow”
- “Unlock insights”
- “Supercharge productivity”
- “Seamless experience”
- “Revolutionary”
- “Next-generation”
- “Powerful platform”
- “All-in-one solution”

Use grounded, plain language.

Good:
- “Read today’s top stories.”
- “Browse by topic.”
- “See why an article matters.”
- “Open the original source.”
- “Review collected stories before publishing.”
- “Track schedule coverage by person, trade, or day.”
- “Share a read-only schedule link.”
- “Log lost time by category.”

---

## 5. Content Must Be Specific to This Product

Before writing copy, inspect the actual app routes, components, data model, and implemented features.

Do not invent features.

For each page, identify:

- Primary user
- Primary action
- Available real data
- Empty state
- Loading state
- Error state
- Mobile behavior
- CTA destination

Example for a news site:

Primary user:
> Someone who wants fast, useful AI + data center infrastructure news.

Primary action:
> Read today’s pulse, browse topics, or open an article.

Real data:
> Firestore articles, article pages, topic pages, daily digest pages.

Do not add:
> Team collaboration, enterprise alerts, paid dashboards, advanced analytics, account personalization, or admin workflows unless they actually exist.

---

## 6. Homepage Rules

The homepage must answer these questions in order:

1. What is this?
2. Who is it for?
3. What can I do here right now?
4. Why should I trust it?
5. Where should I click first?

A good homepage structure:

### Hero

Must include:
- One clear headline
- One plain-language subheadline
- One primary CTA
- One secondary CTA if useful

Bad headline:
> Infrastructure Intelligence for the AI Era

Better headline:
> AI and data center news without the noise

Bad subheadline:
> A Firebase-native intelligence platform for scheduled discovery and admin-first workflows.

Better subheadline:
> SysSignal collects AI, power, cooling, chip, and hyperscale data center stories into a daily briefing and topic feeds you can scan in minutes.

### Main Content

Use sections like:

- Today’s Pulse
- Latest Articles
- Browse by Topic
- Why This Matters
- How It Works
- Source Coverage
- Admin / Publishing, only if relevant and not public-facing marketing fluff

Do not add generic feature grids unless each card describes a real user-facing capability.

---

## 7. Feature Card Rules

Every card must include at least one of these:

- A user action
- A user benefit
- A real object in the app
- A concrete workflow
- A measurable outcome
- A clear limitation

Bad card:

> Admin First  
> V1 gates creation behind server-side admin checks while the public-facing product matures.

Better card:

> Private Publishing Controls  
> Article collection can run automatically, but publishing and cleanup tools stay behind admin authentication.

Bad card:

> Firebase Native  
> Firestore, Storage, Functions v2, scheduled discovery, Cloud Tasks, Auth, and Hosting.

Better card:

> Automatic Article Collection  
> Scheduled backend jobs collect new stories and save them to Firestore so the public feed can stay current without manual posting.

---

## 8. UI Layout Rules

Prefer useful layout over decorative layout.

Do:
- Make the primary content visible above the fold.
- Use clear headings.
- Use compact but readable spacing.
- Make CTAs obvious.
- Keep cards information-dense.
- Use real data wherever possible.
- Make empty states helpful.
- Make mobile layouts clean.

Do not:
- Waste the top of the page on vague branding.
- Add huge decorative sections with little information.
- Add 6-card grids just because they look like SaaS.
- Use icons as decoration without meaning.
- Hide the useful part of the app below marketing fluff.
- Use internal implementation labels as public content.

---

## 9. Copywriting Rules

Use this style:

- Plain
- Specific
- Confident
- Human
- Useful
- Minimal

Avoid this style:

- Corporate
- Buzzword-heavy
- Developer-internal
- Fake enterprise
- Overly dramatic
- Empty inspirational language

Good copy examples:

> Read the latest AI infrastructure stories by topic.

> Today’s Pulse gives you a quick scan of the stories that matter across chips, power, cooling, and hyperscale data centers.

> Open the original source when you want the full article.

> Admin tools are intentionally separated from the public reading experience.

Bad copy examples:

> Harness the power of cloud-native intelligence.

> Transform how your team discovers mission-critical insights.

> Built on a scalable Firebase-native architecture.

> Unlock next-generation operational visibility.

---

## 10. No Placeholder Claims

Do not claim the app has:

- Real-time alerts
- AI summaries
- Personalized feeds
- Enterprise security
- Team collaboration
- Paid subscriptions
- Advanced analytics
- Multi-user workspaces
- Automated recommendations
- Production monitoring
- Admin approval flows

unless the codebase clearly implements them.

If a feature is planned but not implemented, label it clearly as planned or do not mention it.

---

## 11. Developer Notes Stay Out of Public UI

Do not expose internal project details in public website copy.

Avoid public-facing copy that mentions:

- V1
- MVP
- Admin gates
- SSR
- Firestore collections
- Cloud Functions v2
- Backend architecture
- Auth strategy
- Middleware
- JWT cookies
- Implementation phase
- TODOs
- Roadmap internals

These belong in developer docs, not public marketing sections.

---

## 12. Empty States Must Be Useful

Bad empty state:

> No data found.

Better:

> No articles are published yet. Check back after the next scheduled collection run.

Bad:

> Something went wrong.

Better:

> Articles could not be loaded. Try refreshing the page. If this keeps happening, the feed may be temporarily unavailable.

---

## 13. Before Making UI Changes, Codex Must Inspect

Before editing website UI, inspect:

- Existing routes
- Existing components
- Existing data fetching
- Actual Firestore/data shapes if available
- Current styling system
- Current homepage structure
- Current navigation
- Mobile layout behavior

Do not blindly replace the UI with a generic SaaS template.

---

## 14. Required Output Before Editing

Before making code changes, respond with:

```txt
Planned website changes:
1. What page/component I am changing
2. What user problem the change solves
3. What content will be removed as generic/filler
4. What content will replace it
5. What real app feature or route supports the new content
6. What I will not change