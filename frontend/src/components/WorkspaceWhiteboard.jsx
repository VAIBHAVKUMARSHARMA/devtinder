import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
    CirclePlus,
    GitBranchPlus,
    Link as LinkIcon,
    Loader2,
    Save,
    Trash2,
    Undo2
} from "lucide-react";
import toast from "react-hot-toast";
import { workspaceService } from "../services/workspaceService";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";
const NODE_WIDTH = 240;
const NODE_HEIGHT = 116;

const DEFAULT_WHITEBOARD_DATA = {
    nodes: [
        {
            id: "node_idea",
            title: "Idea",
            description: "Define problem and scope",
            color: "#2563eb",
            x: 140,
            y: 130
        },
        {
            id: "node_build",
            title: "Build",
            description: "Implement core features",
            color: "#16a34a",
            x: 460,
            y: 130
        },
        {
            id: "node_review",
            title: "Review",
            description: "Test, QA and feedback loop",
            color: "#ea580c",
            x: 780,
            y: 130
        }
    ],
    links: [
        {
            id: "link_idea_build",
            from: "node_idea",
            to: "node_build"
        },
        {
            id: "link_build_review",
            from: "node_build",
            to: "node_review"
        }
    ]
};

const createWhiteboardId = (prefix = "wb") =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeNodeColor = (color) => {
    if (typeof color !== "string") {
        return "#2563eb";
    }

    const trimmed = color.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "#2563eb";
};

const buildDefaultWhiteboardData = () => ({
    nodes: DEFAULT_WHITEBOARD_DATA.nodes.map((node) => ({ ...node })),
    links: DEFAULT_WHITEBOARD_DATA.links.map((link) => ({ ...link }))
});

const normalizeWhiteboardData = (whiteboardData) => {
    const candidateNodes = Array.isArray(whiteboardData?.nodes) ? whiteboardData.nodes : [];
    const normalizedNodes = candidateNodes
        .map((node) => {
            if (!node || typeof node !== "object") {
                return null;
            }

            const id = typeof node.id === "string" && node.id.trim()
                ? node.id
                : createWhiteboardId("node");
            const title = typeof node.title === "string" && node.title.trim()
                ? node.title.trim().slice(0, 120)
                : "Untitled Step";
            const description = typeof node.description === "string"
                ? node.description.slice(0, 400)
                : "";
            const x = Number.isFinite(Number(node.x)) ? clamp(Number(node.x), 0, 5000) : 120;
            const y = Number.isFinite(Number(node.y)) ? clamp(Number(node.y), 0, 5000) : 120;

            return {
                id,
                title,
                description,
                color: normalizeNodeColor(node.color),
                x,
                y
            };
        })
        .filter(Boolean);

    const nodes = normalizedNodes.length > 0
        ? normalizedNodes
        : buildDefaultWhiteboardData().nodes;
    const nodeIds = new Set(nodes.map((node) => node.id));

    const candidateLinks = Array.isArray(whiteboardData?.links) ? whiteboardData.links : [];
    const linkSeen = new Set();
    const links = candidateLinks
        .map((link) => {
            if (!link || typeof link !== "object") {
                return null;
            }

            const from = typeof link.from === "string" ? link.from : "";
            const to = typeof link.to === "string" ? link.to : "";

            if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to)) {
                return null;
            }

            const dedupeKey = `${from}->${to}`;
            if (linkSeen.has(dedupeKey)) {
                return null;
            }
            linkSeen.add(dedupeKey);

            return {
                id: typeof link.id === "string" && link.id.trim()
                    ? link.id
                    : createWhiteboardId("link"),
                from,
                to
            };
        })
        .filter(Boolean);

    return {
        nodes,
        links
    };
};

const WorkspaceWhiteboard = ({ workspaceId, initialWhiteboardData }) => {
    const initialNormalizedWhiteboardData = useMemo(
        () => normalizeWhiteboardData(initialWhiteboardData),
        [initialWhiteboardData]
    );

    const [whiteboardData, setWhiteboardData] = useState(initialNormalizedWhiteboardData);
    const [selectedNodeId, setSelectedNodeId] = useState(
        initialNormalizedWhiteboardData.nodes[0]?.id || ""
    );
    const [linkFrom, setLinkFrom] = useState("");
    const [linkTo, setLinkTo] = useState("");
    const [saving, setSaving] = useState(false);

    const viewportRef = useRef(null);
    const socketRef = useRef(null);
    const dragRef = useRef(null);
    const whiteboardDataRef = useRef(whiteboardData);
    const isRemoteChange = useRef(false);
    const remoteResetTimerRef = useRef(null);

    const selectedNode = useMemo(
        () => whiteboardData.nodes.find((node) => node.id === selectedNodeId) || null,
        [whiteboardData.nodes, selectedNodeId]
    );

    const nodeMap = useMemo(() => {
        const map = new Map();
        whiteboardData.nodes.forEach((node) => {
            map.set(node.id, node);
        });
        return map;
    }, [whiteboardData.nodes]);

    const canvasSize = useMemo(() => {
        const maxX = whiteboardData.nodes.reduce(
            (acc, node) => Math.max(acc, node.x + NODE_WIDTH + 220),
            1200
        );
        const maxY = whiteboardData.nodes.reduce(
            (acc, node) => Math.max(acc, node.y + NODE_HEIGHT + 240),
            900
        );

        return {
            width: maxX,
            height: maxY
        };
    }, [whiteboardData.nodes]);

    useEffect(() => {
        whiteboardDataRef.current = whiteboardData;
    }, [whiteboardData]);

    useEffect(() => {
        const nextData = initialNormalizedWhiteboardData;
        setWhiteboardData(nextData);
        setSelectedNodeId(nextData.nodes[0]?.id || "");
        setLinkFrom("");
        setLinkTo("");
    }, [workspaceId, initialNormalizedWhiteboardData]);

    useEffect(() => {
        if (!selectedNodeId && whiteboardData.nodes[0]) {
            setSelectedNodeId(whiteboardData.nodes[0].id);
            return;
        }

        if (selectedNodeId && !whiteboardData.nodes.some((node) => node.id === selectedNodeId)) {
            setSelectedNodeId(whiteboardData.nodes[0]?.id || "");
        }

        if (linkFrom && !whiteboardData.nodes.some((node) => node.id === linkFrom)) {
            setLinkFrom("");
        }

        if (linkTo && !whiteboardData.nodes.some((node) => node.id === linkTo)) {
            setLinkTo("");
        }
    }, [whiteboardData.nodes, selectedNodeId, linkFrom, linkTo]);

    const emitWhiteboardChange = useCallback((nextData) => {
        socketRef.current?.emit("whiteboard_change", {
            workspaceId,
            whiteboardData: nextData
        });
    }, [workspaceId]);

    const applyLocalChange = (updater) => {
        setWhiteboardData((previous) => {
            const candidate = typeof updater === "function" ? updater(previous) : updater;
            const next = normalizeWhiteboardData(candidate);
            whiteboardDataRef.current = next;

            if (!isRemoteChange.current) {
                emitWhiteboardChange(next);
            }

            return next;
        });
    };

    useEffect(() => {
        socketRef.current = io(SOCKET_URL, {
            withCredentials: true
        });

        socketRef.current.emit("join_workspace", workspaceId);

        socketRef.current.on("receive_whiteboard_change", (payload) => {
            if (payload.workspaceId !== workspaceId) {
                return;
            }

            isRemoteChange.current = true;
            const incoming = normalizeWhiteboardData(payload.whiteboardData);
            whiteboardDataRef.current = incoming;
            setWhiteboardData(incoming);

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
    }, [workspaceId, emitWhiteboardChange]);

    useEffect(() => {
        const handlePointerMove = (event) => {
            if (!dragRef.current || !viewportRef.current) {
                return;
            }

            const viewportRect = viewportRef.current.getBoundingClientRect();
            const nextX = clamp(
                event.clientX - viewportRect.left + viewportRef.current.scrollLeft - dragRef.current.offsetX,
                0,
                5000
            );
            const nextY = clamp(
                event.clientY - viewportRect.top + viewportRef.current.scrollTop - dragRef.current.offsetY,
                0,
                5000
            );

            dragRef.current.moved = true;
            setWhiteboardData((previous) => {
                const nextNodes = previous.nodes.map((node) =>
                    node.id === dragRef.current.nodeId
                        ? { ...node, x: nextX, y: nextY }
                        : node
                );
                const next = { ...previous, nodes: nextNodes };
                whiteboardDataRef.current = next;
                return next;
            });
        };

        const handlePointerUp = () => {
            if (!dragRef.current) {
                return;
            }

            const hadMove = dragRef.current.moved;
            dragRef.current = null;

            if (hadMove && !isRemoteChange.current) {
                emitWhiteboardChange(whiteboardDataRef.current);
            }
        };

        window.addEventListener("mousemove", handlePointerMove);
        window.addEventListener("mouseup", handlePointerUp);
        return () => {
            window.removeEventListener("mousemove", handlePointerMove);
            window.removeEventListener("mouseup", handlePointerUp);
        };
    }, [emitWhiteboardChange]);

    const handleNodeMouseDown = (event, node) => {
        if (!viewportRef.current) {
            return;
        }

        const viewportRect = viewportRef.current.getBoundingClientRect();
        dragRef.current = {
            nodeId: node.id,
            offsetX: event.clientX - viewportRect.left + viewportRef.current.scrollLeft - node.x,
            offsetY: event.clientY - viewportRect.top + viewportRef.current.scrollTop - node.y,
            moved: false
        };
        setSelectedNodeId(node.id);
    };

    const handleAddNode = () => {
        const viewport = viewportRef.current;
        const centerX = viewport ? viewport.scrollLeft + viewport.clientWidth / 2 - NODE_WIDTH / 2 : 160;
        const centerY = viewport ? viewport.scrollTop + viewport.clientHeight / 2 - NODE_HEIGHT / 2 : 140;

        const newNode = {
            id: createWhiteboardId("node"),
            title: `Step ${whiteboardData.nodes.length + 1}`,
            description: "Describe this stage of the flow",
            color: "#2563eb",
            x: clamp(Math.round(centerX), 0, 5000),
            y: clamp(Math.round(centerY), 0, 5000)
        };

        applyLocalChange((previous) => ({
            ...previous,
            nodes: [...previous.nodes, newNode]
        }));
        setSelectedNodeId(newNode.id);
    };

    const handleDeleteSelectedNode = () => {
        if (!selectedNode) {
            return;
        }

        const confirmed = window.confirm(`Delete "${selectedNode.title}" from whiteboard?`);
        if (!confirmed) {
            return;
        }

        const nodeIdToDelete = selectedNode.id;
        const nextNodes = whiteboardData.nodes.filter((node) => node.id !== nodeIdToDelete);
        const nextLinks = whiteboardData.links.filter(
            (link) => link.from !== nodeIdToDelete && link.to !== nodeIdToDelete
        );

        const nextData = normalizeWhiteboardData({
            nodes: nextNodes,
            links: nextLinks
        });

        setWhiteboardData(nextData);
        whiteboardDataRef.current = nextData;
        setSelectedNodeId(nextData.nodes[0]?.id || "");
        if (!isRemoteChange.current) {
            emitWhiteboardChange(nextData);
        }
    };

    const handleSelectedNodeChange = (field, value) => {
        if (!selectedNode) {
            return;
        }

        applyLocalChange((previous) => ({
            ...previous,
            nodes: previous.nodes.map((node) =>
                node.id === selectedNode.id
                    ? { ...node, [field]: value }
                    : node
            )
        }));
    };

    const handleCreateLink = () => {
        if (!linkFrom || !linkTo) {
            toast.error("Select source and target nodes");
            return;
        }

        if (linkFrom === linkTo) {
            toast.error("Source and target cannot be the same");
            return;
        }

        const duplicate = whiteboardData.links.some(
            (link) => link.from === linkFrom && link.to === linkTo
        );
        if (duplicate) {
            toast.error("This connection already exists");
            return;
        }

        applyLocalChange((previous) => ({
            ...previous,
            links: [
                ...previous.links,
                {
                    id: createWhiteboardId("link"),
                    from: linkFrom,
                    to: linkTo
                }
            ]
        }));

        setLinkTo("");
    };

    const handleDeleteLink = (linkId) => {
        applyLocalChange((previous) => ({
            ...previous,
            links: previous.links.filter((link) => link.id !== linkId)
        }));
    };

    const handleResetBoard = () => {
        const confirmed = window.confirm("Reset whiteboard to starter flow?");
        if (!confirmed) {
            return;
        }

        const nextData = buildDefaultWhiteboardData();
        setWhiteboardData(nextData);
        whiteboardDataRef.current = nextData;
        setSelectedNodeId(nextData.nodes[0]?.id || "");
        setLinkFrom("");
        setLinkTo("");
        if (!isRemoteChange.current) {
            emitWhiteboardChange(nextData);
        }
    };

    const handleSaveWhiteboard = async () => {
        try {
            setSaving(true);
            const normalized = normalizeWhiteboardData(whiteboardDataRef.current);
            await workspaceService.saveWorkspaceWhiteboard(workspaceId, {
                whiteboardData: normalized
            });
            toast.success("Whiteboard saved successfully!");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save whiteboard");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="h-full flex flex-col xl:flex-row bg-[#0f172a]">
            <aside className="w-full xl:w-80 shrink-0 border-b xl:border-b-0 xl:border-r border-slate-700 bg-[#0b1220] flex flex-col">
                <div className="p-4 border-b border-slate-700">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
                        Flow Whiteboard
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                        Map project steps and dependencies.
                    </p>
                </div>

                <div className="p-4 border-b border-slate-700 space-y-2">
                    <button
                        type="button"
                        onClick={handleAddNode}
                        className="w-full flex items-center justify-center text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-2 rounded transition-colors"
                    >
                        <CirclePlus size={16} className="mr-2" />
                        Add Step
                    </button>
                    <button
                        type="button"
                        onClick={handleDeleteSelectedNode}
                        disabled={!selectedNode}
                        className="w-full flex items-center justify-center text-sm bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 px-3 py-2 rounded transition-colors disabled:opacity-50"
                    >
                        <Trash2 size={16} className="mr-2" />
                        Delete Selected Step
                    </button>
                </div>

                <div className="p-4 border-b border-slate-700 space-y-3">
                    <div className="flex items-center text-slate-200 text-sm font-medium">
                        <GitBranchPlus size={15} className="mr-2" />
                        Create Connection
                    </div>
                    <select
                        value={linkFrom}
                        onChange={(event) => setLinkFrom(event.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
                    >
                        <option value="">From step</option>
                        {whiteboardData.nodes.map((node) => (
                            <option key={`from-${node.id}`} value={node.id}>
                                {node.title}
                            </option>
                        ))}
                    </select>
                    <select
                        value={linkTo}
                        onChange={(event) => setLinkTo(event.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
                    >
                        <option value="">To step</option>
                        {whiteboardData.nodes.map((node) => (
                            <option key={`to-${node.id}`} value={node.id}>
                                {node.title}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={handleCreateLink}
                        className="w-full flex items-center justify-center text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-2 rounded transition-colors"
                    >
                        <LinkIcon size={14} className="mr-2" />
                        Add Connection
                    </button>
                </div>

                <div className="p-4 border-b border-slate-700 space-y-2 max-h-44 overflow-y-auto">
                    <h4 className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Connections</h4>
                    {whiteboardData.links.length === 0 ? (
                        <p className="text-xs text-slate-500">No links created yet.</p>
                    ) : (
                        <ul className="space-y-1.5">
                            {whiteboardData.links.map((link) => {
                                const fromTitle = nodeMap.get(link.from)?.title || "Unknown";
                                const toTitle = nodeMap.get(link.to)?.title || "Unknown";

                                return (
                                    <li
                                        key={link.id}
                                        className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs"
                                    >
                                        <span className="text-slate-300 truncate" title={`${fromTitle} -> ${toTitle}`}>
                                            {`${fromTitle} -> ${toTitle}`}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteLink(link.id)}
                                            className="text-rose-300 hover:text-rose-200"
                                            title="Delete connection"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="p-4 border-b border-slate-700 space-y-2 flex-1 min-h-0 overflow-y-auto">
                    <h4 className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Selected Step</h4>
                    {selectedNode ? (
                        <>
                            <input
                                type="text"
                                value={selectedNode.title}
                                onChange={(event) => handleSelectedNodeChange("title", event.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary"
                                placeholder="Step title"
                            />
                            <textarea
                                value={selectedNode.description}
                                onChange={(event) => handleSelectedNodeChange("description", event.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary min-h-24 resize-y"
                                placeholder="Step notes"
                            />
                            <div className="flex items-center justify-between gap-3">
                                <label className="text-xs text-slate-400">Color</label>
                                <input
                                    type="color"
                                    value={selectedNode.color}
                                    onChange={(event) => handleSelectedNodeChange("color", event.target.value)}
                                    className="h-9 w-14 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                                />
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-slate-500">Select a step card to edit details.</p>
                    )}
                </div>

                <div className="p-4 space-y-2 border-t border-slate-700">
                    <button
                        type="button"
                        onClick={handleSaveWhiteboard}
                        disabled={saving}
                        className="w-full flex items-center justify-center text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded transition-colors disabled:opacity-50"
                    >
                        {saving ? (
                            <Loader2 size={16} className="animate-spin mr-2" />
                        ) : (
                            <Save size={16} className="mr-2" />
                        )}
                        Save Whiteboard
                    </button>
                    <button
                        type="button"
                        onClick={handleResetBoard}
                        className="w-full flex items-center justify-center text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 px-3 py-2 rounded transition-colors"
                    >
                        <Undo2 size={16} className="mr-2" />
                        Reset Starter Flow
                    </button>
                </div>
            </aside>

            <div ref={viewportRef} className="flex-1 min-h-0 overflow-auto bg-[#0f172a]">
                <div
                    className="relative"
                    style={{
                        width: `${canvasSize.width}px`,
                        height: `${canvasSize.height}px`,
                        backgroundImage:
                            "radial-gradient(rgba(148,163,184,0.25) 1px, transparent 1px)",
                        backgroundSize: "24px 24px"
                    }}
                >
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        <defs>
                            <marker
                                id="whiteboard-arrow"
                                markerWidth="10"
                                markerHeight="10"
                                refX="8"
                                refY="3"
                                orient="auto"
                            >
                                <path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" />
                            </marker>
                        </defs>
                        {whiteboardData.links.map((link) => {
                            const fromNode = nodeMap.get(link.from);
                            const toNode = nodeMap.get(link.to);

                            if (!fromNode || !toNode) {
                                return null;
                            }

                            const x1 = fromNode.x + NODE_WIDTH;
                            const y1 = fromNode.y + NODE_HEIGHT / 2;
                            const x2 = toNode.x;
                            const y2 = toNode.y + NODE_HEIGHT / 2;
                            const controlOffset = Math.max(60, Math.abs(x2 - x1) * 0.25);
                            const d = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;

                            return (
                                <g key={link.id}>
                                    <path
                                        d={d}
                                        fill="none"
                                        stroke="#94a3b8"
                                        strokeWidth="2.2"
                                        markerEnd="url(#whiteboard-arrow)"
                                    />
                                </g>
                            );
                        })}
                    </svg>

                    {whiteboardData.nodes.map((node) => (
                        <button
                            key={node.id}
                            type="button"
                            onMouseDown={(event) => handleNodeMouseDown(event, node)}
                            onClick={() => setSelectedNodeId(node.id)}
                            className={`absolute text-left rounded-lg border shadow-xl p-3 cursor-move select-none transition-colors ${selectedNodeId === node.id
                                ? "border-white ring-2 ring-primary"
                                : "border-slate-700 hover:border-slate-500"
                                }`}
                            style={{
                                left: `${node.x}px`,
                                top: `${node.y}px`,
                                width: `${NODE_WIDTH}px`,
                                height: `${NODE_HEIGHT}px`,
                                background: "rgba(15, 23, 42, 0.95)"
                            }}
                        >
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span
                                    className="inline-block h-3 w-3 rounded-full"
                                    style={{ backgroundColor: node.color }}
                                />
                                <span className="text-[10px] uppercase tracking-wide text-slate-400">Drag</span>
                            </div>
                            <p className="font-semibold text-slate-100 text-sm truncate">{node.title}</p>
                            <p
                                className="text-xs text-slate-400 mt-1 overflow-hidden"
                                style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical"
                                }}
                            >
                                {node.description || "No notes yet"}
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default WorkspaceWhiteboard;
