import * as dotenv from 'dotenv';
import { JestConfigWithTsJest } from 'ts-jest';

dotenv.config();

const config: JestConfigWithTsJest = {
  preset: 'ts-jest',
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: ['<rootDir>/packages/**/src/**/*.ts', '!<rootDir>/packages/**/src/**/index.ts'],
  projects: [
    {
      displayName: '@imvu/client',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/packages/client/test/**/*.test.ts'],
      // Use a dedicated test tsconfig that extends the package config, so ts-jest
      // compiles with the SAME options as the build (module/moduleResolution/
      // esModuleInterop → module augmentations like axios-cookiejar-support's `jar`
      // resolve correctly; emitDecoratorMetadata + experimentalDecorators from the
      // base config → the serializer's design:type metadata is emitted). Auto-
      // discovering the root tsconfig.json instead drops all of these.
      // isolatedModules:false keeps full type-aware compilation (required for
      // emitDecoratorMetadata). All of this is removed in Phase 2/4 (Valibot +
      // Vitest) once decorators and their metadata dependency are gone.
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            isolatedModules: false,
            tsconfig: 'packages/client/tsconfig.spec.json',
          },
        ],
      },
    },
  ],
};

export default config;
