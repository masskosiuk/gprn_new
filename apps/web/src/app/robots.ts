import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: {
      allow: "/",
      userAgent: "*"
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
