import { useEffect, useRef, useState } from "react";

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

export function useDashboardScale() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) {
        return;
      }

      setScale(Math.min(width / BASE_WIDTH, height / BASE_HEIGHT));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return {
    baseWidth: BASE_WIDTH,
    baseHeight: BASE_HEIGHT,
    containerRef,
    scale
  };
}
