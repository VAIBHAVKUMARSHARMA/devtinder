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
    Pencil,
    MoreVertical,
    FileCode,
    Users,
    ChevronLeft,
    ChevronRight,
    RotateCw
} from "lucide-react";
import { io } from "socket.io-client";
import { SOCKET_BASE_URL } from "@/lib/runtimeConfig";
import { workspaceService } from "../services/workspaceService";
import toast from "react-hot-toast";
import DraftDiffViewer from "../components/DraftDiffViewer";

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

const isValidWorkspacePath = (rawPath) => {
    if (typeof rawPath !== "string") {
        return false;
    }

    const normalized = normalizePath(rawPath);
    if (!normalized) {
        return false;
    }

    return !normalized.toLowerCase().includes("[object object]");
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
            if (!isValidWorkspacePath(entry.path)) {
                return null;
            }

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

const buildPreviewDocument = (codeFiles, entryPath = "") => {
    const files = codeFiles.filter((entry) => entry.type === "file");
    const hasReactFiles = files.some((entry) => REACT_PREVIEW_EXTENSIONS.has(getFileExtension(entry.path)));

    let htmlFile = null;
    if (entryPath) {
        htmlFile = files.find(f => f.path.toLowerCase() === entryPath.toLowerCase());
    }
    if (!htmlFile) {
        htmlFile = files.find((entry) => {
            const extension = getFileExtension(entry.path);
            return extension === "html" || extension === "htm";
        });
    }

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

        document.addEventListener("click", (event) => {
          const anchor = event.target.closest("a");
          if (anchor && anchor.getAttribute("href")) {
            const href = anchor.getAttribute("href");
            if (!/^(?:[a-z]+:)?\\/\\//i.test(href) && !href.startsWith("#") && !href.startsWith("mailto:")) {
              event.preventDefault();
              send("navigate", { path: href });
            }
          }
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

const createTerminalLine = (type, text) => ({
    id: `${type}_${Math.random().toString(36).slice(2, 10)}`,
    type,
    text: String(text ?? ""),
});

const buildTerminalPromptLabel = (cwd = "") => `workspace:${cwd ? `/${cwd}` : "/"}$`;

const buildWorkspaceRuntimeScope = (editorMode = "shared", currentUserId = "") =>
    editorMode === "draft" && currentUserId ? `draft_${currentUserId}` : "shared";

const splitTerminalContent = (content = "") =>
    String(content)
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);

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
            folderNode.name =
                typeof entry.name === "string" && entry.name.trim()
                    ? entry.name
                    : getNodeName(entry.path);
            return;
        }

        const parentNode = ensureFolderNode(getParentPath(entry.path));
        parentNode.children.push({
            id: entry.id,
            type: "file",
            path: entry.path,
            name:
                typeof entry.name === "string" && entry.name.trim()
                    ? entry.name
                    : getNodeName(entry.path),
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
    currentUser,
    currentUserDraft,
    draftSummary = [],
    canCombineDrafts = false,
    presenceUsers = [],
    onPresenceActiveFileChange,
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
    const [draggedNode, setDraggedNode] = useState(null);
    const [navHistory, setNavHistory] = useState([]);
    const [navIndex, setNavIndex] = useState(-1);
    const [showDiffViewer, setShowDiffViewer] = useState(false);
    const [activeBottomPanel, setActiveBottomPanel] = useState("terminal");
    const [terminalLines, setTerminalLines] = useState([]);
    const [terminalCommand, setTerminalCommand] = useState("");
    const [terminalCwd, setTerminalCwd] = useState("");
    const [terminalHistory, setTerminalHistory] = useState([]);
    const [terminalHistoryIndex, setTerminalHistoryIndex] = useState(-1);
    const [isTerminalRunning, setIsTerminalRunning] = useState(false);
    const [terminalPackageState, setTerminalPackageState] = useState(null);

    const currentCodeFiles = editorMode === "draft" ? draftCodeFiles : sharedCodeFiles;
    const activeFileId = editorMode === "draft" ? draftActiveFileId : sharedActiveFileId;
    const currentModeLabel = editorMode === "draft" ? "My Draft" : "Shared Output";
    const runtimeScope = buildWorkspaceRuntimeScope(editorMode, currentUserId);
    const activeUsers = presenceUsers;

    const socketRef = useRef(null);
    const iframeRef = useRef(null);
    const terminalScrollRef = useRef(null);
    const terminalInputRef = useRef(null);
    const isRemoteChange = useRef(false);
    const remoteResetTimerRef = useRef(null);
    const currentCodeFilesRef = useRef(currentCodeFiles);
    const updateCurrentFileSelectionRef = useRef(() => undefined);
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
        // Prevent auto-reloading the preview on every keystroke
        const filesToPreview = editorMode === "draft" ? draftCodeFiles : sharedCodeFiles;
        setPreviewSrcDoc(buildPreviewDocument(filesToPreview, activeFile?.path));
        setConsoleLines([]);
        setRuntimeError("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId, editorMode]);

    useEffect(() => {
        socketRef.current = io(SOCKET_BASE_URL, {
            withCredentials: true,
        });

        socketRef.current.emit("join_workspace", workspaceId);

        socketRef.current.on("receive_draft_saved", ({ user }) => {
            if (user && user._id !== currentUserId) {
                toast(`${user.name} just saved a code draft!`, { icon: '📝' });
                onWorkspaceRefresh?.();
            }
        });

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
    }, [workspaceId, currentUserId, onWorkspaceRefresh]);

    // Emit active file change
    useEffect(() => {
        if (typeof onPresenceActiveFileChange !== "function") {
            return;
        }

        onPresenceActiveFileChange(activeFile?.path || null);
    }, [activeFile?.path, onPresenceActiveFileChange]);

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

            if (payload.type === "navigate") {
                const targetPath = payload.payload?.path;
                let normalizedTargetPath = targetPath;
                if (targetPath.startsWith("./")) normalizedTargetPath = targetPath.slice(2);

                const fileToNavigate = currentCodeFilesRef.current.find(
                    f => f.path.toLowerCase() === normalizedTargetPath.toLowerCase() ||
                        f.path.toLowerCase().endsWith(`/${normalizedTargetPath.toLowerCase()}`)
                );

                if (fileToNavigate) {
                    updateCurrentFileSelectionRef.current(fileToNavigate.id);
                    setPreviewSrcDoc(buildPreviewDocument(currentCodeFilesRef.current, fileToNavigate.path));
                } else {
                    setRuntimeError(`404: Page not found (${targetPath})`);
                }
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

    useEffect(() => {
        currentCodeFilesRef.current = currentCodeFiles;
    }, [currentCodeFiles]);

    useEffect(() => {
        if (!terminalScrollRef.current) {
            return;
        }

        terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }, [terminalLines, activeBottomPanel]);

    useEffect(() => {
        if (activeBottomPanel !== "terminal") {
            return;
        }

        terminalInputRef.current?.focus();
    }, [activeBottomPanel, editorMode, workspaceId]);

    useEffect(() => {
        setTerminalCwd("");
        setTerminalCommand("");
        setTerminalHistoryIndex(-1);
        setTerminalPackageState(null);
    }, [workspaceId, editorMode]);

    const navToFilePathNoHistory = (targetPath) => {
        const fileToNavigate = currentCodeFilesRef.current.find(
            f => f.path.toLowerCase() === targetPath.toLowerCase() ||
                f.path.toLowerCase().endsWith(`/${targetPath.toLowerCase()}`)
        );
        if (fileToNavigate) {
            if (editorMode === "draft") {
                setDraftActiveFileId(fileToNavigate.id);
            } else {
                setSharedActiveFileId(fileToNavigate.id);
            }
            setPreviewSrcDoc(buildPreviewDocument(currentCodeFilesRef.current, fileToNavigate.path));
        }
    };

    const updateCurrentFileSelection = (nextFileId) => {
        if (editorMode === "draft") {
            setDraftActiveFileId(nextFileId);
        } else {
            setSharedActiveFileId(nextFileId);
        }

        const nextFile = currentCodeFilesRef.current.find((entry) => entry.id === nextFileId);
        if (nextFile) {
            setNavHistory(prev => {
                if (prev[navIndex] === nextFile.path) return prev;
                const newHistory = prev.slice(0, navIndex + 1);
                newHistory.push(nextFile.path);
                setNavIndex(newHistory.length - 1);
                return newHistory;
            });
        }
    };

    updateCurrentFileSelectionRef.current = updateCurrentFileSelection;

    const handleGoBack = () => {
        if (navIndex > 0) {
            const prevPath = navHistory[navIndex - 1];
            setNavIndex(navIndex - 1);
            navToFilePathNoHistory(prevPath);
        }
    };

    const handleGoForward = () => {
        if (navIndex < navHistory.length - 1) {
            const nextPath = navHistory[navIndex + 1];
            setNavIndex(navIndex + 1);
            navToFilePathNoHistory(nextPath);
        }
    };

    const handleRefreshPreview = () => {
        if (activeFile) {
            setPreviewSrcDoc(buildPreviewDocument(currentCodeFiles, activeFile.path));
        }
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

        if (!isValidWorkspacePath(path)) {
            toast.error("Folder path is invalid");
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

        if (!isValidWorkspacePath(path)) {
            toast.error("File path is invalid");
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

    const handleDragStart = (e, node) => {
        e.stopPropagation();
        setDraggedNode(node);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e, targetFolderNode) => {
        e.preventDefault();
        e.stopPropagation();

        if (!draggedNode) return;

        const targetPath = targetFolderNode ? targetFolderNode.path : "";

        // Prevent moving a folder into itself or its own children
        if (draggedNode.type === "folder" && targetPath.startsWith(draggedNode.path)) {
            setDraggedNode(null);
            return;
        }

        // Prevent moving to the exact same directory
        const draggedParent = getParentPath(draggedNode.path);
        if (draggedParent === targetPath) {
            setDraggedNode(null);
            return;
        }

        const newPath = buildChildPath(targetPath, getNodeName(draggedNode.path));

        const exists = currentCodeFiles.some(
            (node) => node.path.toLowerCase() === newPath.toLowerCase() && node.id !== draggedNode.id
        );

        if (exists) {
            toast.error("An entry with this name already exists in the destination");
            setDraggedNode(null);
            return;
        }

        const oldPrefix = `${draggedNode.path}/`;
        const newPrefix = `${newPath}/`;

        const next = currentCodeFiles.map((node) => {
            if (node.id === draggedNode.id) {
                return { ...node, path: newPath };
            }
            if (draggedNode.type === "folder" && node.path.startsWith(oldPrefix)) {
                return {
                    ...node,
                    path: newPrefix + node.path.slice(oldPrefix.length),
                };
            }
            return node;
        });

        expandFolderPath(targetPath);
        applyCodeFilesUpdate(sortCodeFiles(next));
        toast.success(`Moved ${getNodeName(draggedNode.path)} to ${targetPath || 'root'}`);
        setDraggedNode(null);
    };

    const handleRenameEntry = (entry) => {
        const isFolder = entry.type === "folder";
        const newName = window.prompt(`Enter new name for ${isFolder ? "folder" : "file"} "${entry.name}"`, entry.name);

        if (!newName || newName === entry.name) {
            return;
        }

        const parentPath = getParentPath(entry.path);
        const newPath = buildChildPath(parentPath, newName);

        const exists = currentCodeFiles.some(
            (node) => node.path.toLowerCase() === newPath.toLowerCase() && node.id !== entry.id
        );

        if (exists) {
            toast.error("File or folder with this name already exists");
            return;
        }

        const oldPrefix = `${entry.path}/`;
        const newPrefix = `${newPath}/`;

        const next = currentCodeFiles.map((node) => {
            if (node.id === entry.id) {
                return { ...node, name: newName, path: newPath };
            }
            if (isFolder && node.path.startsWith(oldPrefix)) {
                return {
                    ...node,
                    path: newPrefix + node.path.slice(oldPrefix.length),
                };
            }
            return node;
        });

        applyCodeFilesUpdate(sortCodeFiles(next));
        toast.success(`${currentModeLabel} entry renamed to ${newName}`);
    };

    const handleRunCode = async () => {
        if (!activeFile) {
            toast.error("Open a file to run");
            return;
        }

        setActiveBottomPanel("output");
        setConsoleLines([]);
        setRuntimeError("");

        if (canUseBrowserPreview(currentCodeFiles, activeFile)) {
            setPreviewSrcDoc(buildPreviewDocument(currentCodeFiles, activeFile.path));
            return;
        }

        try {
            setIsRunning(true);
            setPreviewSrcDoc(buildEmptyPreviewDocument());

            const response = await workspaceService.runWorkspaceCode(workspaceId, {
                codeFiles: currentCodeFiles,
                entryPath: activeFile.path,
                runtimeScope,
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

    const updateCodeFilesFromTerminal = (nextCodeFiles, preferredActivePath = activeFile?.path || "") => {
        const normalizedNextCodeFiles = normalizeCodeFiles(nextCodeFiles, getPrimaryCode(currentCodeFiles));
        const fileEntries = normalizedNextCodeFiles.filter((entry) => entry.type === "file");

        let nextActiveFileId = null;
        if (preferredActivePath) {
            nextActiveFileId =
                fileEntries.find((entry) => entry.path.toLowerCase() === preferredActivePath.toLowerCase())?.id || null;
        }

        if (!nextActiveFileId) {
            nextActiveFileId = fileEntries[0]?.id || null;
        }

        applyCodeFilesUpdate(normalizedNextCodeFiles, nextActiveFileId);
    };

    const appendTerminalEntries = (entries = []) => {
        if (!Array.isArray(entries) || entries.length === 0) {
            return;
        }

        setTerminalLines((prev) => [...prev, ...entries].slice(-400));
    };

    const handleRunTerminalCommand = async () => {
        const trimmedCommand = terminalCommand.trim();
        if (!trimmedCommand || isTerminalRunning) {
            return;
        }

        const promptLabel = buildTerminalPromptLabel(terminalCwd);
        appendTerminalEntries([createTerminalLine("command", `${promptLabel} ${trimmedCommand}`)]);

        if (trimmedCommand === "clear" || trimmedCommand === "cls") {
            setTerminalLines([]);
            setTerminalCommand("");
            setTerminalHistoryIndex(-1);
            return;
        }

        setActiveBottomPanel("terminal");
        setTerminalHistory((prev) => {
            if (prev[prev.length - 1] === trimmedCommand) {
                return prev;
            }

            return [...prev, trimmedCommand].slice(-100);
        });
        setTerminalHistoryIndex(-1);
        setTerminalCommand("");

        try {
            setIsTerminalRunning(true);
            const response = await workspaceService.runWorkspaceTerminal(workspaceId, {
                codeFiles: currentCodeFiles,
                command: trimmedCommand,
                cwd: terminalCwd,
                runtimeScope,
            });
            const terminalResult = response?.data || {};

            if (typeof terminalResult.cwd === "string") {
                setTerminalCwd(terminalResult.cwd);
            }

            setTerminalPackageState(terminalResult.packageState || null);

            const nextEntries = [];
            splitTerminalContent(terminalResult.stdout).forEach((line) => {
                nextEntries.push(createTerminalLine("stdout", line));
            });
            splitTerminalContent(terminalResult.stderr).forEach((line) => {
                nextEntries.push(createTerminalLine("stderr", line));
            });

            if (terminalResult.message && nextEntries.length === 0) {
                nextEntries.push(
                    createTerminalLine(terminalResult.success ? "meta" : "stderr", terminalResult.message)
                );
            } else if (terminalResult.message && !terminalResult.success) {
                nextEntries.push(createTerminalLine("stderr", terminalResult.message));
            }

            appendTerminalEntries(nextEntries);

            if (Array.isArray(terminalResult.updatedCodeFiles)) {
                updateCodeFilesFromTerminal(terminalResult.updatedCodeFiles);
            }
        } catch (error) {
            const message = error.response?.data?.message || "Failed to run workspace terminal command";
            appendTerminalEntries([createTerminalLine("stderr", message)]);
        } finally {
            setIsTerminalRunning(false);
            terminalInputRef.current?.focus();
        }
    };

    const handleTerminalInputKeyDown = (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleRunTerminalCommand();
            return;
        }

        if (event.key === "ArrowUp") {
            if (terminalHistory.length === 0) {
                return;
            }

            event.preventDefault();
            const nextIndex =
                terminalHistoryIndex < 0
                    ? terminalHistory.length - 1
                    : Math.max(0, terminalHistoryIndex - 1);
            setTerminalHistoryIndex(nextIndex);
            setTerminalCommand(terminalHistory[nextIndex] || "");
            return;
        }

        if (event.key === "ArrowDown") {
            if (terminalHistory.length === 0 || terminalHistoryIndex < 0) {
                return;
            }

            event.preventDefault();
            const nextIndex = terminalHistoryIndex + 1;
            if (nextIndex >= terminalHistory.length) {
                setTerminalHistoryIndex(-1);
                setTerminalCommand("");
                return;
            }

            setTerminalHistoryIndex(nextIndex);
            setTerminalCommand(terminalHistory[nextIndex] || "");
        }
    };

    const handleClearTerminal = () => {
        setTerminalLines([]);
        setTerminalCommand("");
        setTerminalHistoryIndex(-1);
        terminalInputRef.current?.focus();
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

            socketRef.current?.emit("draft_saved", {
                workspaceId,
                user: { _id: currentUser._id, name: currentUser.name }
            });

            toast.success("Your draft was saved");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save your draft");
        } finally {
            setSavingDraft(false);
        }
    };

    const verifyLatestCombineAccess = async () => {
        try {
            const response = await workspaceService.getWorkspaceDetails(workspaceId);
            const latestWorkspace = response?.data?.workspace;
            const isAllowed = Boolean(latestWorkspace?.canCurrentUserCombineDrafts);

            if (!isAllowed) {
                await onWorkspaceRefresh?.();
                toast.error("Combine access is not granted for this account");
                return false;
            }

            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to verify combine access");
            return false;
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
        const hasAccess = canCombineDrafts && await verifyLatestCombineAccess();
        if (!hasAccess) {
            return false;
        }

        try {
            setCombiningDrafts(true);
            const response = await workspaceService.combineWorkspaceDrafts(workspaceId);
            const responseData = response?.data || {};
            const conflicts = responseData?.conflicts || [];
            const newCodeFiles = responseData?.codeFiles || [];
            const newCode = responseData?.code || "";
            const normalizedMergedCodeFiles = normalizeCodeFiles(newCodeFiles, newCode);

            setSharedCodeFiles(normalizedMergedCodeFiles);
            setSharedActiveFileId(
                normalizedMergedCodeFiles.find((entry) => entry.type === "file")?.id || null
            );
            setDraftCodeFiles(normalizedMergedCodeFiles);
            setDraftActiveFileId(
                normalizedMergedCodeFiles.find((entry) => entry.type === "file")?.id || null
            );

            // Broadcast the newly merged data instantly
            socketRef.current?.emit("code_change", {
                workspaceId,
                code: newCode,
                codeFiles: normalizedMergedCodeFiles
            });

            await onWorkspaceRefresh?.();

            if (conflicts.length > 0) {
                const previewPaths = conflicts.slice(0, 3).map((conflict) => conflict.path).join(", ");
                toast(`Combined drafts with ${conflicts.length} conflict(s): ${previewPaths}`);
            } else {
                toast.success("Team drafts combined into shared output");
            }

            setEditorMode("shared");
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to combine drafts");
            return false;
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
                    <div
                        key={`${editorMode}-${node.path || node.id}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, folderEntry)}
                    >
                        <div
                            className={`group flex items-center pr-2 ${draggedNode?.id === node.id ? 'opacity-50' : 'hover:bg-slate-900/70'}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, folderEntry)}
                        >
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
                                onClick={() => handleRenameEntry(folderEntry)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white p-1 rounded transition-opacity"
                                title="Rename"
                            >
                                <Pencil size={13} />
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
                    className={`group flex items-center pr-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900/70"} ${draggedNode?.id === node.entry.id ? 'opacity-50' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, node.entry)}
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
                        onClick={() => handleRenameEntry(node.entry)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white p-1 rounded transition-opacity"
                        title="Rename"
                    >
                        <Pencil size={13} />
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
                                className={`px-3 py-1.5 rounded text-sm transition-colors ${editorMode === "shared"
                                    ? "bg-slate-100 text-slate-950"
                                    : "text-slate-300 hover:text-white"
                                    }`}
                            >
                                Shared Output
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditorMode("draft")}
                                className={`px-3 py-1.5 rounded text-sm transition-colors ${editorMode === "draft"
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
                            onClick={async () => {
                                if (!canCombineDrafts) {
                                    toast.error("Only the workspace owner or granted merge leads can combine drafts");
                                    return;
                                }

                                const hasAccess = await verifyLatestCombineAccess();
                                if (!hasAccess) {
                                    return;
                                }
                                setShowDiffViewer(true);
                            }}
                            disabled={combiningDrafts || draftSummary.length === 0 || !canCombineDrafts}
                            className="text-sm bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                            title={canCombineDrafts ? "Review and combine team drafts" : "Ask the workspace owner to grant merge access"}
                        >
                            {combiningDrafts ? "Combining..." : "Combine Drafts"}
                        </button>
                    </div>

                    <div className="flex items-center space-x-1 pl-3 ml-2 border-l border-slate-700">
                        {activeUsers.map(u => (
                            <img
                                key={u._id}
                                src={u.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u._id}`}
                                className="w-7 h-7 rounded-full border-2 border-[#111827] relative hover:z-20 transition-transform hover:scale-110"
                                title={`${u.name} ${u.activeTab === "code" && u.activeFile
                                    ? `(Editing: ${getNodeName(u.activeFile)})`
                                    : `(In ${u.activeTab || "tasks"})`}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="px-3 py-2 border-t border-slate-700 bg-[#0b1220] flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-300">
                        {editorMode === "shared"
                            ? "Shared Output syncs live for everyone in the workspace."
                            : "My Draft stays private until you save it and combine team drafts, but it keeps the latest shared folder structure."}
                    </span>
                    {!canCombineDrafts ? (
                        <span className="text-amber-300">
                            Only the workspace owner or granted merge leads can combine drafts.
                        </span>
                    ) : null}
                    <span className="text-slate-500">Saved drafts:</span>
                    {draftSummary.length === 0 ? (
                        <span className="text-slate-400">No saved drafts yet</span>
                    ) : (
                        draftSummary.map((draft) => (
                            <span
                                key={draft.user._id}
                                className={`px-2 py-1 rounded-full border ${draft.user._id === currentUserId
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
                    <div
                        className="h-full overflow-y-auto py-2"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, null)} // null means root directory
                    >
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
                                    <div className="flex items-center max-w-[60%]">
                                        <p className="text-slate-300 truncate mr-3">{activeFile.path}</p>
                                        <div className="flex items-center -space-x-1">
                                            {activeUsers.filter(u => u.activeFile === activeFile.path && u._id !== currentUserId).map(u => (
                                                <img
                                                    key={u._id}
                                                    src={u.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u._id}`}
                                                    className="w-5 h-5 rounded-full border border-slate-700 opacity-80"
                                                    title={`${u.name} is editing this file`}
                                                />
                                            ))}
                                        </div>
                                    </div>
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
                        <div className="px-3 py-2 border-b border-slate-200 shrink-0 flex items-center justify-between">
                            <div className="flex items-center space-x-1">
                                <button
                                    onClick={handleGoBack}
                                    disabled={navIndex <= 0}
                                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                    title="Go back"
                                >
                                    <ChevronLeft size={18} className="text-slate-700" />
                                </button>
                                <button
                                    onClick={handleGoForward}
                                    disabled={navIndex >= navHistory.length - 1 || navHistory.length === 0}
                                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                                    title="Go forward"
                                >
                                    <ChevronRight size={18} className="text-slate-700" />
                                </button>
                                <button
                                    onClick={handleRefreshPreview}
                                    className="p-1 rounded hover:bg-slate-100 transition-colors mr-2"
                                    title="Reload preview"
                                >
                                    <RotateCw size={16} className="text-slate-700" />
                                </button>
                            </div>
                            <p className="text-sm font-semibold text-slate-500 hidden sm:block">Preview Output</p>
                        </div>
                        <iframe
                            ref={iframeRef}
                            title="workspace-preview"
                            sandbox="allow-scripts allow-modals allow-same-origin"
                            srcDoc={previewSrcDoc}
                            className="flex-1 w-full bg-white"
                        />
                        <div className="h-56 bg-[#0b1220] border-t border-slate-700 text-slate-200 flex flex-col">
                            <div className="px-3 py-2 border-b border-slate-700 text-xs font-semibold uppercase tracking-wide flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveBottomPanel("output")}
                                        className={`rounded px-2 py-1 transition-colors ${activeBottomPanel === "output"
                                            ? "bg-slate-200 text-slate-950"
                                            : "text-slate-400 hover:text-white"
                                            }`}
                                    >
                                        Output
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveBottomPanel("terminal")}
                                        className={`rounded px-2 py-1 transition-colors ${activeBottomPanel === "terminal"
                                            ? "bg-slate-200 text-slate-950"
                                            : "text-slate-400 hover:text-white"
                                            }`}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            <TerminalSquare size={14} />
                                            Terminal
                                        </span>
                                    </button>
                                </div>
                                {activeBottomPanel === "terminal" ? (
                                    <div className="flex items-center gap-2 text-[11px] normal-case flex-wrap justify-end">
                                        {terminalPackageState?.hasPackageJson ? (
                                            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-cyan-100">
                                                {terminalPackageState.packageManager || "npm"} · {terminalPackageState.dependencyCount || 0} deps
                                                {terminalPackageState.devDependencyCount ? ` · ${terminalPackageState.devDependencyCount} dev` : ""}
                                                {terminalPackageState.hasNodeModules ? ` · ${terminalPackageState.installedPackageCount || 0} installed` : " · install pending"}
                                            </span>
                                        ) : null}
                                        <span className="truncate text-slate-400">{buildTerminalPromptLabel(terminalCwd)}</span>
                                        <button
                                            type="button"
                                            onClick={handleClearTerminal}
                                            className="rounded border border-slate-700 px-2 py-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                ) : null}
                            </div>

                            {activeBottomPanel === "output" ? (
                                <div className="flex-1 overflow-y-auto px-3 py-2 text-xs font-mono space-y-1">
                                    {runtimeError ? (
                                        <div className="text-rose-400 p-2 bg-rose-400/10 rounded border border-rose-400/20">
                                            [Runtime Error] {runtimeError}
                                        </div>
                                    ) : consoleLines.length > 0 ? (
                                        consoleLines.map((line, idx) => (
                                            <div key={idx} className="border-b border-slate-800/50 pb-1 break-all">
                                                {line}
                                            </div>
                                        ))
                                    ) : null}
                                </div>
                            ) : (
                                <div
                                    className="flex-1 flex flex-col"
                                    onClick={() => terminalInputRef.current?.focus()}
                                >
                                    <div
                                        ref={terminalScrollRef}
                                        className="flex-1 overflow-y-auto px-3 py-2 text-xs font-mono"
                                    >
                                        <div className="space-y-1">
                                            {terminalLines.map((line) => (
                                                <div
                                                    key={line.id}
                                                    className={`break-all whitespace-pre-wrap ${line.type === "command"
                                                        ? "text-sky-300"
                                                        : line.type === "stderr"
                                                            ? "text-rose-300"
                                                            : line.type === "meta"
                                                                ? "text-amber-200"
                                                                : "text-slate-200"
                                                        }`}
                                                >
                                                    {line.text}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="border-t border-slate-800 px-3 py-2">
                                        <div className="flex items-center gap-2 text-xs font-mono">
                                            <span className="shrink-0 text-emerald-300">
                                                {buildTerminalPromptLabel(terminalCwd)}
                                            </span>
                                            <input
                                                ref={terminalInputRef}
                                                type="text"
                                                value={terminalCommand}
                                                onChange={(event) => setTerminalCommand(event.target.value)}
                                                onKeyDown={handleTerminalInputKeyDown}
                                                placeholder={isTerminalRunning ? "Running..." : "Type a command and press Enter"}
                                                disabled={isTerminalRunning}
                                                className="flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-wait"
                                                spellCheck={false}
                                                autoCapitalize="off"
                                                autoCorrect="off"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showDiffViewer && (
                <DraftDiffViewer
                    draftFiles={draftCodeFiles}
                    sharedFiles={sharedCodeFiles}
                    onClose={() => setShowDiffViewer(false)}
                    onConfirm={async () => {
                        const combined = await handleCombineDrafts();
                        if (combined) {
                            setShowDiffViewer(false);
                        }
                    }}
                    isMerging={combiningDrafts}
                />
            )}
        </div>
    );
};

export default WorkspaceCodeEditor;
