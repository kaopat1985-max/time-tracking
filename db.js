const DB = (() => {
  const dbName = 'time-tracker-db';
  const dbVersion = 1;
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = (event) => {
        const db2 = event.target.result;
        if (!db2.objectStoreNames.contains('projects')) {
          const p = db2.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
          p.createIndex('name', 'name', { unique: true });
        }
        if (!db2.objectStoreNames.contains('tasks')) {
          const t = db2.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
          t.createIndex('projectId', 'projectId', { unique: false });
        }
        if (!db2.objectStoreNames.contains('timeEntries')) {
          const e = db2.createObjectStore('timeEntries', { keyPath: 'id', autoIncrement: true });
          e.createIndex('date', 'date', { unique: false });
          e.createIndex('taskId', 'taskId', { unique: false });
        }
      };
      request.onsuccess = () => {
        db = request.result;
        ensureNoProject().then(() => resolve());
      };
      request.onerror = () => reject(request.error);
    });
  }

  function _tx(storeNames, mode='readonly') {
    const tx = db.transaction(storeNames, mode);
    const stores = storeNames.reduce((agg, name) => ({ ...agg, [name]: tx.objectStore(name) }), {});
    return { tx, stores };
  }

  function getStoreAll(storeName) {
    return new Promise((resolve, reject) => {
      const { stores } = _tx([storeName]);
      const req = stores[storeName].getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getByIndex(storeName, index, value) {
    return new Promise((resolve, reject) => {
      const { stores } = _tx([storeName]);
      const req = stores[storeName].index(index).get(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getByKey(storeName, key) {
    return new Promise((resolve, reject) => {
      const { stores } = _tx([storeName]);
      const req = stores[storeName].get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function put(storeName, item) {
    return new Promise((resolve, reject) => {
      const { stores } = _tx([storeName], 'readwrite');
      const req = stores[storeName].put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function remove(storeName, key) {
    return new Promise((resolve, reject) => {
      const { stores } = _tx([storeName], 'readwrite');
      const req = stores[storeName].delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function ensureNoProject() {
    const all = await getStoreAll('projects');
    if (!all.find(p => p.name === 'No Project')) {
      await put('projects', { id: 1, name: 'No Project', createdAt: new Date().toISOString(), fixed: true });
    }
  }

  async function getProjects() {
    const r = await getStoreAll('projects');
    return r.sort((a,b)=>a.id-b.id);
  }

  async function addProject(name) {
    const project = { name, createdAt: new Date().toISOString(), fixed: false };
    return put('projects', project);
  }

  async function updateProject(id, name) {
    const existing = await getByKey('projects', id);
    if (!existing) throw new Error('Project not found');
    if (existing.fixed) throw new Error('Cannot edit No Project');
    existing.name = name;
    return put('projects', existing);
  }

  async function deleteProject(id) {
    const existing = await getByKey('projects', id);
    if (!existing) throw new Error('Project not found');
    if (existing.fixed) throw new Error('Cannot delete No Project');
    const tasks = await getTasksByProject(id);
    for (const t of tasks) await remove('tasks', t.id);
    return remove('projects', id);
  }

  async function getTasks() {
    return getStoreAll('tasks');
  }

  async function getTasksByProject(projectId) {
    return new Promise((resolve, reject) => {
      const { stores } = _tx(['tasks']);
      const index = stores.tasks.index('projectId');
      const range = IDBKeyRange.only(projectId);
      const req = index.getAll(range);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function addTask(name, projectId) {
    const task = { name, projectId, createdAt: new Date().toISOString() };
    return put('tasks', task);
  }

  async function updateTask(id, name) {
    const existing = await getByKey('tasks', id);
    if (!existing) throw new Error('Task not found');
    existing.name = name;
    return put('tasks', existing);
  }

  async function deleteTask(id) {
    return remove('tasks', id);
  }

  async function addTimeEntry(entry) {
    return put('timeEntries', entry);
  }

  async function getTimeEntriesForDate(date) {
    return new Promise((resolve, reject) => {
      const { stores } = _tx(['timeEntries']);
      const index = stores.timeEntries.index('date');
      const req = index.getAll(IDBKeyRange.only(date));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    openDB,
    getProjects,
    addProject,
    updateProject,
    deleteProject,
    getTasks,
    getTasksByProject,
    addTask,
    updateTask,
    deleteTask,
    addTimeEntry,
    getTimeEntriesForDate,
    getByKey
  };
})();
