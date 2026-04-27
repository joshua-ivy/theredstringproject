"use client";

import { FormEvent, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { functions } from "@/lib/firebase";
import type { Evidence, OracleCitation } from "@/types/domain";

interface OraclePanelProps {
  evidences: Evidence[];
  isAdminHint: boolean;
}

interface OracleResponse {
  answer: string;
  citations: OracleCitation[];
}

const ORACLE_STOP_WORDS = new Set(["show", "with", "and", "the", "for", "all", "case", "cases", "evidence", "connecting"]);

function localOracleTerms(question: string) {
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !ORACLE_STOP_WORDS.has(term));
  const expanded = new Set(terms);
  if (expanded.has("uap") || expanded.has("ufo")) {
    ["uap", "ufo", "unidentified", "anomalous", "craft", "aerospace"].forEach((term) => expanded.add(term));
  }
  return Array.from(expanded);
}

function hasSpecificSource(evidence: Evidence) {
  if (evidence.archived_assets.length > 0) {
    return true;
  }
  if (evidence.source_url.startsWith("local://")) {
    return evidence.archive_status === "archived";
  }
  try {
    const parsed = new URL(evidence.canonical_url || evidence.source_url);
    const host = parsed.hostname.replace(/^www\./, "");
    const rootOnly = !parsed.pathname.replace(/\/+$/, "") && !parsed.search && !parsed.hash;
    return !(rootOnly && ["youtube.com", "youtu.be", "x.com", "twitter.com", "reddit.com", "news.google.com"].includes(host));
  } catch {
    return false;
  }
}

export function OraclePanel({ evidences, isAdminHint }: OraclePanelProps) {
  const [question, setQuestion] = useState("");
  const [credibilityMin, setCredibilityMin] = useState(55);
  const [answer, setAnswer] = useState<OracleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedPrompt = useMemo(() => {
    const topEntity = evidences.flatMap((evidence) => evidence.entities).find(Boolean) ?? "MKUltra";
    return `Show me evidence connecting ${topEntity} across cases with credibility > ${credibilityMin}.`;
  }, [credibilityMin, evidences]);

  async function askOracle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const callable = httpsCallable<
        { question: string; credibilityMin: number },
        OracleResponse
      >(functions, "oracleAsk");
      const result = await callable({ question: prompt, credibilityMin });
      setAnswer(result.data);
    } catch (caught) {
      const terms = localOracleTerms(prompt);
      const localMatches = evidences
        .filter((evidence) => evidence.credibility_score >= credibilityMin)
        .filter(hasSpecificSource)
        .map((evidence) => {
          const text = `${evidence.title} ${evidence.content_text} ${evidence.entities.join(" ")} ${evidence.tags.join(" ")}`.toLowerCase();
          return { evidence, score: terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.evidence.credibility_score - a.evidence.credibility_score)
        .map((item) => item.evidence)
        .slice(0, 5);

      if (localMatches.length > 0) {
        const asksConnection = /\b(connect|connecting|connection|link|links|between|across|thread|string)\b/i.test(prompt);
        const linkedCaseCount = new Set(localMatches.flatMap((evidence) => evidence.linked_conspiracy_ids)).size;
        setAnswer({
          answer: asksConnection && (localMatches.length < 2 || linkedCaseCount < 2)
            ? `The live Oracle function was unavailable. Local retrieval found ${localMatches.length} matching preserved record, which is not enough to claim a cross-case connection.`
            : "The live Oracle function was unavailable, so this is a strict local retrieval over currently loaded evidence. It found related records, but did not run Gemini reasoning.",
          citations: localMatches.map((evidence) => ({
            evidenceId: evidence.id,
            title: evidence.title,
            sourceUrl: evidence.source_url,
            archiveStatus: evidence.archive_status,
            credibility: evidence.credibility_score
          }))
        });
      } else {
        setError(caught instanceof Error ? caught.message : "Oracle request failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="oracle-view">
      <section className="oracle-console">
        <div className="section-title">
          <Bot size={19} />
          <div>
            <p>The Oracle</p>
            <h2>Ask the preserved web</h2>
          </div>
        </div>
        {isAdminHint ? (
          <form onSubmit={askOracle} className="oracle-form">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={suggestedPrompt}
            />
            <label className="oracle-slider">
              <span>Minimum credibility: {credibilityMin}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={credibilityMin}
                onChange={(event) => setCredibilityMin(Number(event.target.value))}
              />
            </label>
            <button className="primary-button" disabled={loading || !question.trim()}>
              {loading ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
              Ask Oracle
            </button>
          </form>
        ) : (
          <div className="admin-only-panel">
            <p className="red-label">Admin-only tool</p>
            <span>The Oracle calls Gemini and is locked to approved admins so public visitors cannot spend API quota.</span>
          </div>
        )}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="oracle-answer">
        {!isAdminHint ? (
          <div className="empty-oracle">
            <Bot size={42} />
            <p>The public archive remains browsable. Oracle questions are reserved for approved admins.</p>
          </div>
        ) : answer ? (
          <>
            <div className="answer-heading">
              <Sparkles size={18} />
              <h3>Answer</h3>
            </div>
            <p>{answer.answer}</p>
            <div className="citation-list">
              {answer.citations.map((citation) => (
                <a key={citation.evidenceId} href={citation.sourceUrl} target="_blank" rel="noreferrer">
                  <strong>{citation.title}</strong>
                  <span>{citation.credibility}/100 · {citation.archiveStatus}</span>
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-oracle">
            <Bot size={42} />
            <p>Answers will cite evidence records with source links and preservation status.</p>
          </div>
        )}
      </section>
    </div>
  );
}
