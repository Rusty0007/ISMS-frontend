import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/register"];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (PUBLIC_ROUTES.some(route => pathname === route)) {
        return NextResponse.next();
    }

    // Auth is validated in client pages using localStorage tokens.
    return NextResponse.next();
}

export const config = {
    matcher: ["/dashboard/:path*", "/matches/:path*", "/profile/:path*"],
};
