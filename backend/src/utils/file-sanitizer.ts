import path from 'path';

export function sanitizeFileName(fileName: string): string {
  // 1. Get just the name (prevents path traversal like ../../)
  const baseName = path.basename(fileName);
  
// 2. Remove any character that isn't a letter, number, dot, or underscore
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '');
  
  // 3. Ensure it doesn't start with a dash (prevents command flag injection)
  return sanitized.startsWith('-') ? 'safe_' + sanitized : sanitized;
}
