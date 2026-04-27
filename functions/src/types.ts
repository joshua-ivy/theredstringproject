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

export interface SupportingSource {
  id: string;
  kind: "url" | "upload";
  title: string;
  type: EvidenceType;
  source_url: string;
  canonical_url: string;
  content_text: string;
  archive_status: ArchiveStatus;
  archived_assets: ArchivedAsset[];
  content_hash: string;
  retrieved_at: string;
  notes?: string;
  storage_path?: string;
}

export interface EvidenceRecord {
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
  supporting_sources?: SupportingSource[];
  content_hash: string;
  linked_conspiracy_ids: string[];
  retrieved_at: FirebaseFirestore.FieldValue | string;
  created_at: FirebaseFirestore.FieldValue | string;
  updated_at?: FirebaseFirestore.FieldValue | string;
  embedding?: number[];
  analysis_status: "queued" | "analyzing" | "complete" | "failed";
  review_status: ReviewStatus;
  review_note?: string;
  discovery_source?: string;
  notes?: string;
}

export interface AnalysisResult {
  title: string;
  summary: string;
  entities: string[];
  tags: string[];
  credibility_score: number;
  credibility_explanation: string;
  credibility_breakdown: Record<string, number>;
  manipulation_flags: string[];
  suggested_connections: Array<{
    label: string;
    type: ConnectionType;
    weight: number;
    reason: string;
  }>;
}
