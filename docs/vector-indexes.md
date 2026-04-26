# Firestore Vector Indexes

The app stores Gemini embeddings on:

- `evidences.embedding`
- `conspiracies.embedding`

The app requests 768-dimensional Gemini embeddings. The vector indexes are also defined in
`firestore.indexes.json`, so `firebase deploy --only firestore:indexes` should create them with
current Firebase CLI versions.

If you need to create them manually, use:

```bash
gcloud firestore indexes composite create \
  --project=the-red-string-project \
  --database="(default)" \
  --collection-group=evidences \
  --query-scope=COLLECTION \
  --field-config field-path=embedding,vector-config='{"dimension":768,"flat":{}}'

gcloud firestore indexes composite create \
  --project=the-red-string-project \
  --database="(default)" \
  --collection-group=conspiracies \
  --query-scope=COLLECTION \
  --field-config field-path=embedding,vector-config='{"dimension":768,"flat":{}}'
```

Until the indexes are ready, the Functions code catches vector query failures and falls back to
recent evidence so ingestion still completes.
