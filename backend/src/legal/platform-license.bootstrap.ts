import { Logger } from '@nestjs/common';

const logger = new Logger('PlatformLicense');

/**
 * Optional deployment binding: set FLOWOPS_DEPLOYMENT_ID on the server and
 * FLOWOPS_ALLOWED_DEPLOYMENT_IDS=comma,separated,ids. When FLOWOPS_LICENSE_STRICT=true,
 * a mismatch aborts startup. When false, only warns.
 */
export function validateDeploymentLicense(): void {
  const allowedRaw = process.env.FLOWOPS_ALLOWED_DEPLOYMENT_IDS?.trim();
  if (!allowedRaw) {
    return;
  }

  const allowed = allowedRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const deploymentId = process.env.FLOWOPS_DEPLOYMENT_ID?.trim();
  const strict =
    process.env.FLOWOPS_LICENSE_STRICT === '1' ||
    process.env.FLOWOPS_LICENSE_STRICT === 'true';

  if (!deploymentId) {
    const msg =
      'FLOWOPS_ALLOWED_DEPLOYMENT_IDS is set but FLOWOPS_DEPLOYMENT_ID is missing.';
    if (strict) {
      logger.error(msg);
      process.exit(1);
    }
    logger.warn(msg);
    return;
  }

  if (!allowed.includes(deploymentId)) {
    const msg = `FLOWOPS_DEPLOYMENT_ID "${deploymentId}" is not listed in FLOWOPS_ALLOWED_DEPLOYMENT_IDS.`;
    if (strict) {
      logger.error(msg);
      process.exit(1);
    }
    logger.warn(msg);
  }
}
