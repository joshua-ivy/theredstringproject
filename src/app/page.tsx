import Link from "next/link";
import Image from "next/image";
import { ArrowRight, FileSearch, Link2, MessageSquareQuote } from "lucide-react";

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
          <Image
            className="hero-logo"
            src="/red-string-logo.png"
            alt="The Red String Project eye and thread mark"
            width={440}
            height={220}
            priority
          />
          <p className="kicker">Every thread tells a story.</p>
          <h1>The Red String Project</h1>
          <p className="hero-text">
            Preserve sources, inspect credibility notes, and follow connected claims on a living
            evidence board built for careful review.
          </p>
          <div className="hero-actions">
            <Link href="/app" className="primary-link">
              Open the board <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="secondary-link">
              How it works
            </a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="landing-band">
        <div className="capability">
          <FileSearch />
          <h2>Save a source trail</h2>
          <p>Each evidence record keeps the original link, retrieval time, hash, and any allowed archived files.</p>
        </div>
        <div className="capability">
          <Link2 />
          <h2>See why threads connect</h2>
          <p>Open a node to read the credibility explanation, named entities, and the reason a string exists.</p>
        </div>
        <div className="capability">
          <MessageSquareQuote />
          <h2>Ask with citations</h2>
          <p>The Oracle answers from saved evidence and points back to the records behind its response.</p>
        </div>
      </section>
    </main>
  );
}
