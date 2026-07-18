import { getDb } from '../../lib/mongodb';
import { AppError } from '../../middlewares/errorHandler';
import { Plan, Review } from '../../types';
import { ObjectId, Filter } from 'mongodb';

export async function getPlans(query: {
    search?: string;
    subject?: string;
    difficulty?: string;
    minRating?: number;
    sortBy: string;
    page: number;
    limit: number;
}) {
    const db = await getDb();
    const filter: Filter<Plan> = {};

    if (query.subject) filter.subject = query.subject;
    if (query.difficulty) filter.difficulty = query.difficulty as Plan['difficulty'];
    if (query.search) filter.$text = { $search: query.search };

    const pipeline: any[] = [
        { $match: filter },
        {
            $lookup: {
                from: 'reviews',
                localField: '_id',
                foreignField: 'planId',
                as: 'reviews',
            },
        },
        {
            $addFields: {
                avgRating: { $avg: '$reviews.rating' },
                reviewCount: { $size: '$reviews' },
            },
        },
    ];

    if (query.minRating && query.minRating > 0) {
        pipeline.push({ $match: { avgRating: { $gte: query.minRating } } });
    }

    let sort: any = { createdAt: -1 };
    if (query.sortBy === 'rating') sort = { avgRating: -1, createdAt: -1 };
    if (query.sortBy === 'hours') sort = { estimatedHours: 1 };

    pipeline.push({ $sort: sort });

    const totalCountPipeline = [...pipeline, { $count: 'total' }];
    const totalResult = await db.collection('plans').aggregate(totalCountPipeline).toArray();
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    pipeline.push({ $skip: (query.page - 1) * query.limit });
    pipeline.push({ $limit: query.limit });

    // Remove reviews array from output (only keep avgRating and reviewCount)
    pipeline.push({ $project: { reviews: 0 } });

    const plans = await db.collection('plans').aggregate(pipeline).toArray();

    return {
        plans,
        pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        },
    };
}

export async function getPlanById(planId: string) {
    const db = await getDb();
    const _id = new ObjectId(planId);

    const pipeline = [
        { $match: { _id } },
        {
            $lookup: {
                from: 'reviews',
                localField: '_id',
                foreignField: 'planId',
                as: 'reviews',
            },
        },
        {
            $addFields: {
                avgRating: { $avg: '$reviews.rating' },
                reviewCount: { $size: '$reviews' },
            },
        },
        { $project: { reviews: 0 } },
    ];

    const plans = await db.collection('plans').aggregate(pipeline).toArray();
    if (plans.length === 0) throw new AppError(404, 'Plan not found', 'NOT_FOUND');
    return plans[0];
}

export async function createPlan(data: Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>) {
    const db = await getDb();
    const now = new Date();
    const doc = { ...data, createdAt: now, updatedAt: now };
    const result = await db.collection<Plan>('plans').insertOne(doc as any);
    return { _id: result.insertedId, ...doc };
}

export async function updatePlan(planId: string, userId: string, data: Partial<Plan>) {
    const db = await getDb();
    const _id = new ObjectId(planId);
    const plan = await db.collection<Plan>('plans').findOne({ _id });
    if (!plan) throw new AppError(404, 'Plan not found', 'NOT_FOUND');
    if (plan.userId.toString() !== userId) throw new AppError(403, 'Not authorized', 'FORBIDDEN');

    const updated = await db.collection<Plan>('plans').findOneAndUpdate(
        { _id },
        { $set: { ...data, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      const updatedDoc = updated?.value as Plan | null;
      if (!updatedDoc) {
        throw new AppError(500, 'Update failed', 'UPDATE_FAILED');
      }

    // findOneAndUpdate returns the updated document directly (or null)
    // handled above

    return updatedDoc;
}

export async function deletePlan(planId: string, userId: string) {
    const db = await getDb();
    const _id = new ObjectId(planId);
    const plan = await db.collection<Plan>('plans').findOne({ _id });
    if (!plan) throw new AppError(404, 'Plan not found', 'NOT_FOUND');
    if (plan.userId.toString() !== userId) throw new AppError(403, 'Not authorized', 'FORBIDDEN');

    await db.collection<Plan>('plans').deleteOne({ _id });
    // Also delete associated reviews
    await db.collection<Review>('reviews').deleteMany({ planId: _id });
}

export async function getUserPlans(userId: string) {
    const db = await getDb();
    return db.collection<Plan>('plans').find({ userId: new ObjectId(userId) }).sort({ createdAt: -1 }).toArray();
}

// Reviews
export async function addReview(planId: string, userId: string, data: { rating: number; comment: string }) {
    const db = await getDb();
    const plan = await db.collection<Plan>('plans').findOne({ _id: new ObjectId(planId) });
    if (!plan) throw new AppError(404, 'Plan not found', 'NOT_FOUND');

    // Optional: one review per user per plan
    const existing = await db.collection<Review>('reviews').findOne({
        planId: new ObjectId(planId),
        userId: new ObjectId(userId),
    });
    if (existing) throw new AppError(409, 'You already reviewed this plan', 'ALREADY_REVIEWED');

    const doc: Review = {
        planId: new ObjectId(planId),
        userId: new ObjectId(userId),
        rating: data.rating,
        comment: data.comment,
        createdAt: new Date(),
    } as Review;
    await db.collection<Review>('reviews').insertOne(doc);
    return doc;
}

export async function getPlanReviews(planId: string, page: number = 1, limit: number = 10) {
    const db = await getDb();
    const filter = { planId: new ObjectId(planId) };
    const total = await db.collection<Review>('reviews').countDocuments(filter);
    const reviews = await db.collection<Review>('reviews').find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
    return { reviews, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getRelatedPlans(planId: string, limit: number = 4) {
    const db = await getDb();
    const plan = await db.collection<Plan>('plans').findOne({ _id: new ObjectId(planId) });
    if (!plan) return [];
    // Find plans with same subject or difficulty, excluding current
    const related = await db
        .collection<Plan>('plans')
        .find({
            _id: { $ne: plan._id },
            $or: [{ subject: plan.subject }, { difficulty: plan.difficulty }],
        })
        .limit(limit)
        .toArray();
    return related;
}