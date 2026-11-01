export interface Clock {
  now(): Date;
}

export function systemClock(): Clock {
  return { now: () => new Date() };
}
