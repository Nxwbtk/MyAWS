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
    region: process.env.EMULATOR_REGION ?? "us-east-1",
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
    return { endpoint, region, connected: true }
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Emulator health check failed."
    return { endpoint, region, connected: false, detail }
  }
}

export async function emulatorClientConfig() {
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
