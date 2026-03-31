import React, { useState, useMemo } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { X, Check, FileDiff, FilePlus, FileMinus } from "lucide-react";

const getLanguageFromPath = (path) => {
    const name = path.split("/").pop();
    const dotIndex = name.lastIndexOf(".");
    const ext = dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
    const map = {
        js: "javascript", jsx: "javascript",
        ts: "typescript", tsx: "typescript",
        html: "html", css: "css", json: "json"
    };
    return map[ext] || "plaintext";
};

const DraftDiffViewer = ({ draftFiles, sharedFiles, onClose, onConfirm, isMerging }) => {
    const diffs = useMemo(() => {
        const changes = [];
        const draftMap = new Map();
        const sharedMap = new Map();
        draftFiles.forEach((f) => draftMap.set(f.path, f));
        sharedFiles.forEach((f) => sharedMap.set(f.path, f));

        draftFiles.forEach((draftFile) => {
            if (draftFile.type === "folder") return;
            const sharedFile = sharedMap.get(draftFile.path);

            if (!sharedFile) {
                changes.push({
                    path: draftFile.path,
                    status: "added",
                    original: "",
                    modified: draftFile.content || "",
                });
            } else if (sharedFile.content !== draftFile.content) {
                changes.push({
                    path: draftFile.path,
                    status: "modified",
                    original: sharedFile.content || "",
                    modified: draftFile.content || "",
                });
            }
        });

        sharedFiles.forEach((sharedFile) => {
            if (sharedFile.type === "folder") return;
            const draftFile = draftMap.get(sharedFile.path);
            if (!draftFile) {
                changes.push({
                    path: sharedFile.path,
                    status: "removed",
                    original: sharedFile.content || "",
                    modified: "",
                });
            }
        });

        return changes.sort((a, b) => a.path.localeCompare(b.path));
    }, [draftFiles, sharedFiles]);

    const [activeDiff, setActiveDiff] = useState(diffs[0] || null);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-[#0b1220] border border-slate-700 shadow-xl rounded-xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between shrink-0 bg-[#0f172a]">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center">
                            Review Draft Changes
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">
                            {diffs.length === 0
                                ? "No changes between your draft and the shared output."
                                : `Review ${diffs.length} changed file${diffs.length > 1 ? "s" : ""} before merging.`}
                        </p>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white transition-colors p-2 rounded-md hover:bg-slate-800"
                            disabled={isMerging}
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 border-r border-slate-700 bg-[#0f172a] overflow-y-auto shrink-0 flex flex-col">
                        <div className="p-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                            Changed Files
                        </div>
                        <div className="flex-1 p-2 space-y-1">
                            {diffs.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">
                                    No changes detected.
                                </div>
                            ) : (
                                diffs.map((diff) => (
                                    <button
                                        key={diff.path}
                                        onClick={() => setActiveDiff(diff)}
                                        className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors text-left truncate
                                            ${activeDiff?.path === diff.path ? "bg-slate-800 text-white" : "hover:bg-slate-800/50 text-slate-300"}
                                        `}
                                    >
                                        {diff.status === "added" && <FilePlus size={14} className="mr-2 text-green-400 shrink-0" />}
                                        {diff.status === "removed" && <FileMinus size={14} className="mr-2 text-red-400 shrink-0" />}
                                        {diff.status === "modified" && <FileDiff size={14} className="mr-2 text-amber-400 shrink-0" />}
                                        <span className="truncate">{diff.path}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 flex flex-col bg-[#1e1e1e] relative min-w-0">
                        {activeDiff ? (
                            <>
                                <div className="h-10 bg-[#252526] border-b border-[#333] flex items-center px-4 shrink-0 shadow-sm z-10">
                                    <div className="text-sm font-medium text-slate-300 flex items-center">
                                        <span className="text-rose-400 mr-2">Shared (Server)</span>
                                        <span className="text-slate-500 mx-2 text-xs">VS</span>
                                        <span className="text-emerald-400">My Draft</span>
                                        <span className="ml-4 px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400">
                                            {activeDiff.path}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0 relative">
                                    <DiffEditor
                                        height="100%"
                                        language={getLanguageFromPath(activeDiff.path)}
                                        theme="vs-dark"
                                        original={activeDiff.original}
                                        modified={activeDiff.modified}
                                        options={{
                                            renderSideBySide: true,
                                            readOnly: true,
                                            minimap: { enabled: false },
                                            wordWrap: "on",
                                            ignoreTrimWhitespace: false,
                                        }}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-500">
                                Select a file from the sidebar to view diff
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-700 bg-[#0f172a] flex justify-end space-x-3 shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isMerging}
                        className="px-4 py-2 rounded-md font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isMerging || diffs.length === 0}
                        className="px-4 py-2 rounded-md font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isMerging ? (
                            "Merging..."
                        ) : (
                            <>
                                <Check size={18} className="mr-2" />
                                Confirm Merge
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DraftDiffViewer;
