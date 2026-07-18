import { getDb } from '../../lib/mongodb';
import { AppError } from '../../middlewares/errorHandler';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { ObjectId } from 'mongodb';
import { User, RefreshToken } from '../../types';

const SALT_ROUNDS = 12;
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export async function registerUser(input: { name: string; email: string; password: string }) {
    const db = await getDb();
    const existing = await db.collection('users').findOne({ email: input.email });
    if (existing) throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const now = new Date();
    const result = await db.collection('users').insertOne({
        email: input.email,
        passwordHash,
        name: input.name,
        createdAt: now,
        updatedAt: now,
    } as User);

    const user: User = {
        _id: result.insertedId,
        email: input.email,
        passwordHash,
        name: input.name,
        createdAt: now,
        updatedAt: now,
    };

    const tokens = await generateTokens(user._id.toString(), user.email);
    return { user: sanitizeUser(user), tokens };
}

export async function loginUser(input: { email: string; password: string }) {
    const db = await getDb();
    const user = await db.collection('users').findOne({ email: input.email });
    if (!user || !user.passwordHash) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    const tokens = await generateTokens(user._id.toString(), user.email);
    return { user: sanitizeUser(user), tokens };
}

export async function googleAuth(idToken: string) {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) throw new AppError(400, 'Invalid Google token', 'INVALID_GOOGLE_TOKEN');

    const db = await getDb();
    const existing = await db.collection('users').findOne({ email: payload.email });
    const now = new Date();
    let user: User;

    if (existing) {
        await db.collection('users').updateOne(
            { _id: existing._id },
            { $set: { googleId: payload.sub, avatar: payload.picture || existing.avatar, updatedAt: now } }
        );
        user = { ...existing, googleId: payload.sub, avatar: payload.picture || existing.avatar };
    } else {
        const newUser: User = {
            email: payload.email,
            name: payload.name || payload.email.split('@')[0],
            googleId: payload.sub,
            avatar: payload.picture || '',
            createdAt: now,
            updatedAt: now,
        } as User;
        const result = await db.collection('users').insertOne(newUser);
        user = { ...newUser, _id: result.insertedId };
    }

    const tokens = await generateTokens(user._id.toString(), user.email);
    return { user: sanitizeUser(user), tokens };
}

export async function refreshAccessToken(refreshToken: string) {
    const db = await getDb();
    const stored = await db.collection('refreshTokens').findOne({ token: refreshToken });
    if (!stored || stored.expiresAt < new Date()) {
        if (stored) await db.collection('refreshTokens').deleteOne({ _id: stored._id });
        throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    let payload: { userId: string };
    try {
        payload = verifyRefreshToken(refreshToken);
    } catch (e) {
        await db.collection('refreshTokens').deleteOne({ _id: stored._id });
        throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(payload.userId) });
    if (!user) {
        await db.collection('refreshTokens').deleteOne({ _id: stored._id });
        throw new AppError(401, 'User not found', 'USER_NOT_FOUND');
    }

    // Rotate token
    await db.collection('refreshTokens').deleteOne({ _id: stored._id });
    const tokens = await generateTokens(user._id.toString(), user.email);
    return { tokens };
}

export async function getDemoCredentials() {
    const db = await getDb();
    const demoEmail = 'demo@studygenius.com';
    const demoPassword = 'Demo1234!';
    let user = await db.collection('users').findOne({ email: demoEmail });
    if (!user) {
        const passwordHash = await bcrypt.hash(demoPassword, SALT_ROUNDS);
        const now = new Date();
        const result = await db.collection('users').insertOne({
            email: demoEmail,
            passwordHash,
            name: 'Demo User',
            createdAt: now,
            updatedAt: now,
        } as User);
        user = { _id: result.insertedId, email: demoEmail, passwordHash, name: 'Demo User', createdAt: now, updatedAt: now };
    }
    return { email: demoEmail, password: demoPassword };
}

// Helpers
async function generateTokens(userId: string, email: string) {
    const accessToken = signAccessToken({ userId, email });
    const refreshTokenValue = signRefreshToken({ userId });
    const db = await getDb();
    const tokenDoc: RefreshToken = {
        token: refreshTokenValue,
        userId: new ObjectId(userId),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
    } as RefreshToken;
    await db.collection('refreshTokens').insertOne(tokenDoc);
    return { accessToken, refreshToken: refreshTokenValue };
}

function sanitizeUser(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
}