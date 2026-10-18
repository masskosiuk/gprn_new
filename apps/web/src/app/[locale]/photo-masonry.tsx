"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function PhotoMasonry({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const tiles = Array.from(
      grid.querySelectorAll<HTMLElement>(":scope > .photo-tile"),
    );
    const measure = (tile: HTMLElement) => {
      const content = tile.querySelector<HTMLElement>(".photo-tile-open");
      if (!content) return;
      const span = `span ${Math.max(1, Math.ceil(content.getBoundingClientRect().height + 6))}`;
      if (tile.style.gridRowEnd !== span) tile.style.gridRowEnd = span;
    };
    const columns = () => {
      const min = window.innerWidth <= 760 ? 160 : 210;
      const count = Math.min(
        4,
        Math.max(1, Math.floor((grid.clientWidth + 6) / (min + 6))),
      );
      const template = `repeat(${count}, minmax(0, 1fr))`;
      if (grid.style.gridTemplateColumns !== template)
        grid.style.gridTemplateColumns = template;
      tiles.forEach(measure);
    };
    columns();
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const tile = (entry.target as HTMLElement).closest<HTMLElement>(
          ".photo-tile",
        );
        if (tile) measure(tile);
      }
    });
    for (const tile of tiles) {
      const content = tile.querySelector(".photo-tile-open");
      if (content) sizes.observe(content);
    }
    const containerSize = new ResizeObserver(columns);
    containerSize.observe(grid);
    window.addEventListener("resize", columns);
    return () => {
      sizes.disconnect();
      containerSize.disconnect();
      window.removeEventListener("resize", columns);
    };
  }, [children]);
  return (
    <div className="photo-masonry" ref={ref}>
      {children}
    </div>
  );
}
