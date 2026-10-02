import { pendingYouTubeConnection } from "@/lib/youtubeConnection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (req: Request) => pendingYouTubeConnection(req, "preview");
