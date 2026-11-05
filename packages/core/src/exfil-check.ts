/** Every string in a value, however deeply nested in arrays and objects (bounded). */
export function collectStrings(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 8 || out.length > 200) return out;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, depth + 1, out);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, depth + 1, out);
    }
  }
  return out;
}
