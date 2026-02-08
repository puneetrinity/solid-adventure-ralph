/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@core$': '<rootDir>/packages/core/src/index',
    '^@core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@db$': '<rootDir>/packages/db/src/index',
    '^@db/(.*)$': '<rootDir>/packages/db/src/$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit)/)'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: false }],
    '^.+\\.m?js$': 'babel-jest'
  }
};
