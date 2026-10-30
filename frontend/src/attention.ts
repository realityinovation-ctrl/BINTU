import { useEffect, useState } from "react";

let waitingCount = 0;
const listeners = new Set<() => void>();

export function publishWaitingCount(count: number) {
  waitingCount = count;
  listeners.forEach((listener) => listener());
}

export function useWaitingCount() {
  const [count, setCount] = useState(waitingCount);
  useEffect(() => {
    const listener = () => setCount(waitingCount);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return count;
}
