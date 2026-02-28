import { DEFAULT_CATEGORIES } from '@/types/qa';

/**
 * Merge default categories with custom user categories
 * Deduplicates, lowercases, and trims all values
 */
export function getMergedCategories(customCategories: string[] = []): string[] {
  const all = [...DEFAULT_CATEGORIES, ...customCategories];
  const unique = [...new Set(all.map(c => c.toLowerCase().trim()))];
  return unique.filter(Boolean);
}

/**
 * Format category for display (capitalize first letter, replace underscores)
 */
export function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}
