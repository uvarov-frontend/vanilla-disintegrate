import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'vitest';

it('keeps only the active project release and image tag while preserving unrelated data', () => {
  const root = mkdtempSync(join(tmpdir(), 'disintegrate-deploy-'));
  const releases = join(root, 'source releases');
  const bin = join(root, 'bin');
  const list = join(root, 'images');
  const log = join(root, 'deleted');
  const sha = (n: number) => n.toString(16).padStart(40, '0');
  mkdirSync(releases);
  mkdirSync(bin);
  try {
    for (let n = 1; n <= 10; n += 1) {
      const directory = join(releases, sha(n));
      mkdirSync(directory);
    }
    mkdirSync(join(releases, 'notes'));
    symlinkSync(bin, join(releases, sha(11)));
    writeFileSync(list, Array.from({ length: 10 }, (_, n) => sha(n + 1)).join('\n') + '\nlatest\n');
    const docker = join(bin, 'docker');
    writeFileSync(
      docker,
      '#!/bin/sh\nif [ "$2" = ls ]; then cat "$FAKE_IMAGES"; else printf "%s\\n" "$@" >> "$FAKE_DELETED"; fi\n',
    );
    chmodSync(docker, 0o700);
    const run = (...args: string[]) =>
      spawnSync('bash', [resolve('deploy/prune-releases.sh'), releases, 'test-image', sha(1), ...args], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, FAKE_IMAGES: list, FAKE_DELETED: log },
      });
    const dry = run();
    expect(dry.status, dry.stderr).toBe(0);
    for (let n = 2; n <= 10; n += 1) expect(dry.stdout).toContain(`test-image:${sha(n)}`);
    for (let n = 1; n <= 10; n += 1) expect(existsSync(join(releases, sha(n)))).toBe(true);
    expect(existsSync(log)).toBe(false);

    const applied = run('--apply');
    expect(applied.status, applied.stderr).toBe(0);
    for (const n of [1, 11]) expect(existsSync(join(releases, sha(n)))).toBe(true);
    for (let n = 2; n <= 10; n += 1) expect(existsSync(join(releases, sha(n)))).toBe(false);
    expect(existsSync(join(releases, 'notes'))).toBe(true);
    expect(existsSync(docker)).toBe(true);
    const deleted = readFileSync(log, 'utf8');
    for (let n = 2; n <= 10; n += 1) expect(deleted).toContain(`test-image:${sha(n)}`);
    expect(deleted).not.toContain(`test-image:${sha(1)}`);
    expect(deleted).not.toContain('--force');
    expect(deleted).not.toContain('latest');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
