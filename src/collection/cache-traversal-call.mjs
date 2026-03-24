// Traversal cache removed — the cached functions (source(), target(),
// connectedEdges(), parallelEdges()) are already fast without caching (O(1) or
// O(degree)), and the per-element cache retained ~100MB of Collection objects.
// The wrapper is now a pass-through to preserve the call-site interface.
let cache = function( fn, name ){
  return function traversalCache( arg1, arg2, arg3, arg4 ){
    return fn.call( this, arg1, arg2, arg3, arg4 );
  };
};

export default cache;
