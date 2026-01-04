import { apiFetch } from "./apiFetch";

let petaPromise: Promise<any[]> | null = null;

export async function getPetaJabatan(force = false): Promise<any[]> {
    if (petaPromise && !force) return petaPromise;

    petaPromise = (async () => {
        const res = await apiFetch("/api/peta-jabatan");
        if (!res.ok) throw new Error(`Failed to load peta jabatan (${res.status})`);
        const json = await res.json();
        return json;
    })();

    return petaPromise;
}

export function clearPetaJabatanCache() {
    petaPromise = null;
}
