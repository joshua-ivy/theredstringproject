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
      const localMatches = evidences
        .filter((evidence) => evidence.credibility_score >= credibilityMin)
        .filter((evidence) =>
          `${evidence.title} ${evidence.content_text} ${evidence.entities.join(" ")}`
            .toLowerCase()
            .includes(prompt.toLowerCase().split(" ")[0] ?? "")
        )
        .slice(0, 5);

      if (localMatches.length > 0) {
        setAnswer({
          answer:
            "The live Oracle function was unavailable, so this is a local fallback over currently loaded evidence. It found related records, but did not run Gemini reasoning.",
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
        {!isAdminHint ? <p className="system-message">Read-only users can ask, but server policy may restrict the callable.</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="oracle-answer">
        {answer ? (
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
