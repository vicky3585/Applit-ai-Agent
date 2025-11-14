/**
 * Auto Package Installer
 * Detects imports in generated code and automatically installs packages
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface PackageInstallResult {
  success: boolean;
  packagesInstalled: string[];
  errors: string[];
  logs: string[];
}

export interface DetectedPackage {
  name: string;
  type: "npm" | "pip" | "apt";
  confidence: "high" | "medium" | "low";
}

/**
 * Parse JavaScript/TypeScript files for import statements
 */
function parseJavaScriptImports(content: string): string[] {
  const packages = new Set<string>();
  
  // Match: import ... from 'package'
  const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    // Skip relative imports
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      continue;
    }
    
    // Extract package name (handle scoped packages like @react/core)
    const packageName = importPath.startsWith("@")
      ? importPath.split("/").slice(0, 2).join("/")
      : importPath.split("/")[0];
    
    packages.add(packageName);
  }
  
  // Match: require('package')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  
  while ((match = requireRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      continue;
    }
    
    const packageName = importPath.startsWith("@")
      ? importPath.split("/").slice(0, 2).join("/")
      : importPath.split("/")[0];
    
    packages.add(packageName);
  }
  
  return Array.from(packages);
}

/**
 * Parse Python files for import statements
 */
function parsePythonImports(content: string): string[] {
  const packages = new Set<string>();
  
  // Match: import package
  const importRegex = /^import\s+(\w+)/gm;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    packages.add(match[1]);
  }
  
  // Match: from package import ...
  const fromImportRegex = /^from\s+(\w+)/gm;
  
  while ((match = fromImportRegex.exec(content)) !== null) {
    packages.add(match[1]);
  }
  
  return Array.from(packages);
}

/**
 * Detect packages from file content based on language
 */
export function detectPackages(files: Array<{ path: string; content: string; language?: string }>): DetectedPackage[] {
  const detectedPackages: DetectedPackage[] = [];
  
  for (const file of files) {
    const ext = path.extname(file.path);
    const language = file.language || ext.slice(1);
    
    let packageNames: string[] = [];
    let packageType: "npm" | "pip" | "apt" = "npm";
    
    // JavaScript/TypeScript
    if (["js", "jsx", "ts", "tsx", "javascript", "typescript"].includes(language)) {
      packageNames = parseJavaScriptImports(file.content);
      packageType = "npm";
    }
    // Python
    else if (["py", "python"].includes(language)) {
      packageNames = parsePythonImports(file.content);
      packageType = "pip";
    }
    
    // Filter out built-in packages
    const filteredPackages = filterBuiltInPackages(packageNames, packageType);
    
    for (const name of filteredPackages) {
      detectedPackages.push({
        name,
        type: packageType,
        confidence: "high",
      });
    }
  }
  
  // Deduplicate
  const uniquePackages = Array.from(
    new Map(detectedPackages.map(p => [p.name, p])).values()
  );
  
  return uniquePackages;
}

/**
 * Filter out built-in Node.js and Python packages
 */
function filterBuiltInPackages(packages: string[], type: "npm" | "pip" | "apt"): string[] {
  if (type === "npm") {
    const builtIns = new Set([
      "fs", "path", "os", "http", "https", "url", "util", "events",
      "stream", "crypto", "buffer", "process", "child_process", "cluster",
      "dns", "net", "readline", "repl", "tty", "v8", "vm", "zlib",
      "assert", "constants", "module", "timers", "string_decoder",
      "querystring", "punycode", "domain", "async_hooks", "perf_hooks",
      "worker_threads", "inspector", "trace_events"
    ]);
    
    return packages.filter(p => !builtIns.has(p));
  }
  
  if (type === "pip") {
    const builtIns = new Set([
      "sys", "os", "re", "json", "datetime", "time", "math", "random",
      "collections", "itertools", "functools", "operator", "pathlib",
      "io", "pickle", "copy", "pprint", "textwrap", "unicodedata",
      "string", "difflib", "hashlib", "hmac", "secrets", "struct",
      "codecs", "typing", "enum", "abc", "contextlib", "warnings",
      "dataclasses", "asyncio", "concurrent", "multiprocessing", "threading",
      "subprocess", "socket", "ssl", "select", "signal", "logging"
    ]);
    
    return packages.filter(p => !builtIns.has(p));
  }
  
  return packages;
}

/**
 * Check if package is already installed
 */
async function isPackageInstalled(packageName: string, type: "npm" | "pip"): Promise<boolean> {
  try {
    if (type === "npm") {
      const { stdout } = await execAsync(`npm list ${packageName} --depth=0`);
      return stdout.includes(packageName);
    } else if (type === "pip") {
      const { stdout } = await execAsync(`pip show ${packageName}`);
      return stdout.includes(`Name: ${packageName}`);
    }
  } catch {
    return false;
  }
  
  return false;
}

/**
 * Install packages using appropriate package manager
 */
export async function installPackages(
  packages: DetectedPackage[],
  workspaceDir: string,
  onProgress?: (message: string) => void
): Promise<PackageInstallResult> {
  const result: PackageInstallResult = {
    success: true,
    packagesInstalled: [],
    errors: [],
    logs: [],
  };
  
  // Group packages by type
  const npmPackages = packages.filter(p => p.type === "npm").map(p => p.name);
  const pipPackages = packages.filter(p => p.type === "pip").map(p => p.name);
  
  // Install npm packages
  if (npmPackages.length > 0) {
    onProgress?.(`📦 Detecting npm packages to install: ${npmPackages.join(", ")}`);
    result.logs.push(`Detected npm packages: ${npmPackages.join(", ")}`);
    
    // Filter already installed
    const toInstall: string[] = [];
    for (const pkg of npmPackages) {
      const installed = await isPackageInstalled(pkg, "npm");
      if (!installed) {
        toInstall.push(pkg);
      } else {
        result.logs.push(`✓ ${pkg} already installed`);
      }
    }
    
    if (toInstall.length > 0) {
      onProgress?.(`⏳ Installing ${toInstall.length} npm package(s): ${toInstall.join(", ")}`);
      
      try {
        const { stdout, stderr } = await execAsync(
          `npm install ${toInstall.join(" ")}`,
          { cwd: workspaceDir, timeout: 120000 } // 2 min timeout
        );
        
        result.packagesInstalled.push(...toInstall);
        result.logs.push(`✓ Successfully installed: ${toInstall.join(", ")}`);
        result.logs.push(stdout);
        
        if (stderr) {
          result.logs.push(`Warnings: ${stderr}`);
        }
        
        onProgress?.(`✅ Installed ${toInstall.length} npm package(s)`);
      } catch (error: any) {
        result.success = false;
        result.errors.push(`Failed to install npm packages: ${error.message}`);
        result.logs.push(`✗ Error: ${error.message}`);
        onProgress?.(`❌ Failed to install npm packages: ${error.message}`);
      }
    } else {
      onProgress?.(`✅ All npm packages already installed`);
    }
  }
  
  // Install pip packages
  if (pipPackages.length > 0) {
    onProgress?.(`📦 Detecting pip packages to install: ${pipPackages.join(", ")}`);
    result.logs.push(`Detected pip packages: ${pipPackages.join(", ")}`);
    
    const toInstall: string[] = [];
    for (const pkg of pipPackages) {
      const installed = await isPackageInstalled(pkg, "pip");
      if (!installed) {
        toInstall.push(pkg);
      } else {
        result.logs.push(`✓ ${pkg} already installed`);
      }
    }
    
    if (toInstall.length > 0) {
      onProgress?.(`⏳ Installing ${toInstall.length} pip package(s): ${toInstall.join(", ")}`);
      
      try {
        const { stdout, stderr } = await execAsync(
          `pip install ${toInstall.join(" ")}`,
          { cwd: workspaceDir, timeout: 120000 }
        );
        
        result.packagesInstalled.push(...toInstall);
        result.logs.push(`✓ Successfully installed: ${toInstall.join(", ")}`);
        result.logs.push(stdout);
        
        if (stderr) {
          result.logs.push(`Warnings: ${stderr}`);
        }
        
        onProgress?.(`✅ Installed ${toInstall.length} pip package(s)`);
      } catch (error: any) {
        result.success = false;
        result.errors.push(`Failed to install pip packages: ${error.message}`);
        result.logs.push(`✗ Error: ${error.message}`);
        onProgress?.(`❌ Failed to install pip packages: ${error.message}`);
      }
    } else {
      onProgress?.(`✅ All pip packages already installed`);
    }
  }
  
  return result;
}

/**
 * Main function: auto-detect and install packages from generated files
 */
export async function autoInstallPackages(
  files: Array<{ path: string; content: string; language?: string }>,
  workspaceDir: string,
  onProgress?: (message: string) => void
): Promise<PackageInstallResult> {
  onProgress?.("🔍 Analyzing generated code for package dependencies...");
  
  // Detect packages
  const detectedPackages = detectPackages(files);
  
  if (detectedPackages.length === 0) {
    onProgress?.("ℹ️ No external packages detected");
    return {
      success: true,
      packagesInstalled: [],
      errors: [],
      logs: ["No external packages detected"],
    };
  }
  
  onProgress?.(`📋 Found ${detectedPackages.length} package(s) to check: ${detectedPackages.map(p => p.name).join(", ")}`);
  
  // Install packages
  return await installPackages(detectedPackages, workspaceDir, onProgress);
}
