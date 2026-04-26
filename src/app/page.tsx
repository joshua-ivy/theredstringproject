import Link from "next/link";
import { Archive, Bot, Check, Folder, Search, Shield, GitBranch } from "lucide-react";

const tabs = [
  { href: "/app", label: "The Web", icon: GitBranch },
  { href: "/app", label: "Case Files", icon: Folder },
  { href: "/app", label: "Evidence Locker", icon: Archive },
  { href: "/app", label: "The Oracle", icon: Bot },
  { href: "/app", label: "Review", icon: Check }
];

export default function Home() {
  return (
    <main className="site-shell guide-home">
      <header className="app-header">
        <div className="app-command-row">
          <Link href="/" className="brand-lockup">
            <span className="brand-mark">RS</span>
            <div>
              <p>The</p>
              <h1>Red String Project</h1>
            </div>
          </Link>

          <div className="header-search">
            <Search size={15} />
            <span>Search evidence, entities, tags...</span>
            <em>CTRL K</em>
          </div>

          <div className="header-meta">
            <span className="status-dot live" />
            <span>Connected</span>
            <Link className="header-auth-button" href="/app">
              Admin
            </Link>
          </div>
        </div>

        <nav className="app-nav">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link key={tab.label} href={tab.href}>
                <Icon size={14} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="disclaimer-strip">
        Exploratory pattern board. Evidence scores explain source quality and connection strength; they are not proof that a claim is true.
      </div>

      <section className="guide-landing-screen">
        <svg className="guide-landing-strings" aria-hidden="true">
          <defs>
            <filter id="landing-red-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g stroke="var(--red)" strokeWidth="1.5" fill="none" filter="url(#landing-red-glow)" opacity="0.9">
            <path d="M 75 90 C 280 60, 460 80, 720 130" />
            <path d="M 75 90 C 200 200, 350 250, 720 380" />
            <path d="M 950 60 C 850 200, 760 240, 720 380" />
            <path d="M 720 130 C 800 200, 900 240, 1100 280" />
            <path d="M 720 380 C 800 380, 900 380, 1080 420" />
            <path d="M 250 350 L 460 220" stroke="var(--red-deep)" strokeDasharray="2 4" opacity="0.6" />
          </g>
          <g fill="var(--red)" filter="url(#landing-red-glow)">
            <circle cx="75" cy="90" r="4" />
            <circle cx="720" cy="130" r="4" />
            <circle cx="720" cy="380" r="4" />
            <circle cx="950" cy="60" r="4" />
            <circle cx="1100" cy="280" r="4" />
            <circle cx="1080" cy="420" r="4" />
          </g>
        </svg>

        <div className="guide-landing-copy">
          <div className="guide-eye paper-grain" aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="oklch(0.30 0.15 25)" strokeWidth="1.6">
              <path d="M4 28 C 14 12, 42 12, 52 28 C 42 44, 14 44, 4 28 Z" />
              <circle cx="28" cy="28" r="9" fill="oklch(0.30 0.15 25)" />
              <circle cx="28" cy="28" r="3.5" fill="oklch(0.95 0 0)" />
              <path d="M28 4 L28 14 M28 42 L28 52 M4 28 L12 28 M44 28 L52 28" />
            </svg>
          </div>

          <div className="red-label guide-kicker">Every thread tells a story...</div>
          <h1>The Red String<br />Project</h1>
          <p>
            Preserve sources, inspect credibility notes, and follow connected claims on a living
            evidence board built for careful review.
          </p>

          <div className="guide-claim-card">
            <div>
              <span>Claim</span>
              <strong>Agency records reference controlled research</strong>
            </div>
            <div>
              <span>Evidence</span>
              <strong>Archived PDF, original source retained</strong>
            </div>
            <div>
              <span>Source quality</span>
              <strong>86 / 100</strong>
            </div>
            <div>
              <span>Review status</span>
              <strong>Approved for board</strong>
            </div>
          </div>

          <div className="guide-landing-actions">
            <Link className="primary-link" href="/app">Open the board -&gt;</Link>
            <a className="secondary-link" href="#how-it-works">How it works</a>
          </div>
        </div>

        <div className="landing-note note-a paper-grain"><i>Archived PDF</i><strong>Church Committee</strong></div>
        <div className="landing-note note-b paper-grain"><i>Image hashed</i><strong>Memo Fragment</strong></div>
        <div className="landing-note note-c paper-grain"><i>Web Source</i><strong>Search Discovery</strong></div>
        <div className="landing-tape tape-a" />
        <div className="landing-tape tape-b" />
        <div className="guide-floating-tag tag-a">Source hash verified</div>
        <div className="guide-floating-tag tag-b">Retrieved 04.26</div>

        <div className="guide-feature-row">
          <div><Shield size={20} /><strong>Preserve</strong><span>Archive every URL with hashes, timestamps, and redaction notes.</span></div>
          <div><GitBranch size={20} /><strong>Connect</strong><span>Pin claims to evidence with red-string logic, not vibes.</span></div>
          <div><Search size={20} /><strong>Inspect</strong><span>Score sources, surface gaps, and review every assertion.</span></div>
        </div>

        <section id="how-it-works" className="guide-how-panel">
          <div>
            <p className="red-label">How it works</p>
            <h2>From source link to board string</h2>
            <span>
              The board is public for reading. Evidence creation and review stay behind the approved admin account.
            </span>
          </div>
          <ol>
            <li>
              <strong>Submit or discover a source</strong>
              <span>Admin intake starts from a URL or file upload. Public visitors can open saved sources but cannot add records.</span>
            </li>
            <li>
              <strong>Preserve what is allowed</strong>
              <span>The record keeps the original link, retrieval time, content hash, archive status, and any saved local assets.</span>
            </li>
            <li>
              <strong>Analyze with citations</strong>
              <span>Gemini extracts entities, summarizes the record, scores credibility, and stores transparent reasoning.</span>
            </li>
            <li>
              <strong>Weave the board</strong>
              <span>Evidence is connected to cases through saved relationships, credibility thresholds, and review status.</span>
            </li>
          </ol>
        </section>
      </section>
    </main>
  );
}
