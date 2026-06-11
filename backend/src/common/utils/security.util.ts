import { basename, extname, join, normalize } from 'path';

export class SecurityUtil {
  // 1. Strict Whitelist Regex: Allows only alphanumeric characters, dashes, and underscores
  private static readonly SAFE_FILENAME_REGEX = /[^a-zA-Z0-9_\-]/g;

  /**
   * Sanitises an untrusted raw filename, preserving only safe alphanumeric characters and the extension.
   * Prevents execution attacks like: "waybill; rm -rf .pdf"
   */
  public static sanitizeFilename(rawFilename: string): string {
    if (!rawFilename) return 'unnamed_file';

    const extension = extname(rawFilename); // e.g., '.pdf'
    const nameWithoutExt = basename(rawFilename, extension); // e.g., 'waybill; rm -rf'

    // Strip out all non-whitelisted characters from the body of the filename
    const cleanName = nameWithoutExt.replace(this.SAFE_FILENAME_REGEX, '_');
    const cleanExt = extension.replace(this.SAFE_FILENAME_REGEX, '');

    // Reconstruct with a timestamp to eliminate overwriting issues or namespace collisions
    return `${Date.now()}_${cleanName}${cleanExt}`;
  }

  /**
   * Safely resolves a local file directory target path and ensures it cannot escape 
   * the designated storage root using directory traversal attacks (../../).
   */
  public static resolveSafePath(baseStorageDir: string, userFilename: string): string {
    const cleanFilename = this.sanitizeFilename(userFilename);
    const targetPath = normalize(join(baseStorageDir, cleanFilename));

    // Security Gate: Ensure the final path explicitly starts with the restricted root directory path
    if (!targetPath.startsWith(normalize(baseStorageDir))) {
      throw new Error('Security Exception: Directory traversal attempt detected.');
    }

    return targetPath;
  }
}

