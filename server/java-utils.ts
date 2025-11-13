/**
 * Java Utilities
 * 
 * Helper functions for Java compilation and execution
 */

/**
 * Extract package name and main class from Java source code
 */
export function extractJavaClassInfo(content: string, fileName: string): {
  packageName: string | null;
  className: string;
  fullClassName: string;
} {
  // Extract class name from filename
  const className = fileName.replace(".java", "");
  
  // Try to find package declaration
  const lines = content.split("\n");
  let packageName: string | null = null;
  
  for (const line of lines.slice(0, 20)) { // Check first 20 lines
    const trimmed = line.trim();
    
    // Look for package declaration
    const packageMatch = trimmed.match(/^package\s+([\w.]+)\s*;/);
    if (packageMatch) {
      packageName = packageMatch[1];
      break;
    }
    
    // Stop at first class/interface/enum declaration
    if (trimmed.match(/^(public\s+)?(class|interface|enum)\s+/)) {
      break;
    }
  }
  
  // Construct fully qualified class name
  const fullClassName = packageName ? `${packageName}.${className}` : className;
  
  return {
    packageName,
    className,
    fullClassName,
  };
}

/**
 * Extract main class from Java file for execution
 */
export async function getJavaMainClass(filePath: string, fileContent?: string): Promise<string> {
  const fileName = filePath.split("/").pop() || "Main.java";
  
  // If we don't have content, use filename as fallback
  if (!fileContent) {
    return fileName.replace(".java", "");
  }
  
  const { fullClassName } = extractJavaClassInfo(fileContent, fileName);
  return fullClassName;
}
