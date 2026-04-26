import Link from "next/link";
import { ArrowRight, DatabaseZap, FileSearch, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="site-shell">
      <section className="landing-hero">
        <div className="hero-board" aria-hidden="true">
          <div className="hero-string hero-string-a" />
          <div className="hero-string hero-string-b" />
          <div className="hero-string hero-string-c" />
          <div className="hero-pin hero-pin-a" />
          <div className="hero-pin hero-pin-b" />
          <div className="hero-pin hero-pin-c" />
          <article className="hero-evidence hero-evidence-a">
            <span>ARCHIVED PDF</span>
            <strong>Church Committee</strong>
          </article>
          <article className="hero-evidence hero-evidence-b">
            <span>IMAGE HASHED</span>
            <strong>Memo Fragment</strong>
          </article>
          <article className="hero-evidence hero-evidence-c">
            <span>WEB SOURCE</span>
            <strong>Search Discovery</strong>
          </article>
        </div>

        <div className="hero-copy">
          <p className="kicker">Every thread tells a story.</p>
          <h1>The Red String Project</h1>
          <p className="hero-text">
            A cinematic Firebase web app for preserving evidence links, archiving allowed media,
            scoring credibility, and exploring the web of claims through a living detective board.
          </p>
          <div className="hero-actions">
            <Link href="/app" className="primary-link">
              Open the board <ArrowRight size={18} />
            </Link>
            <a href="#stack" className="secondary-link">
              View stack
            </a>
          </div>
        </div>
      </section>

      <section id="stack" className="landing-band">
        <div className="capability">
          <FileSearch />
          <h2>Preserved Evidence</h2>
          <p>Every record keeps source links, retrieval metadata, hashes, and archived assets when allowed.</p>
        </div>
        <div className="capability">
          <DatabaseZap />
          <h2>Firebase Native</h2>
          <p>Firestore, Storage, Functions v2, scheduled discovery, Cloud Tasks, Auth, and Hosting.</p>
        </div>
        <div className="capability">
          <ShieldCheck />
          <h2>Admin First</h2>
          <p>V1 gates creation behind server-side admin checks while the public-facing product matures.</p>
        </div>
      </section>
    </main>
  );
}
