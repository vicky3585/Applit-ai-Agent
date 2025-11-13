/**
 * Simple fuzzy search matcher with scoring
 */

export interface FuzzyResult {
  matched: boolean;
  score: number;
}

/**
 * Fuzzy match algorithm with word-boundary and consecutive-character weighting
 * @param query Search string
 * @param target Target string to search in
 * @returns {matched: boolean, score: number}
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult {
  if (!query) return { matched: true, score: 0 };
  
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();
  
  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;
  let consecutiveMatches = 0;
  
  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      // Base score for match
      score += 5;
      
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        consecutiveMatches++;
        score += 10 + consecutiveMatches * 2; // Increasing bonus for longer sequences
      } else {
        consecutiveMatches = 0;
      }
      
      // Bonus for word start (space, dash, underscore, or start of string)
      const prevChar = i > 0 ? targetLower[i - 1] : ' ';
      if (prevChar === ' ' || prevChar === '-' || prevChar === '_' || i === 0) {
        score += 8;
      }
      
      // Small penalty for gap between matches
      if (lastMatchIndex >= 0) {
        const gap = i - lastMatchIndex - 1;
        score -= Math.min(gap, 3); // Cap penalty at 3
      }
      
      lastMatchIndex = i;
      queryIndex++;
    }
  }
  
  // Check if all query characters were matched
  const matched = queryIndex === queryLower.length;
  
  // Bonus for shorter targets (prefer concise matches)
  if (matched) {
    score += Math.max(0, 100 - targetLower.length);
  }
  
  return { matched, score: matched ? score : 0 };
}

/**
 * Search and rank items by fuzzy match score
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getSearchText: (item: T) => string[]
): T[] {
  if (!query) return items;
  
  const results = items
    .map(item => {
      // Get all searchable fields for this item
      const texts = getSearchText(item);
      
      // Find best match across all searchable fields
      let bestScore = 0;
      let matched = false;
      
      for (const text of texts) {
        const result = fuzzyMatch(query, text);
        if (result.matched && result.score > bestScore) {
          bestScore = result.score;
          matched = true;
        }
      }
      
      return { item, score: bestScore, matched };
    })
    .filter(result => result.matched)
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .map(result => result.item);
  
  return results;
}
