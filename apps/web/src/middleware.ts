import { defaultLocale, isSupportedLocale } from "@gprn/i18n";
import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest): NextResponse {
  const [, locale] = request.nextUrl.pathname.split("/");

  if (locale && isSupportedLocale(locale)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${request.nextUrl.pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};

