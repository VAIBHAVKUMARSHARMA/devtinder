import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Loader2, Save } from "lucide-react";
import { io } from "socket.io-client";
import { workspaceService } from "../services/workspaceService";
import toast from "react-hot-toast";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

const WorkspaceCodeEditor = ({ workspaceId, initialCode }) => {
    const [code, setCode] = useState(initialCode || '// Write your code here...\n\nconsole.log("Welcome to your Collaborative Workspace!");\n');
    const [saving, setSaving] = useState(false);
    const socketRef = useRef(null);
    const editorRef = useRef(null);

    // Track if a change is remote so we don't broadcast it back
    const isRemoteChange = useRef(false);

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
                setCode(data.code);
            }
        });

        return () => {
            socketRef.current.disconnect();
        };
    }, [workspaceId]);

    const handleEditorDidMount = (editor) => {
        editorRef.current = editor;
    };

    const handleEditorChange = (value) => {
        // If this change originated from a remote update, don't broadcast it
        if (isRemoteChange.current) {
            isRemoteChange.current = false; // Reset the flag after handling the remote change
            setCode(value);
            return;
        }

        // This is a local change, broadcast it
        setCode(value);
        socketRef.current.emit("code_change", {
            workspaceId,
            code: value
        });
    };

    const handleSaveCode = async () => {
        try {
            setSaving(true);
            await workspaceService.saveWorkspaceCode(workspaceId, code);
            toast.success("Code saved successfully!");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save code");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e]">
            <div className="flex justify-between items-center p-3 bg-[#2d2d2d] border-b border-[#404040] gap-2">
                <div className="text-sm text-gray-300 font-mono">
                    main.js
                </div>
                <button
                    onClick={handleSaveCode}
                    disabled={saving}
                    className="flex items-center text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                >
                    {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                    Save to DB
                </button>
            </div>

            <div className="flex-1 overflow-hidden">
                <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    value={code}
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 16 }
                    }}
                />
            </div>
        </div>
    );
};

export default WorkspaceCodeEditor;
