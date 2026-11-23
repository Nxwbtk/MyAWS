import {
  AccountClient,
  EnableRegionCommand,
  GetRegionOptStatusCommand,
} from "@aws-sdk/client-account"
import { readFile } from "node:fs/promises"
import { Agent, request } from "node:https"
import { homedir } from "node:os"
import { join } from "node:path"
import { fromIni } from "@aws-sdk/credential-providers"
import { NodeHttpHandler } from "@smithy/node-http-handler"

export class EmulatorError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export function emulatorSettings() {
  const endpoint = new URL(
    process.env.EMULATOR_ENDPOINT ?? "https://127.0.0.1:9297",
  )
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== "127.0.0.1" ||
    endpoint.pathname !== "/" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new EmulatorError(
      "Set EMULATOR_ENDPOINT to an HTTPS URL on 127.0.0.1.",
      503,
    )
  }

  return {
    endpoint: endpoint.origin,
    region: process.env.EMULATOR_REGION ?? "ap-southeast-7",
    stateDir:
      process.env.EMULATOR_STATE_DIR ??
      join(homedir(), ".aws", "emulator", endpoint.port || "443"),
  }
}

async function emulatorAgent(stateDir: string) {
  try {
    return new Agent({
      ca: await readFile(join(stateDir, "ca.pem")),
      keepAlive: false,
    })
  } catch {
    throw new EmulatorError(
      "Could not read the emulator certificate. Start AWS Emulator or check EMULATOR_STATE_DIR.",
      503,
    )
  }
}

export async function emulatorHealth() {
  const { endpoint, region, stateDir } = emulatorSettings()
  try {
    const agent = await emulatorAgent(stateDir)
    const status = await new Promise<number>((resolve, reject) => {
      const probe = request(
        new URL("/__admin/health", endpoint),
        { agent, timeout: 2000 },
        (response) => {
          response.resume()
          resolve(response.statusCode ?? 503)
        },
      )
      probe.on("timeout", () =>
        probe.destroy(new Error("Health check timed out.")),
      )
      probe.on("error", reject)
      probe.end()
    })
    if (status !== 200) throw new Error(`Health check returned HTTP ${status}.`)
    await ensureRegionEnabled(region)
    return { endpoint, region, connected: true }
  } catch (error) {
    // A restarted emulator starts with opt-in Regions disabled again.
    enabledRegions.clear()
    const detail =
      error instanceof Error ? error.message : "Emulator health check failed."
    return { endpoint, region, connected: false, detail }
  }
}

const enabledRegions = new Set<string>()

// Opt-in Regions such as ap-southeast-7 start disabled in a fresh emulator,
// as they do in a new AWS account. Enable the console's Region in the local
// emulator so every service accepts requests signed for it.
async function ensureRegionEnabled(region: string) {
  if (enabledRegions.has(region)) return
  const config = await baseClientConfig()
  const client = new AccountClient({ ...config, region: "us-east-1" })
  try {
    const { RegionOptStatus } = await client.send(
      new GetRegionOptStatusCommand({ RegionName: region }),
    )
    if (RegionOptStatus === "DISABLED")
      await client.send(new EnableRegionCommand({ RegionName: region }))
    for (let attempt = 0; attempt < 10; attempt++) {
      const status = await client.send(new GetRegionOptStatusCommand({ RegionName: region }))
      if (status.RegionOptStatus === "ENABLED" || status.RegionOptStatus === "ENABLED_BY_DEFAULT") {
        enabledRegions.add(region)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  } catch {
    // Default Regions are always enabled; other failures surface on use.
  }
}

export async function emulatorClientConfig() {
  const config = await baseClientConfig()
  await ensureRegionEnabled(config.region)
  return config
}

async function baseClientConfig() {
  const { endpoint, region, stateDir } = emulatorSettings()
  const httpsAgent = await emulatorAgent(stateDir)
  const credentialsProvider = fromIni({
    profile: "default",
    filepath: join(stateDir, "emulator_credentials"),
    configFilepath: join(stateDir, "config"),
    ignoreCache: true,
  })

  return {
    endpoint,
    region,
    credentials: async () => {
      try {
        return await credentialsProvider()
      } catch {
        throw new EmulatorError(
          "Could not read emulator credentials. Start AWS Emulator with authentication enabled or check EMULATOR_STATE_DIR.",
          503,
        )
      }
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent,
      connectionTimeout: 2500,
      socketTimeout: 30_000,
    }),
    disableHostPrefix: true,
    maxAttempts: 1,
  }
}

/** Downloads a presigned URL that points back at the local emulator (for example Lambda code). */
export async function downloadFromEmulator(url: string, limit = 50 * 1024 * 1024) {
  const { endpoint, stateDir } = emulatorSettings()
  const target = new URL(url)
  if (target.origin !== endpoint) throw new EmulatorError("The download URL doesn't point at the local emulator.", 400)
  const agent = await emulatorAgent(stateDir)
  return new Promise<Buffer>((resolve, reject) => {
    const req = request(target, { agent, timeout: 10_000 }, (response) => {
      if ((response.statusCode ?? 500) >= 400) {
        response.resume()
        reject(new EmulatorError(`Download returned HTTP ${response.statusCode}.`, 502))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > limit) req.destroy(new EmulatorError("The download is too large.", 413))
        else chunks.push(chunk)
      })
      response.on("end", () => resolve(Buffer.concat(chunks)))
      response.on("error", reject)
    })
    req.on("timeout", () => req.destroy(new Error("Download timed out.")))
    req.on("error", reject)
    req.end()
  })
}
