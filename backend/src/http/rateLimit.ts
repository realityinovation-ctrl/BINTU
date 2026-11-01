interface Bucket {
  hits: number[];
  blockedUntil: number;
}

export class SlidingRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limits: { max: number; windowMs: number; blockMs: number },
    private readonly now: () => number,
  ) {}

  allow(key: string): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { hits: [], blockedUntil: 0 };
    if (bucket.blockedUntil > now) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.hits = bucket.hits.filter((hit) => now - hit < this.limits.windowMs);
    if (bucket.hits.length >= this.limits.max) {
      bucket.hits = [];
      bucket.blockedUntil = now + this.limits.blockMs;
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return true;
  }
}
