import 'dotenv/config';

const DEV_SECRET = 'nicolet-dev-secret-change-in-production';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set to a strong secret in production.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure default. Set a strong secret before deploying.');
}

export const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;
