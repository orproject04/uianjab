'use client';

import React, { useEffect, useState } from 'react';

export default function InformasiJabatanPage() {
  const [namaJabatan, setNamaJabatan] = useState('');
  const [kodeJabatan, setKodeJabatan] = useState('');
  const [unitKerja, setUnitKerja] = useState<Record<string, string>>({}); // atau gunakan type yang lebih spesifik
  const [loading, setLoading] = useState(false);

  // ⬇️ Ambil data dari API saat halaman load
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/anjab');
        const data = await res.json();
        setNamaJabatan(data.nama_jabatan || '');
        setKodeJabatan(data.kode_jabatan || '');
        setUnitKerja(data.unit_kerja || '');
      } catch (err) {
        console.error('Gagal ambil data:', err);
      }
    };
    fetchData();
  }, []);

  const generatePDF = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          namaJabatan,
          kodeJabatan,
          unitKerja,
          date: new Date().toLocaleDateString(),
        }),
      });

      if (!response.ok) throw new Error('Gagal generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document.pdf';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Gagal: ' + err);
    } finally {
      setLoading(false);
    }
  };


  const handleChangeUnitKerja = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUnitKerja((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
      <div style={{ maxWidth: 600, margin: 'auto', padding: 20 }}>
        <h1>Generate PDF</h1>

        <div style={{ marginBottom: '1rem' }}>
          <label>
            Nama Jabatan:{' '}
            <input
                type="text"
                value={namaJabatan}
                onChange={(e) => setNamaJabatan(e.target.value)}
            />
          </label>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>
            Kode Jabatan:{' '}
            <input
                type="text"
                value={kodeJabatan}
                onChange={(e) => setKodeJabatan(e.target.value)}
            />
          </label>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>
            Administrator:{' '}
            <input
                type="text"
                name="Administrator"
                value={unitKerja['Administrator'] || ''}
                onChange={handleChangeUnitKerja}
            />
          </label>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>
            Pengawas:{' '}
            <input
                name="Pengawas"
                type="text"
                value={unitKerja['Pengawas'] || ''}
                onChange={handleChangeUnitKerja}
            />
          </label>
        </div>

        <div className="p-4">
          <h1 className="text-xl font-bold mb-4">Unit Kerja</h1>
          <ul className="list-disc pl-4">
            {Object.entries(unitKerja).map(([key, value]) => (
                <li key={key}>
                  <strong>{key}:</strong> {value}
                </li>
            ))}
          </ul>
        </div>
        {/*<p>{unitKerja['Administrator']}</p>*/}

        <button onClick={generatePDF} disabled={loading}>
          {loading ? 'Generating...' : 'Generate PDF'}
        </button>
      </div>
  );
}

