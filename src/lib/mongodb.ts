import { Db, Collection, ObjectId, Filter, ModifyResult, DeleteResult, UpdateFilter } from 'mongodb';

const store: Record<string, any[]> = {};

function createMockCollection<T>(name: string): Collection<T> {
  if (!store[name]) store[name] = [];
  function match(item: any, filter: Filter<T>): boolean {
    if (!filter) return true;
    for (const k of Object.keys(filter)) {
      const v = (filter as any)[k];
      if (k.includes('.')) {
        const parts = k.split('.');
        let cur = item;
        for (const p of parts) { if (Array.isArray(cur)) return cur.some(el => match(el, { [parts.slice(1).join('.')]: v })); cur = cur?.[p]; }
        if (cur !== v) return false;
        continue;
      }
      if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof ObjectId)) {
        if ('' in v && !(item[k] > v.)) return false;
        if ('' in v && !(item[k] >= v.)) return false;
        if ('' in v && !(item[k] < v.)) return false;
        if ('' in v && !(item[k] <= v.)) return false;
        if ('' in v && item[k] === v.) return false;
        if ('' in v && !v..includes(item[k])) return false;
        continue;
      }
      const iv = item[k] instanceof ObjectId ? item[k].toString() : item[k];
      const fv = v instanceof ObjectId ? v.toString() : v;
      if (iv !== fv) return false;
    }
    return true;
  }

  const coll = {
    async findOne(filter: Filter<T>): Promise<T | null> {
      const found = store[name].find(i => match(i, filter));
      return found ? { ...found } : null;
    },
    async insertOne(doc: any): Promise<any> {
      const nd = { ...doc, _id: doc._id || new ObjectId().toString() };
      store[name].push(nd);
      return { acknowledged: true, insertedId: nd._id };
    },
    async updateOne(filter: Filter<T>, update: UpdateFilter<T>): Promise<any> {
      const item = store[name].find(i => match(i, filter));
      if (item && update.) Object.assign(item, update.);
      return { acknowledged: true, matchedCount: item ? 1 : 0, modifiedCount: item ? 1 : 0 };
    },
    async findOneAndUpdate(filter: Filter<T>, update: UpdateFilter<T>, opts?: any): Promise<ModifyResult<T>> {
      const item = store[name].find(i => match(i, filter));
      if (item && update.) { Object.assign(item, update.); return { value: { ...item }, ok: 1, lastErrorObject: undefined }; }
      return { value: null as any, ok: 1, lastErrorObject: undefined };
    },
    async deleteOne(filter: Filter<T>): Promise<DeleteResult> {
      const idx = store[name].findIndex(i => match(i, filter));
      if (idx > -1) store[name].splice(idx, 1);
      return { acknowledged: true, deletedCount: idx > -1 ? 1 : 0 };
    },
    async deleteMany(filter: Filter<T>): Promise<DeleteResult> {
      let c = 0;
      for (let i = store[name].length - 1; i >= 0; i--) { if (match(store[name][i], filter)) { store[name].splice(i, 1); c++; } }
      return { acknowledged: true, deletedCount: c };
    },
    async countDocuments(filter: Filter<T>): Promise<number> {
      return store[name].filter(i => match(i, filter)).length;
    },
    find(filter: Filter<T> = {}): any {
      let res = store[name].filter(i => match(i, filter));
      const cursor = {
        sort: (spec: any) => { const keys = Object.keys(spec); res.sort((a,b) => { for (const k of keys) { const o = spec[k]; if (a[k] < b[k]) return -o; if (a[k] > b[k]) return o; } return 0; }); return cursor; },
        skip: (n: number) => { res = res.slice(n); return cursor; },
        limit: (n: number) => { res = res.slice(0, n); return cursor; },
        project: (proj: any) => { res = res.map(item => { const ni: any = {}; for (const k of Object.keys(proj)) if (proj[k] === 1) ni[k] = item[k]; return ni; }); return cursor; },
        toArray: async () => res.map(i => ({ ...i })),
      };
      return cursor;
    },
    aggregate(pipeline: any[]): any { return { toArray: async () => store[name] }; },
    createIndex: async () => {},
  };
  return coll as unknown as Collection<T>;
}

let dbInst: Db | undefined;
export async function getDb(): Promise<Db> {
  if (dbInst) return dbInst;
  dbInst = { collection: <T>(name: string) => createMockCollection<T>(name) } as unknown as Db;
  return dbInst;
}
export async function closeDb(): Promise<void> {}
