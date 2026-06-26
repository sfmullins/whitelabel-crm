# White-Label Local-First CRM

A production-quality, local-first, privacy-first Customer Relationship Management (CRM) platform built with React, Node.js, and SQLite.

---

## Architecture Overview

The system is structured as an NPM monorepo containing three core packages:

1.  **`shared/`**: Common TypeScript models, DTO interfaces, and shared validation schemas (powered by Zod).
2.  **`backend/`**: An Express server interface interacting with a local SQLite database (`better-sqlite3`) managed through Drizzle ORM.
3.  **`frontend/`**: A React single-page application built on Vite and styled with a customizable Tailwind branding system.

```
┌─────────────────────────────────────────────────────────┐
│                    UI (React Frontend)                  │
│  Pages, components, routes, styles, and local state    │
└────────────────────────────┬────────────────────────────┘
                             │ Uses (via React Query)
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

### 3. Local Development Start
Start both backend and frontend development servers concurrently:
```bash
npm run dev
```
*   **Backend Server**: http://localhost:5000
*   **Frontend Dashboard**: http://localhost:3001 (auto-proxies `/api/*` requests to port 5000)

### 4. Build Production Bundle
Build and split optimized bundles for deployment:
```bash
npm run build
```

---

## Verification & Testing

Verify that all unit and functional specifications are met:
```bash
npm run test
```
The test suite validates financial calculations, tax rate snaps, and CSV parse behaviors.

---

## Core Enterprise Workflows

### 1. Online SQLite Database Backup
Uses the SQLite Online Backup API natively inside `better-sqlite3` to perform atomic, non-blocking backups into the `/data/backups/` directory.

### 2. CSV Customer Import
Features transactional database rollbacks: if any customer row or dynamic custom field value fails validation, the database rolls back completely to prevent data corruption.
