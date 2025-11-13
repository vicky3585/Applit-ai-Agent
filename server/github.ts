/**
 * GitHub Integration Module
 * 
 * Provides GitHub API client with automatic OAuth token management.
 * Uses Replit's GitHub connector for secure authentication.
 */

import { Octokit } from '@octokit/rest';

let connectionSettings: any;

/**
 * Get GitHub access token from Replit connectors
 * Automatically refreshes if expired
 */
async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

/**
 * Get GitHub client with fresh access token
 * WARNING: Never cache this client. Always call this function to get a fresh client.
 */
export async function getGitHubClient(): Promise<Octokit> {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

/**
 * Check if GitHub integration is connected
 */
export async function isGitHubConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get authenticated user information
 */
export async function getAuthenticatedUser() {
  const octokit = await getGitHubClient();
  const { data } = await octokit.rest.users.getAuthenticated();
  return data;
}

/**
 * List user repositories
 */
export async function listUserRepos(page = 1, perPage = 30) {
  const octokit = await getGitHubClient();
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    page,
    per_page: perPage,
    sort: 'updated',
    direction: 'desc',
  });
  return data;
}

/**
 * Get repository details
 */
export async function getRepository(owner: string, repo: string) {
  const octokit = await getGitHubClient();
  const { data } = await octokit.rest.repos.get({
    owner,
    repo,
  });
  return data;
}

/**
 * List repository branches
 */
export async function listBranches(owner: string, repo: string) {
  const octokit = await getGitHubClient();
  const { data } = await octokit.rest.repos.listBranches({
    owner,
    repo,
  });
  return data;
}
