import { copyFile, writeFile } from 'node:fs/promises';

// Pages serves this document for nested SPA URLs. Absolute base-aware assets
// preserve the path, query, and Auth fragment without a redirect shim.
await copyFile('dist/index.html', 'dist/404.html');
await writeFile('dist/.nojekyll', '');
