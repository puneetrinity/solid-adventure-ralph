/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/packages/core/src/$1',
    '^@core$': '<rootDir>/packages/core/src/index',
    '^@db/(.*)$': '<rootDir>/packages/db/src/$1',
    '^@db$': '<rootDir>/packages/db/src/index'
  }
};
