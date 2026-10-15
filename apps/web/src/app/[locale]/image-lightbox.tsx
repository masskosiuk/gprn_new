"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ImageLightbox({
  title,
  fullScreen,
  close,
  children,
}: {
  title: string;
  fullScreen: boolean;
  close(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return createPortal(
    <dialog
      aria-label={title}
      className={`image-lightbox${fullScreen ? " work-lightbox" : ""}`}
      ref={ref}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
