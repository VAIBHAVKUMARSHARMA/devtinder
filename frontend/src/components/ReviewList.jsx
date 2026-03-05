import { useState, useEffect } from 'react';
import { Star, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import reviewService from '../services/reviewService';

const ReviewList = ({ userId, refreshTrigger }) => {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReviews();
    }, [userId, refreshTrigger]);

    const fetchReviews = async () => {
        try {
            setLoading(true);
            const data = await reviewService.getReviews(userId);
            setReviews(data.data.reviews);
        } catch (error) {
            console.error('Error fetching reviews:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="text-center py-4 text-muted-foreground">Loading reviews...</div>;
    }

    if (reviews.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border border-dashed">
                No reviews yet. Be the first to review!
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {reviews.map((review) => (
                <div key={review._id} className="bg-card p-4 rounded-lg border shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center">
                            <img
                                src={review.reviewer?.profilePicture || "/avatar-placeholder.png"}
                                alt={review.reviewer?.name || "User"}
                                className="w-10 h-10 rounded-full object-cover mr-3 border"
                            />
                            <div>
                                <h4 className="font-medium text-sm">{review.reviewer?.name || "Unknown User"}</h4>
                                <p className="text-xs text-muted-foreground">{review.reviewer?.headline || "Developer"}</p>
                            </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                        </span>
                    </div>

                    <div className="flex items-center mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                                key={star}
                                size={14}
                                fill={review.rating >= star ? "gold" : "none"}
                                color={review.rating >= star ? "gold" : "currentColor"}
                                className={review.rating >= star ? "text-yellow-400" : "text-muted-foreground"}
                            />
                        ))}
                    </div>

                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{review.content}</p>
                </div>
            ))}
        </div>
    );
};

export default ReviewList;
