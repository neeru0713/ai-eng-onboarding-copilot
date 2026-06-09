import dotenv from "dotenv";
import { Octokit } from "@octokit/rest";
import type { Chunk } from "./schema.js";

dotenv.config();

/**
 * Fetches pull requests updated in the last 6 months from the GitHub repository,
 * retrieves the first review comment for each, and formats them into a list of Chunks.
 * 
 * @returns Array of Chunk objects representing pull requests.
 */
export async function crawlPRs(): Promise<Chunk[]> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    throw new Error("Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO in environment variables.");
  }

  const octokit = new Octokit({ auth: token });
  console.log(`PR Crawler: Fetching pull requests for ${owner}/${repo}...`);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const chunks: Chunk[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    console.log(`PR Crawler: Fetching page ${page} of PRs...`);
    const response = await octokit.pulls.list({
      owner,
      repo,
      state: "all",
      sort: "updated",
      direction: "desc",
      per_page: 50,
      page,
    });

    const prs = response.data;
    if (prs.length === 0) {
      break;
    }

    for (const pr of prs) {
      const updatedAt = new Date(pr.updated_at);
      
      // If the PR was updated before six months ago, we can stop fetching because the list is sorted desc by updated date
      if (updatedAt < sixMonthsAgo) {
        hasMore = false;
        break;
      }

      console.log(`PR Crawler: Processing PR #${pr.number} (Updated: ${pr.updated_at})`);

      // Fetch first review comment or issue comment
      let firstComment = "";
      try {
        const reviewComments = await octokit.pulls.listReviewComments({
          owner,
          repo,
          pull_number: pr.number,
          per_page: 1,
          sort: "created",
          direction: "asc",
        });

        if (reviewComments.data && reviewComments.data.length > 0) {
          firstComment = reviewComments.data[0].body;
        } else {
          // Fall back to general PR timeline comments if no diff review comments exist
          const issueComments = await octokit.issues.listComments({
            owner,
            repo,
            issue_number: pr.number,
            per_page: 1,
            sort: "created",
            direction: "asc",
          });

          if (issueComments.data && issueComments.data.length > 0) {
            firstComment = issueComments.data[0].body || "";
          }
        }
      } catch (err: any) {
        console.warn(`PR Crawler: Failed to retrieve comments for PR #${pr.number}:`, err.message);
      }

      const commentSection = firstComment ? `\n\nFirst Comment:\n${firstComment}` : "";
      const text = `PR #${pr.number}: ${pr.title}\nState: ${pr.state}\nAuthor: ${pr.user?.login || "unknown"}\nCreated: ${pr.created_at}\n\nDescription:\n${pr.body || "No description provided."}${commentSection}`;

      chunks.push({
        repo,
        filePath: `PR #${pr.number} — ${pr.title}`,
        startLine: 1,
        text,
        source: "pr",
        commitSha: pr.merge_commit_sha || undefined,
      });
    }

    if (prs.length < 50) {
      break;
    }
    page += 1;
  }

  console.log(`PR Crawler: Ingested ${chunks.length} pull request(s) from the last 6 months.`);
  return chunks;
}
