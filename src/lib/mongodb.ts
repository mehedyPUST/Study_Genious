// Simple in-memory mock – no network, no timeout
const store: Record<string, any[]> = {};

function createMockDb() {
  return {
    collection(name: string) {
      if (!store[name]) store[name] = [];
      return {
        findOne: async (filter: any) => store[name].find(item => matchFilter(item, filter)) || null,
        insertOne: async (doc: any) => {
          const newDoc = { ...doc, _id: Math.random().toString(36).substr(2, 9) };
          store[name].push(newDoc);
          return { insertedId: newDoc._id };
        },
        find: (filter: any) => ({
          sort: () => ({ toArray: async () => store[name].filter(item => matchFilter(item, filter)) }),
          toArray: async () => store[name].filter(item => matchFilter(item, filter)),
        }),
        deleteOne: async (filter: any) => {
          const idx = store[name].findIndex(item => matchFilter(item, filter));
          if (idx > -1) store[name].splice(idx, 1);
          return { deletedCount: idx > -1 ? 1 : 0 };
        },
        updateOne: async (filter: any, update: any) => {
          const item = store[name].find(item => matchFilter(item, filter));
          if (item && update.$set) Object.assign(item, update.$set);
          return { matchedCount: item ? 1 : 0 };
        },
        countDocuments: async (filter: any) => store[name].filter(item => matchFilter(item, filter)).length,
        aggregate: (pipeline: any[]) => ({ toArray: async () => store[name] }), // simplified
      };
    },
  };
}

function matchFilter(item: any, filter: any): boolean {
  if (!filter) return true;
  for (const key of Object.keys(filter)) {
    const val = filter[key];
    if (val && typeof val === 'object' && val.$gt) { if (!(item[key] > val.$gt)) return false; }
    else if (item[key] !== val) return false;
  }
  return true;
}

let db: any;
export async function getDb() {
  if (!db) db = createMockDb();
  return db;
}

export async function closeDb(): Promise<void> {}
