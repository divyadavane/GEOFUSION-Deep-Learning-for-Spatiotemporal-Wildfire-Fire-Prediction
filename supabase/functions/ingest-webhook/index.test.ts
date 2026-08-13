import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts"
import { handler } from "./index.ts"

Deno.test("ingest-webhook - success", async () => {
  Deno.env.set('WEBHOOK_SECRET', 'test-secret')
  const req = new Request("http://localhost", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-secret",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      pipeline_name: "ingest_imagery",
      source: "sentinel2",
      region: "california",
      row_count: 10,
      status: "success"
    })
  })

  const res = await handler(req)
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.success, true)
})

Deno.test("ingest-webhook - bad auth", async () => {
  Deno.env.set('WEBHOOK_SECRET', 'test-secret')
  const req = new Request("http://localhost", {
    method: "POST",
    headers: {
      "Authorization": "Bearer wrong-secret",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      pipeline_name: "ingest_imagery",
      source: "sentinel2",
      status: "success"
    })
  })

  const res = await handler(req)
  assertEquals(res.status, 401)
})

Deno.test("ingest-webhook - malformed payload", async () => {
  Deno.env.set('WEBHOOK_SECRET', 'test-secret')
  const req = new Request("http://localhost", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-secret",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      source: "sentinel2" // missing pipeline_name and status
    })
  })

  const res = await handler(req)
  assertEquals(res.status, 400)
})
