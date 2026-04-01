const AUTH_STORAGE_KEY = "devtinder-auth";

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readStoredAuth = () => {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
};

export const getStoredAuthToken = () => readStoredAuth()?.token || null;

export const saveStoredAuth = ({ user = null, token = null } = {}) => {
  if (!canUseStorage()) {
    return;
  }

  const currentAuth = readStoredAuth();
  const nextToken = token || currentAuth?.token || null;
  const nextUser = user || currentAuth?.user || null;

  if (!nextUser && !nextToken) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      user: nextUser,
      token: nextToken,
    })
  );
};

export const clearStoredAuth = () => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
};
