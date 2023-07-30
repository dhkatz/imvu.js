import * as dotenv from 'dotenv';
import { JestConfigWithTsJest } from 'ts-jest';

dotenv.config();

const config: JestConfigWithTsJest = {
  preset: 'ts-jest',
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '<rootDir>/packages/**/src/**/*.ts',
    '!<rootDir>/packages/**/src/**/index.ts',
  ],
  projects: [
    {
      displayName: '@imvu/client',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/packages/client/test/**/*.test.ts'],
    },
  ],
};

export default config;
