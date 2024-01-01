import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  MY_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use("*", cors());
app.get("/", (c) => c.text("Hello Hono!"));

app.put("/upload/*", async (c) => {
  const fullPath = c.req.path.replace("/upload/", "");
  if (typeof fullPath !== "string") {
    return c.text("Invalid path", 400);
  }

  const segments = fullPath.split("/");
  const filename = segments.pop();
  const folder = segments.join("/");
  const key = folder ? `${folder}/${filename}` : filename;
  const contentType = c.req.header("Content-Type");
  const blob = await c.req.blob();
  if (blob.size === 0) {
    return c.text("No file uploaded", 400);
  }

  await c.env.MY_BUCKET.put(key!, blob.stream(), {
    httpMetadata: {
      contentType: contentType,
    },
  });
  return c.text(`File uploaded to ${key} successfully!`);
});

function indexOf(
  buffer: string | Uint8Array,
  sequence: string | Uint8Array,
  offset = 0
) {
  if (typeof buffer === "string") {
    buffer = new TextEncoder().encode(buffer);
  }
  if (typeof sequence === "string") {
    sequence = new TextEncoder().encode(sequence);
  }

  loop1: for (let i = offset; i <= buffer.length - sequence.length; i++) {
    for (let j = 0; j < sequence.length; j++) {
      if (buffer[i + j] !== sequence[j]) {
        continue loop1;
      }
    }
    return i; // Found the sequence starting at position i
  }
  return -1; // Sequence not found
}

app.put("/multiupload/*", async (c) => {
  const storagePath = c.req.path.replace('/multiupload/', '');

  const contentType = c.req.header("Content-Type");
  const match = /boundary=(.+)$/.exec(contentType || "");
  if (!match) {
    return c.text("Could not find the boundary.", 400);
  }

  const boundaryText = `--${match[1]}`;
  const boundaryBytes = new TextEncoder().encode(boundaryText);
  const crlfBytes = new TextEncoder().encode("\r\n\r\n");

  const rawBody = await c.req.arrayBuffer();
  const bodyArray = new Uint8Array(rawBody);

  let position = 0;
  while (position < bodyArray.length) {
    const partStart =
      indexOf(bodyArray, boundaryBytes, position) + boundaryBytes.length;
    if (partStart < boundaryBytes.length) break; // No more boundaries found

    const headersEnd =
      indexOf(bodyArray, crlfBytes, partStart) + crlfBytes.length;
    if (headersEnd < crlfBytes.length) break; // Headers end not found

    const headers = new TextDecoder().decode(
      bodyArray.slice(partStart, headersEnd)
    );
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    if (!filenameMatch) continue; // Filename not found, skip this part

    const filename = filenameMatch[1]; // Extract the filename
    console.log(`Found file ${filename}`)

    const fileStart = headersEnd;
    const fileEnd = indexOf(bodyArray, boundaryBytes, fileStart);

    if (fileEnd === -1) break; // File end not found

    const fileContentArray = bodyArray.slice(fileStart, fileEnd);

    try {
      await c.env.MY_BUCKET.put(`${storagePath}/${filename}`, fileContentArray, {
        httpMetadata: {
          contentType: "application/pdf",
        },
      });
      console.log(`Uploaded ${filename} successfully!`);
    } catch (error) {
      console.error("Error uploading to R2:", error);
      return c.text("Error uploading file", 500);
    }

    position = fileEnd; // Move to the next part
  }
  return c.text("Files uploaded successfully");
});


// Secure Download Endpoint
app.get("/download/*", async (c) => {
  const filePath = c.req.path.replace("/download/", "");
  if (typeof filePath !== "string" || !filePath) {
    return c.text("Invalid file path", 400);
  }

  try {
    const file = await c.env.MY_BUCKET.get(filePath);
    if (!file) {
      return c.text("File not found", 404);
    }
    const body = file.body;
    const contentType = file.httpMetadata!.contentType;
    return new Response(body, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename=${encodeURIComponent(
          filePath.split("/").pop() || "download"
        )}`,
      },
    });
  } catch (error) {
    return c.text("Error retrieving file", 500);
  }
});

export default app;
