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
import { SOCKET_BASE_URL } from "@/lib/runtimeConfig";
import { workspaceService } from "../services/workspaceService";
import toast from "react-hot-toast";

const DEFAULT_JS_CODE = ``;
const WEB_PREVIEW_EXTENSIONS = new Set(["html", "htm", "css", "js", "mjs", "cjs"]);
const REACT_PREVIEW_EXTENSIONS = new Set(["jsx", "tsx"]);
const REACT_PROJECT_EXTENSIONS = new Set(["js", "mjs", "cjs", "ts", "jsx", "tsx", "css", "html", "htm", "json"]);

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

const buildLegacyCodeFiles = (fallbackJs = DEFAULT_JS_CODE) => {
    if (typeof fallbackJs !== "string" || fallbackJs.length === 0) {
        return [];
    }

    return [
        {
            id: "file_script_js",
            type: "file",
            path: "script.js",
            name: "script.js",
            content: fallbackJs,
        },
    ];
};

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
        return normalizeArrayCodeFiles(codeFiles);
    }

    if (codeFiles && typeof codeFiles === "object") {
        const hasLegacyHtmlCssJs =
            typeof codeFiles?.html === "string" ||
            typeof codeFiles?.css === "string" ||
            typeof codeFiles?.js === "string";

        if (hasLegacyHtmlCssJs) {
            return sortCodeFiles(
                dedupeByPathAndType([
                    typeof codeFiles?.html === "string"
                        ? {
                            id: "file_index_html",
                            type: "file",
                            path: "index.html",
                            name: "index.html",
                            content: codeFiles.html,
                        }
                        : null,
                    typeof codeFiles?.css === "string"
                        ? {
                            id: "file_styles_css",
                            type: "file",
                            path: "styles.css",
                            name: "styles.css",
                            content: codeFiles.css,
                        }
                        : null,
                    typeof codeFiles?.js === "string"
                        ? {
                            id: "file_script_js",
                            type: "file",
                            path: "script.js",
                            name: "script.js",
                            content: codeFiles.js,
                        }
                        : null,
                ].filter(Boolean))
            );
        }

        const objectValues = Object.values(codeFiles).filter(
            (value) => value && typeof value === "object" && typeof value.path === "string"
        );
        if (objectValues.length > 0) {
            return normalizeArrayCodeFiles(objectValues);
        }
    }

    return sortCodeFiles(buildLegacyCodeFiles(fallbackCode));
};

const getPrimaryCode = (codeFiles = []) => {
    const jsFile = codeFiles.find(
        (entry) => entry.type === "file" && typeof entry.path === "string" && entry.path.toLowerCase().endsWith(".js")
    );

    if (jsFile) {
        return jsFile.content || "";
    }

    const firstFile = codeFiles.find((entry) => entry.type === "file");
    return firstFile?.content || "";
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

const getTemplateForFile = () => "";

const escapeScript = (code) => code.replace(/<\/script>/gi, "<\\/script>");

const buildEmptyPreviewDocument = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body { margin: 0; min-height: 100%; background: #ffffff; }
    </style>
  </head>
  <body></body>
</html>`;

const extractPreviewBodyContent = (htmlContent = "") => {
    if (typeof htmlContent !== "string" || !htmlContent.trim()) {
        return "<div id=\"root\"></div>";
    }

    const withoutScripts = htmlContent.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        ""
    );
    const bodyMatch = withoutScripts.match(/<body[^>]*>([\s\S]*)<\/body>/i);

    if (bodyMatch?.[1]?.trim()) {
        return bodyMatch[1];
    }

    const flattenedMarkup = withoutScripts
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<html[^>]*>/gi, "")
        .replace(/<\/html>/gi, "")
        .replace(/<head[\s\S]*?<\/head>/gi, "")
        .replace(/<body[^>]*>/gi, "")
        .replace(/<\/body>/gi, "")
        .trim();

    return flattenedMarkup || "<div id=\"root\"></div>";
};

const hasReactPreviewProject = (files = []) =>
    files.some((entry) => entry.type === "file" && REACT_PREVIEW_EXTENSIONS.has(getFileExtension(entry.path)));

const buildPreviewDocument = (codeFiles) => {
    const files = codeFiles.filter((entry) => entry.type === "file");
    const hasReactFiles = files.some((entry) => REACT_PREVIEW_EXTENSIONS.has(getFileExtension(entry.path)));
    const htmlFile = files.find((entry) => {
        const extension = getFileExtension(entry.path);
        return extension === "html" || extension === "htm";
    });

    if (hasReactFiles) {
        const cssContent = files
            .filter((entry) => getFileExtension(entry.path) === "css")
            .map((entry) => entry.content)
            .join("\n\n");
        const bodyContent = extractPreviewBodyContent(htmlFile?.content);
        const reactPreviewFiles = files
            .filter((entry) => REACT_PROJECT_EXTENSIONS.has(getFileExtension(entry.path)));
        const reactModuleFiles = reactPreviewFiles
            .filter((entry) => ["js", "mjs", "cjs", "ts", "jsx", "tsx", "json"].includes(getFileExtension(entry.path)));
        const reactEntryFile =
            reactModuleFiles.find((entry) => /(^|\/)(main|index)\.(jsx|tsx|js|ts|mjs|cjs)$/i.test(entry.path)) ||
            reactModuleFiles[0];
        const serializedFiles = escapeScript(JSON.stringify(
            Object.fromEntries(
                reactPreviewFiles.map((entry) => [normalizePath(entry.path), entry.content || ""])
            )
        ));
        const reactEntryPath = reactEntryFile ? normalizePath(reactEntryFile.path) : "";

        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${cssContent}</style>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    ${bodyContent}
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

        const normalizeModulePath = (value = "") =>
          String(value)
            .trim()
            .split("\\\\")
            .join("/")
            .split("/")
            .filter(Boolean)
            .join("/");

        const collapseModulePath = (filePath = "") => {
          const segments = normalizeModulePath(filePath).split("/");
          const collapsed = [];

          segments.forEach((segment) => {
            if (!segment || segment === ".") {
              return;
            }

            if (segment === "..") {
              collapsed.pop();
              return;
            }

            collapsed.push(segment);
          });

          return collapsed.join("/");
        };

        const getDirname = (filePath = "") => {
          const segments = collapseModulePath(filePath).split("/").filter(Boolean);
          segments.pop();
          return segments.join("/");
        };

        const joinModulePath = (...parts) =>
          collapseModulePath(parts.filter(Boolean).join("/"));

        const rawWorkspaceFiles = ${serializedFiles};
        const workspaceFiles = {};
        const workspacePathLookup = {};
        const moduleCache = new Map();
        const supportedExtensions = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"];

        Object.entries(rawWorkspaceFiles).forEach(([rawPath, content]) => {
          const normalizedPath = collapseModulePath(rawPath);
          if (!normalizedPath) {
            return;
          }

          workspaceFiles[normalizedPath] = content;
          workspacePathLookup[normalizedPath.toLowerCase()] = normalizedPath;
        });

        const resolveStoredPath = (filePath = "") =>
          workspacePathLookup[collapseModulePath(filePath).toLowerCase()] || "";

        const fileExists = (filePath = "") =>
          Boolean(resolveStoredPath(filePath));

        const resolveRelativeModule = (specifier = "", fromPath = "") => {
          const basePath = specifier.startsWith("/")
            ? collapseModulePath(specifier)
            : joinModulePath(getDirname(fromPath), specifier);
          const candidatePaths = [];

          supportedExtensions.forEach((extension) => {
            if (extension === "") {
              candidatePaths.push(basePath);
              return;
            }

            candidatePaths.push(basePath + extension);
          });

          [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"].forEach((extension) => {
            candidatePaths.push(basePath + "/index" + extension);
          });

          const resolvedPath = candidatePaths
            .map((candidatePath) => resolveStoredPath(candidatePath))
            .find(Boolean);
          if (resolvedPath) {
            return resolvedPath;
          }

          throw new Error("Cannot resolve import '" + specifier + "' from '" + fromPath + "'.");
        };

        const requireModule = (specifier = "", fromPath = "") => {
          if (specifier === "react") {
            return window.React;
          }

          if (specifier === "react-dom" || specifier === "react-dom/client") {
            return window.ReactDOM;
          }

          if (specifier.endsWith(".css")) {
            resolveRelativeModule(specifier, fromPath);
            return {};
          }

          if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
            throw new Error("Only local workspace imports plus react/react-dom are supported in preview.");
          }

          return loadModule(resolveRelativeModule(specifier, fromPath));
        };

        const transpileModule = (filePath = "") => {
          const sourceCode = workspaceFiles[filePath];
          return window.Babel.transform(sourceCode, {
            filename: filePath,
            presets: [
              ["react", { runtime: "classic" }],
              "typescript"
            ],
            plugins: ["transform-modules-commonjs"],
            sourceType: "module"
          }).code;
        };

        const loadModule = (filePath = "") => {
          if (moduleCache.has(filePath)) {
            return moduleCache.get(filePath).exports;
          }

          if (!fileExists(filePath)) {
            throw new Error("Module not found: " + filePath);
          }

          if (filePath.endsWith(".json")) {
            const jsonModule = { exports: JSON.parse(workspaceFiles[filePath] || "null") };
            moduleCache.set(filePath, jsonModule);
            return jsonModule.exports;
          }

          const module = { exports: {} };
          moduleCache.set(filePath, module);

          const compiledCode = transpileModule(filePath);
          const executeModule = new Function("require", "module", "exports", compiledCode);
          executeModule(
            (nextSpecifier) => requireModule(nextSpecifier, filePath),
            module,
            module.exports
          );

          return module.exports;
        };

        const ensureRootElement = () => {
          let rootElement = document.getElementById("root");

          if (!rootElement) {
            rootElement = document.createElement("div");
            rootElement.id = "root";
            document.body.appendChild(rootElement);
          }

          return rootElement;
        };

        if (${JSON.stringify(reactEntryPath)}) {
          const entryExports = loadModule(${JSON.stringify(reactEntryPath)});

          if (entryExports && entryExports.default && typeof entryExports.default === "function") {
            const rootElement = ensureRootElement();
            window.ReactDOM.createRoot(rootElement).render(
              window.React.createElement(entryExports.default)
            );
          }
        }
      })();
    </script>
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
    ${htmlFile?.content || ""}
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

const canUseBrowserPreview = (codeFiles = [], activeFile = null) => {
    if (!activeFile) {
        return false;
    }

    const extension = getFileExtension(activeFile.path);
    if (hasReactPreviewProject(codeFiles) && REACT_PROJECT_EXTENSIONS.has(extension)) {
        return true;
    }

    if (!WEB_PREVIEW_EXTENSIONS.has(extension)) {
        return false;
    }

    return codeFiles.some(
        (entry) => entry.type === "file" && ["html", "htm"].includes(getFileExtension(entry.path))
    );
};

const splitExecutionOutput = (content = "", prefix = "") =>
    String(content)
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .map((line) => `${prefix}${line}`);

const buildExecutionConsoleLines = (executionResult = {}) => {
    const nextLines = [];

    if (executionResult.command) {
        nextLines.push(`$ ${executionResult.command}`);
    }

    nextLines.push(...splitExecutionOutput(executionResult.stdout));
    nextLines.push(...splitExecutionOutput(executionResult.stderr, "[stderr] "));

    if (nextLines.length === 0 && executionResult.success) {
        nextLines.push("Execution finished with no output.");
    }

    if (nextLines.length === 0 && executionResult.message) {
        nextLines.push(executionResult.message);
    }

    return nextLines.slice(-200);
};

const getParentPath = (path = "") => {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath.includes("/")) {
        return "";
    }

    return normalizedPath.slice(0, normalizedPath.lastIndexOf("/"));
};

const buildChildPath = (parentPath = "", childInput = "") =>
    normalizePath(parentPath ? `${parentPath}/${childInput}` : childInput);

const getPathAncestors = (path = "") => {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath) {
        return [];
    }

    const segments = normalizedPath.split("/");
    const ancestors = [];
    let currentPath = "";

    segments.forEach((segment) => {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        ancestors.push(currentPath);
    });

    return ancestors;
};

const sortExplorerTree = (nodes = []) =>
    [...nodes]
        .sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "folder" ? -1 : 1;
            }

            return a.name.localeCompare(b.name);
        })
        .map((node) =>
            node.type === "folder"
                ? {
                    ...node,
                    children: sortExplorerTree(node.children),
                }
                : node
        );

const buildExplorerTree = (codeFiles = []) => {
    const root = {
        id: "__root__",
        type: "folder",
        path: "",
        name: "",
        entry: null,
        children: [],
    };

    const folderNodes = new Map([[root.path, root]]);

    const ensureFolderNode = (folderPath) => {
        const normalizedFolderPath = normalizePath(folderPath);
        if (folderNodes.has(normalizedFolderPath)) {
            return folderNodes.get(normalizedFolderPath);
        }

        const parentPath = getParentPath(normalizedFolderPath);
        const parentNode = ensureFolderNode(parentPath);
        const node = {
            id: `folder_${normalizedFolderPath}`,
            type: "folder",
            path: normalizedFolderPath,
            name: getNodeName(normalizedFolderPath),
            entry: null,
            children: [],
        };

        parentNode.children.push(node);
        folderNodes.set(normalizedFolderPath, node);
        return node;
    };

    codeFiles.forEach((entry) => {
        if (entry.type === "folder") {
            const folderNode = ensureFolderNode(entry.path);
            folderNode.id = entry.id;
            folderNode.entry = entry;
            folderNode.name = entry.name;
            return;
        }

        const parentNode = ensureFolderNode(getParentPath(entry.path));
        parentNode.children.push({
            id: entry.id,
            type: "file",
            path: entry.path,
            name: entry.name,
            entry,
        });
    });

    return sortExplorerTree(root.children);
};

const mergeSharedStructureIntoDraft = (sharedCodeFiles = [], draftCodeFiles = []) => {
    const normalizedSharedCodeFiles = normalizeCodeFiles(sharedCodeFiles, getPrimaryCode(sharedCodeFiles));
    const normalizedDraftCodeFiles = normalizeCodeFiles(draftCodeFiles, getPrimaryCode(sharedCodeFiles));
    const remainingDraftEntries = new Map(
        normalizedDraftCodeFiles.map((entry) => [`${entry.type}:${entry.path.toLowerCase()}`, entry])
    );

    const mergedEntries = normalizedSharedCodeFiles.map((entry) => {
        const key = `${entry.type}:${entry.path.toLowerCase()}`;
        const draftEntry = remainingDraftEntries.get(key);

        if (draftEntry) {
            remainingDraftEntries.delete(key);
            return draftEntry;
        }

        return entry;
    });

    remainingDraftEntries.forEach((entry) => {
        mergedEntries.push(entry);
    });

    return sortCodeFiles(dedupeByPathAndType(mergedEntries));
};

const WorkspaceCodeEditor = ({
    workspaceId,
    initialCode,
    initialCodeFiles,
    currentUserId,
    currentUserDraft,
    draftSummary = [],
    onWorkspaceRefresh,
}) => {
    const initialNormalizedCodeFiles = useMemo(
        () => normalizeCodeFiles(initialCodeFiles, initialCode),
        [initialCodeFiles, initialCode]
    );

    const initialNormalizedDraftCodeFiles = useMemo(() => {
        if (currentUserDraft?.codeFiles) {
            return normalizeCodeFiles(currentUserDraft.codeFiles, initialCode);
        }

        return initialNormalizedCodeFiles;
    }, [currentUserDraft, initialCode, initialNormalizedCodeFiles]);

    const [editorMode, setEditorMode] = useState("shared");
    const [sharedCodeFiles, setSharedCodeFiles] = useState(initialNormalizedCodeFiles);
    const [draftCodeFiles, setDraftCodeFiles] = useState(initialNormalizedDraftCodeFiles);
    const [sharedActiveFileId, setSharedActiveFileId] = useState(
        () => initialNormalizedCodeFiles.find((entry) => entry.type === "file")?.id || null
    );
    const [draftActiveFileId, setDraftActiveFileId] = useState(
        () => initialNormalizedDraftCodeFiles.find((entry) => entry.type === "file")?.id || null
    );
    const [savingShared, setSavingShared] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [combiningDrafts, setCombiningDrafts] = useState(false);
    const [resettingDraft, setResettingDraft] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [previewSrcDoc, setPreviewSrcDoc] = useState(() => buildPreviewDocument(initialNormalizedCodeFiles));
    const [consoleLines, setConsoleLines] = useState([]);
    const [runtimeError, setRuntimeError] = useState("");
    const [expandedFolders, setExpandedFolders] = useState({});
    const socketRef = useRef(null);
    const iframeRef = useRef(null);
    const isRemoteChange = useRef(false);
    const remoteResetTimerRef = useRef(null);

    const currentCodeFiles = editorMode === "draft" ? draftCodeFiles : sharedCodeFiles;
    const activeFileId = editorMode === "draft" ? draftActiveFileId : sharedActiveFileId;
    const currentModeLabel = editorMode === "draft" ? "My Draft" : "Shared Output";
    const explorerTree = useMemo(() => buildExplorerTree(currentCodeFiles), [currentCodeFiles]);
    const activeFile = useMemo(
        () => currentCodeFiles.find((entry) => entry.id === activeFileId && entry.type === "file") || null,
        [currentCodeFiles, activeFileId]
    );

    useEffect(() => {
        setSharedCodeFiles(initialNormalizedCodeFiles);
        setSharedActiveFileId(initialNormalizedCodeFiles.find((entry) => entry.type === "file")?.id || null);
    }, [workspaceId, initialNormalizedCodeFiles]);

    useEffect(() => {
        setDraftCodeFiles(initialNormalizedDraftCodeFiles);
        setDraftActiveFileId(initialNormalizedDraftCodeFiles.find((entry) => entry.type === "file")?.id || null);
    }, [workspaceId, initialNormalizedDraftCodeFiles]);

    useEffect(() => {
        setDraftCodeFiles((prev) => mergeSharedStructureIntoDraft(sharedCodeFiles, prev));
    }, [sharedCodeFiles]);

    useEffect(() => {
        if (!sharedCodeFiles.some((entry) => entry.type === "file" && entry.id === sharedActiveFileId)) {
            setSharedActiveFileId(sharedCodeFiles.find((entry) => entry.type === "file")?.id || null);
        }
    }, [sharedCodeFiles, sharedActiveFileId]);

    useEffect(() => {
        if (!draftCodeFiles.some((entry) => entry.type === "file" && entry.id === draftActiveFileId)) {
            setDraftActiveFileId(draftCodeFiles.find((entry) => entry.type === "file")?.id || null);
        }
    }, [draftCodeFiles, draftActiveFileId]);

    useEffect(() => {
        setExpandedFolders((prev) => {
            const next = {};

            currentCodeFiles
                .filter((entry) => entry.type === "folder")
                .forEach((entry) => {
                    next[entry.path] = prev[entry.path] ?? true;
                });

            return next;
        });
    }, [currentCodeFiles]);

    useEffect(() => {
        setPreviewSrcDoc(buildPreviewDocument(editorMode === "draft" ? draftCodeFiles : sharedCodeFiles));
        setConsoleLines([]);
        setRuntimeError("");
    }, [workspaceId, editorMode, draftCodeFiles, sharedCodeFiles]);

    useEffect(() => {
        socketRef.current = io(SOCKET_BASE_URL, {
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
                setSharedCodeFiles((prev) => normalizeCodeFiles(incomingCodeFiles, getPrimaryCode(prev)));
            } else if (typeof data.code === "string") {
                setSharedCodeFiles((prev) => {
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

            socketRef.current?.disconnect();
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

    const updateCurrentFileSelection = (nextFileId) => {
        if (editorMode === "draft") {
            setDraftActiveFileId(nextFileId);
            return;
        }

        setSharedActiveFileId(nextFileId);
    };

    const applyCodeFilesUpdate = (nextCodeFiles, nextFileId = null) => {
        if (editorMode === "draft") {
            setDraftCodeFiles(nextCodeFiles);
            if (nextFileId !== null) {
                setDraftActiveFileId(nextFileId);
            }
            return;
        }

        setSharedCodeFiles(nextCodeFiles);
        if (nextFileId !== null) {
            setSharedActiveFileId(nextFileId);
        }
        syncCodeFiles(nextCodeFiles);
    };

    const expandFolderPath = (folderPath = "") => {
        const ancestors = getPathAncestors(folderPath);
        if (ancestors.length === 0) {
            return;
        }

        setExpandedFolders((prev) => {
            const next = { ...prev };
            ancestors.forEach((path) => {
                next[path] = true;
            });
            return next;
        });
    };

    const handleEditorChange = (value) => {
        if (!activeFileId) {
            return;
        }

        const nextValue = value || "";

        if (editorMode === "draft") {
            setDraftCodeFiles((prev) =>
                prev.map((entry) => (entry.id === activeFileId ? { ...entry, content: nextValue } : entry))
            );
            return;
        }

        if (isRemoteChange.current) {
            setSharedCodeFiles((prev) =>
                prev.map((entry) => (entry.id === activeFileId ? { ...entry, content: nextValue } : entry))
            );
            return;
        }

        setSharedCodeFiles((prev) => {
            const next = prev.map((entry) =>
                entry.id === activeFileId ? { ...entry, content: nextValue } : entry
            );
            syncCodeFiles(next);
            return next;
        });
    };

    const handleCreateFolder = (parentPath = "") => {
        const input = window.prompt(
            parentPath
                ? `Enter folder name inside "${parentPath}"`
                : "Enter folder path (e.g. src/components)"
        );
        if (input === null) {
            return;
        }

        const path = buildChildPath(parentPath, input);
        if (!path) {
            toast.error("Folder path cannot be empty");
            return;
        }

        const exists = currentCodeFiles.some((entry) => entry.path.toLowerCase() === path.toLowerCase());
        if (exists) {
            toast.error("File or folder with this path already exists");
            return;
        }

        const next = sortCodeFiles([
            ...currentCodeFiles,
            {
                id: createNodeId(),
                type: "folder",
                path,
                name: getNodeName(path),
                content: "",
            },
        ]);

        expandFolderPath(path);
        applyCodeFilesUpdate(next);
        toast.success(`${currentModeLabel} folder created`);
    };

    const handleCreateFile = (parentPath = "") => {
        const input = window.prompt(
            parentPath
                ? `Enter file name inside "${parentPath}" (e.g. index.js)`
                : "Enter file path (e.g. src/main.py)"
        );
        if (input === null) {
            return;
        }

        const path = buildChildPath(parentPath, input);
        if (!path) {
            toast.error("File path cannot be empty");
            return;
        }

        const exists = currentCodeFiles.some((entry) => entry.path.toLowerCase() === path.toLowerCase());
        if (exists) {
            toast.error("File or folder with this path already exists");
            return;
        }

        const next = [...currentCodeFiles];
        const segments = path.split("/");
        const parentSegments = segments.slice(0, -1);
        let nextParentPath = "";

        parentSegments.forEach((segment) => {
            nextParentPath = nextParentPath ? `${nextParentPath}/${segment}` : segment;
            const folderExists = next.some(
                (entry) => entry.type === "folder" && entry.path.toLowerCase() === nextParentPath.toLowerCase()
            );

            if (!folderExists) {
                next.push({
                    id: createNodeId(),
                    type: "folder",
                    path: nextParentPath,
                    name: getNodeName(nextParentPath),
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
        expandFolderPath(getParentPath(path));
        applyCodeFilesUpdate(sorted, newFile.id);
        toast.success(`${currentModeLabel} file created`);
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
        let next = currentCodeFiles.filter((node) => {
            if (node.path === entry.path) {
                return false;
            }

            if (entry.type === "folder" && node.path.startsWith(prefix)) {
                return false;
            }

            return true;
        });

        next = sortCodeFiles(next);
        const nextActiveFileId =
            next.some((node) => node.id === activeFileId && node.type === "file")
                ? activeFileId
                : next.find((node) => node.type === "file")?.id || null;

        applyCodeFilesUpdate(next, nextActiveFileId);
        toast.success(`${currentModeLabel} entry deleted`);
    };

    const handleRunCode = async () => {
        if (!activeFile) {
            toast.error("Open a file to run");
            return;
        }

        setConsoleLines([]);
        setRuntimeError("");

        if (canUseBrowserPreview(currentCodeFiles, activeFile)) {
            setPreviewSrcDoc(buildPreviewDocument(currentCodeFiles));
            return;
        }

        try {
            setIsRunning(true);
            setPreviewSrcDoc(buildEmptyPreviewDocument());

            const response = await workspaceService.runWorkspaceCode(workspaceId, {
                codeFiles: currentCodeFiles,
                entryPath: activeFile.path,
            });
            const executionResult = response?.data || {};

            setConsoleLines(buildExecutionConsoleLines(executionResult));

            if (!executionResult.success) {
                setRuntimeError(executionResult.message || "Execution failed");
            }
        } catch (error) {
            const message = error.response?.data?.message || "Failed to run code";
            setRuntimeError(message);
            toast.error(message);
        } finally {
            setIsRunning(false);
        }
    };

    const handleSaveSharedCode = async () => {
        try {
            setSavingShared(true);
            await workspaceService.saveWorkspaceCode(workspaceId, { codeFiles: sharedCodeFiles });
            await onWorkspaceRefresh?.();
            toast.success("Shared output saved");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save shared output");
        } finally {
            setSavingShared(false);
        }
    };

    const handleSaveDraft = async () => {
        try {
            setSavingDraft(true);
            await workspaceService.saveWorkspaceCodeDraft(workspaceId, { codeFiles: draftCodeFiles });
            await onWorkspaceRefresh?.();
            toast.success("Your draft was saved");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save your draft");
        } finally {
            setSavingDraft(false);
        }
    };

    const handleResetDraft = async () => {
        const confirmed = window.confirm("Reset your draft back to the latest shared output?");
        if (!confirmed) {
            return;
        }

        const resetCodeFiles = normalizeCodeFiles(sharedCodeFiles, getPrimaryCode(sharedCodeFiles));
        setDraftCodeFiles(resetCodeFiles);
        setDraftActiveFileId(resetCodeFiles.find((entry) => entry.type === "file")?.id || null);

        if (!currentUserDraft?.codeFiles) {
            toast.success("Draft reset to shared output");
            return;
        }

        try {
            setResettingDraft(true);
            await workspaceService.discardWorkspaceCodeDraft(workspaceId);
            await onWorkspaceRefresh?.();
            toast.success("Saved draft cleared and reset");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to reset your draft");
        } finally {
            setResettingDraft(false);
        }
    };

    const handleCombineDrafts = async () => {
        try {
            setCombiningDrafts(true);
            const response = await workspaceService.combineWorkspaceDrafts(workspaceId);
            const conflicts = response?.data?.conflicts || [];

            await onWorkspaceRefresh?.();

            if (conflicts.length > 0) {
                const previewPaths = conflicts.slice(0, 3).map((conflict) => conflict.path).join(", ");
                toast(`Combined drafts with ${conflicts.length} conflict(s): ${previewPaths}`);
            } else {
                toast.success("Team drafts combined into shared output");
            }

            setEditorMode("shared");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to combine drafts");
        } finally {
            setCombiningDrafts(false);
        }
    };

    const toggleFolder = (folderPath) => {
        setExpandedFolders((prev) => ({
            ...prev,
            [folderPath]: !(prev[folderPath] ?? true),
        }));
    };

    const renderExplorerNodes = (nodes, depth = 0) =>
        nodes.map((node) => {
            if (node.type === "folder") {
                const isExpanded = expandedFolders[node.path] ?? true;
                const folderEntry = node.entry || {
                    id: node.id,
                    type: "folder",
                    path: node.path,
                    name: node.name,
                    content: "",
                };

                return (
                    <div key={`${editorMode}-${node.path || node.id}`}>
                        <div className="group flex items-center pr-2 hover:bg-slate-900/70">
                            <button
                                type="button"
                                onClick={() => toggleFolder(node.path)}
                                title={node.path || "root"}
                                className="flex-1 text-left py-1.5 text-sm flex items-center gap-2 text-slate-300"
                                style={{ paddingLeft: `${12 + depth * 14}px` }}
                            >
                                <span className="w-3 text-slate-500">{isExpanded ? "v" : ">"}</span>
                                <Folder size={14} />
                                <span className="truncate">{node.name}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateFile(node.path)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white p-1 rounded transition-opacity"
                                title="Add file"
                            >
                                <FilePlus2 size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateFolder(node.path)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white p-1 rounded transition-opacity"
                                title="Add folder"
                            >
                                <FolderPlus size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDeleteEntry(folderEntry)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-300 p-1 rounded transition-opacity"
                                title="Delete"
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>

                        {isExpanded ? renderExplorerNodes(node.children, depth + 1) : null}
                    </div>
                );
            }

            const isActive = node.entry.id === activeFileId;

            return (
                <div
                    key={`${editorMode}-${node.entry.id}`}
                    className={`group flex items-center pr-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900/70"}`}
                >
                    <button
                        type="button"
                        onClick={() => {
                            expandFolderPath(getParentPath(node.entry.path));
                            updateCurrentFileSelection(node.entry.id);
                        }}
                        title={node.entry.path}
                        className={`flex-1 text-left py-1.5 text-sm flex items-center gap-2 ${isActive ? "text-white" : "text-slate-300"}`}
                        style={{ paddingLeft: `${12 + depth * 14}px` }}
                    >
                        <span className="w-3 text-slate-500" />
                        <FileCode2 size={14} />
                        <span className="truncate">{node.entry.name}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleDeleteEntry(node.entry)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-300 p-1 rounded transition-opacity"
                        title="Delete"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            );
        });

    return (
        <div className="flex flex-col h-full bg-[#0f172a]">
            <div className="border-b border-slate-700 bg-[#111827] shrink-0">
                <div className="flex justify-between items-center p-3 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center bg-slate-900 p-1 rounded-md border border-slate-700">
                            <button
                                type="button"
                                onClick={() => setEditorMode("shared")}
                                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                                    editorMode === "shared"
                                        ? "bg-slate-100 text-slate-950"
                                        : "text-slate-300 hover:text-white"
                                }`}
                            >
                                Shared Output
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditorMode("draft")}
                                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                                    editorMode === "draft"
                                        ? "bg-amber-300 text-slate-950"
                                        : "text-slate-300 hover:text-white"
                                }`}
                            >
                                My Draft
                            </button>
                        </div>

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

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={handleRunCode}
                            disabled={isRunning}
                            className="flex items-center text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                        >
                            {isRunning ? (
                                <Loader2 size={16} className="animate-spin mr-2" />
                            ) : (
                                <Play size={16} className="mr-2" />
                            )}
                            {isRunning ? "Running..." : "Run"}
                        </button>

                        {editorMode === "shared" ? (
                            <button
                                type="button"
                                onClick={handleSaveSharedCode}
                                disabled={savingShared}
                                className="flex items-center text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                            >
                                {savingShared ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                                Save Shared
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={handleSaveDraft}
                                    disabled={savingDraft}
                                    className="flex items-center text-sm bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                                >
                                    {savingDraft ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                                    Save Draft
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetDraft}
                                    disabled={resettingDraft}
                                    className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                                >
                                    {resettingDraft ? "Resetting..." : "Reset Draft"}
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={handleCombineDrafts}
                            disabled={combiningDrafts || draftSummary.length === 0}
                            className="text-sm bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                        >
                            {combiningDrafts ? "Combining..." : "Combine Drafts"}
                        </button>
                    </div>
                </div>

                <div className="px-3 py-2 border-t border-slate-700 bg-[#0b1220] flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-300">
                        {editorMode === "shared"
                            ? "Shared Output syncs live for everyone in the workspace."
                            : "My Draft stays private until you save it and combine team drafts, but it keeps the latest shared folder structure."}
                    </span>
                    <span className="text-slate-500">Saved drafts:</span>
                    {draftSummary.length === 0 ? (
                        <span className="text-slate-400">No saved drafts yet</span>
                    ) : (
                        draftSummary.map((draft) => (
                            <span
                                key={draft.user._id}
                                className={`px-2 py-1 rounded-full border ${
                                    draft.user._id === currentUserId
                                        ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                                        : "border-slate-700 bg-slate-800 text-slate-300"
                                }`}
                            >
                                {draft.user.name}
                                {draft.user._id === currentUserId ? " (you)" : ""}
                            </span>
                        ))
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
                <aside className="w-full xl:w-64 border-b xl:border-b-0 xl:border-r border-slate-700 bg-[#0b1220] min-h-0">
                    <div className="px-3 py-2 border-b border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        Explorer - {currentModeLabel}
                    </div>
                    <div className="h-full overflow-y-auto py-2">
                        {explorerTree.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-slate-400 space-y-3">
                                <p>No files yet. Create a folder or file to start your project.</p>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleCreateFolder("")}
                                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 px-2.5 py-1.5 rounded transition-colors"
                                    >
                                        New Folder
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCreateFile("")}
                                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 px-2.5 py-1.5 rounded transition-colors"
                                    >
                                        New File
                                    </button>
                                </div>
                            </div>
                        ) : renderExplorerNodes(explorerTree)}
                    </div>
                </aside>

                <div className="flex-1 min-h-0 grid grid-cols-1 2xl:grid-cols-2">
                    <div className="min-h-0 border-b 2xl:border-b-0 2xl:border-r border-slate-700">
                        {activeFile ? (
                            <div className="h-full flex flex-col">
                                <div className="px-3 py-2 border-b border-slate-700 bg-[#0b1220] flex items-center justify-between text-xs">
                                    <p className="text-slate-300 truncate mr-2">{activeFile.path}</p>
                                    <p className="text-slate-500 uppercase tracking-wide">
                                        {currentModeLabel} - {getLanguageFromPath(activeFile.path)}
                                    </p>
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
                            <div className="h-full bg-[#0f172a]" />
                        )}
                    </div>

                    <div className="min-h-0 flex flex-col bg-white">
                        <div className="px-3 py-2 border-b border-slate-200 shrink-0">
                            <p className="text-sm font-semibold text-slate-700">Workspace Output</p>
                        </div>
                        <iframe
                            ref={iframeRef}
                            title="workspace-preview"
                            sandbox="allow-scripts allow-modals"
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

                                {consoleLines.length > 0 ? (
                                    consoleLines.map((line, index) => (
                                        <p key={`${line}-${index}`}>{line}</p>
                                    ))
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkspaceCodeEditor;
