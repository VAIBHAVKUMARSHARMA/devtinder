import { X, Check, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

const InterestedUsersList = ({ users, onClose, ideaId, isAuthor, onUpdateApplicant }) => {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Interested Developers</h2>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-6 max-h-[60vh] overflow-y-auto px-1">
                    {users.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">
                            No developers have shown interest yet.
                        </p>
                    ) : (
                        users.map((item) => {
                            const user = item.user;
                            const status = item.status || 'pending';
                            const githubUsername = user.githubUrl ? user.githubUrl.split('/').pop() : null;

                            return (
                                <div
                                    key={user._id}
                                    className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center">
                                            <img
                                                src={user.profilePicture || "/avatar-placeholder.png"}
                                                alt={user.name}
                                                className="w-10 h-10 rounded-full object-cover border"
                                            />
                                            <div className="ml-3">
                                                <h3 className="font-medium">{user.name}</h3>
                                                <p className="text-xs text-muted-foreground line-clamp-1">
                                                    {user.headline || user.bio || "Developer"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end space-y-2">
                                            <Link
                                                to={`/user/${user._id}`}
                                                className="text-xs font-medium bg-secondary text-secondary-foreground px-3 py-1.5 rounded-md hover:bg-secondary/80"
                                            >
                                                View Profile
                                            </Link>

                                            {status !== 'pending' && (
                                                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                    {status}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {isAuthor && status === 'pending' && (
                                        <div className="flex space-x-2 mt-3 mb-2">
                                            <button
                                                onClick={() => onUpdateApplicant(ideaId, user._id, 'accepted')}
                                                className="flex-1 flex justify-center items-center py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors"
                                            >
                                                <Check size={16} className="mr-1" />
                                                Accept
                                            </button>
                                            <button
                                                onClick={() => onUpdateApplicant(ideaId, user._id, 'rejected')}
                                                className="flex-1 flex justify-center items-center py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm font-medium transition-colors"
                                            >
                                                <XCircle size={16} className="mr-1" />
                                                Reject
                                            </button>
                                        </div>
                                    )}

                                    {githubUsername && (
                                        <div className="mt-2">
                                            <p className="text-xs text-muted-foreground mb-1">GitHub Contributions</p>
                                            <img
                                                src={`https://gh-chart.rshah.io/${githubUsername}`}
                                                alt={`${user.name}'s Github chart`}
                                                className="w-full rounded bg-white p-1 border"
                                            />
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default InterestedUsersList;
