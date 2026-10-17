"use client";
import Image from "next/image";
import type { ImgHTMLAttributes } from "react";
import { imageSource } from "../../lib/image-source";

export function ContentImage({
  src,
  loading = "lazy",
  decoding = "async",
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const image = imageSource(typeof src === "string" ? src : undefined);
  if (image.optimized && image.src && image.width && image.height)
    return (
      <Image
        {...props}
        alt={props.alt ?? ""}
        src={image.src}
        width={Number(props.width) || image.width}
        height={Number(props.height) || image.height}
        sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 800px"
        loading={loading}
        decoding={decoding}
      />
    );
  return (
    <img
      {...props}
      src={src}
      width={props.width ?? image.width}
      height={props.height ?? image.height}
      loading={loading}
      decoding={decoding}
    />
  );
}
