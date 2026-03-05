import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
});

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
