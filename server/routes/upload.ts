import { Router } from "express";
import { hasDatabase, query, queryOne } from "../db/index.js";

export const uploadRoutes = Router();

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB (base64 inflates ~33%)

// POST /api/upload/screenshot
// Body: { data: string (base64), contentType: string }
// Returns: { url: string, id: string }
uploadRoutes.post("/screenshot", async (req, res) => {
  const { data, contentType } = req.body;

  if (!data || typeof data !== "string") {
    return res.status(400).json({ RequestStatus: "Failed", ResponseMessage: "data (base64 string) is required" });
  }
  if (!contentType || !ALLOWED_TYPES.has(contentType)) {
    return res.status(400).json({ RequestStatus: "Failed", ResponseMessage: `Unsupported type: ${contentType}. Use JPEG, PNG, or WebP.` });
  }
  if (Buffer.byteLength(data, "base64") > MAX_SIZE_BYTES) {
    return res.status(400).json({ RequestStatus: "Failed", ResponseMessage: "Image too large. Max 8 MB." });
  }

  if (!hasDatabase()) {
    return res.status(503).json({ RequestStatus: "Failed", ResponseMessage: "Database not available — cannot store screenshot." });
  }

  try {
    const row = await queryOne<{ id: string }>(
      "INSERT INTO screenshot_uploads (content_type, data) VALUES ($1, $2) RETURNING id",
      [contentType, data]
    );

    const baseUrl = process.env.BASE_URL || "http://localhost:3001";
    // Include file extension so AT platform can detect the image type from the URL
    const ext = contentType === "image/png" ? ".png"
      : contentType === "image/webp" ? ".webp"
      : contentType === "image/gif" ? ".gif"
      : ".jpg";
    const url = `${baseUrl}/api/upload/screenshot/${row!.id}${ext}`;

    res.json({ RequestStatus: "Succeeded", Payload: { url, id: row!.id } });
  } catch (err) {
    res.status(500).json({ RequestStatus: "Failed", ResponseMessage: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/upload/screenshot/:id  (also handles :id.jpg, :id.png, etc.)
// Returns the image with the correct Content-Type header.
// This route must be PUBLIC (no auth) so the AT platform can fetch the image.
uploadRoutes.get("/screenshot/:id", async (req, res) => {
  if (!hasDatabase()) {
    return res.status(503).end();
  }

  try {
    // Strip any file extension the client or AT platform appended to the ID
    const rawId = req.params.id.replace(/\.[^.]+$/, "");

    const row = await queryOne<{ content_type: string; data: string }>(
      "SELECT content_type, data FROM screenshot_uploads WHERE id = $1",
      [rawId]
    );

    if (!row) {
      return res.status(404).end();
    }

    const buffer = Buffer.from(row.data, "base64");
    res.set("Content-Type", row.content_type);
    res.set("Content-Length", String(buffer.length));
    res.set("Cache-Control", "public, max-age=604800"); // 7 days
    res.send(buffer);
  } catch (err) {
    res.status(500).end();
  }
});
