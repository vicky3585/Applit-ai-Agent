/**
 * Language Capability Registry
 * 
 * Centralized registry defining how to detect and execute code in different languages.
 * Supports interpreted languages, compiled languages, and framework scripts.
 */

export type LanguageMode = "interpreter" | "compile-run" | "script";

export interface RunCommandContext {
  filePath?: string; // Original source file path for context
  mainClass?: string; // For Java: fully qualified main class name (package.ClassName)
}

export interface LanguageCapability {
  // Language identification
  id: string;
  name: string;
  extensions: string[];
  
  // Detection rules
  shebangPatterns?: RegExp[];
  frameworkFiles?: string[]; // package.json, Cargo.toml, go.mod, etc.
  
  // Execution configuration
  mode: LanguageMode;
  interpreter?: string; // For interpreter mode
  compiler?: string; // For compile-run mode
  runner?: string; // For running compiled output
  
  // Build configuration (for compile-run mode)
  buildCommand?: (filePath: string, outputPath: string) => string[];
  runCommand?: (outputPath: string, context?: RunCommandContext) => string[];
  
  // Script configuration (for script mode)
  scriptRunner?: string; // npm, cargo, go, etc.
  defaultScript?: string; // Default script to run
  
  // Runtime requirements
  requiredTools: string[]; // Tools that must be present
  
  // Execution limits
  compileTimeout?: number; // ms
  runTimeout?: number; // ms
  
  // Error handling
  compileErrorPattern?: RegExp; // Pattern to detect compilation errors
  runtimeErrorPattern?: RegExp; // Pattern to detect runtime errors
}

/**
 * Language capability registry
 */
export const LANGUAGE_REGISTRY: Record<string, LanguageCapability> = {
  // JavaScript
  javascript: {
    id: "javascript",
    name: "JavaScript",
    extensions: ["js", "mjs", "cjs"],
    shebangPatterns: [/^#!.*\bnode\b/],
    frameworkFiles: ["package.json"],
    mode: "interpreter",
    interpreter: "node",
    requiredTools: ["node"],
    runTimeout: 30000,
  },
  
  // TypeScript
  typescript: {
    id: "typescript",
    name: "TypeScript",
    extensions: ["ts", "mts", "cts"],
    frameworkFiles: ["package.json", "tsconfig.json"],
    mode: "interpreter",
    interpreter: "npx tsx",
    requiredTools: ["node", "npx"],
    runTimeout: 30000,
  },
  
  // Python
  python: {
    id: "python",
    name: "Python",
    extensions: ["py"],
    shebangPatterns: [/^#!.*\bpython[23]?\b/],
    frameworkFiles: ["requirements.txt", "pyproject.toml", "setup.py"],
    mode: "interpreter",
    interpreter: "python3",
    requiredTools: ["python3"],
    runTimeout: 30000,
  },
  
  // Go
  go: {
    id: "go",
    name: "Go",
    extensions: ["go"],
    frameworkFiles: ["go.mod", "go.sum"],
    mode: "compile-run",
    compiler: "go",
    buildCommand: (filePath, outputPath) => [
      "go", "build", "-o", outputPath, filePath
    ],
    runCommand: (outputPath) => [outputPath],
    requiredTools: ["go"],
    compileTimeout: 60000,
    runTimeout: 30000,
  },
  
  // Rust
  rust: {
    id: "rust",
    name: "Rust",
    extensions: ["rs"],
    frameworkFiles: ["Cargo.toml", "Cargo.lock"],
    mode: "compile-run",
    compiler: "rustc",
    buildCommand: (filePath, outputPath) => [
      "rustc", filePath, "-o", outputPath
    ],
    runCommand: (outputPath) => [outputPath],
    requiredTools: ["rustc"],
    compileTimeout: 120000,
    runTimeout: 30000,
  },
  
  // C
  c: {
    id: "c",
    name: "C",
    extensions: ["c"],
    mode: "compile-run",
    compiler: "gcc",
    buildCommand: (filePath, outputPath) => [
      "gcc", filePath, "-o", outputPath, "-Wall"
    ],
    runCommand: (outputPath) => [outputPath],
    requiredTools: ["gcc"],
    compileTimeout: 60000,
    runTimeout: 30000,
  },
  
  // C++
  cpp: {
    id: "cpp",
    name: "C++",
    extensions: ["cpp", "cc", "cxx", "c++"],
    mode: "compile-run",
    compiler: "g++",
    buildCommand: (filePath, outputPath) => [
      "g++", filePath, "-o", outputPath, "-Wall", "-std=c++17"
    ],
    runCommand: (outputPath) => [outputPath],
    requiredTools: ["g++"],
    compileTimeout: 60000,
    runTimeout: 30000,
  },
  
  // Java
  java: {
    id: "java",
    name: "Java",
    extensions: ["java"],
    frameworkFiles: ["pom.xml", "build.gradle"],
    mode: "compile-run",
    compiler: "javac",
    buildCommand: (filePath, buildDir) => {
      // For Java, buildDir should be just the directory, not file-specific
      // Extract just the language build directory (remove filename suffix)
      const javaBuildDir = buildDir.split("/").slice(0, -1).join("/");
      return ["javac", filePath, "-d", javaBuildDir];
    },
    runCommand: (buildPath, context?: RunCommandContext) => {
      // For Java, use the language build directory as classpath
      const javaBuildDir = buildPath.split("/").slice(0, -1).join("/");
      // Use fully qualified class name if available (includes package)
      const className = context?.mainClass || 
        context?.filePath?.split("/").pop()?.replace(".java", "") || 
        "Main";
      return ["java", "-cp", javaBuildDir, className];
    },
    requiredTools: ["javac", "java"],
    compileTimeout: 60000,
    runTimeout: 30000,
  },
  
  // Ruby
  ruby: {
    id: "ruby",
    name: "Ruby",
    extensions: ["rb"],
    shebangPatterns: [/^#!.*\bruby\b/],
    frameworkFiles: ["Gemfile"],
    mode: "interpreter",
    interpreter: "ruby",
    requiredTools: ["ruby"],
    runTimeout: 30000,
  },
  
  // PHP
  php: {
    id: "php",
    name: "PHP",
    extensions: ["php"],
    shebangPatterns: [/^#!.*\bphp\b/],
    frameworkFiles: ["composer.json"],
    mode: "interpreter",
    interpreter: "php",
    requiredTools: ["php"],
    runTimeout: 30000,
  },
  
  // Shell/Bash
  shell: {
    id: "shell",
    name: "Shell",
    extensions: ["sh"],
    shebangPatterns: [/^#!.*\b(bash|sh|zsh)\b/],
    mode: "interpreter",
    interpreter: "bash",
    requiredTools: ["bash"],
    runTimeout: 30000,
  },
  
  // Bash
  bash: {
    id: "bash",
    name: "Bash",
    extensions: ["bash"],
    shebangPatterns: [/^#!.*\bbash\b/],
    mode: "interpreter",
    interpreter: "bash",
    requiredTools: ["bash"],
    runTimeout: 30000,
  },
};

/**
 * Script framework capabilities (npm, cargo, go, etc.)
 */
export interface ScriptFramework {
  id: string;
  name: string;
  configFile: string; // package.json, Cargo.toml, etc.
  runner: string; // npm, cargo, go
  defaultCommand: string[]; // Default command to run
  runCommand: (scriptName: string) => string[]; // How to run a specific script
}

export const SCRIPT_FRAMEWORKS: Record<string, ScriptFramework> = {
  npm: {
    id: "npm",
    name: "NPM",
    configFile: "package.json",
    runner: "npm",
    defaultCommand: ["npm", "start"],
    runCommand: (script) => ["npm", "run", script],
  },
  
  cargo: {
    id: "cargo",
    name: "Cargo",
    configFile: "Cargo.toml",
    runner: "cargo",
    defaultCommand: ["cargo", "run"],
    runCommand: (script) => ["cargo", script],
  },
  
  go: {
    id: "go",
    name: "Go Modules",
    configFile: "go.mod",
    runner: "go",
    defaultCommand: ["go", "run", "."],
    runCommand: (script) => ["go", "run", script],
  },
  
  maven: {
    id: "maven",
    name: "Maven",
    configFile: "pom.xml",
    runner: "mvn",
    defaultCommand: ["mvn", "compile", "exec:java"],
    runCommand: (phase) => ["mvn", phase],
  },
  
  gradle: {
    id: "gradle",
    name: "Gradle",
    configFile: "build.gradle",
    runner: "gradle",
    defaultCommand: ["gradle", "run"],
    runCommand: (task) => ["gradle", task],
  },
};

/**
 * Detect language from file extension
 */
export function detectLanguageByExtension(filePath: string): LanguageCapability | null {
  const extension = filePath.split(".").pop()?.toLowerCase();
  if (!extension) return null;
  
  for (const capability of Object.values(LANGUAGE_REGISTRY)) {
    if (capability.extensions.includes(extension)) {
      return capability;
    }
  }
  
  return null;
}

/**
 * Detect language from shebang line
 */
export function detectLanguageByShebang(content: string): LanguageCapability | null {
  const firstLine = content.split("\n")[0];
  if (!firstLine.startsWith("#!")) return null;
  
  for (const capability of Object.values(LANGUAGE_REGISTRY)) {
    if (capability.shebangPatterns) {
      for (const pattern of capability.shebangPatterns) {
        if (pattern.test(firstLine)) {
          return capability;
        }
      }
    }
  }
  
  return null;
}

/**
 * Detect script framework from workspace files
 */
export function detectScriptFramework(workspaceFiles: string[]): ScriptFramework | null {
  for (const framework of Object.values(SCRIPT_FRAMEWORKS)) {
    if (workspaceFiles.includes(framework.configFile)) {
      return framework;
    }
  }
  
  return null;
}

/**
 * Multi-tier language detection
 * Priority: explicit hint > shebang > extension > framework metadata
 */
export interface LanguageDetectionContext {
  filePath: string;
  fileContent?: string;
  workspaceFiles?: string[];
  explicitHint?: string; // e.g., "python", "go"
}

export function detectLanguage(context: LanguageDetectionContext): LanguageCapability | null {
  // 1. Explicit hint from API
  if (context.explicitHint) {
    const capability = LANGUAGE_REGISTRY[context.explicitHint];
    if (capability) return capability;
  }
  
  // 2. Shebang line
  if (context.fileContent) {
    const fromShebang = detectLanguageByShebang(context.fileContent);
    if (fromShebang) return fromShebang;
  }
  
  // 3. File extension
  const fromExtension = detectLanguageByExtension(context.filePath);
  if (fromExtension) return fromExtension;
  
  // 4. Workspace framework files (for projects)
  if (context.workspaceFiles) {
    const framework = detectScriptFramework(context.workspaceFiles);
    if (framework) {
      // Map framework to language
      if (framework.id === "npm") return LANGUAGE_REGISTRY.javascript;
      if (framework.id === "cargo") return LANGUAGE_REGISTRY.rust;
      if (framework.id === "go") return LANGUAGE_REGISTRY.go;
      if (framework.id === "maven" || framework.id === "gradle") return LANGUAGE_REGISTRY.java;
    }
  }
  
  return null;
}

/**
 * Validate if required tools are available
 */
export function getRequiredTools(capability: LanguageCapability): string[] {
  return capability.requiredTools;
}

/**
 * Get build directory for compiled languages
 */
export function getBuildDirectory(workspaceId: string, languageId: string): string {
  return `/workspace/.build/${languageId}`;
}

/**
 * Get output path for compiled executable
 */
export function getOutputPath(workspaceId: string, languageId: string, fileName: string): string {
  const buildDir = getBuildDirectory(workspaceId, languageId);
  const execName = fileName.split(".")[0];
  return `${buildDir}/${execName}`;
}
