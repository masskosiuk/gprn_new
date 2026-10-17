import {
  defaultLocale,
  isSupportedLocale,
  supportedLocales,
  type SupportedLocale,
} from "@gprn/i18n";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "../security-headers.mjs";

const localeCookieName = "gprn_locale";

export function middleware(request: NextRequest): NextResponse {
  const [, locale] = request.nextUrl.pathname.split("/");

  if (locale && isSupportedLocale(locale)) {
    const nonce = btoa(crypto.randomUUID());
    const csp = contentSecurityPolicy({
      nonce,
      development: process.env.NODE_ENV === "development",
    });
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${detectLocale(request)}${request.nextUrl.pathname}`;
  return NextResponse.redirect(url);
}

function detectLocale(request: NextRequest): SupportedLocale {
  const cookieLocale = request.cookies.get(localeCookieName)?.value;

  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  const acceptedLanguages = request.headers
    .get("accept-language")
    ?.split(",")
    .map((value) => value.trim().split(";")[0]?.toLocaleLowerCase())
    .filter((value): value is string => Boolean(value));

  for (const acceptedLanguage of acceptedLanguages ?? []) {
    const exactMatch = supportedLocales.find(
      (supportedLocale) => supportedLocale === acceptedLanguage,
    );

    if (exactMatch) {
      return exactMatch;
    }

    const baseLanguage = acceptedLanguage.split("-")[0];
    const baseMatch = supportedLocales.find(
      (supportedLocale) => supportedLocale === baseLanguage,
    );

    if (baseMatch) {
      return baseMatch;
    }
  }

  return defaultLocale;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|images|favicon.ico|icon.svg|apple-icon.png|opengraph-image|entity-sitemaps|robots.txt|sitemap.xml).*)",
  ],
};
