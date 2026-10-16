import type { ScanMode, VerifyData } from './api';

const QUEUE_KEY = 'fc_queue';
const LOCATION_KEY = 'fc_share_location';
const SAVED_KEY = 'fc_saved_results';

export type Processed = {
  code: string;
  mode: ScanMode;
  data: VerifyData | null;
};

type QueueItem = {
  code: string;
  mode: ScanMode;
};

export function loadLocPref(): boolean {
  try {
    return localStorage.getItem(LOCATION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveLocPref(enabled: boolean): void {
  try {
    localStorage.setItem(LOCATION_KEY, String(enabled));
  } catch {
    // Storage may be unavailable.
  }
}

export async function getLocation(): Promise<
  { lat: number; lng: number } | undefined
> {
  if (!navigator.geolocation) return undefined;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(undefined),
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60000,
      },
    );
  });
}

export function getQueue(): QueueItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function enqueue(code: string, mode: ScanMode): number {
  const queue = getQueue();

  if (!queue.some((item) => item.code === code && item.mode === mode)) {
    queue.push({ code, mode });

    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // Storage may be full or unavailable.
    }
  }

  return getQueue().length;
}

export async function flushQueue(): Promise<Processed[]> {
  const queue = getQueue();
  const processed: Processed[] = [];
  const remaining: QueueItem[] = [];

  const { verify, ApiError } = await import('./api');

  for (const item of queue) {
    try {
      const data = await verify(item.code, item.mode);

      processed.push({
        code: item.code,
        mode: item.mode,
        data,
      });
    } catch (error) {
      remaining.push(item);

      if (!(error instanceof ApiError) || error.code === 'NETWORK') {
        remaining.push(
          ...queue.slice(queue.indexOf(item) + 1),
        );
        break;
      }
    }
  }

  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));

    const previous = JSON.parse(
      localStorage.getItem(SAVED_KEY) || '[]',
    );

    const saved = Array.isArray(previous) ? previous : [];

    localStorage.setItem(
      SAVED_KEY,
      JSON.stringify([...saved, ...processed].slice(-100)),
    );
  } catch {
    // Storage may be unavailable.
  }

  return processed;
}
export function clearLocal(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
    localStorage.removeItem(SAVED_KEY);
    localStorage.removeItem(LOCATION_KEY);
  } catch {
    // Storage may be unavailable.
  }
}