import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';

dotenv.config();

const allowedExtensions = ['.ts', '.js', '.jsx', '.md', '.json'];

function hasAllowedExtension(path: string) {
  return allowedExtensions.some((ext) => path.toLowerCase().endsWith(ext));
}

export type GitHubFile = {
  path: string;
  content: string;
  repo: string;
  commitSha?: string;
};

export async function crawlGitHubRepo(): Promise<GitHubFile[]> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? 'main';

  if (!token || !owner || !repo) {
    throw new Error('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO in environment variables.');
  }

  const octokit = new Octokit({ auth: token });
  console.log('Fetching repository tree from GitHub...');

  const branchResponse = await octokit.repos.getBranch({ owner, repo, branch });
  const treeSha = branchResponse.data.commit.sha;

  const treeResponse = await octokit.git.getTree({ owner, repo, tree_sha: treeSha, recursive: 'true' });
  const allItems = treeResponse.data.tree ?? [];
  const blobItems = allItems.filter((item) => item.type === 'blob' && item.path && hasAllowedExtension(item.path));

  console.log(`Found ${blobItems.length} files matching allowed extensions.`);

  const files = await Promise.all(
    blobItems.map(async (item) => {
      if (!item.sha || !item.path) {
        throw new Error('Unexpected tree item with missing sha or path.');
      }

      const blob = await octokit.git.getBlob({ owner, repo, file_sha: item.sha });
      const content = Buffer.from(blob.data.content, blob.data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');

      return {
        path: item.path,
        content,
        repo,
        commitSha: item.sha,
      };
    }),
  );

  return files;
}
