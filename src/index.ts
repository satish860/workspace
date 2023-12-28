import { Hono } from "hono";
import { cors } from 'hono/cors';

type Bindings = {
  MY_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', cors());

app.get("/", (c) => c.text("Hello Hono!"));

app.put("/upload/*", async (c) => {
  const fullPath = c.req.path.replace('/upload/', '');

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

export default app;
