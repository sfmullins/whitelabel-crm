export function cleanNulls<T>(obj: T): T {
  if (obj === null || obj === undefined) return undefined as any;
  if (Array.isArray(obj)) {
    return obj.map(cleanNulls) as any;
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      res[key] = val === null ? undefined : cleanNulls(val);
    }
    return res;
  }
  return obj;
}
