"use client";

import { FormEvent, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { functions } from "@/lib/firebase";
import type { Evidence, OracleCitation, OracleIntakeCard } from "@/types/domain";

interface OraclePanelProps {
  evidences: Evidence[];
  isAdminHint: boolean;
}

interface OracleResponse {
  answer: string;
  citations: OracleCitation[];
  intakeCards?: OracleIntakeCard[];
  repeatCount?: number;
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

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function calibratedCredibility(evidence: Evidence) {
  const host = sourceHost(evidence.canonical_url || evidence.source_url);
  let adjusted = evidence.credibility_score;
  let floor = 0;
  const reasons: string[] = [];

  if (host.endsWith(".gov") || evidence.platform.toLowerCase() === "government") {
    if (evidence.credibility_score < 80) adjusted += 8;
    floor = Math.max(floor, 82);
    reasons.push("official government source");
  }
  if (host === "docs.house.gov" || host.endsWith(".house.gov")) {
    if (evidence.credibility_score < 84) adjusted += 4;
    floor = Math.max(floor, 84);
    reasons.push("House document repository");
  }
  if (evidence.type === "pdf") {
    if (evidence.credibility_score < 84) adjusted += 2;
    reasons.push("stable document format");
  }
  if (evidence.archive_status === "archived") {
    adjusted += 3;
    reasons.push("local archive copy");
  } else if (evidence.archive_status === "link_only") {
    reasons.push("source link retained without local mirror");
    if (!host.endsWith(".gov") && evidence.platform.toLowerCase() !== "government") adjusted -= 1;
  }

  return {
    score: Math.max(floor, Math.min(92, Math.round(adjusted))),
    basis: reasons.length
      ? `${reasons.join(", ")}. Score reflects source provenance, not proof that every claim inside the record is true.`
      : "Score reflects retained source provenance, extraction quality, and review status."
  };
}

function buildLocalIntakeCards(matches: Evidence[], asksConnection: boolean, priorCount: number): OracleIntakeCard[] {
  return matches.map((evidence) => {
    const calibrated = calibratedCredibility(evidence);
    const tags = Array.from(new Set([
      ...evidence.tags,
      evidence.platform,
      evidence.type,
      sourceHost(evidence.source_url).endsWith(".gov") ? "official-source" : ""
    ].map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 10);
    return {
      evidenceId: evidence.id,
      title: evidence.title,
      url: evidence.source_url,
      tags,
      intakeNotes: `${priorCount > 0 ? "Already surfaced in this Oracle session; this is the intake view for the same source." : "Intake-ready source."} ${evidence.content_text.slice(0, 360)} ${asksConnection ? "It is not enough by itself to prove a cross-case connection." : ""}`,
      initialCredibility: calibrated.score,
      credibilityBasis: calibrated.basis,
      archiveStatus: evidence.archive_status
    };
  });
}

function questionKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const ORACLE_SECTION_PATTERN = /^(Short answer|What the archive actually shows|Connection readout|What does not follow yet|Next evidence to pull):?$/i;
const ORACLE_SECTION_WITH_TEXT_PATTERN = /^(?:\*\*)?(Short answer|What the archive actually shows|Connection readout|What does not follow yet|Next evidence to pull)(?:\*\*)?:\s*(.+)$/i;

function renderOracleInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function OracleAnswerBody({ text }: { text: string }) {
  const lines = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="oracle-answer-body">
      {lines.map((line, index) => {
        const cleaned = line.replace(/^#{1,6}\s*/, "").trim();
        const sectionWithText = cleaned.match(ORACLE_SECTION_WITH_TEXT_PATTERN);
        if (sectionWithText) {
          return (
            <div className="oracle-answer-section" key={`${line}-${index}`}>
              <h4>{sectionWithText[1]}</h4>
              <p>{renderOracleInline(sectionWithText[2])}</p>
            </div>
          );
        }

        const heading = cleaned.replace(/^\*\*(.+)\*\*$/, "$1").trim();
        if (ORACLE_SECTION_PATTERN.test(heading)) {
          return <h4 key={`${line}-${index}`}>{heading.replace(/:$/, "")}</h4>;
        }

        if (/^[-*]\s+/.test(cleaned)) {
          return <p className="oracle-answer-bullet" key={`${line}-${index}`}>{renderOracleInline(cleaned.replace(/^[-*]\s+/, ""))}</p>;
        }

        return <p key={`${line}-${index}`}>{renderOracleInline(cleaned)}</p>;
      })}
    </div>
  );
}

export function OraclePanel({ evidences, isAdminHint }: OraclePanelProps) {
  const [question, setQuestion] = useState("");
  const [credibilityMin, setCredibilityMin] = useState(55);
  const [answer, setAnswer] = useState<OracleResponse | null>(null);
  const [oracleHistory, setOracleHistory] = useState<Array<{ key: string; answer: string; citationTitles: string[] }>>([]);
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
    const key = questionKey(prompt);
    const previousAnswers = oracleHistory
      .filter((entry) => entry.key === key)
      .slice(-3)
      .map((entry) => `${entry.answer}\nCitations: ${entry.citationTitles.join(", ") || "none"}`);
    try {
      const callable = httpsCallable<
        { question: string; credibilityMin: number; previousAnswers?: string[] },
        OracleResponse
      >(functions, "oracleAsk");
      const result = await callable({ question: prompt, credibilityMin, previousAnswers });
      setAnswer(result.data);
      setOracleHistory((current) => [
        ...current,
        {
          key,
          answer: result.data.answer,
          citationTitles: result.data.citations.map((citation) => citation.title)
        }
      ].slice(-12));
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
        const fallbackAnswer = asksConnection && (localMatches.length < 2 || linkedCaseCount < 2)
            ? previousAnswers.length
              ? `The live Oracle function was unavailable. This is still the same single-record match, so I am returning it as intake material instead of repeating the prior answer.`
              : `The live Oracle function was unavailable. Local retrieval found ${localMatches.length} matching preserved record, which is not enough to claim a cross-case connection.`
            : "The live Oracle function was unavailable, so this is a strict local retrieval over currently loaded evidence. It found related records, but did not run Gemini reasoning.";
        const fallbackResponse = {
          answer: fallbackAnswer,
          citations: localMatches.map((evidence) => ({
            evidenceId: evidence.id,
            title: evidence.title,
            sourceUrl: evidence.source_url,
            archiveStatus: evidence.archive_status,
            credibility: calibratedCredibility(evidence).score
          })),
          intakeCards: buildLocalIntakeCards(localMatches, asksConnection, previousAnswers.length),
          repeatCount: previousAnswers.length
        };
        setAnswer(fallbackResponse);
        setOracleHistory((current) => [
          ...current,
          {
            key,
            answer: fallbackResponse.answer,
            citationTitles: fallbackResponse.citations.map((citation) => citation.title)
          }
        ].slice(-12));
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
            <OracleAnswerBody text={answer.answer} />
            {answer.intakeCards?.length ? (
              <div className="oracle-intake-list">
                {answer.intakeCards.map((card) => (
                  <article className="oracle-intake-card" key={card.evidenceId}>
                    <div className="oracle-intake-card-heading">
                      <span>Evidence Intake</span>
                      <strong>{card.initialCredibility}/100</strong>
                    </div>
                    <h4>{card.title}</h4>
                    <dl>
                      <div>
                        <dt>URL</dt>
                        <dd><a href={card.url} target="_blank" rel="noreferrer">{card.url}</a></dd>
                      </div>
                      <div>
                        <dt>Tags</dt>
                        <dd>{card.tags.join(", ") || "needs-tagging"}</dd>
                      </div>
                      <div>
                        <dt>Intake Notes</dt>
                        <dd>{card.intakeNotes}</dd>
                      </div>
                      <div>
                        <dt>Initial Credibility</dt>
                        <dd>{card.initialCredibility}/100 - {card.credibilityBasis}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="citation-list">
              {answer.citations.map((citation) => (
                <a key={citation.evidenceId} href={citation.sourceUrl} target="_blank" rel="noreferrer">
                  <strong>{citation.title}</strong>
                  <span>{citation.credibility}/100 / {citation.archiveStatus}</span>
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
