export interface StoredPlaygroundAudio {
  /** Identifies the entry inside the store and inside the playground's sound select. */
  readonly id: string;
  readonly blob: Blob;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModified: number;
}

const DATABASE_NAME = 'vanilla-disintegrate-playground';
const DATABASE_VERSION = 1;
const STORE_NAME = 'audio-files';

let databasePromise: Promise<IDBDatabase> | null = null;

function database() {
  if (databasePromise !== null) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    });
    request.addEventListener(
      'success',
      () => {
        const connection = request.result;
        connection.addEventListener(
          'versionchange',
          () => {
            connection.close();
            databasePromise = null;
          },
          { once: true },
        );
        resolve(connection);
      },
      { once: true },
    );
    request.addEventListener('error', () => reject(request.error ?? new Error('Unable to open IndexedDB.')), {
      once: true,
    });
    request.addEventListener('blocked', () => reject(new Error('IndexedDB upgrade is blocked.')), { once: true });
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')), {
      once: true,
    });
  });
}

function transactionCommitted(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });
}

function isStoredAudio(value: unknown): value is StoredPlaygroundAudio {
  return (
    typeof value === 'object' &&
    value !== null &&
    'blob' in value &&
    (value as StoredPlaygroundAudio).blob instanceof Blob
  );
}

/** Every audio file kept for the playground, oldest first. */
export async function listPlaygroundAudio(): Promise<StoredPlaygroundAudio[]> {
  const connection = await database();
  const stored = await requestResult<unknown[]>(
    connection.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll() as IDBRequest<unknown[]>,
  );
  return stored.filter(isStoredAudio);
}

export async function savePlaygroundAudio(file: File): Promise<StoredPlaygroundAudio> {
  const stored: StoredPlaygroundAudio = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    blob: file,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  };
  const connection = await database();
  const transaction = connection.transaction(STORE_NAME, 'readwrite');
  const request = transaction.objectStore(STORE_NAME).put(stored, stored.id);
  await Promise.all([requestResult(request), transactionCommitted(transaction)]);
  return stored;
}

export async function deletePlaygroundAudio(id: string) {
  const connection = await database();
  const transaction = connection.transaction(STORE_NAME, 'readwrite');
  const request = transaction.objectStore(STORE_NAME).delete(id);
  await Promise.all([requestResult(request), transactionCommitted(transaction)]);
}
