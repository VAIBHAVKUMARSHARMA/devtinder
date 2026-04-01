import { axiosInstance as api } from '@/lib/axios';

const getReviews = async (userId) => {
    try {
        const response = await api.get(`/reviews/${userId}`);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch reviews';
    }
};

const addReview = async (userId, reviewData) => {
    try {
        const response = await api.post(`/reviews/${userId}`, reviewData);
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to add review';
    }
};

const reviewService = {
    getReviews,
    addReview,
};

export default reviewService;
