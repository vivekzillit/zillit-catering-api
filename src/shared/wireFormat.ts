// Wire-format helpers matching the iOS JSONSerialization conventions.
//
// - camelCase <-> snake_case conversion preserving leading underscores
//   (so MongoDB `_id` stays `_id`, not `Id`).
// - sortedStringify produces byte-identical output to iOS's
//   `JSONSerialization.data(withJSONObject: sorted, options: [])` after
//   going through `recursivelySortedDictionary`.

type Json =
  | null
  | undefined
  | string
  | number
  | boolean
  | Json[]
  | { [k: string]: Json };

function camelToSnake(key: string): string {
  const leading = key.match(/^_+/)?.[0] ?? '';
  const rest = key.slice(leading.length);
  return leading + rest.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

function snakeToCamel(key: string): string {
  const leading = key.match(/^_+/)?.[0] ?? '';
  const rest = key.slice(leading.length);
  return leading + rest.replace(/_([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

// Atomic value detection — anything that should NOT be recursed into when
// walking an object graph. Without this, `toSnakeCase` would iterate into
// Mongoose ObjectId internals and produce `{buffer:{...}}` garbage.
function isAtomic(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const t = typeof v;
  if (t !== 'object') return true;
  const obj = v as { constructor?: { name?: string } };
  const ctor = obj.constructor?.name;
  if (ctor === 'ObjectId' || ctor === 'ObjectID') return true;
  if (v instanceof Date) return true;
  if (typeof (v as { _bsontype?: unknown })._bsontype === 'string') return true;
  if (typeof (v as { toHexString?: unknown }).toHexString === 'function') return true;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return true;
  return false;
}

// Coerce atomic mongo/date values into their JSON-safe primitive form.
function atomToJson(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v.toISOString();
  const obj = v as { toHexString?: () => string; toString?: () => string };
  if (typeof obj.toHexString === 'function') return obj.toHexString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v.toString('base64');
  return v;
}

// Unwrap a Mongoose document into a plain object before walking it. Without
// this, the walker would hit virtuals, internal `$`-prefixed keys, etc.
function unwrap(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  const maybeDoc = input as { toJSON?: () => unknown };
  if (typeof maybeDoc.toJSON === 'function' && !isAtomic(input) && !Array.isArray(input)) {
    try {
      return maybeDoc.toJSON();
    } catch {
      /* fall through */
    }
  }
  return input;
}

export function toSnakeCase(input: unknown): unknown {
  if (isAtomic(input)) return atomToJson(input);
  const unwrapped = unwrap(input);
  if (isAtomic(unwrapped)) return atomToJson(unwrapped);
  if (Array.isArray(unwrapped)) return unwrapped.map(toSnakeCase);
  if (typeof unwrapped === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(unwrapped as Record<string, unknown>)) {
      out[camelToSnake(k)] = toSnakeCase(v);
    }
    return out;
  }
  return unwrapped;
}

export function toCamelCase(input: unknown): unknown {
  if (isAtomic(input)) return atomToJson(input);
  const unwrapped = unwrap(input);
  if (isAtomic(unwrapped)) return atomToJson(unwrapped);
  if (Array.isArray(unwrapped)) return unwrapped.map(toCamelCase);
  if (typeof unwrapped === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(unwrapped as Record<string, unknown>)) {
      out[snakeToCamel(k)] = toCamelCase(v);
    }
    return out;
  }
  return unwrapped;
}

/**
 * Serialize an object to a JSON string with:
 *   - camelCase → snake_case keys
 *   - keys sorted alphabetically at every level
 *   - no whitespace
 */
export function stringifyForWire(input: unknown): string {
  return sortedStringify(toSnakeCase(input) as Json);
}

function sortedStringify(value: Json): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(sortedStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = (value as { [k: string]: Json })[k];
      if (v === undefined) continue;
      parts.push(JSON.stringify(k) + ':' + sortedStringify(v));
    }
    return '{' + parts.join(',') + '}';
  }
  return 'null';
}
