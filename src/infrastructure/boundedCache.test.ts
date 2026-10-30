import { BoundedCache } from './boundedCache';

describe('BoundedCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = new BoundedCache<number>(2);
    cache.set('first', 1);
    cache.set('second', 2);
    expect(cache.get('first')).toBe(1);

    cache.set('third', 3);

    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('first')).toBe(1);
    expect(cache.get('third')).toBe(3);
  });

  it('deletes failed or stale entries explicitly', () => {
    const cache = new BoundedCache<number>(1);
    cache.set('entry', 1);
    cache.delete('entry');
    expect(cache.get('entry')).toBeUndefined();
  });
});
