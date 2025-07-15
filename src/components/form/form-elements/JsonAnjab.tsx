'use client';

import { useState } from 'react';

export default function JsonAnjab() {
    const [message, setMessage] = useState('');

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const validDataList: any[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (file.type !== 'application/json') {
                setMessage(`File ${file.name} bukan JSON`);
                continue;
            }

            const content = await file.text();

            try {
                const json = JSON.parse(content);

                if (!json.data || !json.data["NAMA JABATAN"] || !json.data["UNIT KERJA"]) {
                    setMessage(`Struktur tidak valid di file ${file.name}`);
                    continue;
                }

                validDataList.push(json.data);
            } catch (err) {
                console.error(`Error parsing ${file.name}:`, err);
                setMessage(`File ${file.name} gagal diparsing`);
            }
        }

        if (validDataList.length === 0) {
            setMessage('Tidak ada file yang valid');
            return;
        }

        try {
            const res = await fetch('/api/upload-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: validDataList }),
            });

            const result = await res.json();
            setMessage(result.message || 'Upload berhasil');
        } catch (err) {
            console.error(err);
            setMessage('Gagal mengirim ke server');
        }
    };

    return (
        <div className="p-4 border rounded">
            <h2 className="text-xl font-bold mb-2">Upload Beberapa File JSON</h2>
            <input type="file" accept=".json" multiple onChange={handleFileUpload} />
            {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
        </div>
    );
}
