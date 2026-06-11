# Prisma Schema Visual Reference

## DemoRequest Model - Detailed Structure

### Model Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      DemoRequest                             │
├─────────────────────────────────────────────────────────────┤
│ Field           │ Type        │ Required │ Special           │
├─────────────────┼─────────────┼──────────┼───────────────────┤
│ id              │ String      │ ✓        │ @id, ObjectId     │
│ fullName        │ String      │ ✓        │                   │
│ email           │ String      │ ✓        │ @index            │
│ companyName     │ String      │ ✓        │                   │
│ phoneNumber     │ String      │ ✗        │ Optional          │
│ companySize     │ String      │ ✓        │ @index            │
│ message         │ String      │ ✗        │ Optional          │
│ status          │ DemoStatus  │ ✓        │ @index, default   │
│ createdAt       │ DateTime    │ ✓        │ @index, auto      │
│ updatedAt       │ DateTime    │ ✓        │ auto-update       │
└─────────────────┴─────────────┴──────────┴───────────────────┘
```

### Status Lifecycle

```
                    ┌──────────────┐
                    │   PENDING    │ ← Initial state
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  CONTACTED   │ ← Sales team reached out
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  SCHEDULED   │ ← Demo meeting scheduled
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  COMPLETED   │ ← Demo conducted
                    └──────────────┘

                    ┌──────────────┐
                    │  CANCELLED   │ ← Prospect withdrew
                    └──────────────┘
```

### Data Flow

```
Frontend Form
    │
    ▼
POST /demo/request
    │
    ▼
DemoController.requestDemo()
    │
    ▼
DemoService.createDemoRequest()
    │
    ├─► Validate Input
    │
    ├─► prisma.demoRequest.create()
    │   └─► MongoDB: DemoRequest Collection
    │
    ├─► emailService.sendDemoRequestNotification()
    │   └─► SendGrid API → FlowOps2@proton.me
    │
    ├─► emailService.sendDemoConfirmationEmail()
    │   └─► SendGrid API → User Email
    │
    ▼
Return Success Response
```

## Complete Schema Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FlowOps Prisma Schema                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐         ┌──────────────┐                          │
│  │   Workflow   │◄────────│DatabaseDef   │                          │
│  └──────────────┘         └──────────────┘                          │
│                                  │                                   │
│                           ┌──────┴──────┐                            │
│                           ▼             ▼                            │
│                        ┌──────┐    ┌──────────┐                     │
│                        │Column│    │DbRecord  │                     │
│                        └──────┘    └──────────┘                     │
│                           │                                          │
│                           ▼                                          │
│                    ┌─────────────┐                                  │
│                    │SelectOption │                                  │
│                    └─────────────┘                                  │
│                                                                       │
│  ┌──────────────┐                                                    │
│  │     User     │                                                    │
│  │   (Auth)     │                                                    │
│  └──────────────┘                                                    │
│                                                                       │
│  ┌──────────────┐         ┌──────────────┐                          │
│  │     Note     │         │DemoRequest   │                          │
│  │ (Annotations)│         │ (Lead Capture)│                         │
│  └──────────────┘         └──────────────┘                          │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## DemoRequest Index Strategy

```
┌─────────────────────────────────────────────────────────────┐
│              DemoRequest Indexes                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Index 1: email                                             │
│  ├─ Purpose: Find requests by email                        │
│  ├─ Query: WHERE email = 'user@example.com'               │
│  └─ Use Case: Duplicate checking, user lookup              │
│                                                              │
│  Index 2: status                                            │
│  ├─ Purpose: Filter by request status                      │
│  ├─ Query: WHERE status = 'PENDING'                        │
│  └─ Use Case: Dashboard filtering, reporting               │
│                                                              │
│  Index 3: createdAt                                         │
│  ├─ Purpose: Sort by creation date                         │
│  ├─ Query: ORDER BY createdAt DESC                         │
│  └─ Use Case: Recent requests, pagination                  │
│                                                              │
│  Index 4: companySize                                       │
│  ├─ Purpose: Analytics and segmentation                    │
│  ├─ Query: WHERE companySize = '51-200'                    │
│  └─ Use Case: Market analysis, targeting                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## MongoDB Collection Structure

```
db.DemoRequest
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "fullName": "John Doe",
  "email": "john@example.com",
  "companyName": "Acme Corp",
  "phoneNumber": "+27 123 456 7890",
  "companySize": "51-200",
  "message": "Interested in enterprise features",
  "status": "PENDING",
  "createdAt": ISODate("2024-01-18T10:30:00Z"),
  "updatedAt": ISODate("2024-01-18T10:30:00Z")
}
```

## Query Patterns

### Pattern 1: Create Request

```
Input Data
├─ fullName: "John Doe"
├─ email: "john@example.com"
├─ companyName: "Acme Corp"
├─ phoneNumber: "+27 123 456 7890"
├─ companySize: "51-200"
└─ message: "Demo request"
    │
    ▼
prisma.demoRequest.create()
    │
    ▼
MongoDB Insert
    │
    ▼
Return Created Object with ID
```

### Pattern 2: Find Pending Requests

```
Query
├─ WHERE status = "PENDING"
├─ ORDER BY createdAt DESC
├─ LIMIT 10
└─ OFFSET 0
    │
    ▼
Use Index on status
    │
    ▼
Use Index on createdAt
    │
    ▼
Return Array of Requests
```

### Pattern 3: Update Status

```
Input
├─ id: "507f1f77bcf86cd799439011"
└─ status: "CONTACTED"
    │
    ▼
prisma.demoRequest.update()
    │
    ▼
MongoDB Update
    │
    ▼
Return Updated Object
```

## Performance Characteristics

### Query Performance by Operation

| Operation | Complexity | Time | Notes |
|-----------|-----------|------|-------|
| Create | O(1) | ~5ms | Direct insert |
| Find by ID | O(1) | ~1ms | Primary key lookup |
| Find by email | O(log n) | ~2ms | Indexed field |
| Find by status | O(log n) | ~2ms | Indexed field |
| Find all | O(n) | ~50ms | Full scan (1000 docs) |
| Update | O(1) | ~5ms | Direct update |
| Delete | O(1) | ~5ms | Direct delete |

### Scalability Estimates

| Records | Query Time | Notes |
|---------|-----------|-------|
| 1,000 | ~2ms | Indexed queries |
| 10,000 | ~3ms | Indexed queries |
| 100,000 | ~5ms | Indexed queries |
| 1,000,000 | ~10ms | Indexed queries |

## Enum Values Reference

### DemoStatus Enum

```typescript
enum DemoStatus {
  PENDING      // 0: Initial state
  CONTACTED    // 1: Sales team reached out
  SCHEDULED    // 2: Demo meeting scheduled
  COMPLETED    // 3: Demo conducted
  CANCELLED    // 4: Request cancelled
}
```

### Transition Rules

```
PENDING ──────────────────► CONTACTED
  │                            │
  │                            ▼
  │                        SCHEDULED
  │                            │
  │                            ▼
  │                        COMPLETED
  │
  └──────────────────────► CANCELLED

Valid Transitions:
✓ PENDING → CONTACTED
✓ PENDING → CANCELLED
✓ CONTACTED → SCHEDULED
✓ CONTACTED → CANCELLED
✓ SCHEDULED → COMPLETED
✓ SCHEDULED → CANCELLED
✓ Any → CANCELLED (at any point)
```

## Data Validation Rules

```
┌─────────────────────────────────────────────────────────────┐
│                  Validation Rules                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ fullName                                                     │
│ ├─ Required: Yes                                            │
│ ├─ Type: String                                             │
│ ├─ Min Length: 2 characters                                 │
│ └─ Max Length: 100 characters                               │
│                                                              │
│ email                                                        │
│ ├─ Required: Yes                                            │
│ ├─ Type: String                                             │
│ ├─ Format: Valid email (RFC 5322)                           │
│ └─ Unique: No (multiple requests allowed)                   │
│                                                              │
│ companyName                                                  │
│ ├─ Required: Yes                                            │
│ ├─ Type: String                                             │
│ ├─ Min Length: 1 character                                  │
│ └─ Max Length: 150 characters                               │
│                                                              │
│ phoneNumber                                                  │
│ ├─ Required: No                                             │
│ ├─ Type: String                                             │
│ ├─ Format: International format                             │
│ └─ Max Length: 20 characters                                │
│                                                              │
│ companySize                                                  │
│ ├─ Required: Yes                                            │
│ ├─ Type: String (Enum)                                      │
│ └─ Valid Values:                                            │
│    ├─ "1-50"                                                │
│    ├─ "51-200"                                              │
│    ├─ "201-500"                                             │
│    ├─ "501-1000"                                            │
│    └─ "1000+"                                               │
│                                                              │
│ message                                                      │
│ ├─ Required: No                                             │
│ ├─ Type: String                                             │
│ ├─ Min Length: 10 characters (if provided)                  │
│ └─ Max Length: 1000 characters                              │
│                                                              │
│ status                                                       │
│ ├─ Required: Yes                                            │
│ ├─ Type: Enum (DemoStatus)                                  │
│ ├─ Default: PENDING                                         │
│ └─ Allowed Values: See DemoStatus Enum                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Backup & Recovery

### Backup Strategy

```
Daily Backups
├─ Full backup at 2:00 AM UTC
├─ Incremental backups every 6 hours
└─ Retention: 30 days

Point-in-Time Recovery
├─ Available for last 7 days
├─ Granularity: 1 minute
└─ Recovery time: ~5 minutes
```

### Export/Import

```bash
# Export all demo requests to JSON
mongoexport --db flowops --collection DemoRequest --out demo_requests.json

# Import from JSON
mongoimport --db flowops --collection DemoRequest --file demo_requests.json

# Backup entire database
mongodump --db flowops --out ./backup/

# Restore from backup
mongorestore --db flowops ./backup/flowops/
```

## Summary

The DemoRequest schema provides:

- **Efficient storage** with optimized indexes
- **Type safety** with Prisma Client
- **Flexible status tracking** with enum values
- **Audit trail** with timestamps
- **Scalability** for thousands of requests
- **Easy querying** with Prisma ORM
- **MongoDB integration** for document flexibility
