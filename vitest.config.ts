import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			vscode: fileURLToPath(
				new URL('./tests/extension/vscode.ts', import.meta.url)
			),
		},
	},
	test: {
		// Only the TypeScript sources — `out/` holds compiled copies of the same
		// files and would otherwise be collected a second time.
		include: ['tests/extension/**/*.test.{ts,tsx}'],
		// The webview modules are DOM code. They were the only part of the editor
		// with no tests, and every bug that reached the author was in them.
		environment: 'happy-dom',
	},
});
