const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const router = express.Router();

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

const getFrontendRedirectUrl = () => {
    if (process.env.FRONTEND_REDIRECT_URL) {
        return process.env.FRONTEND_REDIRECT_URL.replace(/\/+$/, "");
    }

    const firstConfiguredOrigin = (process.env.FRONTEND_URL || "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .find(Boolean);

    return firstConfiguredOrigin || "http://localhost:5173";
};

const frontendRedirectUrl = getFrontendRedirectUrl();
const frontendPostAuthPath = (() => {
    const rawPath = (process.env.FRONTEND_POST_AUTH_PATH || "/").trim();
    if (!rawPath) return "/";
    return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
})();

const buildFrontendUrl = (path = "/") => `${frontendRedirectUrl}${path}`;

const getAuthCookieOptions = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    };
};

// Google Auth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: buildFrontendUrl('/login') }),
    (req, res) => {
        const token = generateToken(req.user._id);

        // Set cookie
        res.cookie('jwt', token, getAuthCookieOptions());

        res.redirect(buildFrontendUrl(frontendPostAuthPath));
    }
);

// GitHub Auth
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback',
    passport.authenticate('github', { session: false, failureRedirect: buildFrontendUrl('/login') }),
    (req, res) => {
        const token = generateToken(req.user._id);

        // Set cookie
        res.cookie('jwt', token, getAuthCookieOptions());

        res.redirect(buildFrontendUrl(frontendPostAuthPath));
    }
);

module.exports = router;
