# Bundled sound license

`src/sounds/dust.mp3`, `src/sounds/vapor.mp3`, `src/sounds/scatter.mp3` and `src/sounds/christmas-wind.mp3` are original sounds created and owned by Yury Uvarov. All are distributed as part of Vanilla Disintegrate under the same MIT License as the source code.

They are VBR stereo MP3 encoded at 44.1 kHz. Each is trimmed to just over the length of the animation it belongs to and carries a baked-in fade at both ends.

The restoration phases reuse the corresponding removal file: the library reverses decoded audio at runtime through the `reverse` sound option, so no separate reversed recordings are bundled.
