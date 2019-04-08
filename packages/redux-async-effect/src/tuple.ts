/**
 * Utility function to create a tuple (an array)
 * with proper type inference, so tuple(2, 'foo', true)
 * has its type inferred as [number, string, boolean]
 * by TypeScript instead of Array<number|string|boolean>
 * (the type inferred for [2, 'foo', true]).
 * @param data items to make up the tuple
 */
export function tuple<T extends any[]>(...data: T) {
  return data;
}
