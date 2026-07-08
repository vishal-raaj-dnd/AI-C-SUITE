# Acme Corp Product & Technical Architecture Roadmap

## 1. Stack and Infrastructure
* **Frontend:** React 19 + TypeScript + Vite + Tailwind.
* **Backend:** Node.js, Express (or Fastify), running SQLite for local development and PostgreSQL for production deployments.
* **Hosting:** Docker containerized deployments on Google Cloud Run.
* **Database Scaling:** SQLite currently handles our local tests. PostgreSQL is used in staging/production. The server contains a read-replica configuration to distribute query load.

## 2. Feature Gating Technical Capability
To launch a freemium tier, our backend must support feature-gating:
* **Current Implementation:** Gating is binary (user has active subscription `true`/`false`).
* **Required Changes:** Upgrade middleware to check fine-grained user entitlements. We need a role/permission framework:
  - `Free` tier: Capped at 1 workspace, 50 API requests/day, basic dashboard.
  - `Pro` tier: Unlimited requests, advanced analytics, custom API integrations.
* **Complexity & Tech Debt:** Gating analytics requires refactoring our database queries to count weekly data volumes per user. This is estimated at 3-4 developer-weeks of effort.

## 3. Database Scaling & Infrastructure Costs
* **Active Database Connections:** 1,200 concurrent.
* **Database Size:** 180 GB and growing.
* **Freemium Traffic Projection:** If signup volume increases 4x, database writes (audit logging, workspace telemetry) will spike by 300%.
* **Mitigation:** We must implement Redis caching on active workspace sessions to offload database reads and transition telemetry to asynchronous background queues. Without this, SQLite local engines will block on write locks, and PostgreSQL replica costs will double.
