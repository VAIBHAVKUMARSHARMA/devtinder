import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageSquare, UserPlus, Check, X, Loader2, Heart, RotateCcw } from 'lucide-react';
import { fetchFeed } from '@/store/slices/feedSlice';
import { sendRequest } from '@/store/slices/connectionSlice';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';

const DashboardPage = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { users, loading, error } = useSelector((state) => state.feed);
  const { actionError, actionSuccess } = useSelector((state) => state.connections);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastDirection, setLastDirection] = useState(null);
  const [requestingUserId, setRequestingUserId] = useState(null);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    dispatch(fetchFeed({ page: 1, limit: 50 })); // Fetch more for swiping
  }, [dispatch]);

  // Setup local feed state that we can 'pop' from
  const [feedUsers, setFeedUsers] = useState([]);

  useEffect(() => {
    if (users) {
      // Filter logic similar to before
      const filtered = users.filter(feedUser => {
        if (feedUser._id === user?._id) return false;
        if (user?.connections?.some(conn => conn._id === feedUser._id)) return false;
        if (user?.sentRequests?.some(req => req._id === feedUser._id)) return false;
        return true;
      });
      setFeedUsers(filtered);
    }
  }, [users, user]);

  useEffect(() => {
    if (actionSuccess || actionError) {
      setShowAlert(true);
      const timer = setTimeout(() => setShowAlert(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess, actionError]);

  const swipe = async (direction, userId) => {
    setLastDirection(direction);

    if (direction === 'right') {
      // Send Connect Request
      setRequestingUserId(userId);
      await dispatch(sendRequest(userId));
      setRequestingUserId(null);
    }

    // Move to next card after delay for animation
    setTimeout(() => {
      setFeedUsers((prev) => prev.filter((u) => u._id !== userId));
      setLastDirection(null);
    }, 200);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) return <div className="text-center text-red-500 mt-10">Error: {error}</div>;

  const currentUserCard = feedUsers[0];

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-gradient-to-br from-background to-muted/50 p-4">

      {/* Header */}
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground px-2 py-1 rounded">DevTinder</span>
        Stack
      </h1>

      {/* Alert */}
      {showAlert && (
        <Alert className={`absolute top-4 w-full max-w-md ${actionError ? "bg-red-50" : "bg-green-50"} z-50`}>
          <AlertDescription className={actionError ? "text-red-700" : "text-green-700"}>
            {actionError || actionSuccess}
          </AlertDescription>
        </Alert>
      )}

      {/* Card Container */}
      <div className="relative w-full max-w-sm h-[500px]">

        {feedUsers.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card border rounded-xl shadow-lg p-6 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <RotateCcw className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No more developers</h3>
            <p className="text-muted-foreground mb-6">Check back later or update your profile to find more matches.</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Refresh Feed
            </Button>
          </div>
        ) : (
          // The Main Card
          <div className={`absolute inset-0 bg-card border hover:border-primary/50 transition-all duration-300 rounded-xl shadow-2xl overflow-hidden flex flex-col transform ${lastDirection === 'right' ? 'translate-x-[200px] rotate-12 opacity-0' : lastDirection === 'left' ? '-translate-x-[200px] -rotate-12 opacity-0' : 'translate-x-0 rotate-0 opacity-100'}`}>

            {/* Image / Banner Area */}
            <div className="h-2/5 bg-gradient-to-b from-primary/10 to-transparent relative">
              <div className="absolute inset-0 flex items-end justify-center -mb-10">
                <Avatar className="w-32 h-32 border-4 border-background shadow-lg">
                  <AvatarImage src={currentUserCard.profilePicture} className="object-cover" />
                  <AvatarFallback className="text-2xl">{currentUserCard.name?.[0]}</AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 pt-12 px-6 flex flex-col items-center text-center">
              <Link to={`/user/${currentUserCard._id}`} className="hover:underline">
                <h2 className="text-2xl font-bold">{currentUserCard.name}</h2>
              </Link>
              <p className="text-primary font-medium mb-1">{currentUserCard.role || "Developer"}</p>

              <div className="flex flex-wrap gap-2 justify-center my-3">
                {currentUserCard.skills?.slice(0, 3).map((skill, i) => (
                  <span key={i} className="text-xs bg-muted px-2 py-1 rounded-full">{skill}</span>
                ))}
              </div>

              <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                {currentUserCard.bio || "Fellow developer looking to connect!"}
              </p>
            </div>

            {/* Actions Footer */}
            <div className="h-20 border-t flex items-center justify-center gap-8 bg-muted/20">
              <Button
                size="icon"
                variant="outline"
                className="h-14 w-14 rounded-full border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 shadow-sm transition-transform hover:scale-110"
                onClick={() => swipe('left', currentUserCard._id)}
              >
                <X className="w-8 h-8" />
              </Button>

              <Button
                size="icon"
                className="h-14 w-14 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-green-200 transition-transform hover:scale-110 hover:shadow-xl"
                onClick={() => swipe('right', currentUserCard._id)}
              >
                <Heart className="w-7 h-7 fill-current" />
              </Button>
            </div>
          </div>
        )}

        {/* Shadow Card (The one behind) */}
        {feedUsers.length > 1 && (
          <div className="absolute inset-0 bg-card border rounded-xl shadow-lg -z-10 transform scale-95 translate-y-4 opacity-50 pointer-events-none">
            {/* Placeholder for the next card to give stack effect */}
          </div>
        )}

      </div>

      <p className="text-xs text-muted-foreground mt-8 animate-pulse">
        {feedUsers.length > 0 && "Press Heart to Connect, X to Skip"}
      </p>

    </div>
  );
};

export default DashboardPage;
