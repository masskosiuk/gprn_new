"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  initialHeaderScroll,
  updateHeaderScroll,
} from "../../lib/header-scroll";

export function AutoHideHeader({
  children,
  pinned,
}: {
  children: ReactNode;
  pinned: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const scroll = useRef(initialHeaderScroll());
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let frame = 0;
    scroll.current = initialHeaderScroll(window.scrollY);
    setHidden(false);

    const update = () => {
      frame = 0;
      const header = ref.current;
      if (!header) return;
      const maxY = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const next = updateHeaderScroll(
        scroll.current,
        Math.min(window.scrollY, maxY),
        header.offsetHeight,
        pinned || Boolean(header.querySelector(":focus-visible")),
      );
      if (next.hidden !== scroll.current.hidden) setHidden(next.hidden);
      scroll.current = next;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pinned]);

  return (
    <header
      className={`topbar topbar--auto-hide${hidden && !pinned ? " is-scroll-hidden" : ""}`}
      ref={ref}
      onFocusCapture={() => {
        scroll.current = initialHeaderScroll(window.scrollY);
        setHidden(false);
      }}
    >
      {children}
    </header>
  );
}
