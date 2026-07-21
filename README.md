# White-Label Local-First CRM

A production-quality, local-first, privacy-first Customer Relationship Management (CRM) platform built with React, Node.js, and SQLite.

---

## Architecture Overview

The system is structured as an NPM monorepo containing three core packages:

1.  **`shared/`**: Common TypeScript models, DTO interfaces, and shared validation schemas (powered by Zod).
2.  **`backend/`**: An Express server interface interacting with a local SQLite database (`better-sqlite3`) managed through Drizzle ORM.
3.  **`frontend/`**: A React single-page application built on Vite and styled with a customizable Tailwind branding system.
4.  **`desktop/`**: An Electron-shell container that embeds the Express server and React client, isolating system operations behind an IPC security bridge.

```
┌─────────────────────────────────────────────────────────┐
│               Electron Container (Shell)                │
│  Window lifecycle, native path selectors, secure preload│
└────────────────────────────┬────────────────────────────┘
                             │ IPC Preload Bridge
┌────────────────────────────▼────────────────────────────┐
│                    UI (React Frontend)                  │
│  Pages, components, routes, styles, and local state    │
└────────────────────────────┬────────────────────────────┘
                             │ Local HTTP Requests
┌────────────────────────────▼────────────────────────────┐
│                    Presentation API                     │
│  Express controllers, middleware, and request validation│
└────────────────────────────┬────────────────────────────┘
                             │ Calls
┌────────────────────────────▼────────────────────────────┐
│                  Application Services / Repo            │
│  Use Cases (e.g. CreateBooking, ProcessPayment)        │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                Infrastructure (Database)                │
│  Drizzle ORM, SQLite DB, backups, and CSV imports      │
└─────────────────────────────────────────────────────────┘
```

---

## Database Relational Model (ER)

The SQLite database comprises 12 relational tables:
*   **Settings**: Stores business name, custom logo data URLs, dynamic color palettes, currency formats, and tax defaults.
*   **Customers**: Profiles with fuzzy search index optimizations and tag support.
*   **Services**: Catalog items with custom pricing in cents and tax rate configurations.
*   **Bookings**: Customer appointments schedule linked directly to auto-billing triggers.
*   **Invoices & Invoice Items**: Itemized billing states with status audits (`unpaid`, `paid`, `cancelled`).
*   **Payments**: Ledger entries recording partial or full payment collections against outstanding balances.
*   **Custom Fields**: Dynamic schema definitions and values linking custom attributes to core CRM entities.
*   **Custom Objects**: Relational Salesforce-style objects (e.g., Vehicles) linked to customer profiles.

---

## Setup & Execution

### 1. Installation
Install all workspaces dependencies:
```bash
npm install
```

### 2. Database Migrations & Seeding
Initialize the SQLite schema structure and populate it with realistic mock data:
```bash
# Generate schemas
npm run db:generate

# Run Drizzle migrations
npm run db:migrate

# Seed mock directory data
npm run db:seed
```

### 3. Local Development Start (Web Mode)
Start both backend and frontend development servers concurrently:
```bash
npm run dev
```
*   **Backend Server**: http://localhost:5000
*   **Frontend Dashboard**: http://localhost:3001 (auto-proxies `/api/*` requests to port 5000)

### 4. Build Production Web Bundle
Build and split optimized bundles for deployment:
```bash
npm run build
```

### 5. Local Development Start (Desktop Mode)
Launch the application locally in the Electron desktop container:
```bash
npm run desktop:start
```

### 6. Package Desktop Application
Bundle the application into a standalone binary inside `desktop/out/`:
```bash
npm run desktop:package
```

### 7. Create Installers (Debian .deb & .zip)
Build production installers and distributables for Linux:
```bash
npm run desktop:make
```
*   **ZIP Archive Target**: `desktop/out/make/zip/`
*   **Debian installer Target**: `desktop/out/make/deb/`

---

## Verification & Testing

Verify that all unit and functional specifications are met:
```bash
npm run test
```
The test suite validates financial calculations, tax rate snaps, CSV parse behaviors, AES-256-GCM encryption, integrity validation, and GFS backup retention schedules.

---

## Core Enterprise Workflows

### 1. Multi-tier Backup & Portability Engine
*   **Atomic Snapshots**: Uses the SQLite Online Backup API natively inside `better-sqlite3` to perform atomic, non-blocking snapshots.
*   **Encryption**: Generates cryptographically secure binary archives encrypted with AES-256-GCM using client-derived SHA-256 keys.
*   **S3 Cloud Sync**: Synchronizes backups directly to S3-compatible remote buckets using a custom, dependency-free AWS Signature V4 client.
*   **GFS Retention**: Rotates and cleans older backup files automatically based on Grandfather-Father-Son schedule counts (Daily, Weekly, Monthly limits).
*   **Integrity Assurance**: Runs `PRAGMA integrity_check` and tables schema scans on isolated database handles before finalizing any backup or restore operation.

### 2. CSV Customer Import
Features transactional database rollbacks: if any customer row or dynamic custom field value fails validation, the database rolls back completely to prevent data corruption.

### 3. Compliance & Auditing
Features a built-in third-party dependency scanner (`scratch/generate-licenses.js`) that enforces a strict permissive license check policy (MIT, Apache 2.0, BSD) on all project dependencies. Run the audit check via `npm run build`.

## WI4 CRM workspace

The development workspace is organisation-first. Global search uses the local SQLite FTS5 index, the organisation workspace consolidates contacts, engagements and a unified timeline, and activity follow-up dates drive the operational follow-up queue.

Reset and seed the prelaunch development database with Good Order Ltd and Acme Ltd:

```bash
npm run db:migrate
npm run db:seed
```

No external search or hosted workflow service is required. WI4 adds no runtime dependency and remains within the repository's FOSS licence gates.
