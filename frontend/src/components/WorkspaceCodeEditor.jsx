import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
    FileCode2,
    FilePlus2,
    Folder,
    FolderPlus,
    Loader2,
    Play,
    Save,
    TerminalSquare,
    Trash2,
} from "lucide-react";
import { io } from "socket.io-client";
import { workspaceService } from "../services/workspaceService";
import toast from "react-hot-toast";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

const DEFAULT_JS_CODE = `console.log("Welcome to your Collaborative Workspace!");`;
const DEFAULT_HTML_CODE = `<main class="app">
  <h1>DevTinder Workspace</h1>
  <p>Create files/folders and code in any language.</p>
  <button id="demoButton">Click me</button>
</main>`;
const DEFAULT_CSS_CODE = `body {
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
}`;

const createNodeId = () => `node_${Math.random().toString(36).slice(2, 10)}`;

const normalizePath = (path = "") =>
    String(path)
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .trim();

const getNodeName = (path = "") => {
    const segments = path.split("/");
    return segments[segments.length - 1] || path;
};

const getPathDepth = (path = "") => Math.max(0, path.split("/").length - 1);

const getFileExtension = (filePath = "") => {
    const name = getNodeName(filePath);
    const dotIndex = name.lastIndexOf(".");
    return dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
};

const sortCodeFiles = (codeFiles = []) =>
    [...codeFiles].sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
        }
        return a.path.localeCompare(b.path);
    });

const dedupeByPathAndType = (codeFiles = []) => {
    const seen = new Set();
    const next = [];

    codeFiles.forEach((entry) => {
        const key = `${entry.type}:${entry.path.toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            next.push(entry);
        }
    });

    return next;
};

const buildDefaultCodeFiles = (fallbackJs = DEFAULT_JS_CODE) => ([
    {
        id: "file_index_html",
        type: "file",
        path: "index.html",
        name: "index.html",
        content: DEFAULT_HTML_CODE,
    },
    {
        id: "file_styles_css",
        type: "file",
        path: "styles.css",
        name: "styles.css",
        content: DEFAULT_CSS_CODE,
    },
    {
        id: "file_script_js",
        type: "file",
        path: "script.js",
        name: "script.js",
        content: typeof fallbackJs === "string" && fallbackJs.length > 0 ? fallbackJs : DEFAULT_JS_CODE,
    },
]);

const normalizeArrayCodeFiles = (codeFiles = []) => {
    const normalized = codeFiles
        .map((entry) => {
            if (!entry || typeof entry !== "object") {
                return null;
            }

            const type = entry.type === "folder" ? "folder" : "file";
            const path = normalizePath(entry.path);
            if (!path) {
                return null;
            }

            return {
                id: typeof entry.id === "string" && entry.id.trim() ? entry.id : createNodeId(),
                type,
                path,
                name: getNodeName(path),
                content: type === "file" && typeof entry.content === "string" ? entry.content : "",
            };
        })
        .filter(Boolean);

    return sortCodeFiles(dedupeByPathAndType(normalized));
};

const normalizeCodeFiles = (codeFiles, fallbackCode = "") => {
    if (Array.isArray(codeFiles)) {
        const normalized = normalizeArrayCodeFiles(codeFiles);
        return normalized.length > 0 ? normalized : sortCodeFiles(buildDefaultCodeFiles(fallbackCode));
    }

    if (codeFiles && typeof codeFiles === "object") {
        const hasLegacyHtmlCssJs =
            typeof codeFiles?.html === "string" ||
            typeof codeFiles?.css === "string" ||
            typeof codeFiles?.js === "string";

        if (hasLegacyHtmlCssJs) {
            return sortCodeFiles(
                buildDefaultCodeFiles(typeof codeFiles?.js === "string" ? codeFiles.js : fallbackCode).map((entry) => {
                    if (entry.path === "index.html" && typeof codeFiles?.html === "string") {
                        return { ...entry, content: codeFiles.html };
                    }
                    if (entry.path === "styles.css" && typeof codeFiles?.css === "string") {
                        return { ...entry, content: codeFiles.css };
                    }
                    return entry;
                })
            );
        }

        const objectValues = Object.values(codeFiles).filter(
            (value) => value && typeof value === "object" && typeof value.path === "string"
        );
        if (objectValues.length > 0) {
            return normalizeArrayCodeFiles(objectValues);
        }
    }

    return sortCodeFiles(buildDefaultCodeFiles(fallbackCode));
};

const getPrimaryCode = (codeFiles = []) => {
    const jsFile = codeFiles.find(
        (entry) => entry.type === "file" && typeof entry.path === "string" && entry.path.toLowerCase().endsWith(".js")
    );

    if (jsFile) {
        return jsFile.content || DEFAULT_JS_CODE;
    }

    const firstFile = codeFiles.find((entry) => entry.type === "file");
    return firstFile?.content || DEFAULT_JS_CODE;
};

const getLanguageFromPath = (filePath = "") => {
    const extension = getFileExtension(filePath);

    const map = {
        js: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        java: "java",
        c: "c",
        h: "cpp",
        cpp: "cpp",
        cxx: "cpp",
        cc: "cpp",
        hpp: "cpp",
        cs: "csharp",
        go: "go",
        rs: "rust",
        php: "php",
        rb: "ruby",
        swift: "swift",
        kt: "kotlin",
        kts: "kotlin",
        html: "html",
        htm: "html",
        css: "css",
        scss: "scss",
        less: "less",
        json: "json",
        xml: "xml",
        md: "markdown",
        yml: "yaml",
        yaml: "yaml",
        sh: "shell",
        bash: "shell",
        sql: "sql",
    };

    return map[extension] || "plaintext";
};

const getTemplateForFile = (filePath = "") => {
    const extension = getFileExtension(filePath);

    switch (extension) {
        case "js":
        case "mjs":
        case "cjs":
            return `console.log("Hello from JavaScript");`;
        case "ts":
            return `const message: string = "Hello from TypeScript";\nconsole.log(message);`;
        case "py":
            return `print("Hello from Python")`;
        case "java":
            return `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Java");\n  }\n}`;
        case "cpp":
        case "cc":
        case "cxx":
            return `#include <iostream>\n\nint main() {\n  std::cout << "Hello from C++" << std::endl;\n  return 0;\n}`;
        case "c":
            return `#include <stdio.h>\n\nint main() {\n  printf("Hello from C\\n");\n  return 0;\n}`;
        case "cs":
            return `using System;\n\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello from C#");\n  }\n}`;
        case "go":
            return `package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello from Go")\n}`;
        case "rs":
            return `fn main() {\n  println!("Hello from Rust");\n}`;
        case "php":
            return `<?php\necho "Hello from PHP";`;
        case "rb":
            return `puts "Hello from Ruby"`;
        case "swift":
            return `print("Hello from Swift")`;
        case "kt":
        case "kts":
            return `fun main() {\n    println("Hello from Kotlin")\n}`;
        case "html":
            return DEFAULT_HTML_CODE;
        case "css":
            return DEFAULT_CSS_CODE;
        case "sql":
            return `SELECT 'Hello from SQL' AS message;`;
        case "json":
            return `{\n  "message": "Hello JSON"\n}`;
        case "md":
            return `# New File\n\nStart writing here.`;
        default:
            return "";
    }
};

const escapeScript = (code) => code.replace(/<\/script>/gi, "<\\/script>");

const buildPreviewDocument = (codeFiles) => {
    const files = codeFiles.filter((entry) => entry.type === "file");
    const htmlFile = files.find((entry) => {
        const extension = getFileExtension(entry.path);
        return extension === "html" || extension === "htm";
    });

    if (!htmlFile) {
        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 2rem; color: #0f172a; }
      .notice { max-width: 640px; margin: 0 auto; border: 1px dashed #94a3b8; border-radius: 10px; padding: 1rem; background: #f8fafc; }
    </style>
  </head>
  <body>
    <div class="notice">
      <h3>No HTML file found</h3>
      <p>Create an <code>.html</code> file to use live preview.</p>
    </div>
  </body>
</html>`;
    }

    const cssContent = files
        .filter((entry) => getFileExtension(entry.path) === "css")
        .map((entry) => entry.content)
        .join("\n\n");
    const jsContent = files
        .filter((entry) => ["js", "mjs", "cjs"].includes(getFileExtension(entry.path)))
        .map((entry) => entry.content)
        .join("\n\n");

    const safeJs = escapeScript(jsContent);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${cssContent}</style>
  </head>
  <body>
    ${htmlFile.content}
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
    const [activeFileId, setActiveFileId] = useState(
        () => initialNormalizedCodeFiles.find((entry) => entry.type === "file")?.id || null
    );
    const [saving, setSaving] = useState(false);
    const [previewSrcDoc, setPreviewSrcDoc] = useState(() => buildPreviewDocument(initialNormalizedCodeFiles));
    const [consoleLines, setConsoleLines] = useState([]);
    const [runtimeError, setRuntimeError] = useState("");
    const socketRef = useRef(null);
    const iframeRef = useRef(null);

    // Track if a change is remote so we don't broadcast it back
    const isRemoteChange = useRef(false);
    const remoteResetTimerRef = useRef(null);

    const activeFile = useMemo(
        () => codeFiles.find((entry) => entry.id === activeFileId && entry.type === "file") || null,
        [codeFiles, activeFileId]
    );

    useEffect(() => {
        setCodeFiles(initialNormalizedCodeFiles);
        setActiveFileId(initialNormalizedCodeFiles.find((entry) => entry.type === "file")?.id || null);
        setPreviewSrcDoc(buildPreviewDocument(initialNormalizedCodeFiles));
        setConsoleLines([]);
        setRuntimeError("");
    }, [workspaceId, initialNormalizedCodeFiles]);

    useEffect(() => {
        if (!activeFile) {
            const firstFile = codeFiles.find((entry) => entry.type === "file");
            if (firstFile) {
                setActiveFileId(firstFile.id);
            }
        }
    }, [codeFiles, activeFile]);

    useEffect(() => {
        socketRef.current = io(SOCKET_URL, {
            withCredentials: true,
        });

        socketRef.current.emit("join_workspace", workspaceId);

        socketRef.current.on("receive_code_change", (data) => {
            if (data.workspaceId !== workspaceId) {
                return;
            }

            isRemoteChange.current = true;
            const incomingCodeFiles =
                data.codeFiles ||
                (data.code && typeof data.code === "object" ? data.code : null);

            if (incomingCodeFiles) {
                setCodeFiles((prev) => normalizeCodeFiles(incomingCodeFiles, getPrimaryCode(prev)));
            } else if (typeof data.code === "string") {
                setCodeFiles((prev) => {
                    const jsFileIndex = prev.findIndex(
                        (entry) => entry.type === "file" && entry.path.toLowerCase().endsWith(".js")
                    );

                    if (jsFileIndex >= 0) {
                        return prev.map((entry, index) =>
                            index === jsFileIndex ? { ...entry, content: data.code } : entry
                        );
                    }

                    return sortCodeFiles([
                        ...prev,
                        {
                            id: createNodeId(),
                            type: "file",
                            path: "script.js",
                            name: "script.js",
                            content: data.code,
                        },
                    ]);
                });
            }

            if (remoteResetTimerRef.current) {
                clearTimeout(remoteResetTimerRef.current);
            }

            remoteResetTimerRef.current = setTimeout(() => {
                isRemoteChange.current = false;
            }, 0);
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

    const syncCodeFiles = (nextCodeFiles) => {
        socketRef.current?.emit("code_change", {
            workspaceId,
            code: getPrimaryCode(nextCodeFiles),
            codeFiles: nextCodeFiles,
        });
    };

    const handleEditorChange = (value) => {
        if (!activeFileId) {
            return;
        }

        const nextValue = value || "";

        if (isRemoteChange.current) {
            setCodeFiles((prev) =>
                prev.map((entry) => (entry.id === activeFileId ? { ...entry, content: nextValue } : entry))
            );
            return;
        }

        setCodeFiles((prev) => {
            const next = prev.map((entry) =>
                entry.id === activeFileId ? { ...entry, content: nextValue } : entry
            );
            syncCodeFiles(next);
            return next;
        });
    };

    const handleCreateFolder = () => {
        const input = window.prompt("Enter folder path (e.g. src/components)");
        if (input === null) {
            return;
        }

        const path = normalizePath(input);
        if (!path) {
            toast.error("Folder path cannot be empty");
            return;
        }

        const exists = codeFiles.some((entry) => entry.path.toLowerCase() === path.toLowerCase());
        if (exists) {
            toast.error("File or folder with this path already exists");
            return;
        }

        const next = sortCodeFiles([
            ...codeFiles,
            {
                id: createNodeId(),
                type: "folder",
                path,
                name: getNodeName(path),
                content: "",
            },
        ]);

        setCodeFiles(next);
        syncCodeFiles(next);
        toast.success("Folder created");
    };

    const handleCreateFile = () => {
        const input = window.prompt("Enter file path (e.g. src/main.py)");
        if (input === null) {
            return;
        }

        const path = normalizePath(input);
        if (!path) {
            toast.error("File path cannot be empty");
            return;
        }

        const exists = codeFiles.some((entry) => entry.path.toLowerCase() === path.toLowerCase());
        if (exists) {
            toast.error("File or folder with this path already exists");
            return;
        }

        const next = [...codeFiles];
        const segments = path.split("/");
        const parentSegments = segments.slice(0, -1);
        let parentPath = "";

        parentSegments.forEach((segment) => {
            parentPath = parentPath ? `${parentPath}/${segment}` : segment;
            const folderExists = next.some(
                (entry) => entry.type === "folder" && entry.path.toLowerCase() === parentPath.toLowerCase()
            );
            if (!folderExists) {
                next.push({
                    id: createNodeId(),
                    type: "folder",
                    path: parentPath,
                    name: getNodeName(parentPath),
                    content: "",
                });
            }
        });

        const newFile = {
            id: createNodeId(),
            type: "file",
            path,
            name: getNodeName(path),
            content: getTemplateForFile(path),
        };

        const sorted = sortCodeFiles([...next, newFile]);
        setCodeFiles(sorted);
        setActiveFileId(newFile.id);
        syncCodeFiles(sorted);
        toast.success("File created");
    };

    const handleDeleteEntry = (entry) => {
        const confirmed = window.confirm(
            entry.type === "folder"
                ? `Delete folder "${entry.path}" and all nested files?`
                : `Delete file "${entry.path}"?`
        );

        if (!confirmed) {
            return;
        }

        const prefix = `${entry.path}/`;
        let next = codeFiles.filter((node) => {
            if (node.path === entry.path) {
                return false;
            }
            if (entry.type === "folder" && node.path.startsWith(prefix)) {
                return false;
            }
            return true;
        });

        if (!next.some((node) => node.type === "file")) {
            next = buildDefaultCodeFiles(getPrimaryCode(codeFiles));
        }

        next = sortCodeFiles(next);
        const nextActiveFileId =
            next.some((node) => node.id === activeFileId && node.type === "file")
                ? activeFileId
                : next.find((node) => node.type === "file")?.id || null;

        setCodeFiles(next);
        setActiveFileId(nextActiveFileId);
        syncCodeFiles(next);
        toast.success("Entry deleted");
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
            <div className="flex justify-between items-center p-3 bg-[#111827] border-b border-slate-700 gap-2 shrink-0 flex-wrap">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCreateFolder}
                        className="flex items-center text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-1.5 rounded transition-colors"
                    >
                        <FolderPlus size={15} className="mr-2" />
                        New Folder
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateFile}
                        className="flex items-center text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-1.5 rounded transition-colors"
                    >
                        <FilePlus2 size={15} className="mr-2" />
                        New File
                    </button>
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

            <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
                <aside className="w-full xl:w-64 border-b xl:border-b-0 xl:border-r border-slate-700 bg-[#0b1220] min-h-0">
                    <div className="px-3 py-2 border-b border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        Explorer
                    </div>
                    <div className="h-full overflow-y-auto py-2">
                        {codeFiles.map((entry) => {
                            const isActive = entry.type === "file" && entry.id === activeFileId;
                            const depth = getPathDepth(entry.path);

                            return (
                                <div
                                    key={entry.id}
                                    className={`group flex items-center pr-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900/70"}`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (entry.type === "file") {
                                                setActiveFileId(entry.id);
                                            }
                                        }}
                                        title={entry.path}
                                        className={`flex-1 text-left py-1.5 text-sm flex items-center gap-2 ${entry.type === "file" ? "cursor-pointer" : "cursor-default"} ${isActive ? "text-white" : "text-slate-300"}`}
                                        style={{ paddingLeft: `${12 + depth * 14}px` }}
                                    >
                                        {entry.type === "folder" ? <Folder size={14} /> : <FileCode2 size={14} />}
                                        <span className="truncate">{entry.name}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteEntry(entry)}
                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-300 p-1 rounded transition-opacity"
                                        title="Delete"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </aside>

                <div className="flex-1 min-h-0 grid grid-cols-1 2xl:grid-cols-2">
                    <div className="min-h-0 border-b 2xl:border-b-0 2xl:border-r border-slate-700">
                        {activeFile ? (
                            <div className="h-full flex flex-col">
                                <div className="px-3 py-2 border-b border-slate-700 bg-[#0b1220] flex items-center justify-between text-xs">
                                    <p className="text-slate-300 truncate mr-2">{activeFile.path}</p>
                                    <p className="text-slate-500 uppercase tracking-wide">{getLanguageFromPath(activeFile.path)}</p>
                                </div>
                                <div className="flex-1 min-h-0">
                                    <Editor
                                        height="100%"
                                        language={getLanguageFromPath(activeFile.path)}
                                        theme="vs-dark"
                                        value={activeFile.content}
                                        onChange={handleEditorChange}
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
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm p-4">
                                Create a file to start editing.
                            </div>
                        )}
                    </div>

                    <div className="min-h-0 flex flex-col bg-white">
                        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between shrink-0">
                            <p className="text-sm font-semibold text-slate-700">Output Preview</p>
                            <p className="text-xs text-slate-500">Works with HTML/CSS/JS files</p>
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
                                    <p className="text-slate-500">No logs yet. Add console output and click Run.</p>
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
        </div>
    );
};

export default WorkspaceCodeEditor;
