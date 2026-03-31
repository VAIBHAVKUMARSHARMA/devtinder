import React, { useState, useEffect } from "react";
import { workspaceService } from "../services/workspaceService";
import { format } from "date-fns";
import { Loader2, History, RotateCcw, Plus } from "lucide-react";
import toast from "react-hot-toast";

const WorkspaceHistory = ({ workspaceId, onWorkspaceRefresh }) => {
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState(null);

    const fetchSnapshots = async () => {
        try {
            setLoading(true);
            const res = await workspaceService.getWorkspaceSnapshots(workspaceId);
            setSnapshots(res.data.snapshots);
        } catch (error) {
            toast.error("Failed to load snapshots");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSnapshots();
    }, [workspaceId]);

    const handleCreateSnapshot = async () => {
        const name = window.prompt("Enter a name for this snapshot:", `Snapshot ${new Date().toLocaleTimeString()}`);
        if (!name) return;

        try {
            setCreating(true);
            await workspaceService.createWorkspaceSnapshot(workspaceId, { name });
            toast.success("Snapshot created successfully!");
            fetchSnapshots();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to create snapshot");
        } finally {
            setCreating(false);
        }
    };

    const handleRestoreSnapshot = async (snapshotId, name) => {
        if (!window.confirm(`Are you sure you want to restore "${name}"? This will overwrite the current shared outputs of Code and Whiteboard.`)) {
            return;
        }

        try {
            setRestoring(snapshotId);
            await workspaceService.restoreWorkspaceSnapshot(workspaceId, snapshotId);
            toast.success("Workspace restored successfully!");
            if (onWorkspaceRefresh) onWorkspaceRefresh();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to restore snapshot");
        } finally {
            setRestoring(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[400px]">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold flex items-center">
                        <History className="mr-2 text-primary" size={24} />
                        Version History
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Create snapshots of your workspace (Code and Whiteboard) and restore them anytime.
                    </p>
                </div>
                <button
                    onClick={handleCreateSnapshot}
                    disabled={creating}
                    className="flex items-center bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
                >
                    {creating ? <Loader2 size={16} className="animate-spin mr-2" /> : <Plus size={16} className="mr-2" />}
                    Create Snapshot
                </button>
            </div>

            <div className="bg-card rounded-lg border shadow-sm overflow-hidden flex-1 flex flex-col">
                <div className="grid grid-cols-12 gap-4 p-4 border-b bg-muted/50 text-sm font-semibold text-muted-foreground">
                    <div className="col-span-5">Name</div>
                    <div className="col-span-3">Created By</div>
                    <div className="col-span-3">Date</div>
                    <div className="col-span-1 text-right">Action</div>
                </div>

                <div className="overflow-y-auto flex-1 p-2 space-y-2">
                    {snapshots.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <History size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No snapshots found. Create one to save your progress!</p>
                        </div>
                    ) : (
                        snapshots.map((snapshot) => (
                            <div key={snapshot._id} className="grid grid-cols-12 gap-4 p-3 rounded-md hover:bg-secondary/50 items-center border border-transparent hover:border-border transition-colors">
                                <div className="col-span-5 flex flex-col">
                                    <span className="font-medium text-foreground">{snapshot.name}</span>
                                    {snapshot.description && <span className="text-xs text-muted-foreground line-clamp-1">{snapshot.description}</span>}
                                </div>
                                <div className="col-span-3 flex items-center">
                                    {snapshot.createdBy && (
                                        <>
                                            <img
                                                src={snapshot.createdBy.profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${snapshot.createdBy._id}`}
                                                alt={snapshot.createdBy.name}
                                                className="w-6 h-6 rounded-full mr-2 border"
                                            />
                                            <span className="text-sm">{snapshot.createdBy.name}</span>
                                        </>
                                    )}
                                </div>
                                <div className="col-span-3 text-sm text-muted-foreground">
                                    {format(new Date(snapshot.createdAt), "MMM d, yyyy h:mm a")}
                                </div>
                                <div className="col-span-1 flex justify-end">
                                    <button
                                        onClick={() => handleRestoreSnapshot(snapshot._id, snapshot.name)}
                                        disabled={restoring === snapshot._id}
                                        className="text-primary hover:bg-primary/10 p-2 rounded-md transition-colors"
                                        title="Restore this snapshot"
                                    >
                                        {restoring === snapshot._id ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <RotateCcw size={16} />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default WorkspaceHistory;
