// Re-export interface and stub (safe for unit tests)
export * from './github-client';
export * from './patch-applicator';
export * from './diff-generator';
export * from './webhook';
export * from './webhook-service';

// Note: octokit-client is not re-exported here because it uses ESM imports
// that don't work well with Jest's CommonJS transform.
// Import directly from './github/octokit-client' when needed in production.
