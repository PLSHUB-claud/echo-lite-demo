const STORAGE_KEY = "echo-lm-studio-demo-v1"
const CONTEXT_TOKEN_LIMIT = 30000
const MAX_IMAGES_PER_MESSAGE = 4
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_EDGE = 1600

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.3 8.3 0 0 1-3-.55L4 20l1.55-4.18A7.3 7.3 0 0 1 4.5 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 4h4l1 3M8 7l1 13h6l1-13M10 11v5M14 11v5"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.5 11.5-8.28 8.28a5 5 0 0 1-7.07-7.07l8.13-8.13a3.5 3.5 0 0 1 4.95 4.95l-8.14 8.14a2 2 0 1 1-2.83-2.83l7.78-7.78"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Zm3 8h13"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.55-3.25 2.75-5 6.5-5s5.95 1.75 6.5 5"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M9.5 12h5M9.5 15h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>',
}

for (const [selector, icon] of [
  ["#new-chat", ICONS.plus],
  ["#sidebar-close", ICONS.close],
  ["#sidebar-toggle", ICONS.menu],
  ["#attach-file", ICONS.paperclip],
  ["#send-button", ICONS.send],
]) {
  const element = document.querySelector(selector)
  if (element) element.insertAdjacentHTML("afterbegin", icon)
}

const els = {
  appShell: document.querySelector(".app-shell"),
  sidebar: document.querySelector("#sidebar"),
  sidebarScrim: document.querySelector("#sidebar-scrim"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  sidebarClose: document.querySelector("#sidebar-close"),
  newChat: document.querySelector("#new-chat"),
  chatList: document.querySelector("#chat-list"),
  chatTitle: document.querySelector("#chat-title"),
  messages: document.querySelector("#messages"),
  emptyState: document.querySelector("#empty-state"),
  composer: document.querySelector("#composer"),
  input: document.querySelector("#message-input"),
  attachFile: document.querySelector("#attach-file"),
  fileInput: document.querySelector("#file-input"),
  composerZone: document.querySelector(".composer-zone"),
  attachmentNotice: document.querySelector("#attachment-notice"),
  attachmentRow: document.querySelector("#attachment-row"),
  sendButton: document.querySelector("#send-button"),
  composerStatus: document.querySelector("#composer-status"),
  toast: document.querySelector("#toast"),
}

let state = {
  chats: [],
  activeChatId: null,
  models: [],
  selectedModel: "",
  isGenerating: false,
  controller: null,
  generationId: null,
  autoScroll: true,
  pendingAttachments: [],
}
let toastTimer

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createChat() {
  return { id: uid("chat"), contextId: uid("context"), title: "Nova conversa", pinned: false, createdAt: Date.now(), messages: [] }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
    if (saved && Array.isArray(saved.chats) && saved.chats.length) {
      state.chats = saved.chats.map((chat) => ({
        ...chat,
        contextId: chat.contextId || uid("context"),
        messages: Array.isArray(chat.messages) ? chat.messages : [],
      }))
      state.activeChatId = saved.activeChatId || state.chats[0].id
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  if (!state.chats.length) {
    const chat = createChat()
    state.chats = [chat]
    state.activeChatId = chat.id
  }
}

function saveState() {
  const serializable = {
    chats: state.chats,
    activeChatId: state.activeChatId,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
}

function activeChat() {
  return state.chats.find((chat) => chat.id === state.activeChatId) || state.chats[0]
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function formatBytes(bytes) {
  if (!bytes) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function showToast(message) {
  clearTimeout(toastTimer)
  els.toast.textContent = message
  els.toast.classList.add("is-visible")
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 3400)
}

let attachmentNoticeTimer
function showAttachmentNotice(message = "voce esta em modo teste, apenas imagens estao disponiveis") {
  clearTimeout(attachmentNoticeTimer)
  els.attachmentNotice.textContent = message
  els.attachmentNotice.classList.add("is-visible")
  attachmentNoticeTimer = setTimeout(() => els.attachmentNotice.classList.remove("is-visible"), 4200)
}

function toggleSidebar(open) {
  els.appShell.classList.toggle("sidebar-collapsed", !open)
  els.sidebar.classList.toggle("is-open", open)
  els.sidebarScrim.classList.toggle("is-visible", open)
}

function renderSidebar() {
  const chats = [...state.chats].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  els.chatList.innerHTML = chats.map((chat) => `
    <div class="chat-item ${chat.id === state.activeChatId ? "is-active" : ""}" data-chat-id="${chat.id}">
      <button class="chat-item-main" type="button" data-select-chat="${chat.id}">
        <span class="chat-item-icon">${ICONS.chat}</span>
        <span class="chat-item-title">${escapeHtml(chat.title)}</span>
      </button>
      <button class="chat-item-menu" type="button" data-delete-chat="${chat.id}" aria-label="Apagar conversa" title="Apagar conversa">${ICONS.trash}</button>
    </div>
  `).join("")

  els.chatList.querySelectorAll("[data-select-chat]").forEach((button) => {
    button.addEventListener("click", () => selectChat(button.dataset.selectChat))
  })
  els.chatList.querySelectorAll("[data-delete-chat]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation()
      deleteChat(button.dataset.deleteChat)
    })
  })
}

function selectChat(chatId) {
  if (state.isGenerating) {
    showToast("Espera a resposta terminar antes de trocar de chat.")
    return
  }
  if (!state.chats.some((chat) => chat.id === chatId)) return
  state.activeChatId = chatId
  state.pendingAttachments = []
  saveState()
  renderAll()
  toggleSidebar(false)
}

function createNewChat() {
  if (state.isGenerating) state.controller?.abort()
  state.generationId = null
  state.controller = null
  const chat = createChat()
  state.chats.unshift(chat)
  state.activeChatId = chat.id
  state.pendingAttachments = []
  state.isGenerating = false
  saveState()
  renderAll()
  toggleSidebar(false)
  els.input.focus()
  showToast("Nova conversa criada.")
}

function deleteChat(chatId) {
  if (state.chats.length === 1) {
    state.chats[0] = createChat()
    state.activeChatId = state.chats[0].id
  } else {
    state.chats = state.chats.filter((chat) => chat.id !== chatId)
    if (state.activeChatId === chatId) state.activeChatId = state.chats[0].id
  }
  saveState()
  renderAll()
  showToast("Conversa apagada.")
}

function renderAssistantContent(content, streaming = false) {
  const wrapper = document.createElement("div")
  wrapper.className = "assistant-content"
  const parts = String(content || "").split(/(```[\s\S]*?(?:```|$))/g)

  parts.forEach((part) => {
    if (!part) return
    if (part.startsWith("```")) {
      const raw = part.slice(3)
      const lines = raw.split("\n")
      const language = (lines.shift() || "").trim() || "code"
      const code = lines.join("\n").replace(/```$/, "").trimEnd()
      const canvas = document.createElement("div")
      canvas.className = `code-canvas ${streaming ? "generating" : ""}`
      canvas.innerHTML = `
        <div class="code-canvas-head"><span class="code-canvas-title">${escapeHtml(language)}</span><button class="copy-code" type="button">${ICONS.copy} copiar</button></div>
        <pre><code>${escapeHtml(code)}</code></pre>
      `
      canvas.querySelector(".copy-code").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code)
          canvas.querySelector(".copy-code").textContent = "copiado"
          setTimeout(() => { if (canvas.querySelector(".copy-code")) canvas.querySelector(".copy-code").innerHTML = `${ICONS.copy} copiar` }, 1400)
        } catch { showToast("Não foi possível copiar o código.") }
      })
      wrapper.appendChild(canvas)
      return
    }
    const text = part.trim()
    if (!text) return
    const paragraph = document.createElement("p")
    paragraph.innerHTML = escapeHtml(text).replaceAll("\n", "<br>")
    wrapper.appendChild(paragraph)
  })
  return wrapper
}

function legacyAttachmentElement(att, removable = false, index = -1) {
  const chip = document.createElement("div")
  chip.className = "attachment-chip"
  const isImage = String(att.type || "").startsWith("image/")
  chip.innerHTML = `
    <span class="attachment-chip-icon">${isImage ? "▧" : ICONS.file}</span>
    <span class="attachment-chip-copy"><span class="attachment-chip-name">${escapeHtml(att.name)}</span><span class="attachment-chip-size">${formatBytes(att.size)}${att.content ? " · texto lido" : ""}</span></span>
    ${removable ? `<button class="attachment-chip-remove" type="button" aria-label="Remover anexo" data-remove-attachment="${index}">×</button>` : ""}
  `
  if (removable) {
    chip.querySelector("[data-remove-attachment]").addEventListener("click", () => {
      state.pendingAttachments.splice(index, 1)
      renderAttachments()
    })
  }
  return chip
}

function attachmentElement(att, removable = false, index = -1) {
  const chip = document.createElement("div")
  chip.className = "attachment-chip"
  chip.innerHTML = `<span class="attachment-chip-copy"><span class="attachment-chip-name">${escapeHtml(att.name || "imagem")}</span><span class="attachment-chip-size">${formatBytes(att.size || 0)} - imagem</span></span>${removable ? `<button class="attachment-chip-remove" type="button" aria-label="Remover imagem" data-remove-attachment="${index}">x</button>` : ""}`
  if (att.dataUrl) {
    const preview = document.createElement("img")
    preview.className = "attachment-preview"
    preview.src = att.dataUrl
    preview.alt = att.name || "Imagem anexada"
    preview.loading = "lazy"
    chip.prepend(preview)
  }
  if (removable) {
    chip.querySelector("[data-remove-attachment]").addEventListener("click", () => {
      state.pendingAttachments.splice(index, 1)
      renderAttachments()
    })
  }
  return chip
}

function renderAttachments() {
  els.attachmentRow.innerHTML = ""
  els.attachmentRow.classList.toggle("is-hidden", state.pendingAttachments.length === 0)
  state.pendingAttachments.forEach((att, index) => els.attachmentRow.appendChild(attachmentElement(att, true, index)))
}

function renderMessage(message, isLast = false) {
  const row = document.createElement("article")
  row.className = `message-row ${message.role}`
  row.dataset.messageId = message.id
  const avatar = message.role === "user"
    ? `<div class="avatar user">${ICONS.user}</div>`
    : `<div class="avatar echo"><img src="/assets/echo-skull.jpg" alt="ECHO" /></div>`
  const visibleLabel = message.role === "user" ? "TU" : "ECHO"
  row.innerHTML = `${avatar}<div class="message-body"><div class="message-meta">${visibleLabel}</div><div class="message-bubble"></div></div>`
  const bubble = row.querySelector(".message-bubble")

  if (message.role === "assistant") {
    if (message.content) bubble.appendChild(renderAssistantContent(message.content, state.isGenerating && isLast))
    if (message.error) {
      const error = document.createElement("div")
      error.className = "error-bubble"
      error.textContent = message.error
      bubble.appendChild(error)
    }
  } else {
    if (message.attachments?.length) {
      const attachments = document.createElement("div")
      attachments.className = "attachments-inline"
      message.attachments.forEach((attachment) => attachments.appendChild(attachmentElement(attachment)))
      bubble.appendChild(attachments)
    }
    if (message.content) {
      const text = document.createElement("p")
      text.textContent = message.content
      bubble.appendChild(text)
    }
  }
  return row
}

function renderThinking() {
  const row = document.createElement("article")
  row.className = "thinking-row"
  row.innerHTML = `
    <div class="avatar echo"><img src="/assets/echo-skull.jpg" alt="ECHO" /></div>
    <div class="thinking-bubble"><span class="thinking-halo"></span><span>A processar</span><span class="thinking-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="thinking-dots" aria-hidden="true"></span></div>
  `
  return row
}

function isNearBottom() {
  const distance = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight
  return distance < 72
}

function scrollToBottomIfNeeded(force = false) {
  if (force || state.autoScroll) els.messages.scrollTop = els.messages.scrollHeight
}

function renderMessages() {
  const chat = activeChat()
  const previousScrollTop = els.messages.scrollTop
  els.chatTitle.textContent = chat.title
  els.messages.innerHTML = ""
  if (!chat.messages.length) {
    els.messages.appendChild(els.emptyState)
    els.emptyState.style.display = "flex"
    return
  }
  els.emptyState.style.display = "none"
  const list = document.createElement("div")
  list.className = "message-list"
  chat.messages.forEach((message, index) => {
    const isEmptyGeneratingAssistant = state.isGenerating && message.role === "assistant" && !message.content && index === chat.messages.length - 1
    if (!isEmptyGeneratingAssistant) list.appendChild(renderMessage(message, index === chat.messages.length - 1))
  })
  if (state.isGenerating) list.appendChild(renderThinking())
  els.messages.appendChild(list)
  requestAnimationFrame(() => {
    if (state.autoScroll) scrollToBottomIfNeeded()
    else els.messages.scrollTop = Math.min(previousScrollTop, els.messages.scrollHeight)
  })
}

function renderAll() {
  renderSidebar()
  renderMessages()
  renderAttachments()
  els.sendButton.innerHTML = state.isGenerating ? ICONS.stop : ICONS.send
  els.sendButton.classList.toggle("is-stop", state.isGenerating)
  els.sendButton.setAttribute("aria-label", state.isGenerating ? "Parar resposta" : "Enviar mensagem")
  els.composerStatus.textContent = state.isGenerating ? "A responder…" : ""
  els.input.disabled = state.isGenerating
  els.attachFile.disabled = state.isGenerating
}

function autoResize() {
  els.input.style.height = "auto"
  els.input.style.height = `${Math.min(els.input.scrollHeight, 170)}px`
}

function titleFromMessage(text) {
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length > 38 ? `${normalized.slice(0, 38).trimEnd()}…` : normalized || "Nova conversa"
}

function legacyTextLike(file) {
  return file.type.startsWith("text/") || /\.(md|markdown|json|js|jsx|ts|tsx|py|css|html|yml|yaml|xml|csv|log|sql|sh|bat)$/i.test(file.name)
}

async function legacyAddFiles(fileList) {
  const files = [...fileList]
  if (!files.length) return
  const remaining = 8 - state.pendingAttachments.length
  for (const file of files.slice(0, remaining)) {
    let content = ""
    if (legacyTextLike(file)) {
      try { content = (await file.text()).slice(0, 20000) } catch { content = "" }
    }
    state.pendingAttachments.push({ id: uid("attachment"), name: file.name, type: file.type || "application/octet-stream", size: file.size, content })
  }
  if (files.length > remaining) showToast("Limite de 8 anexos por mensagem.")
  renderAttachments()
}

function legacyAttachmentPrompt(attachments) {
  if (!attachments.length) return ""
  const lines = attachments.map((att) => {
    const header = `[Anexo: ${att.name} · ${att.type || "arquivo"} · ${formatBytes(att.size)}]`
    return att.content ? `${header}\n${att.content}` : header
  })
  return `\n\nArquivos anexados para contexto:\n${lines.join("\n\n")}`
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("image-read"))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error("image-decode"))
      image.onload = () => {
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext("2d", { alpha: false })
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), width: canvas.width, height: canvas.height })
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

async function addImages(fileList) {
  const files = [...fileList]
  if (!files.length) return
  const remaining = MAX_IMAGES_PER_MESSAGE - state.pendingAttachments.length
  if (remaining <= 0) {
    showAttachmentNotice("Limite de 4 imagens por mensagem.")
    return
  }
  for (const file of files.slice(0, remaining)) {
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      showAttachmentNotice("voce esta em modo teste, apenas imagens estao disponiveis")
      continue
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showAttachmentNotice("Cada imagem deve ter no maximo 8 MB.")
      continue
    }
    try {
      const image = await readImage(file)
      state.pendingAttachments.push({
        id: uid("attachment"),
        name: file.name,
        type: "image/jpeg",
        size: file.size,
        dataUrl: image.dataUrl,
        width: image.width,
        height: image.height,
      })
    } catch {
      showAttachmentNotice("Nao foi possivel ler esta imagem.")
    }
  }
  if (files.length > remaining) showAttachmentNotice("Limite de 4 imagens por mensagem.")
  renderAttachments()
}

function apiContent(message) {
  const images = (message.attachments || []).filter((attachment) => attachment.dataUrl)
  if (!images.length) return message.content
  return [
    { type: "text", text: message.content || "Analise as imagens anexadas." },
    ...images.map((attachment) => ({ type: "image_url", image_url: { url: attachment.dataUrl } })),
  ]
}

function estimateContentTokens(content) {
  if (Array.isArray(content)) {
    return content.reduce((total, part) => total + (part.type === "image_url" ? 1800 : Math.ceil(String(part.text || "").length / 4)), 0)
  }
  return Math.ceil(String(content || "").length / 4)
}

function apiMessages(chat) {
  const candidates = chat.messages
    .filter((message) => (message.content || message.attachments?.length) && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({ role: message.role, content: apiContent(message) }))
  const selected = []
  let usedTokens = 0
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index]
    const cost = estimateContentTokens(message.content)
    if (selected.length && usedTokens + cost > CONTEXT_TOKEN_LIMIT) break
    selected.unshift(message)
    usedTokens += cost
  }
  return selected
}

async function consumeStream(response, onToken) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Não foi possível responder agora.")
  const decoder = new TextDecoder()
  let buffer = ""
  let received = false
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() || ""
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === "[DONE]") continue
        try {
          const packet = JSON.parse(raw)
          const delta = packet.choices?.[0]?.delta?.content ?? packet.choices?.[0]?.message?.content ?? ""
          if (delta) { received = true; onToken(delta) }
        } catch { /* alguns servidores enviam comentários SSE entre os tokens */ }
      }
    }
  }
  return received
}

function updateAssistantInPlace(messageId, content) {
  let row = document.querySelector(`[data-message-id="${messageId}"]`)
  if (!row) {
    const list = els.messages.querySelector(".message-list")
    const message = activeChat().messages.find((item) => item.id === messageId)
    if (!list || !message) return
    els.messages.querySelector(".thinking-row")?.remove()
    row = renderMessage(message, true)
    list.appendChild(row)
  } else {
    els.messages.querySelector(".thinking-row")?.remove()
  }
  const bubble = row.querySelector(".message-bubble")
  bubble.innerHTML = ""
  bubble.appendChild(renderAssistantContent(content, true))
  scrollToBottomIfNeeded()
}

async function sendMessage() {
  const text = els.input.value.trim()
  if (!text && !state.pendingAttachments.length) return
  if (!state.selectedModel) {
    await refreshModels()
  }
  const modelToUse = state.selectedModel || "loaded"
  const chat = activeChat()
  const attachments = state.pendingAttachments.splice(0)
  const prompt = text || "Analise as imagens anexadas."
  const userMessage = { id: uid("message"), role: "user", content: prompt, attachments }
  chat.messages.push(userMessage)
  if (chat.messages.length === 1) chat.title = titleFromMessage(userMessage.content)
  const assistantMessage = { id: uid("message"), role: "assistant", content: "" }
  chat.messages.push(assistantMessage)
  const generationId = uid("generation")
  state.isGenerating = true
  state.generationId = generationId
  state.autoScroll = true
  state.controller = new AbortController()
  els.input.value = ""
  autoResize()
  saveState()
  renderAll()
  const messages = apiMessages(chat)

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelToUse, chatId: chat.id, contextId: chat.contextId, messages, stream: true, temperature: 0.7, max_tokens: 40000 }),
      signal: state.controller.signal,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error("Não foi possível responder agora.")
    }
    let content = ""
    const received = await consumeStream(response, (token) => {
      content += token
      assistantMessage.content = content
      if (state.generationId === generationId && state.activeChatId === chat.id) updateAssistantInPlace(assistantMessage.id, content)
    })
    if (!received && !content) content = "Não foi possível responder agora."
    assistantMessage.content = content
  } catch (error) {
    if (error?.name === "AbortError") {
      assistantMessage.content = assistantMessage.content || "Geração interrompida."
    } else {
      assistantMessage.content = ""
      assistantMessage.error = "Não foi possível responder agora."
      showToast("Não foi possível responder agora.")
    }
  } finally {
    saveState()
    if (state.generationId !== generationId) return
    state.isGenerating = false
    state.controller = null
    state.generationId = null
    saveState()
    renderAll()
  }
}

function stopGeneration() {
  if (!state.isGenerating) return
  state.controller?.abort()
}

async function refreshModels() {
  try {
    const response = await fetch("/api/models", { cache: "no-store" })
    const payload = await response.json()
    if (!response.ok) throw new Error("model-list-unavailable")
    state.models = Array.isArray(payload.models) ? payload.models : []
    const chatModels = state.models.filter((model) => !/embedding/i.test(model.id))
    
    if (payload.loadedModel) {
      state.selectedModel = payload.loadedModel
    } else {
      state.selectedModel = (chatModels[0] || state.models[0])?.id || ""
    }
  } catch {
    state.models = []
    state.selectedModel = ""
  }
}

els.newChat.addEventListener("click", createNewChat)
els.sidebarToggle.addEventListener("click", () => toggleSidebar(els.appShell.classList.contains("sidebar-collapsed")))
els.sidebarClose.addEventListener("click", () => toggleSidebar(false))
els.sidebarScrim.addEventListener("click", () => toggleSidebar(false))
els.attachFile.addEventListener("click", () => els.fileInput.click())
els.fileInput.addEventListener("change", (event) => {
  addImages(event.target.files)
  event.target.value = ""
})
els.messages.addEventListener("scroll", () => {
  state.autoScroll = isNearBottom()
}, { passive: true })
els.composer.addEventListener("submit", (event) => { event.preventDefault(); state.isGenerating ? stopGeneration() : sendMessage() })
els.input.addEventListener("input", autoResize)
els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage() }
})

for (const eventName of ["dragenter", "dragover"]) {
  els.composerZone.addEventListener(eventName, (event) => { event.preventDefault(); els.composerZone.classList.add("is-dragging") })
}
for (const eventName of ["dragleave", "drop"]) {
  els.composerZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    if (eventName === "drop") addImages(event.dataTransfer?.files || [])
    els.composerZone.classList.remove("is-dragging")
  })
}

loadState()
renderAll()
refreshModels()
