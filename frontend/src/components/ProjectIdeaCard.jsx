import { UserPlus, Trash2, Calendar, Code, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useSelector } from "react-redux";
import { useState } from "react";
import InterestedUsersList from "./InterestedUsersList";

const ProjectIdeaCard = ({ idea, onConnect, onDelete, onConvert, onUpdateApplicant, isConnecting }) => {
    const { user } = useSelector((state) => state.auth);
    const authorId = idea.author?._id;
    const isAuthor = user?._id === authorId;

    // Format connections status to check if already connected or requested
    const [showInterestedModal, setShowInterestedModal] = useState(false);

    // Helper to safely compare IDs
    const areIdsEqual = (id1, id2) => {
        if (!id1 || !id2) return false;
        const str1 = typeof id1 === 'object' ? id1._id || id1 : id1;
        const str2 = typeof id2 === 'object' ? id2._id || id2 : id2;
        return String(str1) === String(str2);
    };

    const isConnected = user?.connections?.some(
        (connection) => areIdsEqual(connection, authorId)
    );

    const isRequestSent = user?.sentRequests?.some(
        (request) => areIdsEqual(request, authorId)
    );

    const hasReceivedRequest = user?.connectionRequests?.some(
        (request) => areIdsEqual(request, authorId)
    );

    const isInterestedInProject = idea.interestedUsers?.some(
        (u) => areIdsEqual(u.user, user?._id)
    );

    const validInterestedUsers = (idea.interestedUsers || []).filter(
        (entry) => entry?.user && (typeof entry.user === "object" ? entry.user._id : entry.user)
    );

    return (
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 mb-4 hover:shadow-md transition-shadow relative">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-4">
                    <img
                        src={idea.author?.profilePicture || "/avatar-placeholder.png"}
                        alt={idea.author?.name || "Author"}
                        className="w-12 h-12 rounded-full object-cover border-2 border-primary/10"
                    />
                    <div>
                        <h3 className="font-semibold text-lg">{idea.title}</h3>
                        <p className="text-sm text-muted-foreground flex items-center">
                            By {idea.author?.name || "Unknown"} • {formatDistanceToNow(new Date(idea.createdAt), { addSuffix: true })}
                        </p>
                    </div>
                </div>
                {isAuthor && (
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setShowInterestedModal(true)}
                            className="text-primary hover:bg-primary/10 p-2 rounded-full transition-colors flex items-center text-xs font-medium"
                            title="View Interested Developers"
                        >
                            <Users size={16} className="mr-1" />
                            {validInterestedUsers.length} Interested
                        </button>
                        {idea.status !== 'closed' && onConvert && (
                            <button
                                onClick={() => onConvert(idea._id)}
                                className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors flex items-center text-xs font-medium border border-emerald-200"
                                title="Convert to Workspace"
                            >
                                Convert to Workspace
                            </button>
                        )}
                        <button
                            onClick={() => onDelete(idea._id)}
                            className="text-destructive hover:bg-destructive/10 p-2 rounded-full transition-colors"
                            title="Delete Idea"
                        >
                            <Trash2 size={20} />
                        </button>
                    </div>
                )}
            </div>

            <p className="mb-6 whitespace-pre-wrap leading-relaxed">{idea.description}</p>

            <div className="flex flex-wrap gap-2 mb-6">
                {idea.skills.map((skill, index) => (
                    <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
                    >
                        <Code size={12} className="mr-1" />
                        {skill}
                    </span>
                ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
                <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar size={16} className="mr-2" />
                    <span>Posted {new Date(idea.createdAt).toLocaleDateString()}</span>
                </div>

                {!isAuthor && (
                    <button
                        onClick={() => onConnect(idea._id, authorId, isConnected, isRequestSent, hasReceivedRequest, isInterestedInProject)}
                        disabled={isConnecting}
                        className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${isInterestedInProject
                            ? "bg-green-500 text-white hover:bg-green-600"
                            : (isConnected || isRequestSent || hasReceivedRequest)
                                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                : "bg-primary text-primary-foreground hover:bg-primary/90"
                            }`}
                    >
                        <UserPlus size={16} className="mr-2" />
                        {isInterestedInProject
                            ? "Interested"
                            : (isConnected || isRequestSent || hasReceivedRequest)
                                ? "Interested?"
                                : "Connect to Collaborate"}
                    </button>
                )}
            </div>

            {showInterestedModal && (
                <InterestedUsersList
                    users={validInterestedUsers}
                    onClose={() => setShowInterestedModal(false)}
                    ideaId={idea._id}
                    isAuthor={isAuthor}
                    onUpdateApplicant={onUpdateApplicant}
                />
            )}
        </div>
    );
};

export default ProjectIdeaCard;
