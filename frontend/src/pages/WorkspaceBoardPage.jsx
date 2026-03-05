import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { workspaceService } from "../services/workspaceService";
import { taskService } from "../services/taskService";
import connectionService from "../services/connectionService";
import {
    Loader2,
    Plus,
    MoreVertical,
    Calendar,
    User,
    ArrowLeft,
    Layout,
    Users,
    Trash2,
    X,
    UserPlus,
    Code,
    CheckSquare
} from "lucide-react";

import toast from "react-hot-toast";
import { format } from "date-fns";
import WorkspaceCodeEditor from "../components/WorkspaceCodeEditor";

const COLUMNS = ["Todo", "In Progress", "Done"];

const WorkspaceBoardPage = () => {
    const { id: workspaceId } = useParams();
    const navigate = useNavigate();
    const { user } = useSelector((state) => state.auth);
    const [workspace, setWorkspace] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draggedTask, setDraggedTask] = useState(null);
    const [activeTab, setActiveTab] = useState("board"); // 'board' or 'code'

    // Modal state
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [modalMode, setModalMode] = useState("create"); // 'create' or 'edit'
    const [selectedTask, setSelectedTask] = useState(null);
    const [taskFormData, setTaskFormData] = useState({
        title: "",
        description: "",
        status: "Todo",
        assigneeId: "",
    });
    const [saving, setSaving] = useState(false);

    // Invite Modal state
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [connections, setConnections] = useState([]);
    const [loadingConnections, setLoadingConnections] = useState(false);
    const [invitingUserId, setInvitingUserId] = useState(null);

    useEffect(() => {
        fetchBoardData();
    }, [workspaceId]);

    const fetchBoardData = async () => {
        try {
            setLoading(true);
            const [workspaceRes, tasksRes] = await Promise.all([
                workspaceService.getWorkspaceDetails(workspaceId),
                taskService.getWorkspaceTasks(workspaceId),
            ]);
            setWorkspace(workspaceRes.data.workspace);
            setTasks(tasksRes.data.tasks);
        } catch {
            toast.error("Failed to load workspace data");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenInviteModal = async () => {
        setShowInviteModal(true);
        setLoadingConnections(true);
        try {
            const res = await connectionService.getConnections();
            if (res.success && res.connections) {
                // Filter out users who are already in the workspace or already invited
                const existingMemberIds = new Set(workspace.members.map(m => m._id));
                const pendingMemberIds = new Set(workspace.pendingMembers?.map(m => typeof m === 'object' ? m._id : m) || []);

                console.log("Raw connections response:", res.connections);

                // Filter out users who are already in the workspace or already invited
                const availableUsers = res.connections.filter(u => u && !existingMemberIds.has(u._id) && !pendingMemberIds.has(u._id));

                setConnections(availableUsers);
            }
        } catch {
            toast.error("Failed to load connections");
        } finally {
            setLoadingConnections(false);
        }
    };

    const handleInviteMember = async (userId) => {
        setInvitingUserId(userId);
        try {
            console.log("Adding member with workspaceId:", workspaceId, "and userId:", userId);
            await workspaceService.addMember(workspaceId, userId);
            toast.success("Member added to workspace!");

            // Remove user from the available connections list locally
            setConnections(connections.filter(c => c._id !== userId));

            // Refresh workspace to show new member avatar
            fetchBoardData();
        } catch (error) {
            console.error("API Error when adding member:", error.response?.data || error.message);
            toast.error(error.response?.data?.message || "Failed to add member");
        } finally {
            setInvitingUserId(null);
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e, task) => {
        setDraggedTask(task);
        e.dataTransfer.effectAllowed = "move";
        // Slightly delay hiding original element for better visual effect
        setTimeout(() => {
            e.target.style.opacity = "0.5";
        }, 0);
    };

    const handleDragEnd = (e) => {
        e.target.style.opacity = "1";
        setDraggedTask(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e, targetStatus) => {
        e.preventDefault();
        if (!draggedTask || draggedTask.status === targetStatus) return;

        // Optimistic UI update
        const previousTasks = [...tasks];
        const updatedTasks = tasks.map((t) =>
            t._id === draggedTask._id ? { ...t, status: targetStatus } : t
        );
        setTasks(updatedTasks);

        try {
            await taskService.updateTask(draggedTask._id, { status: targetStatus });
            // Let the background fetch sync it up eventually, or we could fetchBoardData()
            // We'll just rely on the optimistic update to keep it snappy.
        } catch {
            toast.error("Failed to update task status");
            setTasks(previousTasks); // revert
        }
    };

    // --- Modal Handlers ---
    const openCreateModal = (status = "Todo") => {
        setModalMode("create");
        setSelectedTask(null);
        setTaskFormData({
            title: "",
            description: "",
            status,
            assigneeId: "",
        });
        setShowTaskModal(true);
    };

    const openEditModal = (task) => {
        setModalMode("edit");
        setSelectedTask(task);
        setTaskFormData({
            title: task.title,
            description: task.description || "",
            status: task.status,
            assigneeId: task.assignee?._id || "",
        });
        setShowTaskModal(true);
    };

    const handleSaveTask = async (e) => {
        e.preventDefault();
        if (!taskFormData.title) {
            toast.error("Task title is required");
            return;
        }

        setSaving(true);
        try {
            if (modalMode === "create") {
                await taskService.createTask({
                    ...taskFormData,
                    workspaceId,
                });
                toast.success("Task created!");
            } else {
                await taskService.updateTask(selectedTask._id, taskFormData);
                toast.success("Task updated!");
            }
            setShowTaskModal(false);
            fetchBoardData(); // Refresh to get populated assignee / createdBy
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to save task");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            await taskService.deleteTask(taskId);
            toast.success("Task deleted");
            setTasks(tasks.filter((t) => t._id !== taskId));
            setShowTaskModal(false);
        } catch {
            toast.error("Failed to delete task");
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!window.confirm("Are you sure you want to permanently delete this workspace and ALL associated tasks? This action cannot be undone.")) return;

        try {
            await workspaceService.deleteWorkspace(workspaceId);
            toast.success("Workspace deleted successfully");
            navigate("/workspaces"); // redirect to list
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to delete workspace");
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[500px]">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    if (!workspace) {
        return (
            <div className="container mx-auto px-4 py-8 text-center">
                <h2 className="text-2xl font-bold">Workspace not found</h2>
                <Link to="/workspaces" className="text-primary mt-4 inline-block hover:underline">
                    Back to Workspaces
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
            {/* Board Header */}
            <div className="border-b bg-card px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
                <div className="flex items-center">
                    <Link
                        to="/workspaces"
                        className="mr-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-secondary"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center">
                            <Layout className="mr-2 text-primary" size={24} />
                            {workspace.name}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1 max-w-xl">
                            {workspace.description || "Collaborative Workspace"}
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-secondary p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab("board")}
                        className={`flex items-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "board"
                                ? "bg-background shadow text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <CheckSquare size={16} className="mr-2" />
                        Tasks
                    </button>
                    <button
                        onClick={() => setActiveTab("code")}
                        className={`flex items-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "code"
                                ? "bg-background shadow text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        <Code size={16} className="mr-2" />
                        Code
                    </button>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex -space-x-2">
                        {workspace.members.slice(0, 5).map((member) => (
                            <img
                                key={member._id}
                                src={member.profilePicture || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + member._id}
                                alt={member.name}
                                className="w-8 h-8 rounded-full border-2 border-background object-cover"
                                title={member.name}
                            />
                        ))}
                        {workspace.members.length > 5 && (
                            <div className="w-8 h-8 rounded-full border-2 border-background bg-secondary flex items-center justify-center text-xs font-medium z-10">
                                +{workspace.members.length - 5}
                            </div>
                        )}
                        {/* Only owner should ideally see this, but we'll show it generally and backend will block if unauthorized */}
                        <button
                            onClick={handleOpenInviteModal}
                            className="w-8 h-8 rounded-full border-2 border-dashed border-primary flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 transition-colors z-20 ml-2"
                            title="Invite Member"
                        >
                            <UserPlus size={14} />
                        </button>
                    </div>
                    {workspace.owner?._id === user?._id && (
                        <button
                            onClick={handleDeleteWorkspace}
                            className="text-destructive hover:bg-destructive/10 p-2 rounded-md transition-colors border border-destructive/20 flex items-center"
                            title="Delete Workspace"
                        >
                            <Trash2 size={18} />
                        </button>
                    )}
                    <button
                        onClick={() => openCreateModal()}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium flex items-center shadow-sm"
                    >
                        <Plus size={18} className="mr-2" />
                        Add Task
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            {activeTab === "board" ? (
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                    <div className="flex h-full space-x-6 min-w-max">
                        {COLUMNS.map((columnStatus) => (
                            <div
                                key={columnStatus}
                                className="bg-secondary/50 rounded-xl w-[350px] flex flex-col h-full border border-border/50 shadow-inner"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, columnStatus)}
                            >
                                {/* Column Header */}
                                <div className="p-4 flex items-center justify-between border-b border-border/50 shrink-0">
                                    <h3 className="font-semibold flex items-center text-sm uppercase tracking-wider text-muted-foreground">
                                        <div className={`w-2 h-2 rounded-full mr-2 ${columnStatus === 'Done' ? 'bg-green-500' : columnStatus === 'In Progress' ? 'bg-blue-500' : 'bg-slate-500'}`}></div>
                                        {columnStatus}
                                        <span className="ml-2 bg-background/80 px-2 py-0.5 rounded-full text-xs">
                                            {tasks.filter((t) => t.status === columnStatus).length}
                                        </span>
                                    </h3>
                                    <button
                                        onClick={() => openCreateModal(columnStatus)}
                                        className="p-1 hover:bg-background rounded-md text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>

                                {/* Column Tasks */}
                                <div className="flex-1 overflow-y-auto p-3 space-y-3 thin-scrollbar">
                                    {tasks
                                        .filter((t) => t.status === columnStatus)
                                        .map((task) => (
                                            <div
                                                key={task._id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, task)}
                                                onDragEnd={handleDragEnd}
                                                onClick={() => openEditModal(task)}
                                                className="bg-card p-4 rounded-lg shadow-sm border hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all hover:shadow-md group relative"
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-medium text-pretty pr-6 break-words">
                                                        {task.title}
                                                    </h4>
                                                </div>

                                                {task.description && (
                                                    <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                                                        {task.description}
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between mt-4">
                                                    <div className="flex items-center text-xs text-muted-foreground">
                                                        <Calendar size={12} className="mr-1" />
                                                        {format(new Date(task.createdAt), "MMM d")}
                                                    </div>

                                                    {task.assignee && (
                                                        <img
                                                            src={task.assignee.profilePicture || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + task.assignee._id}
                                                            alt={task.assignee.name}
                                                            className="w-6 h-6 rounded-full object-cover border"
                                                            title={`Assigned to ${task.assignee.name}`}
                                                        />
                                                    )}
                                                    {!task.assignee && (
                                                        <div
                                                            className="w-6 h-6 rounded-full border border-dashed border-muted-foreground/50 flex items-center justify-center text-muted-foreground bg-secondary/30"
                                                            title="Unassigned"
                                                        >
                                                            <User size={12} />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex-1 w-full relative">
                    <WorkspaceCodeEditor
                        workspaceId={workspace._id}
                        initialCode={workspace.code}
                    />
                </div>
            )}

            {/* Task Modal */}
            {showTaskModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200 border flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <h2 className="text-xl font-bold">
                                {modalMode === "create" ? "Create Task" : "Edit Task"}
                            </h2>
                            <div className="flex items-center space-x-2">
                                {modalMode === "edit" && (
                                    <button
                                        onClick={() => handleDeleteTask(selectedTask._id)}
                                        className="text-destructive hover:bg-destructive/10 p-2 rounded-md transition-colors"
                                        title="Delete Task"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowTaskModal(false)}
                                    className="text-muted-foreground hover:text-foreground hover:bg-secondary p-2 rounded-md transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-y-auto px-1 py-2 flex-1 thin-scrollbar">
                            <form id="task-form" onSubmit={handleSaveTask} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">
                                        Title <span className="text-destructive">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={taskFormData.title}
                                        onChange={(e) => setTaskFormData({ ...taskFormData, title: e.target.value })}
                                        className="w-full p-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                        placeholder="What needs to be done?"
                                        autoFocus
                                        maxLength={200}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1.5">
                                        Description
                                    </label>
                                    <textarea
                                        value={taskFormData.description}
                                        onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                                        className="w-full p-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-primary outline-none min-h-[120px] resize-y transition-all"
                                        placeholder="Add more details to this task..."
                                        maxLength={2000}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5">
                                            Status
                                        </label>
                                        <select
                                            value={taskFormData.status}
                                            onChange={(e) => setTaskFormData({ ...taskFormData, status: e.target.value })}
                                            className="w-full p-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none transition-all"
                                        >
                                            {COLUMNS.map((col) => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5">
                                            Assignee
                                        </label>
                                        <select
                                            value={taskFormData.assigneeId}
                                            onChange={(e) => setTaskFormData({ ...taskFormData, assigneeId: e.target.value })}
                                            className="w-full p-2.5 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none transition-all"
                                        >
                                            <option value="">Unassigned</option>
                                            {workspace.members.map((member) => (
                                                <option key={member._id} value={member._id}>
                                                    {member.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="flex justify-end pt-4 mt-2 border-t shrink-0 space-x-3">
                            <button
                                type="button"
                                onClick={() => setShowTaskModal(false)}
                                className="px-4 py-2 border rounded-lg hover:bg-secondary font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="task-form"
                                disabled={saving}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center disabled:opacity-70"
                            >
                                {saving && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                                Save Task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-background rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200 border flex flex-col max-h-[80vh]">
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <h2 className="text-xl font-bold flex items-center">
                                <UserPlus size={20} className="mr-2 text-primary" />
                                Invite Connections
                            </h2>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="text-muted-foreground hover:text-foreground hover:bg-secondary p-2 rounded-md transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="overflow-y-auto px-1 py-2 flex-1 thin-scrollbar">
                            {loadingConnections ? (
                                <div className="flex justify-center items-center py-8">
                                    <Loader2 className="animate-spin h-6 w-6 text-primary" />
                                </div>
                            ) : connections.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-muted-foreground mb-4">
                                        No available connections to invite.
                                    </p>
                                    <Link onClick={() => setShowInviteModal(false)} to="/search" className="text-primary hover:underline text-sm font-medium">
                                        Find more developers
                                    </Link>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {connections.map((user) => (
                                        <li key={user._id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors">
                                            <div className="flex items-center">
                                                <img
                                                    src={user.profilePicture || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + user._id}
                                                    alt={user.name}
                                                    className="w-10 h-10 rounded-full object-cover mr-3"
                                                />
                                                <div>
                                                    <h4 className="font-semibold text-sm">{user.name}</h4>
                                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                                        {user.headline || user.bio || "Software Developer"}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleInviteMember(user._id)}
                                                disabled={invitingUserId === user._id}
                                                className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                                            >
                                                {invitingUserId === user._id ? (
                                                    <Loader2 className="animate-spin h-4 w-4" />
                                                ) : (
                                                    "Invite"
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkspaceBoardPage;
