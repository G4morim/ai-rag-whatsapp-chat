import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Settings = {
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_EMBEDDINGS_MODEL: string;
  SYSTEM_PROMPT: string;
};

type DocumentItem = {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
};

type MessageItem = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

const EMPTY_SETTINGS: Settings = {
  OPENROUTER_API_KEY: "",
  OPENROUTER_MODEL: "",
  OPENROUTER_EMBEDDINGS_MODEL: "",
  SYSTEM_PROMPT: "",
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?.replace(/\/$/, "")
  ?? "";

function buildApiUrl(path: string) {
  if (!API_BASE) return path;
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
}

async function readResponseJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const fallbackText = await response.text();
    throw new Error(
      `Resposta nao-JSON de ${response.url} (${response.status}). ${fallbackText.slice(0, 120)}`,
    );
  }

  return response.json();
}

async function getErrorMessage(response: Response) {
  try {
    const data = await readResponseJson(response);
    if (data && typeof data === "object" && "error" in data) {
      const errorValue = (data as { error?: unknown }).error;
      if (typeof errorValue === "string") return errorValue;
    }
  } catch (error) {
    return (error as Error).message;
  }

  return `HTTP ${response.status}`;
}

function App() {
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    localStorage.getItem("conversationId"),
  );
  const [chatInput, setChatInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      ),
    [messages],
  );

  useEffect(() => {
    async function loadInitial() {
      try {
        const [settingsRes, docsRes] = await Promise.all([
          fetch(buildApiUrl("/api/settings")),
          fetch(buildApiUrl("/api/documents")),
        ]);

        if (settingsRes.ok) {
          const data = await readResponseJson(settingsRes);
          setSettings({ ...EMPTY_SETTINGS, ...data });
        }

        if (docsRes.ok) {
          const data = await readResponseJson(docsRes);
          setDocuments(data);
        }

        const savedConvId = localStorage.getItem("conversationId");
        if (savedConvId) {
          const historyRes = await fetch(
            buildApiUrl(`/api/chat/history?conversationId=${savedConvId}`),
          );
          if (historyRes.ok) {
            const history = await readResponseJson(historyRes);
            setMessages(history);
          }
        }
      } catch (error) {
        setStatus(
          `Falha ao carregar dados iniciais. ${(error as Error).message}`,
        );
      }
    }

    loadInitial();
  }, []);

  async function handleSaveSettings(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(buildApiUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      setStatus(errorMessage || "Falha ao salvar configuracoes.");
      return;
    }

    setStatus("Configuracoes salvas.");
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(buildApiUrl("/api/documents/upload"), {
      method: "POST",
      body: formData,
    });

    setUploading(false);
    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      setStatus(errorMessage || "Falha no upload.");
      return;
    }

    const newDoc = await readResponseJson(response);
    setDocuments((prev) => [newDoc, ...prev]);
  }

  async function handleDeleteDocument(id: string) {
    setStatus(null);
    const response = await fetch(buildApiUrl(`/api/documents/${id}`), {
      method: "DELETE",
    });
    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      setStatus(errorMessage || "Falha ao excluir documento.");
      return;
    }

    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!chatInput.trim()) return;

    setSending(true);
    setStatus(null);

    const response = await fetch(buildApiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: chatInput,
        conversationId,
        source: "test",
      }),
    });

    setSending(false);
    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      setStatus(errorMessage || "Falha ao enviar mensagem.");
      return;
    }

    const data = await readResponseJson(response);
    setConversationId(data.conversationId);
    localStorage.setItem("conversationId", data.conversationId);
    setChatInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: chatInput },
      { role: "assistant", content: data.reply },
    ]);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="badge">AI + RAG + WhatsApp</p>
          <h1>Central de Conversas Inteligentes</h1>
          <p className="subtitle">
            Configure modelos, alimente documentos e teste conversas antes de
            colocar o WhatsApp em producao.
          </p>
        </div>
        <div className="hero-card">
          <h2>Status rapido</h2>
          <ul>
            <li>{documents.length} documentos carregados</li>
            <li>{messages.length} mensagens no historico</li>
            <li>
              {settings.OPENROUTER_MODEL
                ? `Modelo: ${settings.OPENROUTER_MODEL}`
                : "Modelo nao configurado"}
            </li>
          </ul>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Configuracoes</h2>
          <form className="stack" onSubmit={handleSaveSettings}>
            <label>
              OpenRouter API Key
              <input
                type="password"
                placeholder="sk-..."
                value={settings.OPENROUTER_API_KEY}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    OPENROUTER_API_KEY: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Modelo principal
              <input
                type="text"
                placeholder="gpt-4.1-mini"
                value={settings.OPENROUTER_MODEL}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    OPENROUTER_MODEL: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Modelo de embeddings
              <input
                type="text"
                placeholder="text-embedding-3-small"
                value={settings.OPENROUTER_EMBEDDINGS_MODEL}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    OPENROUTER_EMBEDDINGS_MODEL: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              System prompt
              <textarea
                rows={5}
                value={settings.SYSTEM_PROMPT}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    SYSTEM_PROMPT: event.target.value,
                  }))
                }
              />
            </label>
            <button className="primary" type="submit">
              Salvar configuracoes
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Documentos RAG</h2>
          <div className="stack">
            <label className="upload">
              <input type="file" onChange={handleUpload} />
              <span>{uploading ? "Enviando..." : "Enviar PDF, TXT ou MD"}</span>
            </label>
            <div className="documents">
              {documents.length === 0 ? (
                <p className="muted">Nenhum documento carregado.</p>
              ) : (
                documents.map((doc) => (
                  <div className="doc" key={doc.id}>
                    <div>
                      <strong>{doc.filename}</strong>
                      <span>{Math.round(doc.size / 1024)} KB</span>
                    </div>
                    <button
                      className="ghost"
                      onClick={() => handleDeleteDocument(doc.id)}
                    >
                      Remover
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="panel chat">
          <h2>Chat de teste</h2>
          <div className="chat-window">
            {sortedMessages.length === 0 ? (
              <p className="muted">Sem mensagens ainda. Envie a primeira!</p>
            ) : (
              sortedMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`bubble ${message.role}`}
                >
                  <span>{message.content}</span>
                </div>
              ))
            )}
          </div>
          <form className="chat-input" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Digite sua mensagem..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
            />
            <button className="primary" type="submit" disabled={sending}>
              {sending ? "Enviando" : "Enviar"}
            </button>
          </form>
        </section>
      </main>

      {status && <div className="status">{status}</div>}
    </div>
  );
}

export default App;
