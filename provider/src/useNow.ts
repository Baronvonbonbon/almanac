import { useEffect, useState } from "react";

/** The time, ticking every second — for countdowns, and for openings that end while on screen. */
export function useNow(every = 1000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
