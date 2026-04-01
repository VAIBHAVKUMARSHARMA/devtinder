import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { io } from "socket.io-client";
import { SOCKET_BASE_URL } from "@/lib/runtimeConfig";
import { Loader2, PanelsTopLeft, Save, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { workspaceService } from "../services/workspaceService";

const DEFAULT_VIEW_BACKGROUND = "#ffffff";
const LEGACY_NODE_WIDTH = 240;
const LEGACY_NODE_HEIGHT = 116;

const isPlainObject = (value) =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cloneSerializable = (value, fallback) => {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return fallback;
    }
};

const normalizeNodeColor = (color) => {
    if (typeof color !== "string") {
        return "#2563eb";
    }

    const trimmed = color.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "#2563eb";
};

const buildDefaultWhiteboardScene = () => ({
    kind: "excalidraw",
    elements: [],
    appState: {
        viewBackgroundColor: DEFAULT_VIEW_BACKGROUND,
    },
    files: {},
    libraryItems: [],
});

const HIDE_PROPERTIES_PANEL_STYLES = `
    .workspace-whiteboard--properties-hidden .excalidraw .App-menu__left {
        display: none !important;
    }
`;

const buildPersistedAppState = (appState) => {
    const nextAppState = isPlainObject(appState) ? appState : {};
    const persistedAppState = {
        viewBackgroundColor:
            typeof nextAppState.viewBackgroundColor === "string" &&
                nextAppState.viewBackgroundColor.trim()
                ? nextAppState.viewBackgroundColor.trim()
                : DEFAULT_VIEW_BACKGROUND,
    };

    if (Number.isFinite(nextAppState.scrollX)) {
        persistedAppState.scrollX = nextAppState.scrollX;
    }

    if (Number.isFinite(nextAppState.scrollY)) {
        persistedAppState.scrollY = nextAppState.scrollY;
    }

    if (isPlainObject(nextAppState.zoom) && Number.isFinite(nextAppState.zoom.value)) {
        persistedAppState.zoom = { value: nextAppState.zoom.value };
    }

    if (Number.isFinite(nextAppState.gridSize)) {
        persistedAppState.gridSize = nextAppState.gridSize;
    }

    return persistedAppState;
};

const sanitizeWhiteboardScene = (sceneData) => {
    if (!isPlainObject(sceneData)) {
        return buildDefaultWhiteboardScene();
    }

    return {
        kind: "excalidraw",
        elements: Array.isArray(sceneData.elements)
            ? cloneSerializable(sceneData.elements, [])
            : [],
        appState: buildPersistedAppState(sceneData.appState),
        files: isPlainObject(sceneData.files)
            ? cloneSerializable(sceneData.files, {})
            : {},
        libraryItems: Array.isArray(sceneData.libraryItems)
            ? cloneSerializable(sceneData.libraryItems, [])
            : [],
    };
};

const normalizeLegacyWhiteboardData = (whiteboardData) => {
    const nodes = Array.isArray(whiteboardData?.nodes)
        ? whiteboardData.nodes
            .filter((node) => isPlainObject(node))
            .map((node, index) => ({
                id:
                    typeof node.id === "string" && node.id.trim()
                        ? node.id
                        : `legacy_node_${index + 1}`,
                title:
                    typeof node.title === "string" && node.title.trim()
                        ? node.title.trim()
                        : "Untitled Step",
                description:
                    typeof node.description === "string"
                        ? node.description.trim()
                        : "",
                color: normalizeNodeColor(node.color),
                x: Number.isFinite(Number(node.x)) ? Number(node.x) : 140 + index * 280,
                y: Number.isFinite(Number(node.y)) ? Number(node.y) : 130,
            }))
        : [];

    if (nodes.length === 0) {
        return buildDefaultWhiteboardScene();
    }

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const nodeElements = nodes.flatMap((node) => {
        const titleY = node.y + 18;
        const descriptionY = node.y + 58;
        const elements = [
            {
                id: node.id,
                type: "rectangle",
                x: node.x,
                y: node.y,
                width: LEGACY_NODE_WIDTH,
                height: LEGACY_NODE_HEIGHT,
                strokeColor: node.color,
                backgroundColor: "#ffffff",
                fillStyle: "solid",
                strokeWidth: 2,
                roughness: 1,
            },
            {
                id: `${node.id}_title`,
                type: "text",
                x: node.x + 20,
                y: titleY,
                text: node.title,
                fontSize: 24,
                width: LEGACY_NODE_WIDTH - 40,
            },
        ];

        if (node.description) {
            elements.push({
                id: `${node.id}_description`,
                type: "text",
                x: node.x + 20,
                y: descriptionY,
                text: node.description,
                fontSize: 16,
                width: LEGACY_NODE_WIDTH - 40,
            });
        }

        return elements;
    });

    const linkElements = Array.isArray(whiteboardData?.links)
        ? whiteboardData.links
            .filter((link) => isPlainObject(link))
            .map((link, index) => {
                const fromNode = nodeMap.get(link.from);
                const toNode = nodeMap.get(link.to);

                if (!fromNode || !toNode) {
                    return null;
                }

                const fromX = fromNode.x + LEGACY_NODE_WIDTH;
                const fromY = fromNode.y + LEGACY_NODE_HEIGHT / 2;
                const toX = toNode.x;
                const toY = toNode.y + LEGACY_NODE_HEIGHT / 2;

                return {
                    id:
                        typeof link.id === "string" && link.id.trim()
                            ? link.id
                            : `legacy_link_${index + 1}`,
                    type: "arrow",
                    x: fromX,
                    y: fromY,
                    points: [[0, 0], [toX - fromX, toY - fromY]],
                    strokeColor: "#64748b",
                    endArrowhead: "arrow",
                };
            })
            .filter(Boolean)
        : [];

    return sanitizeWhiteboardScene({
        elements: convertToExcalidrawElements([
            ...nodeElements,
            ...linkElements,
        ]),
        appState: {
            viewBackgroundColor: DEFAULT_VIEW_BACKGROUND,
        },
        files: {},
        libraryItems: [],
    });
};

const normalizeWhiteboardScene = (whiteboardData) => {
    if (
        isPlainObject(whiteboardData) &&
        (
            whiteboardData.kind === "excalidraw" ||
            Array.isArray(whiteboardData.elements) ||
            isPlainObject(whiteboardData.files) ||
            isPlainObject(whiteboardData.appState)
        )
    ) {
        return sanitizeWhiteboardScene(whiteboardData);
    }

    if (Array.isArray(whiteboardData?.nodes) || Array.isArray(whiteboardData?.links)) {
        return normalizeLegacyWhiteboardData(whiteboardData);
    }

    return buildDefaultWhiteboardScene();
};

const getSceneFromApi = (api, fallbackScene) => {
    if (!api) {
        return sanitizeWhiteboardScene(fallbackScene);
    }

    return sanitizeWhiteboardScene({
        ...fallbackScene,
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: api.getFiles(),
    });
};

const WorkspaceWhiteboard = ({ workspaceId, initialWhiteboardData }) => {
    const initialScene = useMemo(
        () => normalizeWhiteboardScene(initialWhiteboardData),
        [initialWhiteboardData]
    );

    const [saving, setSaving] = useState(false);
    const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);

    const excalidrawApiRef = useRef(null);
    const socketRef = useRef(null);
    const sceneRef = useRef(initialScene);
    const isRemoteChange = useRef(false);
    const emitTimerRef = useRef(null);
    const remoteResetTimerRef = useRef(null);

    const clearEmitTimer = () => {
        if (emitTimerRef.current) {
            clearTimeout(emitTimerRef.current);
            emitTimerRef.current = null;
        }
    };

    const releaseRemoteLock = () => {
        if (remoteResetTimerRef.current) {
            clearTimeout(remoteResetTimerRef.current);
        }

        remoteResetTimerRef.current = setTimeout(() => {
            isRemoteChange.current = false;
        }, 0);
    };

    const applySceneToCanvas = useCallback((sceneData) => {
        const nextScene = sanitizeWhiteboardScene(sceneData);
        sceneRef.current = nextScene;

        if (!excalidrawApiRef.current) {
            return;
        }

        excalidrawApiRef.current.updateScene({
            elements: nextScene.elements,
            appState: nextScene.appState,
            files: nextScene.files,
        });

        excalidrawApiRef.current.history.clear();
        excalidrawApiRef.current
            .updateLibrary({
                libraryItems: nextScene.libraryItems,
                merge: false,
            })
            .catch(() => undefined);
    }, []);

    const emitWhiteboardChange = useCallback((sceneData) => {
        const nextScene = sanitizeWhiteboardScene(sceneData);
        sceneRef.current = nextScene;
        clearEmitTimer();

        emitTimerRef.current = setTimeout(() => {
            socketRef.current?.emit("whiteboard_change", {
                workspaceId,
                whiteboardData: nextScene,
            });
        }, 120);
    }, [workspaceId]);

    useEffect(() => {
        sceneRef.current = initialScene;
        clearEmitTimer();
        isRemoteChange.current = true;
        applySceneToCanvas(initialScene);
        releaseRemoteLock();
    }, [initialScene, workspaceId, applySceneToCanvas]);

    useEffect(() => {
        const socket = io(SOCKET_BASE_URL, {
            withCredentials: true,
        });

        socketRef.current = socket;
        socket.emit("join_workspace", workspaceId);

        socket.on("receive_whiteboard_change", (payload) => {
            if (payload.workspaceId !== workspaceId) {
                return;
            }

            clearEmitTimer();
            isRemoteChange.current = true;
            applySceneToCanvas(normalizeWhiteboardScene(payload.whiteboardData));
            releaseRemoteLock();
        });

        return () => {
            clearEmitTimer();

            if (remoteResetTimerRef.current) {
                clearTimeout(remoteResetTimerRef.current);
            }

            socket.disconnect();
        };
    }, [workspaceId, applySceneToCanvas]);

    const handleSceneChange = useCallback((elements, appState, files) => {
        const nextScene = sanitizeWhiteboardScene({
            ...sceneRef.current,
            elements,
            appState: {
                viewBackgroundColor: appState?.viewBackgroundColor || DEFAULT_VIEW_BACKGROUND,
            },
            files,
        });

        sceneRef.current = nextScene;

        if (!isRemoteChange.current) {
            emitWhiteboardChange(nextScene);
        }
    }, [emitWhiteboardChange]);

    const handleLibraryChange = useCallback((libraryItems) => {
        const nextScene = sanitizeWhiteboardScene({
            ...sceneRef.current,
            libraryItems,
        });

        sceneRef.current = nextScene;

        if (!isRemoteChange.current) {
            emitWhiteboardChange(nextScene);
        }
    }, [emitWhiteboardChange]);

    const handleSaveWhiteboard = async () => {
        try {
            setSaving(true);
            const nextScene = getSceneFromApi(excalidrawApiRef.current, sceneRef.current);
            sceneRef.current = nextScene;

            await workspaceService.saveWorkspaceWhiteboard(workspaceId, {
                whiteboardData: nextScene,
            });

            toast.success("Excalidraw whiteboard saved");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save whiteboard");
        } finally {
            setSaving(false);
        }
    };

    const handleClearCanvas = () => {
        const confirmed = window.confirm("Clear the Excalidraw canvas?");
        if (!confirmed) {
            return;
        }

        const nextScene = buildDefaultWhiteboardScene();
        clearEmitTimer();
        isRemoteChange.current = true;
        applySceneToCanvas(nextScene);
        emitWhiteboardChange(nextScene);
        releaseRemoteLock();
        toast.success("Canvas cleared");
    };

    const handleExcalidrawApi = useCallback((api) => {
        if (!api) {
            return;
        }

        excalidrawApiRef.current = api;
        applySceneToCanvas(sceneRef.current);
    }, [applySceneToCanvas]);

    return (
        <div
            className={`h-full w-full relative bg-[#f8fafc] ${
                showPropertiesPanel ? "" : "workspace-whiteboard--properties-hidden"
            }`}
        >
            <style>{HIDE_PROPERTIES_PANEL_STYLES}</style>

            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setShowPropertiesPanel((current) => !current)}
                    className={`flex items-center rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition-colors ${
                        showPropertiesPanel
                            ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                >
                    <PanelsTopLeft size={16} className="mr-2" />
                    {showPropertiesPanel ? "Hide Properties" : "Show Properties"}
                </button>
                <button
                    type="button"
                    onClick={handleClearCanvas}
                    className="flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                    <Trash2 size={16} className="mr-2" />
                    Clear Canvas
                </button>
                <button
                    type="button"
                    onClick={handleSaveWhiteboard}
                    disabled={saving}
                    className="flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-60"
                >
                    {saving ? (
                        <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                        <Save size={16} className="mr-2" />
                    )}
                    Save Whiteboard
                </button>
            </div>

            <div className="h-full w-full">
                <Excalidraw
                    excalidrawAPI={handleExcalidrawApi}
                    initialData={initialScene}
                    onChange={handleSceneChange}
                    onLibraryChange={handleLibraryChange}
                    theme="light"
                />
            </div>
        </div>
    );
};

export default WorkspaceWhiteboard;
