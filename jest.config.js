/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  collectCoverageFrom: [
    'apps/api/src/**/*.ts',
    'apps/worker/src/**/*.ts',
    'packages/**/src/**/*.ts',
    '!**/*.d.ts',
    '!**/dist/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  moduleNameMapper: {
    '^@core$': '<rootDir>/packages/core/src/index',
    '^@core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@db$': '<rootDir>/packages/db/src/index',
    '^@db/(.*)$': '<rootDir>/packages/db/src/$1',
    '^@arch-orchestrator/core$': '<rootDir>/packages/core/src/index',
    '^@arch-orchestrator/core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@arch-orchestrator/db$': '<rootDir>/packages/db/src/index',
    '^@arch-orchestrator/db/(.*)$': '<rootDir>/packages/db/src/$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit|universal-user-agent)/)'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: 'tsconfig.test.json'
    }],
    '^.+\\.m?js$': 'babel-jest'
  }
};
