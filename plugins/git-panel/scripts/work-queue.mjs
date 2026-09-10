// Bound subprocess pressure and discard cancelled work before it starts.
export function createWorkQueue(limit = 2, maxWaiting = 32) {
  let running = 0;
  const waiting = [];
  function drain() {
    while(running < limit && waiting.length) {
      const item = waiting.shift();
      item.signal?.removeEventListener('abort', item.abort);
      running++;
      item.resolve(() => {running--; drain();});
    }
  }
  return async function run(work, signal) {
    signal?.throwIfAborted();
    if(waiting.length >= maxWaiting) throw Error('查询过多，请稍后重试');
    const release = await new Promise((resolve, reject) => {
      const item = {resolve, signal, abort: () => {
        const index = waiting.indexOf(item);
        if(index !== -1) waiting.splice(index, 1);
        reject(signal.reason);
      }};
      signal?.addEventListener('abort', item.abort, {once:true});
      waiting.push(item);
      drain();
    });
    try {signal?.throwIfAborted(); return await work();}
    finally {release();}
  };
}
