// Standalone embed widget: loaded via <script> on an arbitrary third-party
// site, so it must not assume React, a bundler, or any global is present.
// Everything renders inside a Shadow DOM root to avoid colliding with the
// host page's CSS.

interface Product {
  id: string;
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  productUrl: string;
}

interface ChatMessageResponse {
  reply: string;
  products: Product[];
}

interface ChatEntry {
  role: "user" | "assistant" | "error";
  content: string;
  products?: Product[];
}

function readConfig() {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) throw new Error("Chat widget: could not find its own <script> tag");

  const widgetKey = script.dataset.widgetKey;
  if (!widgetKey) throw new Error("Chat widget: data-widget-key is required");

  return {
    widgetKey,
    // The gateway base is wherever widget.js was served from, including any
    // path prefix (production serves it at /api/widget.js behind nginx).
    gatewayOrigin: new URL(".", script.src).href.replace(/\/+$/, ""),
    themeColor: script.dataset.themeColor ?? "#00c2a8",
    botName: "Assistant",
    greeting: script.dataset.greeting ?? "Hi! How can I help you today?",
    position: script.dataset.position === "bottom-left" ? "bottom-left" : "bottom-right",
    title: "Chat with us",
    placeholder: "Type a message…",
  };
}

type WidgetConfig = ReturnType<typeof readConfig>;

/**
 * The appearance set in the dashboard. It also confirms the widget is on and
 * this site is allowed: if not, the widget stays hidden instead of showing a
 * chat that can't answer.
 */
async function loadConfig(base: WidgetConfig): Promise<WidgetConfig | null> {
  const response = await fetch(`${base.gatewayOrigin}/public/widget/${base.widgetKey}/config`);
  if (response.status === 403 || response.status === 404) {
    console.warn(`[ai-platform-widget] not shown: ${response.status === 404 ? "unknown widget key" : "the widget is off or this site isn't an allowed origin"}`);
    return null;
  }
  if (!response.ok) throw new Error(`Config request failed (${response.status})`);
  const remote = (await response.json()) as { botName?: string; color: string; title: string; greeting: string; placeholder: string; position: string };
  return {
    ...base,
    themeColor: remote.color,
    botName: remote.botName || base.botName,
    title: remote.title,
    greeting: remote.greeting,
    placeholder: remote.placeholder,
    position: remote.position === "bottom-left" ? "bottom-left" : "bottom-right",
  };
}

/**
 * One id per visitor per tab, so the platform can group their messages into a
 * conversation. sessionStorage can be blocked (privacy modes): fall back to an
 * id that lives as long as the page.
 */
function sessionId(widgetKey: string): string {
  const storageKey = `ai-platform-widget-session:${widgetKey}`;
  const fresh = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const id = fresh();
    sessionStorage.setItem(storageKey, id);
    return id;
  } catch {
    return fresh();
  }
}

function formatPrice(product: Product): string {
  if (product.price === undefined) return "";
  return `${product.price.toLocaleString()} ${product.currency ?? ""}`.trim();
}

/** "#00c2a8" -> "0, 194, 168", for rgba() shadows and glows. */
function rgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Near-black or white text, whichever reads better on the accent color. */
function textOn(hex: string): string {
  const [r, g, b] = rgb(hex).split(", ").map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#0e1210" : "#ffffff";
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Same look as the demo chat on the Suuper website: a dark panel, an accent
// header with a dot pattern, accent bot bubbles and cream visitor bubbles.
function styles(config: WidgetConfig, side: "left" | "right") {
  const accent = config.themeColor;
  const onAccent = textOn(accent);
  const glow = rgb(accent);
  return `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; }
    .wrap {
      position: fixed; bottom: 16px; ${side}: 16px; z-index: 2147483000;
      display: flex; flex-direction: column; align-items: ${side === "left" ? "flex-start" : "flex-end"}; gap: 12px;
      font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased; color: #f7f6f2;
    }
    .launcher {
      width: 60px; height: 60px; border: 0; cursor: pointer;
      border-radius: ${side === "left" ? "20px 20px 6px 20px" : "20px 20px 20px 6px"};
      background: ${accent}; color: ${onAccent};
      font: 700 15px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
      box-shadow: 0 18px 40px rgba(${glow}, .35);
      animation: ring 2.6s infinite; transition: transform .15s ease;
    }
    .launcher:hover { transform: translateY(-2px); }
    .launcher:focus-visible, button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
    .panel {
      width: min(360px, calc(100vw - 32px)); max-height: min(600px, calc(100vh - 104px));
      display: none; flex-direction: column; overflow: hidden;
      background: #0e1210; border: 1px solid rgba(247, 246, 242, .14); border-radius: 22px;
      box-shadow: 0 30px 70px rgba(0, 0, 0, .6);
    }
    .panel.open { display: flex; animation: pop .3s ease both; }
    .header {
      display: flex; align-items: center; gap: 12px; padding: 16px 18px; flex: none;
      background-color: ${accent}; color: ${onAccent};
      background-image: radial-gradient(rgba(14, 18, 16, .2) 1.2px, transparent 1.2px); background-size: 16px 16px;
    }
    .logo {
      width: 34px; height: 34px; flex: none; border-radius: 12px 12px 12px 4px; background: #0e1210; color: ${accent};
      display: flex; align-items: center; justify-content: center; font: 700 15px ui-sans-serif, system-ui, sans-serif;
    }
    .name { display: block; font: 700 16px/1.2 "Space Grotesk", ui-sans-serif, system-ui, sans-serif; letter-spacing: -.01em; }
    .sub { display: block; margin-top: 2px; font: 500 10px/1.3 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; opacity: .85; }
    .messages {
      flex: 1; min-height: 200px; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px;
      font-size: 14px; line-height: 1.5; scrollbar-width: thin; scrollbar-color: rgba(247, 246, 242, .2) transparent;
    }
    .bubble { padding: 11px 14px; white-space: pre-wrap; overflow-wrap: anywhere; animation: pop .3s ease both; }
    .bubble.assistant { align-self: flex-start; max-width: 88%; border-radius: 16px 16px 16px 5px; background: ${accent}; color: ${onAccent}; }
    .bubble.greeting { align-self: flex-start; max-width: 88%; border-radius: 16px 16px 16px 5px; background: #161d1a; color: #f7f6f2; }
    .bubble.user { align-self: flex-end; max-width: 82%; border-radius: 16px 16px 5px 16px; background: #f7f6f2; color: #0e1210; }
    .bubble.error { align-self: flex-start; max-width: 88%; border-radius: 16px 16px 16px 5px; background: rgba(239, 68, 68, .14); color: #fca5a5; }
    .typing { align-self: flex-start; display: flex; gap: 5px; padding: 12px 14px; border-radius: 999px; background: rgba(247, 246, 242, .1); }
    .typing span { width: 6px; height: 6px; border-radius: 50%; background: #f7f6f2; animation: blink 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: .2s; }
    .typing span:nth-child(3) { animation-delay: .4s; }
    .product {
      align-self: flex-start; width: 88%; display: block; overflow: hidden; text-decoration: none; color: #f7f6f2;
      background: #161d1a; border: 1px solid rgba(247, 246, 242, .1); border-radius: 16px; transition: border-color .15s ease;
      animation: pop .3s ease both;
    }
    .product:hover { border-color: ${accent}; }
    .product img { display: block; width: 100%; height: 130px; object-fit: contain; background: #fff; }
    .product .info { padding: 10px 12px 12px; }
    .product .title { font-size: 13px; font-weight: 600; line-height: 1.35; }
    .product .price { margin-top: 4px; font: 600 12.5px ui-monospace, "SF Mono", Menlo, monospace; color: ${accent}; }
    form { display: flex; align-items: center; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid rgba(247, 246, 242, .1); flex: none; }
    input {
      flex: 1; min-width: 0; padding: 11px 16px; border-radius: 999px; font-size: 14px; font-family: inherit;
      background: transparent; color: #f7f6f2; border: 1px solid rgba(247, 246, 242, .2);
    }
    input::placeholder { color: rgba(247, 246, 242, .45); }
    input:focus { border-color: ${accent}; outline: none; }
    button.send {
      width: 42px; height: 42px; flex: none; border: 0; border-radius: 999px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; background: ${accent}; color: ${onAccent};
    }
    button.send:disabled { opacity: .5; cursor: default; }
    @keyframes pop { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: none; } }
    @keyframes ring { 0%, 100% { box-shadow: 0 18px 40px rgba(${glow}, .35), 0 0 0 0 rgba(${glow}, .5); } 70% { box-shadow: 0 18px 40px rgba(${glow}, .35), 0 0 0 16px rgba(${glow}, 0); } }
    @keyframes blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .launcher, .panel.open, .bubble, .product { animation: none; } .typing span { animation-duration: 2.4s; } }
  `;
}

function renderWidget(config: WidgetConfig) {
  const host = document.createElement("div");
  host.id = "ai-platform-widget-root";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const side = config.position === "bottom-left" ? "left" : "right";

  const style = el("style");
  style.textContent = styles(config, side);
  const wrap = el("div", "wrap");

  // Built with textContent only: names, greetings and product data come from
  // the dashboard and the store, never as HTML.
  const panel = el("div", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", config.title);
  const header = el("div", "header");
  const logo = el("span", "logo", (config.botName.trim()[0] ?? "A").toUpperCase());
  logo.setAttribute("aria-hidden", "true");
  const heading = el("span");
  heading.append(el("span", "name", config.botName), el("span", "sub", config.title));
  header.append(logo, heading);

  const messagesEl = el("div", "messages");
  messagesEl.setAttribute("aria-live", "polite");

  const form = el("form");
  const input = el("input");
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = config.placeholder;
  input.setAttribute("aria-label", config.placeholder);
  const sendButton = el("button", "send");
  sendButton.type = "submit";
  sendButton.setAttribute("aria-label", "Send");
  sendButton.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  form.append(input, sendButton);
  panel.append(header, messagesEl, form);

  const launcher = el("button", "launcher", "AI");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.setAttribute("aria-expanded", "false");
  wrap.append(panel, launcher);
  root.append(style, wrap);

  const history: ChatEntry[] = [{ role: "assistant", content: config.greeting }];
  const session = sessionId(config.widgetKey);
  let opened = false;
  let waiting = false;

  function productCard(product: Product) {
    const link = el("a", "product");
    link.href = product.productUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (product.imageUrl) {
      const img = el("img");
      img.src = product.imageUrl;
      img.alt = "";
      img.loading = "lazy";
      link.append(img);
    }
    const info = el("div", "info");
    info.append(el("div", "title", product.title));
    const price = formatPrice(product);
    if (price) info.append(el("div", "price", price));
    link.append(info);
    return link;
  }

  function renderMessages() {
    messagesEl.replaceChildren();
    history.forEach((entry, i) => {
      // The greeting sits in a dark bubble, like the demo's intro line; replies use the accent.
      const kind = i === 0 && entry.role === "assistant" ? "greeting" : entry.role;
      messagesEl.append(el("div", `bubble ${kind}`, entry.content));
      for (const product of entry.products ?? []) messagesEl.append(productCard(product));
    });
    if (waiting) {
      const typing = el("div", "typing");
      typing.setAttribute("aria-label", "Typing");
      typing.append(el("span"), el("span"), el("span"));
      messagesEl.append(typing);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage(message: string) {
    history.push({ role: "user", content: message });
    input.value = "";
    sendButton.disabled = true;
    waiting = true;
    renderMessages();

    try {
      const response = await fetch(`${config.gatewayOrigin}/public/widget/${config.widgetKey}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: session }),
      });
      // 402: the business is over its plan's limit. The plan details are for the owner, not their visitors.
      if (response.status === 402) {
        history.push({ role: "error", content: "This assistant isn't available right now. Please contact us another way." });
        return;
      }
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const data = (await response.json()) as ChatMessageResponse;
      history.push({ role: "assistant", content: data.reply, products: data.products });
    } catch {
      history.push({ role: "error", content: "Sorry, something went wrong. Please try again." });
    } finally {
      waiting = false;
      sendButton.disabled = false;
      renderMessages();
    }
  }

  launcher.addEventListener("click", () => {
    opened = !opened;
    panel.classList.toggle("open", opened);
    launcher.textContent = opened ? "✕" : "AI";
    launcher.setAttribute("aria-label", opened ? "Close chat" : "Open chat");
    launcher.setAttribute("aria-expanded", String(opened));
    if (opened) {
      renderMessages();
      input.focus();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (message && !waiting) void sendMessage(message);
  });

  renderMessages();
}

try {
  const base = readConfig();
  loadConfig(base)
    .then((config) => config && renderWidget(config))
    .catch((error) => console.error("[ai-platform-widget]", error));
} catch (error) {
  console.error("[ai-platform-widget]", error);
}
