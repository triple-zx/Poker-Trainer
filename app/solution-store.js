// Large complete trees belong in IndexedDB, not the small localStorage journal.
async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("poker-solutions", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("solutions");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function solutionStore(key, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "solutions",
        value === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("solutions");
      const request =
        value === undefined ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error("Saving was interrupted"));
    });
  } finally {
    db.close();
  }
}
