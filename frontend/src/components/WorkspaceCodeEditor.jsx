import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Loader2, Play, Save, TerminalSquare } from "lucide-react";
import { io } from "socket.io-client";
import { workspaceService } from "../services/workspaceService";
import toast from "react-hot-toast";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";
const FILE_TABS = ["html", "css", "js"];
const DEFAULT_CODE_FILES = {
    html: `<main class="app">
  <h1>DevTinder Workspace</h1>
  <p>Edit HTML, CSS, and JS, then click Run to preview.</p>
  <button id="demoButton">Click me</button>
</main>`,
    css: `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 2rem;
  background: #f4f7fb;
}

.app {
  max-width: 560px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.12);
}

h1 {
  margin-top: 0;
  color: #0f172a;
}

button {
  margin-top: 1rem;
  border: none;
  background: #2563eb;
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  cursor: pointer;
}`,
    js: `document.getElementById("demoButton")?.addEventListener("click", () => {
  console.log("Button clicked from workspace preview.");
});`,
};

const normalizeCodeFiles = (codeFiles, fallbackCode = "") => ({
    html: typeof codeFiles?.html === "string" ? codeFiles.html : DEFAULT_CODE_FILES.html,
    css: typeof codeFiles?.css === "string" ? codeFiles.css : DEFAULT_CODE_FILES.css,
    js:
        typeof codeFiles?.js === "string"
            ? codeFiles.js
            : typeof fallbackCode === "string" && fallbackCode.length > 0
                ? fallbackCode
                : DEFAULT_CODE_FILES.js,
});

const escapeScript = (code) => code.replace(/<\/script>/gi, "<\\/script>");

const buildPreviewDocument = (codeFiles) => {
    const safeJs = escapeScript(codeFiles.js);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${codeFiles.css}</style>
  </head>
  <body>
    ${codeFiles.html}
    <script>
      (function () {
        const send = (type, payload) => {
          window.parent.postMessage({ source: "workspace_preview", type, payload }, "*");
        };

        const formatArg = (value) => {
          if (typeof value === "string") return value;
          try {
            return JSON.stringify(value);
          } catch (err) {
            return String(value);
          }
        };

        ["log", "info", "warn", "error"].forEach((method) => {
          const original = console[method];
          console[method] = (...args) => {
            send("console", { level: method, args: args.map(formatArg) });
            original.apply(console, args);
          };
        });

        window.addEventListener("error", (event) => {
          send("runtime-error", { message: event.message || "Runtime error" });
        });

        window.addEventListener("unhandledrejection", (event) => {
          const reason = event.reason?.message || String(event.reason || "Unhandled promise rejection");
          send("runtime-error", { message: reason });
        });
      })();
    </script>
    <script>${safeJs}</script>
  </body>
</html>`;
};

const WorkspaceCodeEditor = ({ workspaceId, initialCode, initialCodeFiles }) => {
    const initialNormalizedCodeFiles = useMemo(
        () => normalizeCodeFiles(initialCodeFiles, initialCode),
        [initialCodeFiles, initialCode]
    );

    const [codeFiles, setCodeFiles] = useState(initialNormalizedCodeFiles);
    const [activeFile, setActiveFile] = useState("html");
    const [saving, setSaving] = useState(false);
    const [previewSrcDoc, setPreviewSrcDoc] = useState(() => buildPreviewDocument(initialNormalizedCodeFiles));
    const [consoleLines, setConsoleLines] = useState([]);
    const [runtimeError, setRuntimeError] = useState("");
    const socketRef = useRef(null);
    const editorRef = useRef(null);
    const iframeRef = useRef(null);

    // Track if a change is remote so we don't broadcast it back
    const isRemoteChange = useRef(false);
    const remoteResetTimerRef = useRef(null);

    useEffect(() => {
        setCodeFiles(initialNormalizedCodeFiles);
        setPreviewSrcDoc(buildPreviewDocument(initialNormalizedCodeFiles));
        setConsoleLines([]);
        setRuntimeError("");
    }, [workspaceId, initialNormalizedCodeFiles]);

    useEffect(() => {
        // Connect to Socket.IO
        socketRef.current = io(SOCKET_URL, {
            withCredentials: true,
        });

        // Join the workspace room
        socketRef.current.emit("join_workspace", workspaceId);

        // Listen for code changes from other users
        socketRef.current.on("receive_code_change", (data) => {
            if (data.workspaceId === workspaceId) {
                isRemoteChange.current = true;
                const incomingCodeFiles =
                    data.codeFiles ||
                    (data.code && typeof data.code === "object" ? data.code : null);

                if (incomingCodeFiles) {
                    setCodeFiles((prev) => normalizeCodeFiles(incomingCodeFiles, prev.js));
                } else if (typeof data.code === "string") {
                    setCodeFiles((prev) => ({ ...prev, js: data.code }));
                }

                if (remoteResetTimerRef.current) {
                    clearTimeout(remoteResetTimerRef.current);
                }
                remoteResetTimerRef.current = setTimeout(() => {
                    isRemoteChange.current = false;
                }, 0);
            }
        });

        return () => {
            if (remoteResetTimerRef.current) {
                clearTimeout(remoteResetTimerRef.current);
            }
            socketRef.current.disconnect();
        };
    }, [workspaceId]);

    useEffect(() => {
        const onPreviewMessage = (event) => {
            if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
                return;
            }

            const payload = event.data;
            if (!payload || payload.source !== "workspace_preview") {
                return;
            }

            if (payload.type === "console") {
                const level = payload.payload?.level || "log";
                const args = Array.isArray(payload.payload?.args) ? payload.payload.args : [];
                const line = `[${level}] ${args.join(" ")}`;
                setConsoleLines((prev) => [...prev.slice(-39), line]);
                return;
            }

            if (payload.type === "runtime-error") {
                setRuntimeError(payload.payload?.message || "Runtime error");
            }
        };

        window.addEventListener("message", onPreviewMessage);

        return () => {
            window.removeEventListener("message", onPreviewMessage);
        };
    }, []);

    const handleEditorDidMount = (editor) => {
        editorRef.current = editor;
    };

    const handleEditorChange = (value) => {
        const nextValue = value || "";

        // If this change originated from a remote update, don't broadcast it
        if (isRemoteChange.current) {
            setCodeFiles((prev) => ({
                ...prev,
                [activeFile]: nextValue,
            }));
            return;
        }

        // This is a local change, broadcast it
        setCodeFiles((prev) => {
            const next = {
                ...prev,
                [activeFile]: nextValue,
            };

            socketRef.current?.emit("code_change", {
                workspaceId,
                code: next.js,
                codeFiles: next,
            });

            return next;
        });
    };

    const handleRunCode = () => {
        setConsoleLines([]);
        setRuntimeError("");
        setPreviewSrcDoc(buildPreviewDocument(codeFiles));
    };

    const handleSaveCode = async () => {
        try {
            setSaving(true);
            await workspaceService.saveWorkspaceCode(workspaceId, { codeFiles });
            toast.success("Code saved successfully!");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save code");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0f172a]">
            <div className="flex justify-between items-center p-3 bg-[#111827] border-b border-slate-700 gap-2 shrink-0">
                <div className="flex items-center gap-2">
                    {FILE_TABS.map((file) => (
                        <button
                            key={file}
                            type="button"
                            onClick={() => setActiveFile(file)}
                            className={`px-3 py-1.5 rounded-md text-xs uppercase tracking-wide font-semibold transition-colors ${activeFile === file
                                ? "bg-blue-600 text-white"
                                : "bg-slate-800 text-slate-300 hover:text-white"
                                }`}
                        >
                            {file}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleRunCode}
                        className="flex items-center text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded transition-colors"
                    >
                        <Play size={16} className="mr-2" />
                        Run
                    </button>
                    <button
                        onClick={handleSaveCode}
                        disabled={saving}
                        className="flex items-center text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                        Save to DB
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2">
                <div className="min-h-0 border-b xl:border-b-0 xl:border-r border-slate-700">
                    <Editor
                        height="100%"
                        language={activeFile === "js" ? "javascript" : activeFile}
                        theme="vs-dark"
                        value={codeFiles[activeFile]}
                        onChange={handleEditorChange}
                        onMount={handleEditorDidMount}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            wordWrap: "on",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            padding: { top: 16 },
                        }}
                    />
                </div>

                <div className="min-h-0 flex flex-col bg-white">
                    <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between shrink-0">
                        <p className="text-sm font-semibold text-slate-700">Output Preview</p>
                        <p className="text-xs text-slate-500">Click Run to refresh</p>
                    </div>
                    <iframe
                        ref={iframeRef}
                        title="workspace-preview"
                        sandbox="allow-scripts"
                        srcDoc={previewSrcDoc}
                        className="flex-1 w-full bg-white"
                    />
                    <div className="h-40 bg-[#0b1220] border-t border-slate-700 text-slate-200 flex flex-col">
                        <div className="px-3 py-2 border-b border-slate-700 text-xs font-semibold uppercase tracking-wide flex items-center">
                            <TerminalSquare size={14} className="mr-2" />
                            Console
                        </div>
                        <div className="flex-1 overflow-y-auto px-3 py-2 text-xs font-mono space-y-1">
                            {runtimeError ? (
                                <p className="text-rose-400">{runtimeError}</p>
                            ) : null}

                            {consoleLines.length === 0 && !runtimeError ? (
                                <p className="text-slate-500">No logs yet. Add `console.log` and run the code.</p>
                            ) : (
                                consoleLines.map((line, index) => (
                                    <p key={`${line}-${index}`}>{line}</p>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkspaceCodeEditor;
