export class BoundedCache<T> {
  private readonly values = new Map<string, T>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('Cache capacity must be a positive integer.');
    }
  }

  get(key: string): T | undefined {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.values.delete(key);
    this.values.set(key, value);
    if (this.values.size > this.capacity) {
      const oldest = this.values.keys().next().value;
      if (oldest !== undefined) this.values.delete(oldest);
    }
  }

  delete(key: string): void {
    this.values.delete(key);
  }
}
