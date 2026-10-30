// Shims for Safari before 15.4 (iPadOS 15.0–15.3). Those builds parse
// ES modules but lack a few ES2022 builtins the UI uses; without them
// the first screen throws (e.g. `inView.at is not a function`).

function at<T>(this: ArrayLike<T>, index: number): T | undefined {
  const len = this.length;
  const i = Math.trunc(index) || 0;
  const k = i >= 0 ? i : len + i;
  if (k < 0 || k >= len) return undefined;
  return this[k];
}

if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, "at", {
    value: at,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

if (!String.prototype.at) {
  Object.defineProperty(String.prototype, "at", {
    value: at,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

if (!Object.hasOwn) {
  Object.defineProperty(Object, "hasOwn", {
    value: (object: object, property: PropertyKey) => Object.prototype.hasOwnProperty.call(object, property),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
