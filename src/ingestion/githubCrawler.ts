import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';

dotenv.config();

const allowedExtensions = ['.ts', '.js', '.jsx', '.md', '.json'];

function hasAllowedExtension(path: string) {
  return allowedExtensions.some((ext) => path.toLowerCase().endsWith(ext));
}

function maskValue(value?: string) {
  if (!value) return 'undefined';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
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

  console.log('GitHub crawler configuration:');
  console.log({
    owner,
    repo,
    branch,
    token: token ? maskValue(token) : 'undefined',
    allowedExtensions,
  });

  if (!token || !owner || !repo) {
    throw new Error('Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO in environment variables.');
  }

  const octokit = new Octokit({ auth: token });
  console.log('Fetching repository tree from GitHub...');

  const branchResponse = await octokit.repos.getBranch({ owner, repo, branch });
  const treeSha = branchResponse.data.commit.sha;
  console.log('Resolved branch commit SHA:', treeSha);

  const treeResponse = await octokit.git.getTree({ owner, repo, tree_sha: treeSha, recursive: 'true' });
  const allItems = treeResponse.data.tree ?? [];
  console.log('Total tree items returned by GitHub:', allItems.length);

  const blobItems = allItems.filter((item) => item.type === 'blob' && item.path && hasAllowedExtension(item.path));
  console.log(`Found ${blobItems.length} files matching allowed extensions.`);
  console.log('Sample matched file paths:', blobItems.slice(0, 10).map((item) => item.path));

  const files = await Promise.all(
    blobItems.map(async (item, index) => {
      if (!item.sha || !item.path) {
        throw new Error('Unexpected tree item with missing sha or path.');
      }

      console.log(`Downloading file ${index + 1}/${blobItems.length}: ${item.path} (${item.sha})`);
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

  console.log('Finished downloading GitHub files.');
  return files;
}
