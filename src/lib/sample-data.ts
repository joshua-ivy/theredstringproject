import type { Connection, Conspiracy, Evidence, Project } from "@/types/domain";

const now = "2026-04-26T20:18:00.000Z";

export const sampleProjects: Project[] = [
  {
    id: "project-historical-intelligence",
    title: "Historical Intelligence Programs",
    summary: "Declassified programs, oversight records, and archive trails tied to intelligence activity.",
    credibility_avg: 75,
    case_count: 2,
    evidence_count: 11,
    string_count: 20,
    tags: ["cia", "fbi", "archives"],
    status: "active",
    last_weaved: now,
    created_at: now,
    updated_at: now
  },
  {
    id: "project-uap",
    title: "UFO / UAP",
    summary: "Government hearings, official reports, witness testimony, and aerospace records related to anomalous phenomena.",
    credibility_avg: 78,
    case_count: 1,
    evidence_count: 5,
    string_count: 9,
    tags: ["uap", "ufo", "defense"],
    status: "active",
    last_weaved: now,
    created_at: now,
    updated_at: now
  },
  {
    id: "project-election-media",
    title: "Election Media Claims",
    summary: "Claims about media amplification, voting systems, and cross-platform influence campaigns.",
    credibility_avg: 41,
    case_count: 1,
    evidence_count: 4,
    string_count: 6,
    tags: ["media", "elections", "influence"],
    status: "active",
    last_weaved: now,
    created_at: now,
    updated_at: now
  }
];

export const sampleConspiracies: Conspiracy[] = [
  {
    id: "case-mkultra",
    project_id: "project-historical-intelligence",
    title: "Project MKUltra",
    summary: "Historical records and recurring claims around covert mind-control programs, chemical experimentation, and institutional oversight.",
    credibility_avg: 78,
    evidence_count: 7,
    string_count: 13,
    tags: ["cia", "mind-control", "documents"],
    last_weaved: now
  },
  {
    id: "case-uap",
    project_id: "project-uap",
    title: "UAP Disclosure",
    summary: "Statements, imagery, and testimony related to unidentified anomalous phenomena and defense-program secrecy.",
    credibility_avg: 78,
    evidence_count: 5,
    string_count: 9,
    tags: ["uap", "defense", "aerospace"],
    last_weaved: now
  },
  {
    id: "case-cointel",
    project_id: "project-historical-intelligence",
    title: "COINTELPRO Cross-Refs",
    summary: "FBI counter-intelligence program records, surveillance directives, and contemporary parallels surfaced by archive cross-reference.",
    credibility_avg: 71,
    evidence_count: 4,
    string_count: 7,
    tags: ["fbi", "surveillance", "memos"],
    last_weaved: now
  },
  {
    id: "case-election-media",
    project_id: "project-election-media",
    title: "Election Media Claims",
    summary: "Claims about media amplification, voting-system narratives, and cross-platform influence campaigns.",
    credibility_avg: 41,
    evidence_count: 4,
    string_count: 6,
    tags: ["media", "elections", "influence"],
    last_weaved: now
  }
];

export const sampleEvidence: Evidence[] = [
  {
    id: "evidence-church-hearings",
    title: "Church Committee resource index",
    type: "pdf",
    platform: "archive",
    source_url: "https://www.intelligence.senate.gov/resources",
    canonical_url: "https://www.intelligence.senate.gov/resources",
    content_text: "Historical oversight materials referenced in claims about MKUltra and related CIA programs.",
    credibility_score: 86,
    credibility_explanation: "Primary institutional source with stable provenance. Interpretation still needs care because surrounding claims can exceed the document.",
    entities: ["CIA", "MKUltra", "Church Committee"],
    tags: ["cia", "documents"],
    archive_status: "link_only",
    archived_assets: [],
    content_hash: "sample-01",
    linked_conspiracy_ids: ["case-mkultra"],
    retrieved_at: now,
    created_at: now,
    analysis_status: "complete",
    review_status: "approved"
  },
  {
    id: "evidence-declassified-memo",
    title: "Declassified memo fragment",
    type: "image",
    platform: "user_upload",
    source_url: "local://sample/declassified-memo",
    canonical_url: "local://sample/declassified-memo",
    content_text: "A scanned memo excerpt allegedly tied to behavioral research procurement.",
    credibility_score: 52,
    credibility_explanation: "Partial scan with uncertain provenance. Needs corroboration against a complete archived source before publication.",
    entities: ["MKSEARCH", "CIA", "procurement"],
    tags: ["scan", "mkultra"],
    archive_status: "archived",
    archived_assets: [],
    content_hash: "sample-02",
    linked_conspiracy_ids: ["case-mkultra"],
    retrieved_at: now,
    created_at: now,
    analysis_status: "complete",
    review_status: "pending_review"
  },
  {
    id: "evidence-national-archives",
    title: "National Archives MKUltra collection",
    type: "pdf",
    platform: "archive",
    source_url: "https://www.archives.gov/",
    canonical_url: "https://www.archives.gov/",
    content_text: "Public archive reference point for declassified records and source trails related to MKUltra claims.",
    credibility_score: 74,
    credibility_explanation: "Stable archival provenance with useful source trails. It supports document discovery, but individual claims still need exact record matching.",
    entities: ["NARA", "MKUltra", "CIA"],
    tags: ["archives", "declassified"],
    archive_status: "link_only",
    archived_assets: [],
    content_hash: "sample-06",
    linked_conspiracy_ids: ["case-mkultra"],
    retrieved_at: now,
    created_at: now,
    analysis_status: "complete",
    review_status: "approved"
  },
  {
    id: "evidence-uap-testimony",
    title: "House Oversight UAP hearing transcript",
    type: "pdf",
    platform: "government",
    source_url: "https://docs.house.gov/meetings/GO/GO06/20230726/116282/HHRG-118-GO06-Transcript-20230726.pdf",
    canonical_url: "https://docs.house.gov/meetings/GO/GO06/20230726/116282/HHRG-118-GO06-Transcript-20230726.pdf",
    content_text: "Official transcript for the July 26, 2023 House Oversight hearing on Unidentified Anomalous Phenomena, including testimony from Ryan Graves, David Fravor, and David Grusch about UAP reporting, safety concerns, and alleged retrieval programs.",
    credibility_score: 84,
    credibility_explanation: "Official House transcript with stable .gov provenance and named witnesses. It is highly credible evidence that the testimony occurred, while the claims inside the testimony still require independent corroborating records.",
    entities: ["UAP", "House Oversight", "Ryan Graves", "David Fravor", "David Grusch", "DoD"],
    tags: ["uap", "testimony", "house-oversight", "transcript"],
    archive_status: "link_only",
    archived_assets: [],
    content_hash: "sample-03",
    linked_conspiracy_ids: ["case-uap"],
    retrieved_at: now,
    created_at: now,
    analysis_status: "complete",
    review_status: "approved"
  },
  {
    id: "evidence-social-claim",
    title: "Viral social claim",
    type: "link",
    platform: "x",
    source_url: "https://x.com/",
    canonical_url: "https://x.com/",
    content_text: "A high-engagement claim connecting voting-machine vendors to unrelated historical cases.",
    credibility_score: 34,
    credibility_explanation: "High reach but weak sourcing, emotional language, and low cross-verification.",
    entities: ["elections", "media", "voting systems"],
    tags: ["influence", "low-confidence"],
    archive_status: "link_only",
    archived_assets: [],
    content_hash: "sample-04",
    linked_conspiracy_ids: ["case-election-media"],
    retrieved_at: now,
    created_at: now,
    analysis_status: "complete",
    review_status: "pending_review"
  },
  {
    id: "evidence-rss-news",
    title: "News report with named documents",
    type: "text",
    platform: "web",
    source_url: "https://news.google.com/",
    canonical_url: "https://news.google.com/",
    content_text: "A report citing named filings and public records connected to intelligence contracting.",
    credibility_score: 73,
    credibility_explanation: "Secondary source, but cites public records and avoids unsupported leaps.",
    entities: ["contracting", "intelligence", "public records"],
    tags: ["news", "records"],
    archive_status: "link_only",
    archived_assets: [],
    content_hash: "sample-05",
    linked_conspiracy_ids: ["case-mkultra", "case-uap"],
    retrieved_at: now,
    created_at: now,
    analysis_status: "complete",
    review_status: "approved"
  }
];

export const sampleConnections: Connection[] = [
  {
    id: "conn-01",
    from: "evidence-church-hearings",
    to: "case-mkultra",
    type: "supports",
    weight: 0.9,
    ai_reason: "The evidence and case share named programs, oversight bodies, and historical timeframes.",
    created_at: now
  },
  {
    id: "conn-02",
    from: "evidence-national-archives",
    to: "case-mkultra",
    type: "supports",
    weight: 0.78,
    ai_reason: "The archive collection is a stable source trail for MKUltra-related records.",
    created_at: now
  },
  {
    id: "conn-03",
    from: "evidence-declassified-memo",
    to: "case-mkultra",
    type: "correlates",
    weight: 0.72,
    ai_reason: "The memo references entities commonly associated with the case, but provenance remains incomplete.",
    created_at: now
  },
  {
    id: "conn-04",
    from: "evidence-uap-testimony",
    to: "case-uap",
    type: "supports",
    weight: 0.84,
    ai_reason: "The official House transcript documents public UAP testimony, while the factual claims inside that testimony still need corroborating records.",
    created_at: now
  },
  {
    id: "conn-05",
    from: "evidence-social-claim",
    to: "case-election-media",
    type: "contradicts",
    weight: 0.34,
    ai_reason: "The claim is related to the case but has weak sourcing and high manipulation risk.",
    created_at: now
  },
  {
    id: "conn-06",
    from: "evidence-rss-news",
    to: "case-mkultra",
    type: "correlates",
    weight: 0.66,
    ai_reason: "The report cites public records that overlap with intelligence-contracting entities.",
    created_at: now
  },
  {
    id: "conn-07",
    from: "evidence-rss-news",
    to: "case-uap",
    type: "correlates",
    weight: 0.58,
    ai_reason: "Shared defense-program language creates a moderate semantic connection.",
    created_at: now
  },
  {
    id: "conn-08",
    from: "evidence-national-archives",
    to: "case-cointel",
    type: "correlates",
    weight: 0.52,
    ai_reason: "Archive records and oversight references overlap with surveillance-program source trails.",
    created_at: now
  },
  {
    id: "conn-09",
    from: "evidence-rss-news",
    to: "case-cointel",
    type: "correlates",
    weight: 0.46,
    ai_reason: "Named filings and public records intersect with counter-intelligence case entities.",
    created_at: now
  }
];
