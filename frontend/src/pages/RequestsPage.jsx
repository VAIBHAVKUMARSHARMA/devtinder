import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Check, X, Loader2, Layout } from 'lucide-react';
import { fetchConnectionRequests, acceptRequest, rejectRequest } from '@/store/slices/connectionSlice';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { workspaceService } from '@/services/workspaceService';
import toast from 'react-hot-toast';

const RequestsPage = () => {
  const dispatch = useDispatch();
  const { pendingRequests, loading, error, actionLoading, actionError, actionSuccess } = useSelector((state) => state.connections);
  console.log('Pending requests:', pendingRequests);

  const [processingId, setProcessingId] = useState(null);
  const [showAlert, setShowAlert] = useState(false);

  // Workspace Invitations state
  const [workspaceInvitations, setWorkspaceInvitations] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [processingWorkspaceId, setProcessingWorkspaceId] = useState(null);

  // Fetch connection requests on component mount
  useEffect(() => {
    dispatch(fetchConnectionRequests());
    fetchWorkspaceInvitations();
  }, [dispatch]);

  const fetchWorkspaceInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const res = await workspaceService.getPendingInvitations();
      if (res.status === 'success' && res.data && res.data.invitations) {
        setWorkspaceInvitations(res.data.invitations);
      }
    } catch (err) {
      toast.error("Failed to load workspace invitations");
    } finally {
      setLoadingInvitations(false);
    }
  };

  // Log the pending requests for debugging
  console.log('Pending requests in component:', pendingRequests);

  // Show success/error alert when connection action completes
  useEffect(() => {
    if (actionSuccess || actionError) {
      setShowAlert(true);
      setProcessingId(null);

      // Hide alert after 3 seconds
      const timer = setTimeout(() => {
        setShowAlert(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [actionSuccess, actionError]);

  const handleAcceptRequest = (userId) => {
    setProcessingId(userId);
    dispatch(acceptRequest(userId));
  };

  const handleRejectRequest = (userId) => {
    setProcessingId(userId);
    dispatch(rejectRequest(userId));
  };

  const handleAcceptWorkspace = async (workspaceId) => {
    setProcessingWorkspaceId(workspaceId);
    try {
      await workspaceService.acceptInvitation(workspaceId);
      toast.success("Workspace invitation accepted!");
      setWorkspaceInvitations(prev => prev.filter(w => w._id !== workspaceId));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to accept invitation");
    } finally {
      setProcessingWorkspaceId(null);
    }
  };

  const handleRejectWorkspace = async (workspaceId) => {
    setProcessingWorkspaceId(workspaceId);
    try {
      await workspaceService.rejectInvitation(workspaceId);
      toast.success("Workspace invitation declined");
      setWorkspaceInvitations(prev => prev.filter(w => w._id !== workspaceId));
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to decline invitation");
    } finally {
      setProcessingWorkspaceId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-destructive">Error loading requests: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Connection Requests Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Connection Requests</h1>
          <span className="text-sm text-muted-foreground">
            {pendingRequests.length} pending requests
          </span>
        </div>

        {showAlert && (
          <Alert className={actionError ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}>
            <AlertDescription className={actionError ? "text-red-700" : "text-green-700"}>
              {actionError || actionSuccess}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 animate-in fade-in duration-500">
          {pendingRequests.map((request, index) => (
            <div
              key={request._id}
              className={`animate-in slide-in-from-bottom-4 duration-500 delay-${index * 100}`}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarImage src={request.profilePicture} alt={request.name} />
                      <AvatarFallback>{request.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">{request.name}</CardTitle>
                      <CardDescription>{request.skills?.join(', ') || 'Developer'}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">{request.bio || `${request.name} wants to connect with you.`}</p>
                </CardContent>
                <CardFooter className="justify-end space-x-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="space-x-2 text-destructive transform transition hover:scale-105"
                    onClick={() => handleRejectRequest(request._id)}
                    disabled={processingId === request._id}
                  >
                    {processingId === request._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span>{processingId === request._id ? 'Declining...' : 'Decline'}</span>
                  </Button>
                  <Button
                    size="sm"
                    className="space-x-2 transform transition hover:scale-105"
                    onClick={() => handleAcceptRequest(request._id)}
                    disabled={processingId === request._id}
                  >
                    {processingId === request._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span>{processingId === request._id ? 'Accepting...' : 'Accept'}</span>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ))}
        </div>

        {pendingRequests.length === 0 && (
          <div className="text-center py-8 animate-in fade-in duration-500 bg-card rounded-lg border border-dashed">
            <p className="text-muted-foreground">No pending connection requests</p>
          </div>
        )}
      </div>

      {/* Workspace Invitations Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold flex items-center">
            <Layout className="mr-3 text-primary" size={28} />
            Workspace Invitations
          </h2>
          <span className="text-sm text-muted-foreground">
            {workspaceInvitations.length} pending invites
          </span>
        </div>

        {loadingInvitations ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid gap-6 animate-in fade-in duration-500">
            {workspaceInvitations.map((workspace, index) => (
              <div
                key={workspace._id}
                className={`animate-in slide-in-from-bottom-4 duration-500 delay-${index * 100}`}
              >
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
                          {workspace.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{workspace.name}</CardTitle>
                          <CardDescription>
                            Invited by <span className="font-semibold text-foreground">{workspace.owner.name}</span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground px-2 py-1 bg-background rounded-md border">
                        Workspace
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {workspace.description || "You've been invited to collaborate on this workspace."}
                    </p>
                  </CardContent>
                  <CardFooter className="justify-end space-x-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="space-x-2 text-destructive transform transition hover:scale-105"
                      onClick={() => handleRejectWorkspace(workspace._id)}
                      disabled={processingWorkspaceId === workspace._id}
                    >
                      {processingWorkspaceId === workspace._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      <span>{processingWorkspaceId === workspace._id ? 'Declining...' : 'Decline'}</span>
                    </Button>
                    <Button
                      size="sm"
                      className="space-x-2 transform transition hover:scale-105"
                      onClick={() => handleAcceptWorkspace(workspace._id)}
                      disabled={processingWorkspaceId === workspace._id}
                    >
                      {processingWorkspaceId === workspace._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span>{processingWorkspaceId === workspace._id ? 'Accepting...' : 'Accept'}</span>
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            ))}
          </div>
        )}

        {!loadingInvitations && workspaceInvitations.length === 0 && (
          <div className="text-center py-8 animate-in fade-in duration-500 bg-card rounded-lg border border-dashed">
            <p className="text-muted-foreground">No pending workspace invitations</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RequestsPage;