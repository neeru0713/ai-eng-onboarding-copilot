# AI-Powered Engineering Onboarding Copilot

An intelligent agent that cuts new engineer ramp-up from weeks to days by answering codebase questions, surfacing relevant PRs, explaining architectural decisions, and auto-generating a personalised learning path from GitHub, Confluence, and Slack data.

## Getting started

1. Install packages:
   ```bash
   npm install
   ```
2. Copy the example environment file and fill in the values:
   ```bash
   cp .env.example .env
   ```
3. Start the database:
   ```bash
   docker compose up -d
   ```
4. Run the ingestion pipeline:
   ```bash
   npm run ingest
   ```

## Environment variables

- `GITHUB_TOKEN` — GitHub access token with repository read permissions
- `GITHUB_OWNER` — owner or organization name for the repo
- `GITHUB_REPO` — repository name
- `GITHUB_BRANCH` — branch to ingest (default: `main`)
- `OPENAI_API_KEY` — API key for embeddings
- `DATABASE_URL` — Postgres connection string

## What is included

- TypeScript scaffold with `src/` code layout
- ingestion pipeline entrypoint in `src/ingestion/index.ts`
- placeholder modules for GitHub crawling, chunking, and embedding
- `docker-compose.yml` for a PostgreSQL + pgvector database
