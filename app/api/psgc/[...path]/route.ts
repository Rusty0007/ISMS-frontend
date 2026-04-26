import { NextRequest, NextResponse } from "next/server";

const PSGC_BASE = "https://psgc.cloud/api";

export const dynamic = "force-dynamic";

export async function GET(
    _request: NextRequest,
    { params }: { params: { path?: string[] } },
) {
    const path = (params.path ?? []).join("/");

    if (!path || path.includes("..")) {
        return NextResponse.json({ detail: "Invalid PSGC path." }, { status: 400 });
    }

    try {
        const upstream = await fetch(`${PSGC_BASE}/${path}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        });
        const body = await upstream.text();

        return new NextResponse(body, {
            status: upstream.status,
            headers: {
                "Content-Type": upstream.headers.get("content-type") ?? "application/json",
            },
        });
    } catch {
        return NextResponse.json(
            { detail: "Location service is temporarily unavailable." },
            { status: 503 },
        );
    }
}
