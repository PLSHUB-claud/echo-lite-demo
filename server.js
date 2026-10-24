const http = require("node:http")
const fs = require("node:fs")
const path = require("node:path")
const { randomUUID } = require("node:crypto")
const { once } = require("node:events")

const ROOT = __dirname
const PUBLIC_DIR = path.join(ROOT, "public")
const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || "127.0.0.1"
const LM_STUDIO_URL = (process.env.LM_STUDIO_URL || "http://127.0.0.1:1234").replace(/\/$/, "")
const LM_STUDIO_TIMEOUT_MS = Number(process.env.LM_STUDIO_TIMEOUT_MS || 180000)
const MAX_BODY = 18 * 1024 * 1024
const MAX_CONTEXT_TOKENS = 24000
const MAX_OUTPUT_TOKENS = 2048
const MAX_IMAGE_DATA_URL_CHARS = 8 * 1024 * 1024
const SESSION_COOKIE = "echo_demo_session"
const SESSION_TTL_MS = 60 * 60 * 1000
const sessions = new Map()

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error("Pedido demasiado grande."))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")) } catch { reject(new Error("JSON inválido.")) }
    })
    req.on("error", reject)
  })
}

async function fetchModelsDetails() {
  try {
    const response = await fetch(`${LM_STUDIO_URL}/api/v0/models`, { signal: AbortSignal.timeout(4500) })
    if (response.ok) {
      const payload = await response.json().catch(() => ({}))
      if (Array.isArray(payload.data)) {
        const chatModels = payload.data.filter((m) => m.type !== "embeddings")
        const loadedModelObj = chatModels.find((m) => m.state === "loaded") || chatModels.find((m) => m.state === "loading")
        const models = chatModels.map((m) => ({
          id: m.id,
          owned_by: m.publisher || m.owned_by || "local",
          state: m.state || "not-loaded",
          max_context_length: m.max_context_length || 32768,
        }))
        return {
          models,
          loadedModel: loadedModelObj ? loadedModelObj.id : null,
          maxContextLength: loadedModelObj?.max_context_length || 32768,
        }
      }
    }
  } catch {
    // Fallback to /v1/models if /api/v0/models fails
  }

  const response = await fetch(`${LM_STUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(4500) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || `LM Studio respondeu ${response.status}.`)
  const rawData = Array.isArray(payload.data) ? payload.data : []
  const models = rawData
    .filter((m) => !/embedding/i.test(m.id))
    .map((model) => ({ id: model.id, owned_by: model.owned_by || "local", state: "unknown", max_context_length: 32768 }))
  return {
    models,
    loadedModel: null,
    maxContextLength: 32768,
  }
}

function legacyAttachmentContext(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return ""
  return `\n\nArquivos anexados para contexto:\n${attachments.map((attachment) => {
    const header = `[Anexo: ${attachment.name || "arquivo"} · ${attachment.type || "arquivo"} · ${attachment.size || 0} bytes]`
    return attachment.content ? `${header}\n${String(attachment.content).slice(0, 20000)}` : header
  }).join("\n\n")}`
}

function getSessionId(req, res) {
  const cookie = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))
  const existing = cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : ""
  const sessionId = existing || randomUUID()
  if (!existing) res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`)
  return sessionId
}

function normalizeContent(content) {
  if (typeof content === "string") return content.slice(0, 120000)
  if (!Array.isArray(content)) return ""
  return content.flatMap((part) => {
    if (part?.type === "text") return [{ type: "text", text: String(part.text || "").slice(0, 120000) }]
    if (part?.type === "image_url") {
      const url = String(part.image_url?.url || "")
      if (!/^data:image\/(jpeg|png|webp|gif);base64,/i.test(url) || url.length > MAX_IMAGE_DATA_URL_CHARS) throw new Error("Imagem invalida ou grande demais.")
      return [{ type: "image_url", image_url: { url } }]
    }
    return []
  })
}

function estimateContentTokens(content) {
  if (Array.isArray(content)) return content.reduce((total, part) => total + (part.type === "image_url" ? 1800 : Math.ceil(String(part.text || "").length / 4)), 0)
  return Math.ceil(String(content || "").length / 4)
}

function fitContent(content, maxTokens) {
  if (!Array.isArray(content)) return String(content || "").slice(-(maxTokens * 4))
  const images = content.filter((part) => part.type === "image_url").slice(0, Math.floor(maxTokens / 1800))
  const remaining = Math.max(0, maxTokens - images.length * 1800)
  const text = content.filter((part) => part.type === "text").map((part) => String(part.text || "")).join("\n")
  const parts = []
  if (text && remaining) parts.push({ type: "text", text: text.slice(-(remaining * 4)) })
  return [...parts, ...images]
}

function contextWindow(messages, maxTokensAllowed = MAX_CONTEXT_TOKENS) {
  const selected = []
  let usedTokens = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = { ...messages[index] }
    const cost = estimateContentTokens(message.content)
    if (!selected.length && cost > maxTokensAllowed) message.content = fitContent(message.content, maxTokensAllowed)
    if (selected.length && usedTokens + cost > maxTokensAllowed) break
    selected.unshift(message)
    usedTokens += estimateContentTokens(message.content)
  }
  return selected
}

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return []
  return rawMessages
    .filter((message) => ["user", "assistant", "system"].includes(message?.role))
    .map((message) => ({ role: message.role, content: normalizeContent(message.content) }))
    .filter((message) => (Array.isArray(message.content) ? message.content.length : message.content))
}

function rememberContext(sessionId, chatId, messages) {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id)
  }
  if (sessions.size > 1000 && !sessions.has(sessionId)) sessions.delete(sessions.keys().next().value)
  const session = sessions.get(sessionId) || { updatedAt: now, chats: new Map() }
  session.updatedAt = now
  session.chats.set(chatId, { updatedAt: now, messages })
  sessions.set(sessionId, session)
}

async function proxyChat(req, res) {
  let body
  try { body = await readJson(req) } catch (error) { return sendJson(res, 400, { error: error.message }) }
  
  let modelDetails
  try {
    modelDetails = await fetchModelsDetails()
  } catch {
    modelDetails = { models: [], loadedModel: null, maxContextLength: 32768 }
  }

  let model = body.model
  // Prioritize currently loaded model in LM Studio if available
  if (modelDetails.loadedModel) {
    model = modelDetails.loadedModel
  } else if (!model || model === "loaded" || model === "auto") {
    model = modelDetails.models[0]?.id
  }

  if (!model) return sendJson(res, 400, { error: "Nenhum modelo foi carregado ou selecionado no LM Studio." })

  const maxContextTokens = modelDetails.maxContextLength || MAX_CONTEXT_TOKENS

  const sessionId = getSessionId(req, res)
  const chatId = String(body.chatId || body.contextId || "default").slice(0, 160)
  let messages
  try {
    messages = contextWindow(normalizeMessages(body.messages), maxContextTokens)
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }
  rememberContext(sessionId, chatId, messages)
  const maxTokens = typeof body.max_tokens === "number" ? Math.min(MAX_OUTPUT_TOKENS, Math.max(1, Math.floor(body.max_tokens))) : MAX_OUTPUT_TOKENS

  let upstream
  try {
    upstream = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(LM_STUDIO_TIMEOUT_MS),
    })
  } catch (error) {
    return sendJson(res, 502, { error: `Não foi possível comunicar com o LM Studio: ${error.message}` })
  }

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "")
    return sendJson(res, upstream.status, { error: errorText || `LM Studio respondeu ${upstream.status}.` })
  }
  if (!upstream.body) return sendJson(res, 502, { error: "O LM Studio não devolveu um stream." })

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  if (typeof res.flushHeaders === "function") res.flushHeaders()
  if (res.socket && typeof res.socket.setNoDelay === "function") res.socket.setNoDelay(true)
  const reader = upstream.body.getReader()
  let clientClosed = false
  res.on("close", () => { clientClosed = true; reader.cancel().catch(() => {}) })
  try {
    while (!clientClosed) {
      const { value, done } = await reader.read()
      if (done) break
      if (!res.write(Buffer.from(value)) && !clientClosed) await once(res, "drain")
      if (typeof res.flush === "function") res.flush()
    }
  } catch {
    if (!clientClosed) res.write(`data: ${JSON.stringify({ error: "O stream foi interrompido." })}\n\n`)
  } finally {
    if (!res.writableEnded) res.end()
  }
}

async function serveStatic(urlPath, res) {
  let decoded
  try { decoded = decodeURIComponent(urlPath) } catch { return sendJson(res, 400, { error: "URL inválida." }) }
  const rootFile = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "")
  const isAsset = decoded.startsWith("/assets/")
  const isRootFile = ["/", "/index.html", "/styles.css", "/app.js"].includes(decoded)
  if (!isAsset && !isRootFile) return sendJson(res, 404, { error: "Ficheiro não encontrado." })
  const baseDir = isAsset ? path.join(PUBLIC_DIR, "assets") : ROOT
  const relative = isAsset ? decoded.slice("/assets/".length) : rootFile
  const filePath = path.resolve(baseDir, relative)
  if (filePath !== baseDir && !filePath.startsWith(`${baseDir}${path.sep}`)) return sendJson(res, 403, { error: "Acesso negado." })
  try {
    const stat = await fs.promises.stat(filePath)
    if (!stat.isFile()) throw new Error("not-file")
    const content = await fs.promises.readFile(filePath)
    const extension = path.extname(filePath).toLowerCase()
    res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream", "Cache-Control": "no-cache" })
    res.end(content)
  } catch {
    sendJson(res, 404, { error: "Ficheiro não encontrado." })
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  if (requestUrl.pathname === "/api/models" && req.method === "GET") {
    try {
      const details = await fetchModelsDetails()
      return sendJson(res, 200, { models: details.models, loadedModel: details.loadedModel, maxContextLength: details.maxContextLength, lmStudioUrl: LM_STUDIO_URL })
    } catch (error) {
      return sendJson(res, 502, { error: `LM Studio offline: ${error.message}` })
    }
  }
  if (requestUrl.pathname === "/api/health" && req.method === "GET") {
    try {
      const details = await fetchModelsDetails()
      return sendJson(res, 200, { ok: true, models: details.models, loadedModel: details.loadedModel })
    } catch (error) {
      return sendJson(res, 502, { ok: false, error: error.message })
    }
  }
  if (requestUrl.pathname === "/api/chat" && req.method === "POST") return proxyChat(req, res)
  if (requestUrl.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Endpoint não encontrado." })
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Método não suportado." })
  return serveStatic(requestUrl.pathname, res)
})

server.listen(PORT, HOST, () => {
  console.log(`ECHO LM Studio Demo: http://${HOST}:${PORT}`)
  console.log(`Proxy LM Studio: ${LM_STUDIO_URL}`)
  console.log("Para expor com Cloudflare Tunnel: cloudflared tunnel --url http://127.0.0.1:8787")
})
