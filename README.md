# AI-Powered Engineering Onboarding Copilot

An intelligent agent that cuts new engineer ramp-up from weeks to days by answering codebase questions, surfacing relevant PRs, explaining architectural decisions, and auto-generating a personalised learning path from GitHub, Confluence, and Slack data.

## Getting started

1. Install packages:
   ```bash
   npm install
   ```
2. Start the database:
   ```bash
   docker compose up -d
   ```
3. Run the scaffold app:
   ```bash
   npm run ingest
   ```

## What is included

- TypeScript scaffold with `src/` code layout
- ingestion pipeline entrypoint in `src/ingestion/index.ts`
- placeholder modules for GitHub crawling, chunking, and embedding
- `docker-compose.yml` for a PostgreSQL + pgvector database
