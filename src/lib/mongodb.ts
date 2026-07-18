import { MongoClient, Db, ObjectId } from 'mongodb';
import { env } from '../config/env';

let client: MongoClient | undefined;
let db: any | undefined;
let isMock = false;

// Global memory store for mock db
const memoryStore: { [collectionName: string]: any[] } = {
    users: [],
    refreshTokens: [],
    plans: [],
    reviews: [],
    interactions: [],
};

class MockCursor {
    items: any[];
    constructor(items: any[]) {
        this.items = items;
    }

    sort(spec: any) {
        const keys = Object.keys(spec);
        this.items.sort((a, b) => {
            for (const key of keys) {
                const order = spec[key];
                const valA = a[key];
                const valB = b[key];
                if (valA !== valB) {
                    if (valA < valB) return order === 1 ? -1 : 1;
                    if (valA > valB) return order === 1 ? 1 : -1;
                }
            }
            return 0;
        });
        return this;
    }

    skip(n: number) {
        this.items = this.items.slice(n);
        return this;
    }

    limit(n: number) {
        this.items = this.items.slice(0, n);
        return this;
    }

    project(proj: any) {
        this.items = this.items.map(item => {
            const newItem: any = {};
            for (const key of Object.keys(proj)) {
                if (proj[key] === 1) {
                    newItem[key] = item[key];
                }
            }
            if (item._id && proj._id !== 0) {
                newItem._id = item._id;
            }
            return newItem;
        });
        return this;
    }

    async toArray() {
        return JSON.parse(JSON.stringify(this.items));
    }
}

function matchFilter(item: any, filter: any): boolean {
    if (!filter) return true;
    for (const key of Object.keys(filter)) {
        const val = filter[key];

        if (key === '$or' && Array.isArray(val)) {
            if (!val.some(subFilter => matchFilter(item, subFilter))) return false;
            continue;
        }

        // Standard key: val. Could be operators
        if (val && typeof val === 'object' && !(val instanceof ObjectId) && !(val instanceof Date)) {
            if ('$gt' in val) {
                if (!(item[key] > val.$gt)) return false;
                continue;
            }
            if ('$gte' in val) {
                if (!(item[key] >= val.$gte)) return false;
                continue;
            }
            if ('$lt' in val) {
                if (!(item[key] < val.$lt)) return false;
                continue;
            }
            if ('$lte' in val) {
                if (!(item[key] <= val.$lte)) return false;
                continue;
            }
            if ('$ne' in val) {
                const neValStr = val.$ne ? val.$ne.toString() : '';
                const itemValStr = item[key] ? item[key].toString() : '';
                if (itemValStr === neValStr) return false;
                continue;
            }
            if ('$in' in val && Array.isArray(val.$in)) {
                const inArr = val.$in.map((x: any) => x ? x.toString() : '');
                const itemValStr = item[key] ? item[key].toString() : '';
                if (!inArr.includes(itemValStr)) return false;
                continue;
            }
        }

        // Handle path keys (e.g. 'items.title')
        if (key.includes('.')) {
            const parts = key.split('.');
            let currentVal = item;
            for (const part of parts) {
                if (Array.isArray(currentVal)) {
                    currentVal = currentVal.map(sub => sub ? sub[part] : undefined);
                } else if (currentVal && typeof currentVal === 'object') {
                    currentVal = currentVal[part];
                } else {
                    currentVal = undefined;
                }
            }
            if (Array.isArray(currentVal)) {
                if (!currentVal.includes(val)) return false;
            } else if (currentVal !== val) {
                return false;
            }
            continue;
        }

        if (key === '_id') {
            const itemVal = item._id ? item._id.toString() : '';
            const filterVal = val ? val.toString() : '';
            if (itemVal !== filterVal) return false;
            continue;
        }

        // Standard comparison
        const itemValStr = item[key] instanceof ObjectId || item[key] instanceof Date ? item[key].toString() : item[key];
        const valStr = val instanceof ObjectId || val instanceof Date ? val.toString() : val;
        if (itemValStr !== valStr) {
            return false;
        }
    }
    return true;
}

class MockCollection {
    name: string;
    constructor(name: string) {
        this.name = name;
        if (!memoryStore[name]) {
            memoryStore[name] = [];
        }
    }

    private getStore() {
        return memoryStore[this.name];
    }

    async findOne(filter: any) {
        const store = this.getStore();
        const found = store.find(item => matchFilter(item, filter));
        return found ? JSON.parse(JSON.stringify(found)) : null;
    }

    async insertOne(doc: any) {
        const store = this.getStore();
        const inserted = { ...doc };
        if (!inserted._id) {
            inserted._id = new ObjectId();
        } else if (typeof inserted._id === 'string') {
            inserted._id = new ObjectId(inserted._id);
        }
        store.push(inserted);
        return {
            acknowledged: true,
            insertedId: inserted._id,
        };
    }

    async updateOne(filter: any, update: any) {
        const store = this.getStore();
        const index = store.findIndex(item => matchFilter(item, filter));
        if (index !== -1) {
            const item = store[index];
            if (update.$set) {
                for (const key of Object.keys(update.$set)) {
                    const val = update.$set[key];
                    if (key.includes('.$.')) {
                        const [arrayKey, fieldKey] = key.split('.$.');
                        const arr = item[arrayKey];
                        if (Array.isArray(arr)) {
                            const filterVal = filter[`${arrayKey}.title`] || filter['items.title'];
                            const matchedElem = arr.find(el => el && el.title === filterVal);
                            if (matchedElem) {
                                matchedElem[fieldKey] = val;
                            }
                        }
                    } else if (key.includes('.')) {
                        const parts = key.split('.');
                        let current = item;
                        for (let i = 0; i < parts.length - 1; i++) {
                            current = current[parts[i]] || {};
                        }
                        current[parts[parts.length - 1]] = val;
                    } else {
                        item[key] = val;
                    }
                }
            }
            return { acknowledged: true, modifiedCount: 1, matchedCount: 1 };
        }
        return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
    }

    async findOneAndUpdate(filter: any, update: any, options?: any) {
        const store = this.getStore();
        const index = store.findIndex(item => matchFilter(item, filter));
        if (index !== -1) {
            const item = store[index];
            if (update.$set) {
                Object.assign(item, update.$set);
            }
            return JSON.parse(JSON.stringify(item));
        }
        return null;
    }

    async deleteOne(filter: any) {
        const store = this.getStore();
        const index = store.findIndex(item => matchFilter(item, filter));
        if (index !== -1) {
            store.splice(index, 1);
            return { acknowledged: true, deletedCount: 1 };
        }
        return { acknowledged: true, deletedCount: 0 };
    }

    async deleteMany(filter: any) {
        const store = this.getStore();
        let deletedCount = 0;
        for (let i = store.length - 1; i >= 0; i--) {
            if (matchFilter(store[i], filter)) {
                store.splice(i, 1);
                deletedCount++;
            }
        }
        return { acknowledged: true, deletedCount };
    }

    async countDocuments(filter: any) {
        const store = this.getStore();
        const matched = store.filter(item => matchFilter(item, filter));
        return matched.length;
    }

    find(filter: any = {}) {
        const store = this.getStore();
        const matched = store.filter(item => matchFilter(item, filter));
        return new MockCursor(matched);
    }

    aggregate(pipeline: any[]) {
        let current = [...this.getStore()];

        for (const stage of pipeline) {
            if (stage.$match) {
                current = current.filter(item => matchFilter(item, stage.$match));
            } else if (stage.$lookup) {
                const { from, localField, foreignField, as } = stage.$lookup;
                const otherStore = memoryStore[from] || [];
                for (const item of current) {
                    const lVal = item[localField];
                    const lValStr = lVal ? lVal.toString() : '';
                    item[as] = otherStore.filter((other: any) => {
                        const fVal = other[foreignField];
                        const fValStr = fVal ? fVal.toString() : '';
                        return lValStr && fValStr && lValStr === fValStr;
                    });
                }
            } else if (stage.$addFields) {
                for (const item of current) {
                    for (const key of Object.keys(stage.$addFields)) {
                        const valExpr = stage.$addFields[key];
                        if (valExpr && valExpr.$avg) {
                            const arrPath = valExpr.$avg.replace(/^\$/, '');
                            const parts = arrPath.split('.');
                            const reviews = item[parts[0]] || [];
                            const sum = reviews.reduce((acc: number, r: any) => acc + (r[parts[1]] || 0), 0);
                            item[key] = reviews.length > 0 ? sum / reviews.length : 0;
                        } else if (valExpr && valExpr.$size) {
                            const arrPath = valExpr.$size.replace(/^\$/, '');
                            const reviews = item[arrPath] || [];
                            item[key] = reviews.length;
                        }
                    }
                }
            } else if (stage.$project) {
                for (const item of current) {
                    for (const key of Object.keys(stage.$project)) {
                        if (stage.$project[key] === 0) {
                            delete item[key];
                        }
                    }
                }
            } else if (stage.$sort) {
                const sortKeys = Object.keys(stage.$sort);
                current.sort((a, b) => {
                    for (const key of sortKeys) {
                        const order = stage.$sort[key];
                        const valA = a[key];
                        const valB = b[key];
                        if (valA !== valB) {
                            if (valA < valB) return order === 1 ? -1 : 1;
                            if (valA > valB) return order === 1 ? 1 : -1;
                        }
                    }
                    return 0;
                });
            } else if (stage.$skip) {
                current = current.slice(stage.$skip);
            } else if (stage.$limit) {
                current = current.slice(0, stage.$limit);
            } else if (stage.$count) {
                return new MockCursor([{ [stage.$count]: current.length }]);
            }
        }

        return new MockCursor(current);
    }
}

class MockDb {
    collection(name: string) {
        return new MockCollection(name);
    }
}

export async function getDb(): Promise<Db> {
    if (db) return db;

    if (!env.MONGODB_URI || env.MONGODB_URI.includes('mock') || env.MONGODB_URI.includes('localhost') || env.MONGODB_URI.includes('127.0.0.1')) {
        console.warn('⚠️ No external MONGODB_URI or local URI provided. Falling back to In-Memory Mock MongoDB.');
        isMock = true;
        db = new MockDb() as unknown as Db;
        return db;
    }

    try {
        client = new MongoClient(env.MONGODB_URI, {
            maxPoolSize: 1,
            serverSelectionTimeoutMS: 3000,
            socketTimeoutMS: 10000,
        });

        await client.connect();
        db = client.db(env.MONGODB_DB_NAME);
        console.log('✅ Successfully connected to MongoDB');
        return db;
    } catch (err: any) {
        console.warn(`⚠️ Failed to connect to MongoDB (${err.message}). Falling back to In-Memory Mock MongoDB.`);
        isMock = true;
        db = new MockDb() as unknown as Db;
        return db;
    }
}

export async function closeDb(): Promise<void> {
    await client?.close();
    client = undefined;
    db = undefined;
}