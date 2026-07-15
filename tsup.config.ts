import { defineConfig } from 'tsup';

// Shared config: each package runs `tsup` from its own dir, so `entry` is relative
// to the package. Emits ESM + CJS + .d.ts. Workspace deps (e.g. @imvu/rest) are
// external by default, so they're referenced, not bundled.
export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	sourcemap: true,
	clean: true,
	target: 'node20',
	// Libraries don't bundle their dependencies — the consumer installs them.
	// (Also avoids esbuild choking on native transitive deps like `deasync`.)
	skipNodeModulesBundle: true,
});
