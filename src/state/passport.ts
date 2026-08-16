const KEY = 't6ix.passport.v1';

interface PassportData {
  version: 1;
  stamps: Record<string, string>; // code → ISO date stamped
}

// Falls back to in-memory when localStorage is unavailable (Safari private mode).
let memory: PassportData = { version: 1, stamps: {} };

function read(): PassportData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && typeof parsed.stamps === 'object') return parsed;
    return memory;
  } catch {
    return memory;
  }
}

function write(data: PassportData): void {
  memory = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* in-memory only */
  }
}

export function getStamps(): Set<string> {
  return new Set(Object.keys(read().stamps));
}

export function toggleStamp(code: string): Set<string> {
  const data = read();
  if (data.stamps[code]) delete data.stamps[code];
  else data.stamps[code] = new Date().toISOString().slice(0, 10);
  write(data);
  return new Set(Object.keys(data.stamps));
}
