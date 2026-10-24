const STORAGE_KEY = "echo-lm-studio-demo-v1"
const CONTEXT_TOKEN_LIMIT = 24000
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

// GLM ThinkingBubble & Silky Smooth Streaming Helpers
function splitFragments(text, maxLen = 5) {
  const frags = []
  for (const part of String(text || "").split(/(\s+)/)) {
    if (part === "") continue
    if (/^\s+$/.test(part)) {
      if (frags.length > 0) frags[frags.length - 1] += part
      else frags.push(part)
      continue
    }
    for (let i = 0; i < part.length; i += maxLen) {
      frags.push(part.slice(i, i + maxLen))
    }
  }
  return frags
}

function trailOpacity(charsFromEnd) {
  let o
  if (charsFromEnd <= 30) o = 0.95
  else if (charsFromEnd >= 330) o = 0.35
  else o = 0.95 - ((charsFromEnd - 30) / 300) * 0.6
  return Math.round(o * 40) / 40
}

function parseThoughtAndAnswer(raw) {
  if (typeof raw !== "string") return { thought: "", answer: "", isStillThinking: false }
  
  // Check for <think> tags (common in DeepSeek-R1, Qwen reasoning, etc.)
  if (raw.includes("<think>")) {
    if (raw.includes("</think>")) {
      const match = raw.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/i)
      if (match) {
        return {
          thought: match[1].trim(),
          answer: match[2].trimStart(),
          isStillThinking: false,
        }
      }
    } else {
      const match = raw.match(/<think>([\s\S]*)/i)
      return {
        thought: match ? match[1].trim() : "",
        answer: "",
        isStillThinking: true,
      }
    }
  }

  return { thought: "", answer: raw, isStillThinking: false }
}

function createThinkingBubble(message, isGenerating) {
  const isThinking = message.phase === "thinking"
  const elapsed = message.thoughtSeconds || 0
  const thoughtText = message.thought || ""
  const isExpanded = message.isThinkingExpanded !== false && (isThinking || Boolean(message.isThinkingExpanded))

  const container = document.createElement("div")
  container.className = "thinking-container" + (isThinking ? " is-live" : "")
  container.dataset.messageId = message.id

  const header = document.createElement("div")
  header.className = "thinking-header"
  header.setAttribute("role", "button")
  header.setAttribute("tabindex", "0")
  header.setAttribute("aria-expanded", isExpanded ? "true" : "false")

  const bulbSvg = `
    <svg class="bulb-icon ${isThinking ? 'bulb-glow' : ''}" viewBox="0 0 24 24" fill="${isThinking ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${isThinking ? '1.5' : '2'}">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
      <path d="M9 18h6"/>
      <path d="M10 22h4"/>
    </svg>
  `

  const statusLabel = message.statusLabel || "Thinking..."
  const finishedLabel = message.doneLabel || `Thought for ${elapsed}s`

  const labelHtml = isThinking
    ? `<span class="shimmer-text">${escapeHtml(statusLabel)}</span><span class="thinking-timer">${elapsed}s</span>`
    : `<span class="thinking-finished-label">${escapeHtml(finishedLabel)}</span>`

  const chevronSvg = `
    <svg class="thinking-chevron ${isExpanded ? 'is-expanded' : 'is-collapsed'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  `

  header.innerHTML = `
    ${bulbSvg}
    <div class="thinking-label-wrap">${labelHtml}</div>
    ${chevronSvg}
  `

  const body = document.createElement("div")
  body.className = `thinking-body ${isExpanded ? 'is-expanded' : 'is-collapsed'}`

  const scrollArea = document.createElement("div")
  scrollArea.className = "thinking-scroll thinking-fade"

  const textP = document.createElement("p")
  textP.className = "thinking-text"

  if (thoughtText) {
    const frags = splitFragments(thoughtText)
    const total = thoughtText.length
    const ends = []
    frags.reduce((acc, f) => {
      const next = acc + f.length
      ends.push(next)
      return next
    }, 0)

    frags.forEach((frag, i) => {
      const span = document.createElement("span")
      span.className = "thinking-frag"
      span.textContent = frag
      span.style.opacity = isThinking ? trailOpacity(total - ends[i]) : 0.5
      textP.appendChild(span)
    })
  }

  if (isThinking) {
    const cursor = document.createElement("span")
    cursor.className = "cursor-blink"
    cursor.textContent = "▍"
    textP.appendChild(cursor)
  }

  scrollArea.appendChild(textP)
  body.appendChild(scrollArea)

  header.addEventListener("click", () => {
    const willExpand = body.classList.contains("is-collapsed")
    body.classList.toggle("is-collapsed", !willExpand)
    body.classList.toggle("is-expanded", willExpand)
    const chev = header.querySelector(".thinking-chevron")
    if (chev) {
      chev.classList.toggle("is-collapsed", !willExpand)
      chev.classList.toggle("is-expanded", willExpand)
    }
    header.setAttribute("aria-expanded", willExpand ? "true" : "false")
    message.isThinkingExpanded = willExpand
  })

  container.appendChild(header)
  if (thoughtText || isThinking) {
    container.appendChild(body)
  }

  if (isThinking && scrollArea) {
    requestAnimationFrame(() => {
      scrollArea.scrollTop = scrollArea.scrollHeight
    })
  }

  return container
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
    if (message.phase === "thinking" || message.thought || message.thoughtSeconds) {
      bubble.appendChild(createThinkingBubble(message, state.isGenerating && isLast))
    }
    if (message.content) {
      bubble.appendChild(renderAssistantContent(message.content, state.isGenerating && isLast))
    }
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
    list.appendChild(renderMessage(message, index === chat.messages.length - 1))
  })
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

async function consumeStream(response, onChunk) {
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
          const delta = packet.choices?.[0]?.delta || {}
          const content = delta.content || ""
          const reasoning = delta.reasoning_content || ""
          if (content || reasoning) {
            received = true
            onChunk({ content, reasoning })
          }
        } catch { /* alguns servidores enviam comentários SSE entre os tokens */ }
      }
    }
  }
  return received
}

function updateExistingThinkingBubble(container, message) {
  const isThinking = message.phase === "thinking"
  const elapsed = message.thoughtSeconds || 0
  const thoughtText = message.thought || ""
  const isExpanded = message.isThinkingExpanded !== false && (isThinking || Boolean(message.isThinkingExpanded))

  const bulb = container.querySelector(".bulb-icon")
  if (bulb) {
    bulb.setAttribute("class", `bulb-icon ${isThinking ? 'bulb-glow' : ''}`)
    bulb.setAttribute("fill", isThinking ? 'currentColor' : 'none')
    bulb.setAttribute("stroke-width", isThinking ? '1.5' : '2')
  }

  const labelWrap = container.querySelector(".thinking-label-wrap")
  if (labelWrap) {
    const statusLabel = message.statusLabel || "Thinking..."
    const finishedLabel = message.doneLabel || `Thought for ${elapsed}s`
    container.classList.toggle("is-live", isThinking)
    const timerEl = labelWrap.querySelector(".thinking-timer")
    if (isThinking && timerEl && labelWrap.querySelector(".shimmer-text")) {
      timerEl.textContent = `${elapsed}s`
    } else {
      labelWrap.innerHTML = isThinking
        ? `<span class="shimmer-text">${escapeHtml(statusLabel)}</span><span class="thinking-timer">${elapsed}s</span>`
        : `<span class="thinking-finished-label">${escapeHtml(finishedLabel)}</span>`
    }
  }

  const chev = container.querySelector(".thinking-chevron")
  if (chev) {
    chev.classList.toggle("is-collapsed", !isExpanded)
    chev.classList.toggle("is-expanded", isExpanded)
  }

  let body = container.querySelector(".thinking-body")
  if (!body && (thoughtText || isThinking)) {
    body = document.createElement("div")
    body.className = `thinking-body ${isExpanded ? 'is-expanded' : 'is-collapsed'}`
    const scrollArea = document.createElement("div")
    scrollArea.className = "thinking-scroll thinking-fade"
    const textP = document.createElement("p")
    textP.className = "thinking-text"
    scrollArea.appendChild(textP)
    body.appendChild(scrollArea)
    container.appendChild(body)
  }

  if (body) {
    body.className = `thinking-body ${isExpanded ? 'is-expanded' : 'is-collapsed'}`
    const textP = body.querySelector(".thinking-text")
    const scrollArea = body.querySelector(".thinking-scroll")
    if (textP) {
      textP.innerHTML = ""
      if (thoughtText) {
        const frags = splitFragments(thoughtText)
        const total = thoughtText.length
        const ends = []
        frags.reduce((acc, f) => {
          const next = acc + f.length
          ends.push(next)
          return next
        }, 0)
        frags.forEach((frag, i) => {
          const span = document.createElement("span")
          span.className = "thinking-frag"
          span.textContent = frag
          span.style.opacity = isThinking ? trailOpacity(total - ends[i]) : 0.65
          textP.appendChild(span)
        })
      }
      if (isThinking) {
        const cursor = document.createElement("span")
        cursor.className = "cursor-blink"
        cursor.textContent = "▍"
        textP.appendChild(cursor)
      }
      if (scrollArea && isThinking) {
        scrollArea.scrollTop = scrollArea.scrollHeight
      }
    }
  }
}

function updateAssistantInPlace(messageId) {
  const message = activeChat().messages.find((item) => item.id === messageId)
  if (!message) return
  let row = document.querySelector(`[data-message-id="${messageId}"]`)
  if (!row) {
    const list = els.messages.querySelector(".message-list")
    if (!list) return
    row = renderMessage(message, true)
    list.appendChild(row)
  }
  const bubble = row.querySelector(".message-bubble")
  if (!bubble) return

  // Manage ThinkingBubble
  let thinkingEl = bubble.querySelector(".thinking-container")
  if (message.phase === "thinking" || message.thought || message.thoughtSeconds) {
    if (thinkingEl) {
      updateExistingThinkingBubble(thinkingEl, message)
    } else {
      const newThinkingEl = createThinkingBubble(message, state.isGenerating)
      bubble.prepend(newThinkingEl)
    }
  } else if (thinkingEl && !message.thought && !message.thoughtSeconds) {
    thinkingEl.remove()
  }

  // Manage Assistant Answer
  let contentEl = bubble.querySelector(".assistant-content")
  if (message.content) {
    const newContentEl = renderAssistantContent(message.content, state.isGenerating)
    if (contentEl) {
      contentEl.replaceWith(newContentEl)
    } else {
      bubble.appendChild(newContentEl)
    }
  } else if (contentEl) {
    contentEl.remove()
  }

  if (message.error) {
    let errEl = bubble.querySelector(".error-bubble")
    if (!errEl) {
      errEl = document.createElement("div")
      errEl.className = "error-bubble"
      bubble.appendChild(errEl)
    }
    errEl.textContent = message.error
  }

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

  const assistantMessage = {
    id: uid("message"),
    role: "assistant",
    content: "",
    thought: "",
    phase: "thinking",
    thoughtSeconds: 0,
    isThinkingExpanded: true,
  }
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

  let thinkingSeconds = 0
  const thinkingInterval = setInterval(() => {
    if (assistantMessage.phase === "thinking") {
      thinkingSeconds++
      assistantMessage.thoughtSeconds = thinkingSeconds
      if (state.generationId === generationId && state.activeChatId === chat.id) {
        updateAssistantInPlace(assistantMessage.id)
      }
    } else {
      clearInterval(thinkingInterval)
    }
  }, 1000)

  const messages = apiMessages(chat)

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelToUse, chatId: chat.id, contextId: chat.contextId, messages, stream: true, temperature: 0.7, max_tokens: 2048 }),
      signal: state.controller.signal,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error("Não foi possível responder agora.")
    }

    let rawThought = ""
    let rawContent = ""
    const received = await consumeStream(response, ({ content, reasoning }) => {
      if (reasoning) {
        rawThought += reasoning
        assistantMessage.thought = rawThought
        assistantMessage.phase = "thinking"
        assistantMessage.isThinkingExpanded = true
      }

      if (content) {
        rawContent += content
        const parsed = parseThoughtAndAnswer(rawContent)
        if (parsed.thought) {
          assistantMessage.thought = (rawThought ? rawThought + "\n" : "") + parsed.thought
        }

        if (parsed.isStillThinking) {
          assistantMessage.phase = "thinking"
          assistantMessage.isThinkingExpanded = true
        } else {
          if (assistantMessage.phase === "thinking") {
            assistantMessage.phase = "done"
            clearInterval(thinkingInterval)
            assistantMessage.thoughtSeconds = Math.max(1, thinkingSeconds)
            assistantMessage.doneLabel = `Thought for ${assistantMessage.thoughtSeconds}s`
            assistantMessage.isThinkingExpanded = false
          }
          assistantMessage.content = parsed.answer || rawContent
        }
      }

      if (state.generationId === generationId && state.activeChatId === chat.id) {
        updateAssistantInPlace(assistantMessage.id)
      }
    })

    if (!received && !assistantMessage.content) {
      assistantMessage.content = "Não foi possível responder agora."
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      assistantMessage.content = assistantMessage.content || "Geração interrompida."
    } else {
      assistantMessage.content = ""
      assistantMessage.error = "Não foi possível responder agora."
      showToast("Não foi possível responder agora.")
    }
  } finally {
    clearInterval(thinkingInterval)
    if (assistantMessage.phase === "thinking") {
      assistantMessage.phase = "done"
      assistantMessage.thoughtSeconds = Math.max(1, thinkingSeconds)
      assistantMessage.doneLabel = `Thought for ${assistantMessage.thoughtSeconds}s`
      assistantMessage.isThinkingExpanded = false
    }
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
