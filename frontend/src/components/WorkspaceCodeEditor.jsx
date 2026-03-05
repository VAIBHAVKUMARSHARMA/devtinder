import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Loader2, Save, CreditCard } from "lucide-react";
import { io } from "socket.io-client";
import { workspaceService } from "../services/workspaceService";
import toast from "react-hot-toast";

const SOCKET_URL = import.meta.env.MODE === "development" ? "http://localhost:3000" : "/";

const loadRazorpayScript = () =>
    new Promise((resolve) => {
        if (window.Razorpay) {
            resolve(true);
            return;
        }

        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });

const WorkspaceCodeEditor = ({ workspaceId, initialCode, playValue = 0, ownerId, currentUserId }) => {
    const [code, setCode] = useState(initialCode || '// Write your code here...\n\nconsole.log("Welcome to your Collaborative Workspace!");\n');
    const [saving, setSaving] = useState(false);
    const [paying, setPaying] = useState(false);
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

    const handlePay = async () => {
        if (!playValue || Number(playValue) <= 0) {
            toast.error("Play value is not set for this workspace");
            return;
        }

        if (ownerId === currentUserId) {
            toast.error("Workspace owner cannot pay themselves");
            return;
        }

        try {
            setPaying(true);

            const scriptLoaded = await loadRazorpayScript();
            if (!scriptLoaded) {
                toast.error("Failed to load Razorpay Checkout");
                return;
            }

            const orderResponse = await workspaceService.createPaymentOrder(workspaceId);
            const orderData = orderResponse?.data;

            const options = {
                key: orderData.key,
                amount: orderData.amount,
                currency: orderData.currency,
                name: "Workspace Payment",
                description: "Payment for workspace contribution",
                order_id: orderData.orderId,
                handler: async function (response) {
                    try {
                        await workspaceService.verifyPayment(response);
                        toast.success("Payment successful and verified!");
                    } catch (error) {
                        toast.error(error.response?.data?.message || "Payment verification failed");
                    }
                },
                modal: {
                    ondismiss: function () {
                        toast("Payment cancelled");
                    }
                },
                theme: {
                    color: "#3b82f6"
                }
            };

            const razorpay = new window.Razorpay(options);
            razorpay.on("payment.failed", function () {
                toast.error("Payment failed");
            });
            razorpay.open();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to start payment");
        } finally {
            setPaying(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e]">
            <div className="flex justify-between items-center p-3 bg-[#2d2d2d] border-b border-[#404040] gap-2">
                <div className="text-sm text-gray-300 font-mono">
                    main.js
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSaveCode}
                        disabled={saving}
                        className="flex items-center text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                        Save to DB
                    </button>
                    {ownerId !== currentUserId && Number(playValue) > 0 && (
                        <button
                            onClick={handlePay}
                            disabled={paying}
                            className="flex items-center text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                        >
                            {paying ? <Loader2 size={16} className="animate-spin mr-2" /> : <CreditCard size={16} className="mr-2" />}
                            Pay Rs {Number(playValue).toFixed(2)}
                        </button>
                    )}
                </div>
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
