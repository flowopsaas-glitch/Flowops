# 🔍 ELASTICSEARCH SETUP - Phase 4: Ghost-Search

## Quick Start (Local Development)

### Option 1: Docker Compose (Recommended)

```yaml
# docker-compose.yml (add to project root)
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: curl -s http://localhost:9200 >/dev/null || exit 1
      interval: 10s
      timeout: 10s
      retries: 5

volumes:
  elasticsearch_data:
```

**Start Elasticsearch:**
```bash
docker-compose up -d elasticsearch
```

**Verify running:**
```bash
curl http://localhost:9200
# Response: { "version": { "number": "8.11.0", ... } }
```

---

### Option 2: Manual Installation (macOS/Linux)

```bash
# Download & extract
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-darwin-x86_64.tar.gz
tar -xzf elasticsearch-8.11.0-darwin-x86_64.tar.gz
cd elasticsearch-8.11.0

# Edit config (disable security for dev)
vim config/elasticsearch.yml
# Add: xpack.security.enabled: false

# Run
./bin/elasticsearch
```

---

## Backend Integration

### 1. Enable Elasticsearch in ElasticsearchService

In `/backend/src/search/elasticsearch.service.ts`, uncomment the client initialization:

```typescript
private initializeClient() {
  try {
    const esHost = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

    // ✅ UNCOMMENT BELOW:
    const { Client } = require('@elastic/elasticsearch');
    this.esClient = new Client({ node: esHost });

    this.logger.log(`📊 Elasticsearch initialized (${esHost})`);
  } catch (err: any) {
    this.logger.warn(`⚠️ Elasticsearch not available: ${err.message}`);
  }
}
```

### 2. Implement Actual Indexing

Uncomment the actual Elasticsearch operations in the service methods:

```typescript
// In indexWaybill():
await this.esClient.index({
  index: `waybills-${waybill.companyId}`,
  id: waybill.id.toString(),
  body: document,
});

// In searchWaybills():
const result = await this.esClient.search({
  index: `waybills-${companyId}`,
  from: (page - 1) * pageSize,
  size: pageSize,
  query: {
    bool: {
      filter: filters,
    },
  },
  highlight: {
    fields: {
      fullText: {},
    },
  },
});
```

### 3. Update Environment

Add to `.env`:
```env
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX_PREFIX=flowops
```

---

## Testing Elasticsearch

### 1. Create Index Template

```bash
curl -X PUT "http://localhost:9200/_index_template/waybills" \
  -H "Content-Type: application/json" \
  -d '{
    "index_patterns": ["waybills-*"],
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0
    },
    "mappings": {
      "properties": {
        "waybillNumber": { "type": "keyword" },
        "recipient": { "type": "text", "analyzer": "standard" },
        "address": { "type": "text", "analyzer": "standard" },
        "driver": { "type": "text" },
        "zone": { "type": "keyword" },
        "status": { "type": "keyword" },
        "weight": { "type": "integer" },
        "createdAt": { "type": "date" },
        "fullText": { "type": "text", "analyzer": "standard" }
      }
    }
  }'
```

### 2. Index Sample Waybill

```bash
curl -X POST "http://localhost:9200/waybills-1/_doc" \
  -H "Content-Type: application/json" \
  -d '{
    "waybillNumber": "WB-001-2026",
    "recipient": "John Doe",
    "address": "123 Main St, Zone 5",
    "driver": "Ahmed",
    "weight": 45,
    "zone": "5",
    "status": "DELIVERED",
    "createdAt": "2026-04-19",
    "fullText": "WB-001-2026 John Doe 123 Main St, Zone 5 Ahmed"
  }'
```

### 3. Search for Waybill

```bash
curl -X GET "http://localhost:9200/waybills-1/_search?q=Zone%205" \
  -H "Content-Type: application/json"
```

### 4. Natural Language Search Test

```bash
curl -X POST "http://localhost:3000/search/advanced" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Find waybills from Zone 5 over 45kg last 30 days"
  }'
```

---

## Production Deployment

### 1. Enable Security (Production)

```yaml
# elasticsearch.yml
xpack.security.enabled: true
xpack.security.authc.api_key.enabled: true
```

### 2. Generate Certificates

```bash
./bin/elasticsearch-certutil ca --out=/tmp/elastic-stack-ca.p12
./bin/elasticsearch-certutil cert --ca=/tmp/elastic-stack-ca.p12 --out=/tmp/elastic-stack.p12
```

### 3. Update Backend Config

```env
ELASTICSEARCH_URL=https://username:password@es-prod:9200
ELASTICSEARCH_API_KEY=xxxxxx
```

### 4. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: elasticsearch
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: elasticsearch
        image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
        env:
        - name: discovery.seed_hosts
          value: "elasticsearch-0,elasticsearch-1,elasticsearch-2"
        - name: cluster.initial_master_nodes
          value: "elasticsearch-0,elasticsearch-1,elasticsearch-2"
```

---

## Monitoring

### 1. Check Cluster Health

```bash
curl -s http://localhost:9200/_cluster/health | jq '.'
```

### 2. View Indices

```bash
curl -s http://localhost:9200/_cat/indices?v
```

### 3. Monitor Index Size

```bash
curl -s http://localhost:9200/_cat/indices/waybills-*?v | grep store
```

### 4. Elasticsearch Kibana UI

Access at: `http://localhost:5601` (if running with Kibana)

---

## Performance Tuning

- **Refresh interval**: Set to 30s for batch indexing
- **Shards**: 1 per 30GB data (adjust `number_of_shards`)
- **Replicas**: 1 for HA, 0 for single-node dev
- **Heap size**: 50% of system RAM (min 1GB, max 32GB)
- **Bulk indexing**: Use `_bulk` API for large datasets

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Verify `ELASTICSEARCH_URL` env var, check port 9200 |
| Index not found | Ensure indexing is triggered on waybill creation |
| Query timeout | Increase pagination, add filters to narrow search |
| High memory | Reduce shard count, increase heap, use compression |
| Network errors | Check firewall rules, enable CORS if cross-origin |

---

**✅ Elasticsearch is now production-ready for Ghost-Search!**
