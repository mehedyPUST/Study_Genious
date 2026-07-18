import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { getDb } from '../../lib/mongodb';
import { AppError } from '../../middlewares/errorHandler';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { User } from '../../types';

const router = Router();

// Get user profile
router.get('/', authenticate, async (req, res, next) => {
    try {
        const db = await getDb();
        const user = await db.collection<User>('users').findOne(
            { _id: new ObjectId((req as any).userId) },
            { projection: { passwordHash: 0 } }
        );
        if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

// Update profile (name, email, avatar)
router.put('/', authenticate, async (req, res, next) => {
    try {
        const { name, email, avatar } = req.body;
        const db = await getDb();
        const userId = (req as any).userId;

        // Check if email already taken by another user
        if (email) {
            const existing = await db.collection<User>('users').findOne({
                email,
                _id: { $ne: new ObjectId(userId) },
            });
            if (existing) throw new AppError(409, 'Email already in use', 'EMAIL_EXISTS');
        }

        const updateData: any = { updatedAt: new Date() };
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (avatar !== undefined) updateData.avatar = avatar;

        await db.collection<User>('users').updateOne(
            { _id: new ObjectId(userId) },
            { $set: updateData }
        );

        const updatedUser = await db.collection<User>('users').findOne(
            { _id: new ObjectId(userId) },
            { projection: { passwordHash: 0 } }
        );

        res.json({ success: true, data: updatedUser });
    } catch (error) {
        next(error);
    }
});

// Change password
router.put('/password', authenticate, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const db = await getDb();
        const userId = (req as any).userId;

        if (!currentPassword || !newPassword) {
            throw new AppError(400, 'Current password and new password are required', 'MISSING_FIELDS');
        }

        if (newPassword.length < 8) {
            throw new AppError(400, 'New password must be at least 8 characters', 'WEAK_PASSWORD');
        }

        const user = await db.collection<User>('users').findOne({ _id: new ObjectId(userId) });
        if (!user || !user.passwordHash) {
            throw new AppError(400, 'Cannot change password for social login accounts', 'SOCIAL_ACCOUNT');
        }

        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) {
            throw new AppError(400, 'Current password is incorrect', 'WRONG_PASSWORD');
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        await db.collection<User>('users').updateOne(
            { _id: new ObjectId(userId) },
            { $set: { passwordHash: newHash, updatedAt: new Date() } }
        );

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;