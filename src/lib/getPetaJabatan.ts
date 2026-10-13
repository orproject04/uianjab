import { apiFetch } from "./apiFetch";

let petaPromise: Record<string, Promise<any[]>> = {};

export async function getPetaJabatan(force = false, versi_id = "AKTIF"): Promise<any[]> {
    if (petaPromise[versi_id] && !force) return petaPromise[versi_id];

    petaPromise[versi_id] = (async () => {
        const res = await apiFetch(`/api/peta-jabatan?versi_id=${versi_id}`);
        if (!res.ok) throw new Error(`Failed to load peta jabatan (${res.status})`);
        const json = await res.json();
        return json;
    })();

    return petaPromise[versi_id];
}

export function clearPetaJabatanCache() {
    petaPromise = {};
}
