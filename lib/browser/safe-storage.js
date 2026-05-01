function isBrowser() {
  return typeof window !== "undefined";
}

function getStorage(type) {
  if (!isBrowser()) {
    return null;
  }

  try {
    const storage = window[type];
    const testKey = "__chaohuaxishi_storage_test__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch (error) {
    console.warn(`${type} 不可用，将使用内存兜底:`, error);
    return null;
  }
}

export function readStorageValue(key, options = {}) {
  const storage = getStorage(options.type || "localStorage");
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch (error) {
    console.error(`读取 ${key} 失败:`, error);
    return null;
  }
}

export function writeStorageValue(key, value, options = {}) {
  const storage = getStorage(options.type || "localStorage");
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`保存 ${key} 失败:`, error);
    return false;
  }
}

export function removeStorageValue(key, options = {}) {
  const storage = getStorage(options.type || "localStorage");
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`删除 ${key} 失败:`, error);
    return false;
  }
}

export function removeStorageValues(keys, options = {}) {
  if (!Array.isArray(keys) || !keys.length) {
    return false;
  }

  const storage = getStorage(options.type || "localStorage");
  if (!storage) {
    return false;
  }

  let removed = false;
  for (const key of keys) {
    try {
      storage.removeItem(key);
      removed = true;
    } catch (error) {
      console.error(`删除 ${key} 失败:`, error);
    }
  }

  return removed;
}
