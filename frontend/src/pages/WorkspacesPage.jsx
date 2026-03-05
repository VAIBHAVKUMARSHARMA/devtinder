import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { workspaceService } from "../services/workspaceService";
import { Plus, Layout, Users, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

const WorkspacesPage = () => {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newWorkspace, setNewWorkspace] = useState({ name: "", description: "", playValue: 0 });

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    const fetchWorkspaces = async () => {
        try {
            const response = await workspaceService.getWorkspaces();
            setWorkspaces(response.data.workspaces);
        } catch {
            toast.error("Failed to load workspaces");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newWorkspace.name) {
            toast.error("Workspace name is required");
            return;
        }

        setCreating(true);
        try {
            await workspaceService.createWorkspace(newWorkspace);
            toast.success("Workspace created successfully!");
            setShowCreateModal(false);
            setNewWorkspace({ name: "", description: "", playValue: 0 });
            fetchWorkspaces();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to create workspace");
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[500px]">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent flex items-center">
                        <Layout className="mr-3 text-primary" size={32} />
                        Your Workspaces
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Collaborate on projects, manage tasks, and track progress together.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium flex items-center transition-colors shadow-sm"
                >
                    <Plus size={20} className="mr-2" />
                    New Workspace
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workspaces.length === 0 ? (
                    <div className="col-span-full text-center py-16 bg-card rounded-xl border shadow-sm">
                        <Layout className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                        <h3 className="text-xl font-semibold mb-2">No workspaces yet</h3>
                        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                            Create your first workspace to start organizing tasks and collaborating with your team.
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-md font-medium transition-colors"
                        >
                            Create a Workspace
                        </button>
                    </div>
                ) : (
                    workspaces.map((workspace) => (
                        <Link
                            key={workspace._id}
                            to={`/workspaces/${workspace._id}`}
                            className="group block bg-card rounded-xl border shadow-sm hover:shadow-md hover:border-primary/50 transition-all p-6 relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-1 h-full bg-primary/80 group-hover:bg-primary transition-colors"></div>
                            <h3 className="text-xl font-semibold mb-2 line-clamp-1">{workspace.name}</h3>
                            <p className="text-muted-foreground text-sm mb-6 line-clamp-2 h-10">
                                {workspace.description || "No description provided."}
                            </p>
                            <p className="text-sm mb-4">
                                Play Value: <span className="font-semibold">Rs {Number(workspace.playValue || 0).toFixed(2)}</span>
                            </p>

                            <div className="flex items-center justify-between mt-auto">
                                <div className="flex items-center text-sm text-muted-foreground">
                                    <Users size={16} className="mr-1.5" />
                                    <span>{workspace.members?.length || 1} members</span>
                                </div>
                                <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                                    {format(new Date(workspace.createdAt), "MMM d, yyyy")}
                                </span>
                            </div>
                        </Link>
                    ))
                )}
            </div>

            {/* Create Workspace Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200 border">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">Create Workspace</h2>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-muted-foreground hover:text-foreground hover:bg-secondary p-1 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    Workspace Name <span className="text-destructive">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newWorkspace.name}
                                    onChange={(e) => setNewWorkspace({ ...newWorkspace, name: e.target.value })}
                                    className="w-full p-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                    placeholder="e.g., E-commerce Platform"
                                    autoFocus
                                    maxLength={100}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    Description
                                </label>
                                <textarea
                                    value={newWorkspace.description}
                                    onChange={(e) => setNewWorkspace({ ...newWorkspace, description: e.target.value })}
                                    className="w-full p-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none min-h-[100px] resize-y transition-all"
                                    placeholder="What is this workspace for?"
                                    maxLength={1000}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5">
                                    Play Value (INR)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={newWorkspace.playValue}
                                    onChange={(e) => setNewWorkspace({ ...newWorkspace, playValue: e.target.value })}
                                    className="w-full p-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                    placeholder="e.g., 99"
                                />
                            </div>

                            <div className="flex justify-end pt-6 space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 border rounded-lg hover:bg-secondary font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center disabled:opacity-70"
                                >
                                    {creating && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                                    Create Workspace
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkspacesPage;
