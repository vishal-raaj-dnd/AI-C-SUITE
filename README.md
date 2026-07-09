# Quorum AI - Multi-Perspective Executive Decision Support Board

Quorum AI is an agentic workspace designed to support executive decisions by simulating a boardroom debate among five virtual C-level advisors: CMO, CFO, CTO, COO, and a Contrarian (Devil's Advocate). The system retrieves files from a scoped Knowledge Base and executes specialized tools (financial calculators, competitor web searches) to generate multi-perspective analysis cards.

---

## Key Features & Architecture

* **Bypassed Auth Flow**: The application is configured to bypass the login screen, automatically placing you in the dashboard under the default demo account (`demo@quorum.ai` / `default_user`).
* **Groq Model Priority**: Runs on Groq (`llama-3.1-8b-instant`) as the primary execution engine for maximum speed.
* **OpenRouter Fallback**: Seamlessly routes full model paths (e.g. `google/gemini-2.5-flash`) via OpenRouter when configured.
* **Rate-Limit Mitigation**: Advisor steps are staggered by 1.5 seconds during parallel execution phases. This prevents concurrent request spikes from hitting Groq's 429 (Too Many Requests) limits.

---

## Directory Structure

* **`client/`**: React, Vite, and Tailwind CSS frontend application.
* **`server/`**: Express.js server, local SQLite database orchestration, and multi-agent debate workflows.
* **`fixtures/`**: Pre-seeded knowledge base documents partitioned into operational folders (`marketing/`, `finance/`, `tech/`, `ops/`).

---

## Local Development

### 1. Install Dependencies
In the root directory, run:
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (based on `.env.example`) with your API credentials:

```env
# Primary LLM API Settings
GROQ_API_KEY="your-groq-api-key"
GROQ_MODEL="llama-3.1-8b-instant"

# Fallback/OpenRouter Settings
OPENROUTER_API_KEY="your-openrouter-key"
OPENROUTER_MODEL="google/gemini-2.5-flash"

# Web Research Tool (Optional)
SERPAPI_API_KEY="your-serpapi-key"

# Supabase Sync Settings (Optional)
SUPABASE_URL="your-supabase-url"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

APP_URL="http://localhost:3000"
```

### 3. Run the Servers

You need to run both the backend API server and the frontend dev server.

* **Start the Backend API Server** (runs on port `3001`):
  ```bash
  npm run server
  ```
* **Start the Frontend Development Server** (runs on port `3000`):
  ```bash
  npm run dev
  ```

Now, navigate to [http://localhost:3000/](http://localhost:3000/) to access the dashboard.
