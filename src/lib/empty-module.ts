/**
 * Browser stand-in for Node's `module` builtin. harfbuzzjs's Emscripten glue imports `module`
 * on a branch that only runs under Node; bundlers still need something to resolve.
 */
export function createRequire(): never {
  throw new Error('`module` is not available in the browser');
}
