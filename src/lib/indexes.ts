import { getDb } from './mongodb';

export async function ensureIndexes() {
    const db = await getDb();
    await db.collection('plans').createIndex({ title: 'text', shortDescription: 'text' });
    await db.collection('plans').createIndex({ userId: 1 });
    await db.collection('plans').createIndex({ subject: 1, difficulty: 1 });
    await db.collection('reviews').createIndex({ planId: 1 });
    console.log('✅ Indexes were ensured');
}


// mamar desh