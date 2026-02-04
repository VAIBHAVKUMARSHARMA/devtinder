const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

console.log("DEBUG: GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "Loaded" : "Missing");
console.log("DEBUG: GITHUB_CLIENT_ID:", process.env.GITHUB_CLIENT_ID ? "Loaded" : "Missing");

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback"
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if user already exists with this googleId
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    return done(null, user);
                }

                // Check if user exists with same email, then link accounts
                user = await User.findOne({ email: profile.emails[0].value });
                if (user) {
                    user.googleId = profile.id;
                    await user.save();
                    return done(null, user);
                }

                // Create new user
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    profilePicture: profile.photos[0]?.value,
                    password: undefined // Explicitly undefined to skip validation if handled correctly
                });

                await user.save();
                done(null, user);
            } catch (err) {
                console.error('Google Auth Error:', err);
                done(err, null);
            }
        }
    ));
} else {
    console.log('⚠️ Google OAuth not configured (missing keys)');
}

// GitHub Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: "/api/auth/github/callback",
        scope: ['user:email']
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // GitHub might not return email if it's private, need strict handling
                const email = profile.emails && profile.emails[0]?.value;
                const primaryEmail = email || `${profile.username}@github.placeholder.com`; // Fallback

                let user = await User.findOne({ githubId: profile.id });

                if (user) {
                    return done(null, user);
                }

                if (email) {
                    user = await User.findOne({ email: email });
                    if (user) {
                        user.githubId = profile.id;
                        await user.save();
                        return done(null, user);
                    }
                }

                user = new User({
                    name: profile.displayName || profile.username,
                    email: primaryEmail,
                    githubId: profile.id,
                    profilePicture: profile.photos[0]?.value,
                    githubUrl: profile.profileUrl,
                    bio: profile._json.bio
                });

                await user.save();
                done(null, user);
            } catch (err) {
                console.error('GitHub Auth Error:', err);
                done(err, null);
            }
        }
    ));
} else {
    console.log('⚠️ GitHub OAuth not configured (missing keys)');
}

module.exports = passport;
