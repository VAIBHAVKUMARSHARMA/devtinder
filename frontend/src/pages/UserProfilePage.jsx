import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageSquare, UserPlus, Star } from 'lucide-react';
import { fetchUserProfile } from '@/store/slices/userProfileSlice';
import { sendRequest } from '@/store/slices/connectionSlice';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import ReviewList from '@/components/ReviewList';
import ReviewForm from '@/components/ReviewForm';

const UserProfilePage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { userProfile, loading, error } = useSelector((state) => state.userProfile);
  const { user } = useSelector((state) => state.auth);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [refreshReviews, setRefreshReviews] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);

  // Helper to check connection status
  const getConnectionStatus = (targetUserId) => {
    if (!user || !targetUserId) return 'unknown';

    // Check connections
    if (user.connections?.some(u => u._id === targetUserId || u === targetUserId)) return 'connected';

    // Check sent requests
    if (user.sentRequests?.some(u => u._id === targetUserId || u === targetUserId)) return 'pending';

    // Check received requests
    if (user.connectionRequests?.some(u => u._id === targetUserId || u === targetUserId)) return 'received';

    return 'none';
  };

  const handleConnect = async (userId) => {
    if (!user) {
      toast.error("Please login to connect");
      return;
    }
    setIsConnecting(true);
    try {
      await dispatch(sendConnectionRequest(userId)).unwrap();
      toast.success("Connection request sent!");
      // We should ideally reload the auth user to get updated sentRequests
      // for now simple state update might be tricky without reducer update
      // but the slice should handle it if attached.
      window.location.reload(); // Simple brute force update for now to reflect button state
    } catch (err) {
      toast.error(err || "Failed to send request");
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (id) {
      dispatch(fetchUserProfile(id));
      setShowReviewForm(false);
    }
  }, [dispatch, id]);

  const handleReviewAdded = () => {
    setRefreshReviews(prev => prev + 1);
    setShowReviewForm(false);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading profile...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-destructive">Error loading profile: {error}</p>
        <Link to="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Feed
          </Button>
        </Link>
      </div>
    );
  }

  if (!userProfile) {
    return null;
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center">
        <Link to="/dashboard">
          <Button variant="ghost" className="mr-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Developer Profile</h1>
      </div>

      <div className="animate-in fade-in duration-500">
        <Card className="overflow-hidden mb-8">
          <div className="h-40 relative bg-gradient-to-r from-primary/20 to-primary/40">
            {userProfile.bannerUrl && <img src={userProfile.bannerUrl} alt="Banner" className="w-full h-full object-cover" />}
          </div>
          <div className="relative px-6">
            <Avatar className="absolute -top-16 border-4 border-background w-32 h-32">
              <AvatarImage src={userProfile.profilePicture} alt={userProfile.name} />
              <AvatarFallback>{userProfile.name?.[0]}</AvatarFallback>
            </Avatar>
          </div>
          <CardHeader className="pt-20">
            <CardTitle className="text-2xl">{userProfile.name}</CardTitle>
            <CardDescription>{userProfile.headline || userProfile.skills?.join(', ')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-medium mb-2">About</h3>
              <p className="text-muted-foreground">{userProfile.bio || 'No bio provided'}</p>
            </div>

            {/* Projects Display */}
            {userProfile.projects?.length > 0 && (
              <div>
                <h3 className="font-medium mb-3">Projects</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {userProfile.projects.map((project, i) => (
                    <Card key={i} className="bg-muted/10">
                      <CardHeader className="p-4">
                        <CardTitle className="text-lg">{project.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        {project.image && (
                          <div className="mb-3 rounded-md overflow-hidden h-32 w-full">
                            <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground mb-2">{project.description}</p>
                        {project.link && (
                          <a href={project.link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                            View Project
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {userProfile.skills?.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {userProfile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex space-x-4 pt-4 border-t">
              {getConnectionStatus(userProfile._id) === 'connected' ? (
                <Button variant="outline" className="space-x-2 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 border-green-200">
                  <UserPlus className="h-4 w-4" />
                  <span>Connected</span>
                </Button>
              ) : getConnectionStatus(userProfile._id) === 'pending' ? (
                <Button variant="outline" className="space-x-2 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 hover:text-yellow-800 border-yellow-200">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Pending</span>
                </Button>
              ) : getConnectionStatus(userProfile._id) === 'received' ? (
                <Button className="space-x-2 bg-blue-600 hover:bg-blue-700">
                  <UserPlus className="h-4 w-4" />
                  <span>Accept Request</span>
                </Button>
              ) : (
                <Button
                  onClick={() => handleConnect(userProfile._id)}
                  className="space-x-2"
                  disabled={isConnecting}
                >
                  {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  <span>Connect</span>
                </Button>
              )}

              <Button variant="outline" className="space-x-2">
                <MessageSquare className="h-4 w-4" />
                <span>Message</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reviews Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Reviews & Testimonials</h2>
            <Button onClick={() => setShowReviewForm(true)} variant="outline" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Write a Review
            </Button>
          </div>

          {showReviewForm && (
            <div className="mb-8 animate-in slide-in-from-top duration-300">
              <ReviewForm
                userId={id}
                onReviewAdded={handleReviewAdded}
                onClose={() => setShowReviewForm(false)}
              />
            </div>
          )}

          <ReviewList userId={id} refreshTrigger={refreshReviews} />
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;