import { bundleBudgets, dependencyGzipSize } from './bundle-metrics.mjs';

let failed = false;
console.log('Bundle size including local chunks (gzip)');

for (const [file, budget] of Object.entries(bundleBudgets)) {
  const gzip = await dependencyGzipSize(file);
  const status = gzip <= budget ? 'ok' : 'over budget';
  console.log(`${file}: ${(gzip / 1024).toFixed(2)} KiB / ${(budget / 1024).toFixed(2)} KiB (${status})`);
  if (gzip > budget) failed = true;
}

if (failed) process.exitCode = 1;
