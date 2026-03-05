import { useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import reviewService from '../services/reviewService';

const ReviewForm = ({ userId, onReviewAdded, onClose }) => {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (rating === 0) {
            toast.error('Please select a rating');
            return;
        }
        if (!content.trim()) {
            toast.error('Please write a review');
            return;
        }

        setSubmitting(true);
        try {
            await reviewService.addReview(userId, { rating, content });
            toast.success('Review submitted successfully');
            setContent('');
            setRating(0);
            if (onReviewAdded) onReviewAdded();
            if (onClose) onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-card p-6 rounded-lg border shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Write a Review</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            type="button"
                            className="focus:outline-none transition-colors"
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => setRating(star)}
                        >
                            <Star
                                size={24}
                                fill={(hoverRating || rating) >= star ? "gold" : "none"}
                                color={(hoverRating || rating) >= star ? "gold" : "currentColor"}
                                className={(hoverRating || rating) >= star ? "text-yellow-400" : "text-muted-foreground"}
                            />
                        </button>
                    ))}
                    <span className="ml-2 text-sm text-muted-foreground">
                        {rating > 0 ? `${rating} Star${rating > 1 ? 's' : ''}` : 'Select rating'}
                    </span>
                </div>

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Share your experience working with this developer..."
                    className="w-full p-3 rounded-md border bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none min-h-[100px]"
                    maxLength={500}
                />

                <div className="flex justify-end space-x-2">
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center"
                    >
                        {submitting && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                        Submit Review
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ReviewForm;
