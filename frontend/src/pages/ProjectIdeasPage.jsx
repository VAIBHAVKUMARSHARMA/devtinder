import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { projectService } from "../services/projectService";
import connectionService from "../services/connectionService";
import ProjectIdeaCard from "../components/ProjectIdeaCard";
import { Plus, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const ProjectIdeasPage = () => {
    const navigate = useNavigate();
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newIdea, setNewIdea] = useState({
        title: "",
        description: "",
        skills: "",
    });
    const [creating, setCreating] = useState(false);
    const [connecting, setConnecting] = useState(false);

    const { user } = useSelector((state) => state.auth);

    useEffect(() => {
        fetchIdeas();
    }, []);

    const fetchIdeas = async () => {
        try {
            const response = await projectService.getAllIdeas();
            setIdeas(response.data.ideas);
        } catch (error) {
            toast.error("Failed to load project ideas");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newIdea.title || !newIdea.description) {
            toast.error("Please fill in all required fields");
            return;
        }

        setCreating(true);
        try {
            const skillsArray = newIdea.skills.split(",").map((s) => s.trim()).filter(Boolean);
            await projectService.createIdea({ ...newIdea, skills: skillsArray });
            toast.success("Project idea posted successfully!");
            setShowCreateModal(false);
            setNewIdea({ title: "", description: "", skills: "" });
            fetchIdeas();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to create project idea");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this idea?")) return;

        try {
            await projectService.deleteIdea(id);
            toast.success("Project idea deleted");
            setIdeas(ideas.filter((idea) => idea._id !== id));
        } catch (error) {
            toast.error("Failed to delete project idea");
        }
    };

    const handleConnect = async (ideaId, userId, isConnected, isRequestSent, hasReceivedRequest, isInterestedInProject) => {
        setConnecting(true);
        try {
            // First register interest (always safe to try)
            await projectService.toggleInterest(ideaId);

            // Skip connection request if already connected or pending
            if (!isConnected && !isRequestSent && !hasReceivedRequest) {
                try {
                    await connectionService.sendConnectionRequest(userId);
                    toast.success("Connection request and interest sent!");
                } catch (connError) {
                    const errorMsg = typeof connError === 'string' ? connError : (connError.response?.data?.message || connError.message || connError.toString());
                    if (errorMsg.toLowerCase().includes("already") || errorMsg.toLowerCase().includes("existing")) {
                        toast.success("Interest status registered!");
                    } else {
                        throw connError;
                    }
                }
            } else {
                toast.success(isInterestedInProject ? "Interest removed!" : "Interest registered!");
            }

            fetchIdeas(); // Refresh to show updated interest count
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || "Failed to update interest/connection");
        } finally {
            setConnecting(false);
        }
    };

    const handleUpdateApplicant = async (ideaId, userId, status) => {
        try {
            await projectService.updateApplicantStatus(ideaId, userId, status);
            toast.success(`Applicant ${status}`);
            fetchIdeas(); // Refresh the list
        } catch (error) {
            toast.error(error.response?.data?.message || `Failed to update applicant`);
        }
    };

    const handleConvert = async (ideaId) => {
        if (!window.confirm("Convert this idea into a Workspace? This will close the idea to new connections.")) return;

        try {
            const res = await projectService.convertToWorkspace(ideaId);
            toast.success("Workspace created successfully!");
            // Redirect to the newly created workspace board
            if (res.data && res.data.workspace) {
                navigate(`/workspaces/${res.data.workspace._id}`);
            } else {
                fetchIdeas();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to convert idea");
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                        Project Ideas
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Find collaborators or share your next big idea
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium flex items-center transition-colors"
                >
                    <Plus size={20} className="mr-2" />
                    Post Idea
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-1 gap-6 max-w-4xl mx-auto">
                {ideas.length === 0 ? (
                    <div className="text-center py-12 bg-card rounded-lg border shadow-sm">
                        <h3 className="text-xl font-semibold mb-2">No ideas yet</h3>
                        <p className="text-muted-foreground">
                            Be the first to share a project idea!
                        </p>
                    </div>
                ) : (
                    ideas.map((idea) => (
                        <ProjectIdeaCard
                            key={idea._id}
                            idea={idea}
                            onConnect={handleConnect}
                            onDelete={handleDelete}
                            onConvert={handleConvert}
                            onUpdateApplicant={handleUpdateApplicant}
                            isConnecting={connecting}
                        />
                    ))
                )}
            </div>

            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-background rounded-lg shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">New Project Idea</h2>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Title <span className="text-destructive">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newIdea.title}
                                    onChange={(e) =>
                                        setNewIdea({ ...newIdea, title: e.target.value })
                                    }
                                    className="w-full p-2 rounded-md border bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                    placeholder="e.g., AI Drone Control App"
                                    maxLength={100}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Description <span className="text-destructive">*</span>
                                </label>
                                <textarea
                                    value={newIdea.description}
                                    onChange={(e) =>
                                        setNewIdea({ ...newIdea, description: e.target.value })
                                    }
                                    className="w-full p-2 rounded-md border bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none min-h-[120px]"
                                    placeholder="Describe your idea and what kind of help you need..."
                                    maxLength={1000}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Required Skills
                                </label>
                                <input
                                    type="text"
                                    value={newIdea.skills}
                                    onChange={(e) =>
                                        setNewIdea({ ...newIdea, skills: e.target.value })
                                    }
                                    className="w-full p-2 rounded-md border bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                                    placeholder="e.g., React, Node.js, Python (comma separated)"
                                />
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="mr-3 px-4 py-2 text-muted-foreground hover:text-foreground font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2 rounded-md font-medium disabled:opacity-50 flex items-center"
                                >
                                    {creating && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                                    Post Idea
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectIdeasPage;
