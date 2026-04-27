export type EvidenceType = "image" | "text" | "pdf" | "video" | "link";

export type ArchiveStatus = "archived" | "link_only" | "blocked" | "failed";

export type ConnectionType = "supports" | "contradicts" | "correlates";

export type ReviewStatus = "pending_review" | "approved" | "rejected";

export interface ArchivedAsset {
  path: string;
  url?: string;
  contentType?: string;
  bytes?: number;
  kind: "source" | "image" | "pdf" | "thumbnail" | "text" | "metadata";
  hash?: string;
}

export interface Evidence {
  id: string;
  title: string;
  type: EvidenceType;
  platform: string;
  source_url: string;
  canonical_url: string;
  content_text: string;
  media_url?: string;
  credibility_score: number;
  credibility_explanation: string;
  credibility_breakdown?: Record<string, number>;
  manipulation_flags?: string[];
  entities: string[];
  tags: string[];
  archive_status: ArchiveStatus;
  archived_assets: ArchivedAsset[];
  content_hash: string;
  linked_conspiracy_ids: string[];
  retrieved_at: string;
  created_at: string;
  updated_at?: string;
  embedding?: number[];
  analysis_status?: "queued" | "analyzing" | "complete" | "failed";
  review_status?: ReviewStatus;
  review_note?: string;
}

export interface Conspiracy {
  id: string;
  title: string;
  summary: string;
  credibility_avg: number;
  evidence_count: number;
  string_count: number;
  tags: string[];
  thumbnail?: string;
  last_weaved: string;
  embedding?: number[];
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  type: ConnectionType;
  weight: number;
  ai_reason: string;
  created_at: string;
  updated_at?: string;
}

export interface OracleCitation {
  evidenceId: string;
  title: string;
  sourceUrl: string;
  archiveStatus: ArchiveStatus;
  credibility: number;
}

export interface OracleIntakeCard {
  evidenceId: string;
  title: string;
  url: string;
  tags: string[];
  intakeNotes: string;
  initialCredibility: number;
  credibilityBasis: string;
  archiveStatus: ArchiveStatus;
}

export interface AnalysisJob {
  id: string;
  evidence_id: string;
  status: "queued" | "running" | "complete" | "failed" | string;
  error?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SearchRun {
  id: string;
  query: string;
  provider: string;
  status: "running" | "complete" | "failed" | string;
  result_count?: number;
  error?: string;
  created_at?: string;
  updated_at?: string;
}
