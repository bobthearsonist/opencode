import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk"

// Re-export types consumers will need
export type {
  Session,
  Message,
  UserMessage,
  AssistantMessage,
  Part,
  TextPart,
  ToolPart,
  FilePart,
  FileDiff,
  Provider,
  Model,
  Event,
  TextPartInput,
  FilePartInput,
} from "@opencode-ai/sdk/v2/client"

type Server = { url: string; close(): void }

export class Bridge {
  private client: OpencodeClient | undefined
  private server: Server | undefined
  private abortController: AbortController | undefined

  /** Start the OpenCode server and create a client connection. */
  async start(cwd: string): Promise<void> {
    if (this.server) {
      return
    }

    this.abortController = new AbortController()

    const result = await createOpencode({
      signal: this.abortController.signal,
    })

    this.server = result.server
    this.client = result.client
  }

  /** Stop the OpenCode server and clean up resources. */
  async stop(): Promise<void> {
    this.abortController?.abort()
    this.server?.close()
    this.server = undefined
    this.client = undefined
    this.abortController = undefined
  }

  /** Get the underlying SDK client. Throws if the bridge has not been started. */
  getClient(): OpencodeClient {
    if (!this.client) {
      throw new Error("Bridge not started. Call start() first.")
    }
    return this.client
  }

  /** Whether the bridge is currently running. */
  isRunning(): boolean {
    return this.server !== undefined
  }

  // ---------------------------------------------------------------------------
  // Session helpers
  // ---------------------------------------------------------------------------

  /** List all sessions, sorted by most recently updated. */
  async listSessions() {
    const { data } = await this.getClient().session.list()
    return data
  }

  /** Get a single session by ID. */
  async getSession(id: string) {
    const { data } = await this.getClient().session.get({ sessionID: id })
    return data
  }

  /** Create a new session with an optional title. */
  async createSession(title?: string) {
    const { data } = await this.getClient().session.create({ title })
    return data
  }

  /**
   * Send a message to a session and return the assistant response.
   *
   * Text is sent as a `TextPartInput`. Optional file attachments are sent as
   * `FilePartInput` entries alongside the text.
   */
  async sendMessage(
    sessionId: string,
    text: string,
    files?: Array<{ url: string; filename: string; mime: string }>,
  ) {
    const parts: Array<
      { type: "text"; text: string } | { type: "file"; url: string; filename: string; mime: string }
    > = [{ type: "text" as const, text }]

    if (files) {
      for (const f of files) {
        parts.push({ type: "file" as const, url: f.url, filename: f.filename, mime: f.mime })
      }
    }

    const { data } = await this.getClient().session.prompt({
      sessionID: sessionId,
      parts,
    })
    return data
  }

  /** Abort an active session, stopping any ongoing AI processing. */
  async abortSession(sessionId: string) {
    const { data } = await this.getClient().session.abort({ sessionID: sessionId })
    return data
  }

  /** Get all messages for a session, including user prompts and AI responses. */
  async getMessages(sessionId: string) {
    const { data } = await this.getClient().session.messages({ sessionID: sessionId })
    return data
  }

  /** Get file changes (diff) for a session. */
  async getSessionDiff(sessionId: string) {
    const { data } = await this.getClient().session.diff({ sessionID: sessionId })
    return data
  }

  // ---------------------------------------------------------------------------
  // Provider helpers
  // ---------------------------------------------------------------------------

  /** List available AI providers and their models. */
  async listProviders() {
    const { data } = await this.getClient().provider.list()
    return data
  }

  // ---------------------------------------------------------------------------
  // Event stream
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to SSE events from OpenCode.
   *
   * Returns an abort function that cancels the subscription.
   */
  subscribeEvents(handler: (event: unknown) => void): () => void {
    const controller = new AbortController()
    const client = this.getClient()

    const run = async () => {
      try {
        const { stream } = await client.event.subscribe({
          signal: controller.signal,
        })
        for await (const event of stream) {
          if (controller.signal.aborted) break
          handler(event)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("[opencode] event stream error:", err)
        }
      }
    }

    run()

    return () => controller.abort()
  }
}
