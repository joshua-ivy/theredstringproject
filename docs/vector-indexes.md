# Firestore Vector Indexes

The app stores Gemini embeddings on:

- `evidences.embedding`
- `conspiracies.embedding`

Create KNN indexes before relying on production vector search. The exact command may vary by Google
Cloud CLI version, but the intended indexes are:

```bash
gcloud firestore indexes composite create \
  --project=the-red-string-project \
  --database="(default)" \
  --collection-group=evidences \
  --query-scope=COLLECTION \
  --field-config field-path=embedding,vector-config='{"dimension":"auto","flat":{}}'

gcloud firestore indexes composite create \
  --project=the-red-string-project \
  --database="(default)" \
  --collection-group=conspiracies \
  --query-scope=COLLECTION \
  --field-config field-path=embedding,vector-config='{"dimension":"auto","flat":{}}'
```

If your CLI requires an explicit dimension, use the dimension returned by the configured Gemini
embedding model. Until the indexes are ready, the Functions code catches vector query failures and
falls back to recent evidence so ingestion still completes.
