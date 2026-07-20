import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Only the TypeScript sources — `out/` holds compiled copies of the same
		// files and would otherwise be collected a second time.
		include: ['tests/extension/**/*.test.ts'],
	},
});
