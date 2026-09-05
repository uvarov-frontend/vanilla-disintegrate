export const MAX_LOCAL_AUDIO_BYTES = 5 * 1024 * 1024;

export const MAX_LOCAL_AUDIO_SECONDS = 10;

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function audioDuration(file: Blob) {
  return new Promise<number>((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    let settled = false;
    let timeout = 0;
    const release = () => {
      if (settled) return false;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeEventListener('loadedmetadata', loaded);
      audio.removeEventListener('error', failed);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      return true;
    };
    const loaded = () => {
      const duration = audio.duration;
      if (!release()) return;
      if (Number.isFinite(duration)) resolve(duration);
      else reject(new Error('Invalid audio duration.'));
    };
    const failed = () => {
      if (!release()) return;
      reject(new Error('Unable to read audio metadata.'));
    };
    timeout = window.setTimeout(() => {
      if (!release()) return;
      reject(new Error('Audio metadata timeout.'));
    }, 5000);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', loaded, { once: true });
    audio.addEventListener('error', failed, { once: true });
    audio.src = url;
  });
}
