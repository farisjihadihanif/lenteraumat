import { useEffect, useState } from "react";
import { api } from "./api";

// Daftar kategori dari server (dikelola admin). Disimpan sementara supaya tidak diminta berulang.
let cache = null;
const listeners = new Set();

export function refreshCategories() {
  return api.get("/books/categories").then((r) => {
    cache = r.categories;
    listeners.forEach((fn) => fn(cache));
    return cache;
  });
}

export function useCategories() {
  const [items, setItems] = useState(cache || []);
  useEffect(() => {
    listeners.add(setItems);
    refreshCategories().catch(() => {}); // selalu segarkan: kategori bisa sudah dihapus
    return () => listeners.delete(setItems);
  }, []);
  return items;
}
