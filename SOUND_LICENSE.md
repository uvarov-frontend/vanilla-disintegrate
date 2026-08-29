# Bundled sound license

`src/sounds/dust.mp3` and `src/sounds/christmas-wind.mp3` are original sounds created and owned by Yury Uvarov. Both are distributed as part of Vanilla Disintegrate under the same MIT License as the source code.

The default file preserves its original MP3 stream. The Christmas file is trimmed to the bundled animation timeline and includes a baked-in fade-out, encoded as 256 kbps MP3.

The restoration phases of `dust` and `wind` reuse these same two files: the library reverses the decoded audio at runtime through the `reverse` sound option, so no separate reversed recordings are bundled.
