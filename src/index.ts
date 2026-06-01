import dotenv from 'dotenv';

dotenv.config();

console.log('AI-Powered Engineering Onboarding Copilot scaffold is ready.');
console.log('Run `npm run ingest` to start the ingestion pipeline.');
console.log('Environment info:');
console.log({
  NODE_ENV: process.env.NODE_ENV ?? 'undefined',
  GITHUB_OWNER: process.env.GITHUB_OWNER ?? 'undefined',
  GITHUB_REPO: process.env.GITHUB_REPO ?? 'undefined',
  GITHUB_BRANCH: process.env.GITHUB_BRANCH ?? 'main',
  DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'undefined',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'set' : 'undefined',
});
