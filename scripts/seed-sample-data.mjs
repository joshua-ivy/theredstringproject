import { createHash } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const projectId = "the-red-string-project";
initializeApp({
  credential: applicationDefault(),
  projectId
});

const db = getFirestore();

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

const cases = [
  {
    id: "case-mkultra",
    title: "Project MKUltra",
    summary:
      "Historical records and recurring claims around covert mind-control programs, chemical experimentation, and institutional oversight.",
    credibility_avg: 78,
    evidence_count: 2,
    string_count: 2,
    tags: ["cia", "mind-control", "documents"]
  },
  {
    id: "case-uap",
    title: "UAP Disclosure",
    summary:
      "Statements, imagery, and testimony related to unidentified anomalous phenomena and defense-program secrecy.",
    credibility_avg: 68,
    evidence_count: 1,
    string_count: 1,
    tags: ["uap", "defense", "testimony"]
  }
];

const evidences = [
  {
    id: "evidence-church-hearings",
    title: "Church Committee resource index",
    type: "link",
    platform: "government",
    source_url: "https://www.intelligence.senate.gov/resources",
    canonical_url: "https://www.intelligence.senate.gov/resources",
    content_text:
      "A public Senate Intelligence Committee resource page used as a source trail for historical oversight references.",
    credibility_score: 86,
    credibility_explanation:
      "Primary institutional source with stable provenance. Interpretation still needs care because surrounding claims can exceed the document.",
    entities: ["CIA", "Church Committee", "MKUltra"],
    tags: ["cia", "documents"],
    archive_status: "link_only",
    linked_conspiracy_ids: ["case-mkultra"],
    review_status: "approved"
  },
  {
    id: "evidence-national-archives-mkultra",
    title: "National Archives MKUltra collection reference",
    type: "link",
    platform: "archive",
    source_url: "https://www.archives.gov/",
    canonical_url: "https://www.archives.gov/",
    content_text:
      "A public archive reference point for locating declassified records and source trails related to MKUltra claims.",
    credibility_score: 74,
    credibility_explanation:
      "Strong provenance as an archive entry point, but each specific claim still needs a direct document citation.",
    entities: ["National Archives", "MKUltra", "declassified records"],
    tags: ["archive", "mkultra"],
    archive_status: "link_only",
    linked_conspiracy_ids: ["case-mkultra"],
    review_status: "approved"
  },
  {
    id: "evidence-uap-hearing",
    title: "House Oversight UAP hearing transcript",
    type: "pdf",
    platform: "government",
    source_url: "https://docs.house.gov/meetings/GO/GO06/20230726/116282/HHRG-118-GO06-Transcript-20230726.pdf",
    canonical_url: "https://docs.house.gov/meetings/GO/GO06/20230726/116282/HHRG-118-GO06-Transcript-20230726.pdf",
    content_text:
      "Official transcript for the July 26, 2023 House Oversight hearing on Unidentified Anomalous Phenomena, including testimony from Ryan Graves, David Fravor, and David Grusch about UAP reporting, safety concerns, and alleged retrieval programs.",
    credibility_score: 72,
    credibility_explanation:
      "Primary government transcript with named witnesses and stable provenance. It documents sworn testimony, but the underlying claims still require independent corroborating records.",
    entities: ["UAP", "House Oversight", "Ryan Graves", "David Fravor", "David Grusch", "DoD"],
    tags: ["uap", "testimony", "house-oversight", "transcript"],
    archive_status: "link_only",
    linked_conspiracy_ids: ["case-uap"],
    review_status: "approved"
  }
];

const connections = [
  {
    id: "conn-church-mkultra",
    from: "evidence-church-hearings",
    to: "case-mkultra",
    type: "supports",
    weight: 0.86,
    ai_reason: "The source is an institutional record trail for historical oversight material tied to the case."
  },
  {
    id: "conn-archives-mkultra",
    from: "evidence-national-archives-mkultra",
    to: "case-mkultra",
    type: "correlates",
    weight: 0.74,
    ai_reason: "The archive entry point relates to declassified document discovery for the case."
  },
  {
    id: "conn-uap-hearing",
    from: "evidence-uap-hearing",
    to: "case-uap",
    type: "supports",
    weight: 0.72,
    ai_reason: "The official House transcript documents public UAP testimony, while the factual claims inside that testimony still need corroborating records."
  }
];

const batch = db.batch();

for (const item of cases) {
  batch.set(
    db.collection("conspiracies").doc(item.id),
    {
      ...item,
      thumbnail: null,
      last_weaved: FieldValue.serverTimestamp(),
      embedding: []
    },
    { merge: true }
  );
}

for (const item of evidences) {
  batch.set(
    db.collection("evidences").doc(item.id),
    {
      ...item,
      archived_assets: [],
      content_hash: hash(item.canonical_url + item.content_text),
      retrieved_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      analysis_status: "complete",
      embedding: []
    },
    { merge: true }
  );
}

for (const item of connections) {
  batch.set(
    db.collection("connections").doc(item.id),
    {
      ...item,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

await batch.commit();
console.log(`Seeded ${cases.length} cases, ${evidences.length} evidence records, and ${connections.length} strings.`);
