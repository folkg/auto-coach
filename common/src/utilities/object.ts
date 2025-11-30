export function isObject(target: unknown): target is object {
  return target !== null && typeof target === "object";
}

export function isPlainObject(target: unknown): target is object {
  if (!isObject(target)) {
    return false;
  }
  // The following check ensures that the object's prototype is either Object.prototype or null,
  // which means it's a "plain object" (created by {} or new Object()).
  // This excludes objects like Date, Map, Set, Array, or custom class instances
  return (
    Object.getPrototypeOf(target) === Object.prototype || Object.getPrototypeOf(target) === null
  );
}
