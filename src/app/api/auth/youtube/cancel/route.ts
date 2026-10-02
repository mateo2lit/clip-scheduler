import { pendingYouTubeConnection } from "@/lib/youtubeConnection";
export const runtime = "nodejs";
export const POST = (req: Request) => pendingYouTubeConnection(req, "cancel");
