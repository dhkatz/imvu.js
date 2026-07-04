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
      // ts-jest auto-discovers the root tsconfig.json, which does NOT set
      // emitDecoratorMetadata/experimentalDecorators (those live in
      // tsconfig.base.json). Without them the serializer's design:type metadata
      // is never emitted and deserialization yields empty objects. Force the
      // decorator-aware options and full (non-isolated) compilation here.
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            isolatedModules: false,
            tsconfig: {
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
            },
          },
        ],
      },
    },
  ],
};

export default config;
