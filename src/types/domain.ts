export type EvidenceType = "image" | "text" | "pdf" | "video" | "link";

export type ArchiveStatus = "archived" | "link_only" | "blocked" | "failed";

export type ConnectionType = "supports" | "contradicts" | "correlates";

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
