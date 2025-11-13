/**
 * Git Operations Module
 * 
 * Provides Git operations for workspace management.
 * Executes Git commands in sandbox environment.
 */

import { sandbox } from "./sandbox";

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  clean: boolean;
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

/**
 * Validate and escape Git command arguments to prevent command injection
 * 
 * KNOWN LIMITATION (Phase 5 improvement):
 * This function uses string escaping + shell quoting. For maximum safety,
 * Phase 5 will migrate to array-based exec APIs (e.g., spawn with argv array)
 * to eliminate shell parsing entirely.
 * 
 * Current approach: Reject most dangerous chars, allow legitimate ones with escaping
 */
function validateAndEscapeGitArg(arg: string, allowSpaces: boolean = true, allowQuotes: boolean = false): string {
  // Reject inputs with HIGH-RISK shell metacharacters
  const dangerousChars = /[;&|`$(){}[\]<>\\]/;
  if (dangerousChars.test(arg)) {
    throw new Error(`Invalid input: contains dangerous shell metacharacters`);
  }
  
  // Reject control characters and newlines
  if (/[\x00-\x1F\x7F]/.test(arg)) {
    throw new Error(`Invalid input: contains control characters`);
  }
  
  // If spaces not allowed (e.g., for remote names, branch names), reject them
  if (!allowSpaces && /\s/.test(arg)) {
    throw new Error(`Invalid input: spaces not allowed in this context`);
  }
  
  // Escape quotes if present (for commit messages, author names)
  let escaped = arg;
  if (!allowQuotes && /['"]/.test(arg)) {
    throw new Error(`Invalid input: quotes not allowed in this context`);
  }
  
  // Escape special chars for shell safety (defense in depth)
  escaped = escaped.replace(/\$/g, '\\$').replace(/`/g, '\\`');
  
  return escaped;
}

/**
 * Clone a Git repository into workspace
 * WARNING: This clones into the current workspace directory
 */
export async function cloneRepository(
  repoUrl: string,
  workspaceId: string,
  branch?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Validate URL format first
    if (!repoUrl.match(/^https?:\/\//i) && !repoUrl.match(/^git@/)) {
      return {
        success: false,
        output: "",
        error: "Invalid repository URL format",
      };
    }
    
    // Validate and escape inputs to prevent command injection (URLs allow spaces, branches don't allow spaces/quotes)
    const escapedUrl = validateAndEscapeGitArg(repoUrl, true, false);
    const escapedBranch = branch ? validateAndEscapeGitArg(branch, false, false) : undefined;
    
    const cmd = escapedBranch 
      ? `git clone --branch "${escapedBranch}" "${escapedUrl}" .`
      : `git clone "${escapedUrl}" .`;
    
    console.log(`[Git] Cloning repository: ${escapedUrl}`);
    const result = await sandbox.executeCommand(cmd, workspaceId);
    
    if (result.exitCode === 0) {
      console.log(`[Git] Repository cloned successfully`);
      return {
        success: true,
        output: result.output,
      };
    } else {
      console.error(`[Git] Clone failed:`, result.error || result.output);
      return {
        success: false,
        output: result.output,
        error: result.error || "Clone failed",
      };
    }
  } catch (error: any) {
    console.error(`[Git] Clone error:`, error);
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}

/**
 * Get Git status for workspace
 */
export async function getGitStatus(workspaceId: string): Promise<GitStatus | null> {
  try {
    // Get current branch
    const branchResult = await sandbox.executeCommand(
      "git rev-parse --abbrev-ref HEAD",
      workspaceId
    );
    const branch = branchResult.exitCode === 0 ? branchResult.output.trim() : "main";

    // Get ahead/behind counts
    const aheadBehindResult = await sandbox.executeCommand(
      "git rev-list --left-right --count @{u}...HEAD 2>/dev/null || echo '0\t0'",
      workspaceId
    );
    const [behind, ahead] = aheadBehindResult.output.trim().split(/\s+/).map(Number);

    // Get staged files
    const stagedResult = await sandbox.executeCommand(
      "git diff --cached --name-only",
      workspaceId
    );
    const staged = stagedResult.exitCode === 0 
      ? stagedResult.output.split("\n").filter(Boolean)
      : [];

    // Get modified files
    const modifiedResult = await sandbox.executeCommand(
      "git diff --name-only",
      workspaceId
    );
    const modified = modifiedResult.exitCode === 0
      ? modifiedResult.output.split("\n").filter(Boolean)
      : [];

    // Get untracked files
    const untrackedResult = await sandbox.executeCommand(
      "git ls-files --others --exclude-standard",
      workspaceId
    );
    const untracked = untrackedResult.exitCode === 0
      ? untrackedResult.output.split("\n").filter(Boolean)
      : [];

    const clean = staged.length === 0 && modified.length === 0 && untracked.length === 0;

    return {
      branch,
      ahead: ahead || 0,
      behind: behind || 0,
      staged,
      modified,
      untracked,
      clean,
    };
  } catch (error) {
    console.error(`[Git] Status error:`, error);
    return null;
  }
}

/**
 * Stage files for commit
 */
export async function stageFiles(
  workspaceId: string,
  files: string[]
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Validate file paths to prevent command injection (spaces allowed, quotes rejected)
    const escapedFiles = files.map(f => validateAndEscapeGitArg(f, true, false));
    
    // Stage all if empty array, otherwise stage individual files with proper quoting
    const filesArg = escapedFiles.length === 0 
      ? "." 
      : escapedFiles.map(f => `"${f}"`).join(" ");
      
    const result = await sandbox.executeCommand(
      `git add ${filesArg}`,
      workspaceId
    );
    
    return {
      success: result.exitCode === 0,
      output: result.output,
      error: result.exitCode !== 0 ? result.error : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}

/**
 * Commit staged changes
 */
export async function commit(
  workspaceId: string,
  message: string,
  author?: { name: string; email: string }
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Validate message (spaces and quotes allowed, will be escaped)
    const escapedMessage = validateAndEscapeGitArg(message, true, true).replace(/"/g, '\\"');
    
    let cmd = `git commit -m "${escapedMessage}"`;
    
    if (author) {
      // Validate author info (spaces allowed in names, quotes rejected in emails)
      const escapedName = validateAndEscapeGitArg(author.name, true, true).replace(/"/g, '\\"');
      const escapedEmail = validateAndEscapeGitArg(author.email, false, false);
      cmd = `git -c user.name="${escapedName}" -c user.email="${escapedEmail}" ${cmd}`;
    }
    
    const result = await sandbox.executeCommand(cmd, workspaceId);
    
    return {
      success: result.exitCode === 0,
      output: result.output,
      error: result.exitCode !== 0 ? result.error : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}

/**
 * Push commits to remote
 */
export async function push(
  workspaceId: string,
  remote = "origin",
  branch?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Validate remote and branch names (no spaces/quotes allowed)
    const escapedRemote = validateAndEscapeGitArg(remote, false, false);
    const escapedBranch = branch ? validateAndEscapeGitArg(branch, false, false) : undefined;
    
    const cmd = escapedBranch 
      ? `git push "${escapedRemote}" "${escapedBranch}"`
      : `git push "${escapedRemote}"`;
    
    const result = await sandbox.executeCommand(cmd, workspaceId);
    
    return {
      success: result.exitCode === 0,
      output: result.output,
      error: result.exitCode !== 0 ? result.error : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}

/**
 * Pull changes from remote
 */
export async function pull(
  workspaceId: string,
  remote = "origin",
  branch?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Validate remote and branch names (no spaces/quotes allowed)
    const escapedRemote = validateAndEscapeGitArg(remote, false, false);
    const escapedBranch = branch ? validateAndEscapeGitArg(branch, false, false) : undefined;
    
    const cmd = escapedBranch 
      ? `git pull "${escapedRemote}" "${escapedBranch}"`
      : `git pull "${escapedRemote}"`;
    
    const result = await sandbox.executeCommand(cmd, workspaceId);
    
    return {
      success: result.exitCode === 0,
      output: result.output,
      error: result.exitCode !== 0 ? result.error : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}

/**
 * Get commit history
 */
export async function getCommitHistory(
  workspaceId: string,
  limit = 10
): Promise<GitCommitInfo[]> {
  try {
    // Validate limit is a safe positive integer
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    
    const result = await sandbox.executeCommand(
      `git log --pretty=format:'%H|%an|%ai|%s' -n ${safeLimit}`,
      workspaceId
    );
    
    if (result.exitCode !== 0) {
      return [];
    }
    
    return result.output
      .split("\n")
      .filter(Boolean)
      .map(line => {
        const [hash, author, date, message] = line.split("|");
        return { hash, author, date, message };
      });
  } catch (error) {
    console.error(`[Git] History error:`, error);
    return [];
  }
}

/**
 * Initialize a new Git repository
 */
export async function initRepository(
  workspaceId: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const result = await sandbox.executeCommand("git init", workspaceId);
    
    return {
      success: result.exitCode === 0,
      output: result.output,
      error: result.exitCode !== 0 ? result.error : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}

/**
 * Set Git remote URL
 */
export async function setRemote(
  workspaceId: string,
  url: string,
  name = "origin"
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Validate URL format first
    if (!url.match(/^https?:\/\//i) && !url.match(/^git@/)) {
      return {
        success: false,
        output: "",
        error: "Invalid repository URL format",
      };
    }
    
    // Validate and escape inputs (URLs allow spaces, remote names don't allow spaces/quotes)
    const escapedUrl = validateAndEscapeGitArg(url, true, false);
    const escapedName = validateAndEscapeGitArg(name, false, false);
    
    // Check if remote exists
    const checkResult = await sandbox.executeCommand(
      `git remote get-url "${escapedName}"`,
      workspaceId
    );
    
    const cmd = checkResult.exitCode === 0
      ? `git remote set-url "${escapedName}" "${escapedUrl}"`
      : `git remote add "${escapedName}" "${escapedUrl}"`;
    
    const result = await sandbox.executeCommand(cmd, workspaceId);
    
    return {
      success: result.exitCode === 0,
      output: result.output,
      error: result.exitCode !== 0 ? result.error : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}
