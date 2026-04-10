import { createSlice } from '@reduxjs/toolkit';
import authService from '@/services/userService';
import {
  clearStoredAuth,
  getStoredAuth,
  getStoredAuthToken,
  saveStoredAuth,
} from '@/lib/authStorage';

const storedAuth = getStoredAuth();
const hasStoredUser = !!storedAuth?.user;

const initialState = {
  user: storedAuth?.user || null,
  token: storedAuth?.token || null,
  isAuthenticated: hasStoredUser,
  initialized: hasStoredUser,
  checkingAuth: !hasStoredUser,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Auth state management
    setAuthData: (state, action) => {
      state.user = action.payload.user || null;
      state.token = action.payload.token || action.payload.user?.token || null;
      state.isAuthenticated = !!action.payload.user;
      state.initialized = true;
      state.checkingAuth = false;
      state.loading = false;
      state.error = null;
    },
    clearAuthData: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.initialized = true;
      state.checkingAuth = false;
      state.error = null;
      state.loading = false;
    },

    // Loading states
    setLoading: (state, action) => {
      state.loading = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },
    setCheckingAuth: (state, action) => {
      state.checkingAuth = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },
    finishAuthCheck: (state) => {
      state.initialized = true;
      state.checkingAuth = false;
    },

    // Error handling
    setError: (state, action) => {
      state.error = action.payload;
      state.initialized = true;
      state.checkingAuth = false;
      state.loading = false;
    },
    clearError: (state) => {
      state.error = null;
    },

    // Profile update
    updateUserProfile: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        state.loading = false;
      }
    }
  }
});

// Action creators
export const registerUser = (userData) => async (dispatch) => {
  try {
    dispatch(setLoading(true));
    const response = await authService.register(userData);
    dispatch(setAuthData(response));
    saveStoredAuth({
      user: response.user || null,
      token: response.token || response.user?.token || null,
    });
    return response;
  } catch (error) {
    dispatch(setError(error));
    throw error;
  }
};

export const loginUser = ({ email, password }) => async (dispatch) => {
  try {
    dispatch(setLoading(true));
    const response = await authService.login(email, password);
    dispatch(setAuthData(response));
    saveStoredAuth({
      user: response.user || null,
      token: response.token || response.user?.token || null,
    });
    return response;
  } catch (error) {
    dispatch(setError(error));
    throw error;
  }
};

export const logoutUser = () => async (dispatch) => {
  try {
    await authService.logout();
    clearStoredAuth();
    dispatch(clearAuthData());
    return null;
  } catch (error) {
    clearStoredAuth();
    dispatch(setError(error));
    throw error;
  }
};

export const updateUserProfile = (userData) => async (dispatch) => {
  try {
    dispatch(setLoading(true));
    const response = await authService.updateProfile(userData);
    dispatch(authSlice.actions.updateUserProfile(response.user));
    saveStoredAuth({
      user: response.user || null,
      token: getStoredAuthToken(),
    });
    return response.user;
  } catch (error) {
    dispatch(setError(error));
    throw error;
  }
};

export const getCurrentUser = () => async (dispatch, getState) => {
  const hasCachedSession = !!(getState().auth.user || getState().auth.token);

  try {
    dispatch(setCheckingAuth(true));
    const response = await authService.getCurrentUser();
    const persistedToken = getStoredAuthToken();
    const normalizedResponse = persistedToken && !response.token && response.user
      ? { ...response, token: persistedToken }
      : response;

    dispatch(setAuthData(normalizedResponse));
    saveStoredAuth({
      user: normalizedResponse.user || null,
      token: normalizedResponse.token || normalizedResponse.user?.token || null,
    });
    return normalizedResponse;
  } catch (error) {
    const errorMessage = typeof error === 'string' ? error : error?.message;
    const errorStatus = typeof error === 'object' ? error?.status : null;

    // Avoid showing an error on app startup for expected unauthenticated state.
    if (errorStatus === 401) {
      clearStoredAuth();
      dispatch(clearAuthData());
      return null;
    }

    console.error('Failed to restore auth session:', errorMessage || error);
    dispatch(finishAuthCheck());
    return hasCachedSession ? getState().auth.user : null;
  }
};

export const {
  setAuthData,
  clearAuthData,
  setLoading,
  setCheckingAuth,
  finishAuthCheck,
  setError,
  clearError,
  updateUserProfile: updateUserProfileAction
} = authSlice.actions;

export default authSlice.reducer;
