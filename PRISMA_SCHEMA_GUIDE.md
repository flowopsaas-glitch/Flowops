# Prisma Database Schema Guide - FlowOps

This guide provides a comprehensive overview of the Prisma schema for FlowOps, with special focus on the DemoRequest model for storing demo request submissions.

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [DemoRequest Model](#demorequest-model)
3. [Complete Schema Reference](#complete-schema-reference)
4. [Database Migrations](#database-migrations)
5. [Querying Examples](#querying-examples)
6. [Best Practices](#best-practices)

---

## Schema Overview

The FlowOps Prisma schema is organized into several logical sections:

| Section | Purpose | Models |
|---------|---------|--------|
| **Generator & Datasource** | Configuration | client, MongoDB |
| **Workflow Models** | Automation workflows | Workflow, DatabaseDefinition |
| **Authentication** | User management | User, Role enum |
| **Memory Models** | Dynamic database storage | Column, SelectOption, DatabaseRecord |
| **Notes** | Operational notes | Note, NoteType enum |
| **Demo Requests** | Lead capture | DemoRequest, DemoStatus enum |

---

## DemoRequest Model

### Model Definition

```prisma
model DemoRequest {
  id          String     @id @default(auto()) @map("_id") @db.ObjectId
  fullName    String
  email       String
  companyName String
  phoneNumber String?
  companySize String
  message     String?
  status      DemoStatus @default(PENDING)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

enum DemoStatus {
  PENDING
  CONTACTED
  SCHEDULED
  COMPLETED
  CANCELLED
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String (ObjectId) | ✓ | Unique identifier, auto-generated MongoDB ObjectId |
| `fullName` | String | ✓ | Full name of the person requesting demo |
| `email` | String | ✓ | Email address for contact and confirmation |
| `companyName` | String | ✓ | Name of the company |
| `phoneNumber` | String | ✗ | Optional phone number for follow-up |
| `companySize` | String | ✓ | Company size category (e.g., "1-50", "51-200") |
| `message` | String | ✗ | Optional custom message from the requester |
| `status` | DemoStatus | ✓ | Current status of the demo request (default: PENDING) |
| `createdAt` | DateTime | ✓ | Timestamp when request was created |
| `updatedAt` | DateTime | ✓ | Timestamp of last update |

### Status Enum Values

The `DemoStatus` enum defines the lifecycle of a demo request:

| Status | Meaning | Use Case |
|--------|---------|----------|
| `PENDING` | Request received, awaiting action | Initial state when form submitted |
| `CONTACTED` | Sales team has reached out | After initial email/call to prospect |
| `SCHEDULED` | Demo meeting is scheduled | When date/time confirmed |
| `COMPLETED` | Demo has been conducted | After demo meeting concluded |
| `CANCELLED` | Request cancelled | If prospect withdraws or no response |

---

## Complete Schema Reference

### Full Prisma Schema File

**File:** `backend/prisma/schema.prisma`

```prisma
// FlowOps Consolidated Prisma Schema
// Combines schema for workflow and memory in a monolithic approach

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native"]
}

datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

// ============================================================================
// WORKFLOW MODELS
// ============================================================================

model Workflow {
  id                    String                 @id @default(auto()) @map("_id") @db.ObjectId
  name                  String
  script                String
  databaseDefinitions   DatabaseDefinition[]
  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt
}

// ============================================================================
// AUTHENTICATION & AUTHORIZATION MODELS
// ============================================================================

model User {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  email           String   @unique
  password        String
  name            String?
  companyName     String?
  plan            String?  @default("Starter")
  role            Role     @default(MEMBER)
  isUltimateOwner Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([email])
  @@index([role])
}

enum Role {
  ULTIMATE_OWNER
  ADMIN
  MEMBER
  CLIENT
}

// ============================================================================
// MEMORY & DATABASE MODELS
// ============================================================================

model DatabaseDefinition {
  id                String            @id @default(auto()) @map("_id") @db.ObjectId
  name              String
  workflow          Workflow          @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  workflowId        String            @db.ObjectId
  columns           Column[]
  databaseRecords   DatabaseRecord[]
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@index([workflowId])
}

model Column {
  id                     String             @id @default(auto()) @map("_id") @db.ObjectId
  name                   String
  type                   String
  required               Boolean            @default(false)
  description            String?
  options                SelectOption[]
  databaseDefinition     DatabaseDefinition @relation(fields: [databaseDefinitionId], references: [id], onDelete: Cascade)
  databaseDefinitionId   String             @db.ObjectId

  @@index([databaseDefinitionId])
}

model SelectOption {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  label     String
  color     String?
  column    Column   @relation(fields: [columnId], references: [id], onDelete: Cascade)
  columnId  String   @db.ObjectId

  @@index([columnId])
}

model DatabaseRecord {
  id                     String             @id @default(auto()) @map("_id") @db.ObjectId
  databaseDefinition     DatabaseDefinition @relation(fields: [databaseDefinitionId], references: [id], onDelete: Cascade)
  databaseDefinitionId   String             @db.ObjectId
  data                   Json
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt

  @@index([databaseDefinitionId])
  @@index([createdAt])
}

// ============================================================================
// NOTES & ANNOTATIONS MODELS
// ============================================================================

model Note {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  content    String
  operator   String
  type       NoteType
  targetId   String   @db.ObjectId
  manifestId String?  @db.ObjectId
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([targetId])
  @@index([manifestId])
  @@index([type])
}

enum NoteType {
  WAYBILL
  MANIFEST
}

// ============================================================================
// DEMO REQUEST MODELS (Lead Capture)
// ============================================================================

model DemoRequest {
  id          String     @id @default(auto()) @map("_id") @db.ObjectId
  fullName    String
  email       String
  companyName String
  phoneNumber String?
  companySize String
  message     String?
  status      DemoStatus @default(PENDING)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  // Indexes for common queries
  @@index([email])
  @@index([status])
  @@index([createdAt])
  @@index([companySize])
}

enum DemoStatus {
  PENDING
  CONTACTED
  SCHEDULED
  COMPLETED
  CANCELLED
}
```

---

## Database Migrations

### Initial Setup

```bash
# 1. Install Prisma CLI
npm install -D prisma

# 2. Generate Prisma Client
npx prisma generate

# 3. Push schema to database (creates collections)
npx prisma db push

# 4. Verify connection
npx prisma db seed
```

### After Schema Changes

```bash
# 1. Update schema.prisma file
# 2. Push changes to database
npx prisma db push

# 3. Generate updated Prisma Client
npx prisma generate

# 4. Restart backend server
npm run start:dev
```

### Viewing Database

```bash
# Open Prisma Studio (visual database browser)
npx prisma studio
```

This opens a web interface at `http://localhost:5555` where you can:
- View all collections
- Create, read, update, delete records
- Filter and search data
- Export data

---

## Querying Examples

### Create a Demo Request

```typescript
// Using Prisma Client
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a new demo request
const newRequest = await prisma.demoRequest.create({
  data: {
    fullName: 'John Doe',
    email: 'john@example.com',
    companyName: 'Acme Corp',
    phoneNumber: '+27 123 456 7890',
    companySize: '51-200',
    message: 'Interested in enterprise plan',
    status: 'PENDING',
  },
});

console.log('Created:', newRequest);
```

### Read Demo Requests

```typescript
// Get all demo requests
const allRequests = await prisma.demoRequest.findMany();

// Get requests by status
const pendingRequests = await prisma.demoRequest.findMany({
  where: { status: 'PENDING' },
});

// Get requests by email
const userRequest = await prisma.demoRequest.findFirst({
  where: { email: 'john@example.com' },
});

// Get requests with pagination
const paginatedRequests = await prisma.demoRequest.findMany({
  skip: 0,
  take: 10,
  orderBy: { createdAt: 'desc' },
});

// Count total requests
const totalCount = await prisma.demoRequest.count();

// Get requests by company size
const largeCompanyRequests = await prisma.demoRequest.findMany({
  where: { companySize: '51-200' },
});
```

### Update Demo Request

```typescript
// Update status to CONTACTED
const updated = await prisma.demoRequest.update({
  where: { id: 'request-id' },
  data: { status: 'CONTACTED' },
});

// Update multiple fields
const updated = await prisma.demoRequest.update({
  where: { id: 'request-id' },
  data: {
    status: 'SCHEDULED',
    message: 'Demo scheduled for 2024-01-25 at 2:00 PM',
  },
});

// Update many requests
const updated = await prisma.demoRequest.updateMany({
  where: { status: 'PENDING', createdAt: { lt: new Date('2024-01-01') } },
  data: { status: 'CANCELLED' },
});
```

### Delete Demo Request

```typescript
// Delete a single request
const deleted = await prisma.demoRequest.delete({
  where: { id: 'request-id' },
});

// Delete many requests
const deleted = await prisma.demoRequest.deleteMany({
  where: { status: 'CANCELLED' },
});
```

### Advanced Queries

```typescript
// Get requests grouped by company size
const grouped = await prisma.demoRequest.groupBy({
  by: ['companySize'],
  _count: true,
});

// Get requests with aggregation
const stats = await prisma.demoRequest.aggregate({
  _count: true,
  _min: { createdAt: true },
  _max: { createdAt: true },
});

// Get requests created in last 7 days
const recentRequests = await prisma.demoRequest.findMany({
  where: {
    createdAt: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  },
  orderBy: { createdAt: 'desc' },
});

// Search by email or company name
const searchResults = await prisma.demoRequest.findMany({
  where: {
    OR: [
      { email: { contains: 'example' } },
      { companyName: { contains: 'Tech' } },
    ],
  },
});
```

---

## Best Practices

### 1. Connection Management

```typescript
// ✅ Good: Use singleton pattern
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### 2. Error Handling

```typescript
// ✅ Good: Comprehensive error handling
try {
  const request = await prisma.demoRequest.create({
    data: { /* ... */ },
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      console.error('Unique constraint violation');
    }
  }
  throw error;
}
```

### 3. Query Optimization

```typescript
// ✅ Good: Select only needed fields
const requests = await prisma.demoRequest.findMany({
  select: {
    id: true,
    fullName: true,
    email: true,
    status: true,
  },
});

// ✅ Good: Use indexes for filtering
const requests = await prisma.demoRequest.findMany({
  where: { status: 'PENDING' }, // Indexed field
  orderBy: { createdAt: 'desc' }, // Indexed field
  take: 10,
});
```

### 4. Data Validation

```typescript
// ✅ Good: Validate before creating
import { z } from 'zod';

const DemoRequestSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  companyName: z.string().min(1),
  companySize: z.enum(['1-50', '51-200', '201-500', '500+']),
  phoneNumber: z.string().optional(),
  message: z.string().optional(),
});

const validated = DemoRequestSchema.parse(data);
const request = await prisma.demoRequest.create({ data: validated });
```

### 5. Transaction Support

```typescript
// ✅ Good: Use transactions for multiple operations
const result = await prisma.$transaction(async (tx) => {
  const request = await tx.demoRequest.create({
    data: { /* ... */ },
  });

  const user = await tx.user.update({
    where: { id: userId },
    data: { demoRequestCount: { increment: 1 } },
  });

  return { request, user };
});
```

### 6. Logging & Monitoring

```typescript
// ✅ Good: Log queries in development
const prisma = new PrismaClient({
  log: [
    { emit: 'stdout', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' },
  ],
});
```

---

## Performance Considerations

### Indexing Strategy

The DemoRequest model includes indexes on frequently queried fields:

```prisma
@@index([email])        // For finding requests by email
@@index([status])       // For filtering by status
@@index([createdAt])    // For sorting by date
@@index([companySize])  // For analytics and filtering
```

### Query Performance Tips

| Scenario | Optimization |
|----------|--------------|
| Filtering by status | Use indexed `status` field |
| Sorting by date | Use indexed `createdAt` field |
| Pagination | Combine `skip` and `take` |
| Aggregations | Use `groupBy` and `aggregate` |
| Large result sets | Use `select` to limit fields |

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Connection refused | Check `DATABASE_URL` in `.env` |
| Collection doesn't exist | Run `npx prisma db push` |
| Type errors | Run `npx prisma generate` |
| Stale data | Restart backend server |

### Debug Mode

```bash
# Enable detailed logging
export DEBUG="prisma:*"
npm run start:dev
```

---

## Summary

The Prisma schema provides:

- **Type-safe database access** with auto-generated types
- **MongoDB integration** for flexible document storage
- **Relationship management** with automatic cascading
- **Built-in validation** through field definitions
- **Performance optimization** with strategic indexing
- **Migration support** for schema evolution

The DemoRequest model is production-ready and optimized for demo request management workflows.
