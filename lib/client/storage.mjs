// Storage is an enhancement. Privacy settings and quota failures must never
// interrupt an in-flight booking, its recovery, or a confirmed result.
/** @param {() => any} access @param {string} operation @param {string} key @param {string | undefined} [value] */
export function safeStorage(access, operation, key, value = undefined) {
  try {
    return (
      access()[operation](key, ...(value === undefined ? [] : [value])) ?? null
    );
  } catch {
    return null;
  }
}
