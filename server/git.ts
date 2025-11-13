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
 * Clone a Git repository into workspace
 */
export async function cloneRepository(
  repoUrl: string,
  workspaceId: string,
  branch?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const cmd = branch 
      ? `git clone --branch ${branch} ${repoUrl} .`
      : `git clone ${repoUrl} .`;
    
    console.log(`[Git] Cloning repository: ${repoUrl}`);
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
    const filesArg = files.length === 0 ? "." : files.join(" ");
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
    let cmd = `git commit -m "${message.replace(/"/g, '\\"')}"`;
    
    if (author) {
      cmd = `git -c user.name="${author.name}" -c user.email="${author.email}" ${cmd}`;
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
    const cmd = branch 
      ? `git push ${remote} ${branch}`
      : `git push ${remote}`;
    
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
    const cmd = branch 
      ? `git pull ${remote} ${branch}`
      : `git pull ${remote}`;
    
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
    const result = await sandbox.executeCommand(
      `git log --pretty=format:'%H|%an|%ai|%s' -n ${limit}`,
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
    // Check if remote exists
    const checkResult = await sandbox.executeCommand(
      `git remote get-url ${name}`,
      workspaceId
    );
    
    const cmd = checkResult.exitCode === 0
      ? `git remote set-url ${name} ${url}`
      : `git remote add ${name} ${url}`;
    
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
