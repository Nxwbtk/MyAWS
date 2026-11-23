import { GetFunctionCommand, LambdaClient } from "@aws-sdk/client-lambda"
import { z } from "zod"
import { EmulatorError, downloadFromEmulator, emulatorClientConfig } from "@/lib/emulator"

export const runtime = "nodejs"

const schema = z.object({ functionName: z.string().min(1).max(170), qualifier: z.string().max(128).optional() })

function verifyLocalRequest(request: Request) {
  const host = request.headers.get("host") ?? ""
  const site = request.headers.get("sec-fetch-site")
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) throw new EmulatorError("Open the console using its loopback address.", 403)
  if (site && site !== "same-origin" && site !== "none") throw new EmulatorError("Cross-origin calls to the local console are blocked.", 403)
}

/** Returns a function's deployment package so the console code editor can open it. */
export async function POST(request: Request) {
  try {
    verifyLocalRequest(request)
    const input = schema.parse(await request.json())
    const client = new LambdaClient(await emulatorClientConfig())
    try {
      const fn = await client.send(new GetFunctionCommand({ FunctionName: input.functionName, Qualifier: input.qualifier }))
      const location = fn.Code?.Location
      if (!location) return Response.json({ repositoryType: fn.Code?.RepositoryType, imageUri: fn.Code?.ImageUri }, { headers: { "Cache-Control": "no-store" } })
      const zip = await downloadFromEmulator(location)
      return Response.json({ repositoryType: fn.Code?.RepositoryType, zip: zip.toString("base64") }, { headers: { "Cache-Control": "no-store" } })
    } finally {
      client.destroy()
    }
  } catch (error) {
    const status = error instanceof EmulatorError ? error.status : error instanceof z.ZodError ? 400 : 502
    return Response.json({ error: error instanceof Error ? error.message : "Request failed." }, { status })
  }
}
