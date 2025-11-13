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
 * Basic input validation for Git commands
 * With argv-based execution, we only need to reject truly invalid characters
 * All other characters (parentheses, quotes, newlines, etc.) are safe
 */
function validateGitInput(input: string, allowNewlines: boolean = false): void {
  // Only reject null bytes and other truly invalid control characters
  // Allow newlines (0x0A) and carriage returns (0x0D) when specified
  if (allowNewlines) {
    // Reject null byte and other problematic control chars (not newlines)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input)) {
      throw new Error(`Invalid input: contains invalid control characters`);
    }
  } else {
    // Reject all control characters including newlines
    if (/[\x00-\x1F\x7F]/.test(input)) {
      throw new Error(`Invalid input: contains control characters`);
    }
  }
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
    // Validate URL format
    if (!repoUrl.match(/^https?:\/\//i) && !repoUrl.match(/^git@/)) {
      return {
        success: false,
        output: "",
        error: "Invalid repository URL format",
      };
    }
    
    // Validate inputs (only reject control characters)
    validateGitInput(repoUrl);
    if (branch) validateGitInput(branch);
    
    // Build argv array - NO SHELL PARSING, all special chars are safe
    const argv = branch
      ? ["git", "clone", "--branch", branch, repoUrl, "."]
      : ["git", "clone", repoUrl, "."];
    
    console.log(`[Git] Cloning repository: ${repoUrl}`);
    const result = await sandbox.executeCommandArgv(argv, workspaceId);
    
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
    const branchResult = await sandbox.executeCommandArgv(
      ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      workspaceId
    );
    const branch = branchResult.exitCode === 0 ? branchResult.output.trim() : "main";

    // Get ahead/behind counts (fallback to 0,0 if no upstream)
    const aheadBehindResult = await sandbox.executeCommandArgv(
      ["sh", "-c", "git rev-list --left-right --count @{u}...HEAD 2>/dev/null || echo '0\t0'"],
      workspaceId
    );
    const [behind, ahead] = aheadBehindResult.output.trim().split(/\s+/).map(Number);

    // Get staged files
    const stagedResult = await sandbox.executeCommandArgv(
      ["git", "diff", "--cached", "--name-only"],
      workspaceId
    );
    const staged = stagedResult.exitCode === 0 
      ? stagedResult.output.split("\n").filter(Boolean)
      : [];

    // Get modified files
    const modifiedResult = await sandbox.executeCommandArgv(
      ["git", "diff", "--name-only"],
      workspaceId
    );
    const modified = modifiedResult.exitCode === 0
      ? modifiedResult.output.split("\n").filter(Boolean)
      : [];

    // Get untracked files
    const untrackedResult = await sandbox.executeCommandArgv(
      ["git", "ls-files", "--others", "--exclude-standard"],
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
    // Validate file paths (only reject control characters)
    files.forEach(f => validateGitInput(f));
    
    // Build argv array with -- separator to handle filenames starting with hyphens
    const argv = files.length === 0
      ? ["git", "add", "."]
      : ["git", "add", "--", ...files];
      
    const result = await sandbox.executeCommandArgv(argv, workspaceId);
    
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
    // Validate inputs - allow newlines in commit messages, only reject truly invalid chars
    validateGitInput(message, true);
    if (author) {
      validateGitInput(author.name, false);
      validateGitInput(author.email, false);
    }
    
    // Build argv array - ALL characters including quotes, parentheses, newlines are safe!
    let argv: string[];
    if (author) {
      argv = [
        "git",
        "-c", `user.name=${author.name}`,
        "-c", `user.email=${author.email}`,
        "commit",
        "-m", message
      ];
    } else {
      argv = ["git", "commit", "-m", message];
    }
    
    const result = await sandbox.executeCommandArgv(argv, workspaceId);
    
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
    // Validate inputs (only reject control characters)
    validateGitInput(remote);
    if (branch) validateGitInput(branch);
    
    // Build argv array
    const argv = branch
      ? ["git", "push", remote, branch]
      : ["git", "push", remote];
    
    const result = await sandbox.executeCommandArgv(argv, workspaceId);
    
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
    // Validate inputs (only reject control characters)
    validateGitInput(remote);
    if (branch) validateGitInput(branch);
    
    // Build argv array
    const argv = branch
      ? ["git", "pull", remote, branch]
      : ["git", "pull", remote];
    
    const result = await sandbox.executeCommandArgv(argv, workspaceId);
    
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
    
    // Use null-byte separator which is never valid in commit messages
    const argv = [
      "git", "log",
      "--pretty=format:%H%x00%an%x00%ai%x00%s",
      "-n", safeLimit.toString()
    ];
    
    const result = await sandbox.executeCommandArgv(argv, workspaceId);
    
    if (result.exitCode !== 0) {
      return [];
    }
    
    return result.output
      .split("\n")
      .filter(Boolean)
      .map(line => {
        const [hash, author, date, message] = line.split("\x00");
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
    const result = await sandbox.executeCommandArgv(["git", "init"], workspaceId);
    
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
    // Validate URL format
    if (!url.match(/^https?:\/\//i) && !url.match(/^git@/)) {
      return {
        success: false,
        output: "",
        error: "Invalid repository URL format",
      };
    }
    
    // Validate inputs (only reject control characters)
    validateGitInput(url);
    validateGitInput(name);
    
    // Check if remote exists
    const checkResult = await sandbox.executeCommandArgv(
      ["git", "remote", "get-url", name],
      workspaceId
    );
    
    // Build argv based on whether remote exists
    const argv = checkResult.exitCode === 0
      ? ["git", "remote", "set-url", name, url]
      : ["git", "remote", "add", name, url];
    
    const result = await sandbox.executeCommandArgv(argv, workspaceId);
    
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
