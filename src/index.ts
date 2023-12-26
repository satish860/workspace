import { Hono } from 'hono'

type Bindings = {
    MY_BUCKET: R2Bucket
  }

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('Hello Hono!'))

app.put('/upload/:key', async (c, next) => {
    const key = c.req.param('key')
    await c.env.MY_BUCKET.put(key, c.req.raw.body)
    return c.text(`Put ${key} successfully!`)
})

export default app
