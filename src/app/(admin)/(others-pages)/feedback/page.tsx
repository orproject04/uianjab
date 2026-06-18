'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '@/context/MeContext';
import Swal from 'sweetalert2';
import { ChevronDownIcon, ChevronUpIcon, ArrowRightIcon } from '@/icons';

interface StatusHistoryEntry {
  status: string;
  changed_at: string;
  changed_by: string;
  notes?: string;
}

interface Feedback {
  id: string;
  user_id: string;
  nama_jabatan: string;
  unit_kerja: string;
  usulan_perbaikan: string;
  created_at: string;
  updated_at: string;
  status?: 'diusulkan' | 'ditindaklanjuti' | 'ditolak' | 'diterima';
  admin_notes?: string;
  status_history?: StatusHistoryEntry[];
  rating?: number;
  rating_comment?: string;
  user_name?: string;
  user_email?: string;
}

interface JabatanSuggestion {
  value: string;
  label: string;
  unit_kerja: string;
  peta_jabatan_id: string;
}

interface TugasPokokDetail {
  id_tahapan: string;
  nomor_tahapan: number | null;
  tahapan: string;
  detail_tahapan: string[];
}

interface TugasPokokItem {
  id_tugas: string;
  nomor_tugas: number | null;
  uraian_tugas: string[] | string | null;
  hasil_kerja: unknown;
  detail_uraian_tugas: TugasPokokDetail[];
}

interface JabatanDetail {
  id: string;
  nama_jabatan: string;
  tugas_pokok: TugasPokokItem[];
}

interface TaskSuggestionDraft {
  uraian_tugas: string;
  hasil_kerja: string;
}

interface HasilKerjaNode {
  text?: string;
  children?: HasilKerjaNode[];
}

interface ParsedTaskSuggestionRow {
  nomor: string;
  uraian_tugas: string;
  uraian_tugas_steps: {
    nomor: string;
    tahapan: string;
    detail_tahapan: string[];
  }[];
  hasil_kerja: HasilKerjaNode[];
  usulan_uraian_tugas: string;
  usulan_hasil_kerja: string;
}

type TabType = 'submit' | 'history';

export default function FeedbackPage() {
  const { me, isAdmin, isAdminJf, isAdminAKK, loading: meLoading } = useMe();
  const router = useRouter();
  // Admin-JF is treated as regular user for feedback
  const isActualAdmin = isAdmin && !isAdminJf && !isAdminAKK;
  // Change default to history
  const [activeTab, setActiveTab] = useState<TabType>('history');
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const [formData, setFormData] = useState({
    nama_jabatan: '',
    unit_kerja: '',
    usulan_perbaikan: '',
  });

  // Filter & sort state
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUpdatesOnly, setFilterUpdatesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Admin: track which rated items have been opened (per item id → rating value as string)
  const [seenRatingsMap, setSeenRatingsMap] = useState<Record<string, string>>({});

  // Track which feedback items user has already "seen" (by updated_at timestamp)
  // Stored in localStorage as { [feedbackId]: updatedAtIso }
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});

  // Load admin seenRatingsMap from localStorage
  useEffect(() => {
    if (!me || !isActualAdmin) return;
    try {
      const raw = localStorage.getItem(`feedback_ratings_seen_${me.id}`);
      setSeenRatingsMap(raw ? JSON.parse(raw) : {});
    } catch {
      setSeenRatingsMap({});
    }
  }, [me, isActualAdmin]);

  const markRatingAsSeen = (item: Feedback) => {
    if (!me || !isActualAdmin || !item.rating) return;
    const key = String(item.rating);
    if (seenRatingsMap[item.id] === key) return;
    const next = { ...seenRatingsMap, [item.id]: key };
    setSeenRatingsMap(next);
    try { localStorage.setItem(`feedback_ratings_seen_${me.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const isRatingUnread = (item: Feedback) => {
    if (!item.rating) return false;
    return seenRatingsMap[item.id] !== String(item.rating);
  };

  // Load seenMap from localStorage once user is known
  useEffect(() => {
    if (!me || isActualAdmin) return;
    try {
      const raw = localStorage.getItem(`feedback_seen_${me.id}`);
      setSeenMap(raw ? JSON.parse(raw) : {});
    } catch {
      setSeenMap({});
    }
  }, [me, isActualAdmin]);

  const markAsSeen = (item: Feedback) => {
    if (!me || isActualAdmin) return;
    // Track based on status_history length so that user-only changes (e.g. rating) don't re-trigger unread
    const adminState = String((item.status_history || []).length);
    if (seenMap[item.id] === adminState) return;
    const next = { ...seenMap, [item.id]: adminState };
    setSeenMap(next);
    try { localStorage.setItem(`feedback_seen_${me.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const isUnread = (item: Feedback) => {
    // Only flag items that have been acted on by admin (not just submitted)
    if (!item.status_history || item.status_history.length === 0) return false;
    // Use status_history length as "admin state" — only changes when admin adds an entry, not when user rates
    const adminState = String(item.status_history.length);
    return seenMap[item.id] !== adminState;
  };

  // Rating forms state
  const [ratingValues, setRatingValues] = useState<Record<string, { rating: number, comment: string }>>({});
  const [ratingSubmitting, setRatingSubmitting] = useState<Record<string, boolean>>({});

  // Admin edit state
  const [adminEditId, setAdminEditId] = useState<string | null>(null);
  const [adminFormData, setAdminFormData] = useState({ status: '', admin_notes: '' });
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  // Dropdown states for nama_jabatan
  const [jabatanList, setJabatanList] = useState<JabatanSuggestion[]>([]);
  const [jabatanLoading, setJabatanLoading] = useState(false);
  const [jabatanFilter, setJabatanFilter] = useState('');
  const [jabatanSelectedLabel, setJabatanSelectedLabel] = useState('');
  const [showJabatanDropdown, setShowJabatanDropdown] = useState(false);
  const [selectedPetaJabatanId, setSelectedPetaJabatanId] = useState('');
  const [jabatanDetail, setJabatanDetail] = useState<JabatanDetail | null>(null);
  const [jabatanDetailLoading, setJabatanDetailLoading] = useState(false);
  const [taskSuggestionMap, setTaskSuggestionMap] = useState<Record<string, TaskSuggestionDraft>>({});
  const jabatanRef = useRef<HTMLDivElement>(null);

  // Dropdown states for unit_kerja
  const [unitKerjaList, setUnitKerjaList] = useState<string[]>([]);
  const [unitKerjaLoading, setUnitKerjaLoading] = useState(false);
  const [unitKerjaFilter, setUnitKerjaFilter] = useState('');
  const [showUnitKerjaDropdown, setShowUnitKerjaDropdown] = useState(false);
  const unitKerjaRef = useRef<HTMLDivElement>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!meLoading && !me) {
      router.replace('/auth/signin');
    }
  }, [meLoading, me, router]);

  // Load all unit kerja list on mount
  useEffect(() => {
    if (me) {
      loadUnitKerjaList();
    }
  }, [me]);

  useEffect(() => {
    if (!formData.unit_kerja.trim()) {
      setJabatanList([]);
      setJabatanFilter('');
      setJabatanSelectedLabel('');
      setSelectedPetaJabatanId('');
      setJabatanDetail(null);
      setTaskSuggestionMap({});
      setShowJabatanDropdown(false);
      return;
    }

    loadJabatanList(formData.unit_kerja);
  }, [formData.unit_kerja]);

  useEffect(() => {
    if (!selectedPetaJabatanId.trim()) {
      setJabatanDetail(null);
      setTaskSuggestionMap({});
      return;
    }

    loadJabatanDetail(selectedPetaJabatanId);
  }, [selectedPetaJabatanId]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (unitKerjaRef.current && !unitKerjaRef.current.contains(e.target as Node)) {
        setShowUnitKerjaDropdown(false);
        setUnitKerjaFilter('');
      }
      if (jabatanRef.current && !jabatanRef.current.contains(e.target as Node)) {
        setShowJabatanDropdown(false);
        setJabatanFilter('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadUnitKerjaList = async () => {
    try {
      setUnitKerjaLoading(true);
      const res = await fetch('/api/feedback/suggestions?type=unit_kerja&q=');
      if (res.ok) {
        const json = await res.json();
        setUnitKerjaList(json?.data || []);
      }
    } catch (err) {
      console.error('Failed to load unit kerja list:', err);
    } finally {
      setUnitKerjaLoading(false);
    }
  };

  const loadJabatanList = async (unitKerja: string) => {
    if (!unitKerja.trim()) {
      setJabatanList([]);
      return;
    }

    try {
      setJabatanLoading(true);
      const res = await fetch(`/api/feedback/suggestions?type=jabatan&unit_kerja=${encodeURIComponent(unitKerja.trim())}&q=`);
      if (res.ok) {
        const json = await res.json();
        setJabatanList(json?.data || []);
      }
    } catch (err) {
      console.error('Failed to load jabatan list:', err);
      setJabatanList([]);
    } finally {
      setJabatanLoading(false);
    }
  };

  const filteredUnitKerja = unitKerjaList.filter((u) =>
    u.toLowerCase().includes(unitKerjaFilter.toLowerCase())
  );

  const filteredJabatan = jabatanList.filter((j) =>
    j.label.toLowerCase().includes(jabatanFilter.toLowerCase()) ||
    j.value.toLowerCase().includes(jabatanFilter.toLowerCase())
  );

  const formatTaskText = (value: unknown) => {
    if (value == null) {
      return '-';
    }

    if (Array.isArray(value)) {
      return value
        .flatMap((item) => {
          if (typeof item === 'string') return [item];
          if (item && typeof item === 'object') {
            const node = item as HasilKerjaNode;
            const parts = [node.text || ''];
            if (Array.isArray(node.children)) {
              parts.push(...node.children.flatMap((child) => formatTaskText(child)));
            }
            return parts;
          }
          return [String(item)];
        })
        .map((part) => part.trim())
        .filter(Boolean)
        .join('; ');
    }

    if (typeof value === 'object') {
      const node = value as HasilKerjaNode;
      const parts = [node.text || ''];
      if (Array.isArray(node.children)) {
        parts.push(...node.children.flatMap((child) => formatTaskText(child)));
      }
      return parts.map((part) => part.trim()).filter(Boolean).join('; ') || '-';
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '-';

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object') {
          return formatTaskText(parsed);
        }
      } catch {
        // fall through to plain string
      }

      return trimmed;
    }

    return String(value);
  };

  const formatStoredTaskText = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return '-';
    }

    const structuredParts = trimmed.includes('};') || trimmed.startsWith('{')
      ? trimmed.split(/;\s*(?=\{)/g).map((part) => part.trim()).filter(Boolean)
      : [];

    if (structuredParts.length > 1) {
      const formattedParts = structuredParts
        .map((part) => formatTaskText(part))
        .map((part) => part.trim())
        .filter(Boolean);

      if (formattedParts.length > 0) {
        return formattedParts.join('\n');
      }
    }

    return formatTaskText(trimmed);
  };

  const parseStoredHasilKerjaNodes = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return [] as HasilKerjaNode[];
    }

    const structuredParts = trimmed.includes('};') || trimmed.startsWith('{')
      ? trimmed.split(/;\s*(?=\{)/g).map((part) => part.trim()).filter(Boolean)
      : [trimmed];

    return structuredParts.flatMap((part) => normalizeHasilKerjaNodes(part));
  };

  const normalizeHasilKerjaNodes = (value: unknown): HasilKerjaNode[] => {
    if (!value) return [];

    const walk = (input: unknown): HasilKerjaNode[] => {
      if (input == null) return [];

      if (Array.isArray(input)) {
        return input.flatMap((item) => walk(item));
      }

      if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return [];

        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (parsed && typeof parsed === 'object') {
            return walk(parsed);
          }
        } catch {
          // plain text node
        }

        return [{ text: trimmed, children: [] }];
      }

      if (typeof input === 'object') {
        const node = input as HasilKerjaNode;
        const text = typeof node.text === 'string' ? node.text.trim() : '';
        const children = Array.isArray(node.children) ? node.children.flatMap((child) => walk(child)) : [];
        return [{ text, children }];
      }

      return [{ text: String(input), children: [] }];
    };

    return walk(value);
  };

  const renderHasilKerjaNodes = (nodes: HasilKerjaNode[], level = 0) => (
    <div className={level > 0 ? 'mt-2 space-y-2 border-l border-gray-200 dark:border-gray-700 pl-3' : 'space-y-2'}>
      {nodes.map((node, index) => (
        <div key={`${level}-${index}`} className="text-gray-800 dark:text-gray-200">
          {node.text && (
            <div className="flex gap-2">
              {level === 0 ? (
                <span className="mt-2 inline-flex h-2 w-2 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400" aria-hidden="true" />
              ) : (
                <span className="mt-0.5 shrink-0 font-semibold text-brand-700 dark:text-brand-300">
                  {index + 1}.
                </span>
              )}
              <span className="whitespace-pre-wrap leading-relaxed">{node.text}</span>
            </div>
          )}
          {Array.isArray(node.children) && node.children.length > 0 && renderHasilKerjaNodes(node.children, level + 1)}
        </div>
      ))}
    </div>
  );

  const estimateLineCount = (text: string, width = 52) => {
    const lines = text
      .split(/\r?\n/)
      .reduce((count, part) => count + Math.max(1, Math.ceil(Math.max(part.length, 1) / width)), 0);

    return Math.max(1, lines);
  };

  const estimateHasilKerjaLines = (nodes: HasilKerjaNode[]): number => {
    if (nodes.length === 0) return 1;

    return nodes.reduce((total, node) => {
      const own = node.text ? estimateLineCount(node.text, 48) : 1;
      const children = Array.isArray(node.children) && node.children.length > 0 ? estimateHasilKerjaLines(node.children) : 0;
      return total + own + children;
    }, 0);
  };

  const estimateTaskRows = (row: TugasPokokItem) => {
    const uraianRows = estimateLineCount(formatTaskText(row.uraian_tugas), 54);
    const hasilRows = estimateHasilKerjaLines(normalizeHasilKerjaNodes(row.hasil_kerja));
    return Math.max(4, uraianRows, hasilRows);
  };

  const loadJabatanDetail = async (petaJabatanId: string) => {
    if (!petaJabatanId.trim()) {
      setJabatanDetail(null);
      setTaskSuggestionMap({});
      return;
    }

    try {
      setJabatanDetailLoading(true);
      const res = await fetch(`/api/anjab/${encodeURIComponent(petaJabatanId.trim())}`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error('Gagal memuat rincian tugas pokok');
      }

      const json = await res.json();
      const detail = (json?.data ?? json) as JabatanDetail | null;
      const tugasPokok = Array.isArray(detail?.tugas_pokok) ? detail.tugas_pokok : [];

      setJabatanDetail(detail && detail.id ? detail : null);
      setTaskSuggestionMap(
        tugasPokok.reduce<Record<string, TaskSuggestionDraft>>((acc, row) => {
          acc[row.id_tugas] = { uraian_tugas: '', hasil_kerja: '' };
          return acc;
        }, {})
      );
    } catch (err) {
      console.error('Failed to load jabatan detail:', err);
      setJabatanDetail(null);
      setTaskSuggestionMap({});
    } finally {
      setJabatanDetailLoading(false);
    }
  };

  const updateTaskSuggestion = (taskId: string, field: keyof TaskSuggestionDraft, value: string) => {
    setTaskSuggestionMap((prev) => ({
      ...prev,
      [taskId]: {
        uraian_tugas: prev[taskId]?.uraian_tugas || '',
        hasil_kerja: prev[taskId]?.hasil_kerja || '',
        [field]: value,
      },
    }));
  };

  const getTahapanUraianTugas = (row: TugasPokokItem) => {
    const directDetails = Array.isArray(row.detail_uraian_tugas) ? row.detail_uraian_tugas : [];
    if (directDetails.length > 0) {
      return directDetails;
    }

    const fallbackRow = jabatanDetail?.tugas_pokok.find((item) => item.id_tugas === row.id_tugas);
    return Array.isArray(fallbackRow?.detail_uraian_tugas) ? fallbackRow.detail_uraian_tugas : [];
  };

  const buildTaskSuggestionSummary = () => {
    const rows = jabatanDetail?.tugas_pokok || [];
    const filledRows = rows
      .map((row, index) => {
        const draft = taskSuggestionMap[row.id_tugas] || { uraian_tugas: '', hasil_kerja: '' };
        const uraianTugas = draft.uraian_tugas.trim();
        const hasilKerja = draft.hasil_kerja.trim();

        if (!uraianTugas && !hasilKerja) {
          return null;
        }

        return { row, index, draft: { uraian_tugas: uraianTugas, hasil_kerja: hasilKerja } };
      })
      .filter((item): item is {
        row: TugasPokokItem;
        index: number;
        draft: TaskSuggestionDraft;
      } => item !== null);

    if (filledRows.length === 0) {
      return '';
    }

    return filledRows
      .map(({ row, draft }, index) => {
        const uraianTugasSteps = getTahapanUraianTugas(row);
        const uraianTugasSection = uraianTugasSteps.length > 0
          ? [
              '   Tahapan Uraian Tugas:',
              ...uraianTugasSteps.flatMap((detail, detailIndex) => {
                const lines = [
                  `      ${detail.nomor_tahapan || detailIndex + 1}. ${detail.tahapan}`,
                ];

                if (Array.isArray(detail.detail_tahapan) && detail.detail_tahapan.length > 0) {
                  lines.push(...detail.detail_tahapan.map((item) => `         - ${item}`));
                }

                return lines;
              }),
            ]
          : [];

        return [
          `${index + 1}. Uraian Tugas: ${formatTaskText(row.uraian_tugas)}`,
          ...uraianTugasSection,
          `   Hasil Kerja: ${formatTaskText(row.hasil_kerja)}`,
          `   Usulan Uraian Tugas: ${draft.uraian_tugas || '-'}`,
          `   Usulan Hasil Kerja: ${draft.hasil_kerja || '-'}`,
        ].join('\n');
      })
      .join('\n\n');
  };

  // Load feedback data
  const loadFeedback = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/feedback');

      if (res.status === 401) {
        setFeedbackList([]);
        return;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || 'Failed to fetch feedback');
      }

      const json = await res.json();
      const data = json?.data || [];
      setFeedbackList(data);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load feedback';
      console.error('Error loading feedback:', error);
      Swal.fire('Error', message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (me && (activeTab === 'history' || isActualAdmin)) {
      loadFeedback();
    }
  }, [me, activeTab, isActualAdmin]);

  // Reset to page 1 when tab, filter, or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterStatus, filterUpdatesOnly, sortBy, sortOrder]);


  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nama_jabatan.trim()) {
      Swal.fire('Error', 'Nama jabatan harus diisi', 'error');
      return;
    }

    if (!formData.unit_kerja.trim()) {
      Swal.fire('Error', 'Unit kerja harus diisi', 'error');
      return;
    }

    const hasTaskSuggestion = Object.values(taskSuggestionMap).some((draft) =>
      Boolean(draft.uraian_tugas.trim() || draft.hasil_kerja.trim())
    );

    if (!formData.usulan_perbaikan.trim() && !hasTaskSuggestion) {
      Swal.fire('Error', 'Isi Usulan Perbaikan Lainnya atau minimal satu baris pada tabel usulan tugas pokok', 'error');
      return;
    }

    const taskSummary = buildTaskSuggestionSummary();
    const generalUsulan = formData.usulan_perbaikan.trim();
    const combinedUsulan = [
      taskSummary ? `Tabel Usulan Perbaikan Tugas Pokok\n${taskSummary}` : '',
      generalUsulan ? `Usulan Perbaikan Dokumen Anjab\n${generalUsulan}` : '',
    ].filter(Boolean).join('\n\n');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          usulan_perbaikan: combinedUsulan,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        Swal.fire('Error', json.error || 'Failed to submit feedback', 'error');
        return;
      }

      await Swal.fire('Berhasil', 'Usulan perbaikan berhasil dikirim', 'success');

      // Reset form
      setFormData({
        nama_jabatan: '',
        unit_kerja: '',
        usulan_perbaikan: '',
      });
      setUnitKerjaFilter('');
      setJabatanFilter('');
      setJabatanSelectedLabel('');
      setSelectedPetaJabatanId('');
      setJabatanDetail(null);
      setTaskSuggestionMap({});
      setJabatanList([]);
      setShowJabatanDropdown(false);

      setActiveTab('history');
      loadFeedback();
      setCurrentPage(1);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit feedback';
      console.error('Error submitting feedback:', error);
      Swal.fire('Error', message, 'error');
    }
  };

  const handleRatingSubmit = async (id: string) => {
    const data = ratingValues[id];
    if (!data || !data.rating) {
      Swal.fire('Error', 'Pilih rating bintang terlebih dahulu', 'error');
      return;
    }
    setRatingSubmitting(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch('/api/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          rating: data.rating,
          rating_comment: data.comment
        })
      });
      if (!res.ok) throw new Error('Gagal mengirim penilaian');
      Swal.fire('Berhasil', 'Penilaian berhasil disimpan', 'success');
      loadFeedback();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengirim penilaian';
      Swal.fire('Error', message, 'error');
    } finally {
      setRatingSubmitting(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleAdminUpdate = async (id: string) => {
    setAdminSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: adminFormData.status,
          admin_notes: adminFormData.admin_notes
        })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Gagal memperbarui status');
      }
      Swal.fire('Berhasil', 'Status usulan berhasil diperbarui', 'success');
      setAdminEditId(null);
      loadFeedback();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memperbarui status';
      Swal.fire('Error', message, 'error');
    } finally {
      setAdminSubmitting(false);
    }
  };

  // Toggle expanded state
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
        const item = feedbackList.find((f) => f.id === id);
        if (item) {
          markAsSeen(item);       // user: mark status update as seen
          markRatingAsSeen(item); // admin: mark rating as seen
        }
      }
      return newSet;
    });
  };

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const parseUsulanPerbaikan = (value: string) => {
    const normalized = value.replace(/\r\n/g, '\n').trim();
    const result = {
      taskRows: [] as ParsedTaskSuggestionRow[],
      generalText: '',
    };

    if (!normalized) {
      return result;
    }

    const taskHeading = 'Tabel Usulan Perbaikan Tugas Pokok\n';
    const generalHeading = 'Usulan Perbaikan Dokumen Anjab\n';

    const taskStart = normalized.indexOf(taskHeading);
    const generalStart = normalized.indexOf(generalHeading);

    if (taskStart !== -1) {
      const taskSectionStart = taskStart + taskHeading.length;
      const taskSectionEnd = generalStart !== -1 && generalStart > taskSectionStart ? generalStart - 2 : normalized.length;
      const taskSection = normalized.slice(taskSectionStart, taskSectionEnd).trim();

      result.taskRows = taskSection
        .split(/\n\n+/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const lines = block.split('\n').map((line) => line.trim());
          const nomorMatch = lines[0]?.match(/^(\d+)\.\s+Uraian Tugas:\s*(.*)$/);
          const tahapanStart = lines.findIndex((line) => line === 'Tahapan Uraian Tugas:');
          const hasilKerjaIndex = lines.findIndex((line) => line.startsWith('Hasil Kerja:'));
          const usulanUraianIndex = lines.findIndex((line) => line.startsWith('Usulan Uraian Tugas:'));
          const usulanHasilIndex = lines.findIndex((line) => line.startsWith('Usulan Hasil Kerja:'));
          const hasilKerjaMatch = hasilKerjaIndex !== -1 ? lines[hasilKerjaIndex].match(/^Hasil Kerja:\s*(.*)$/) : null;

          const parsedSteps: ParsedTaskSuggestionRow['uraian_tugas_steps'] = [];
          if (tahapanStart !== -1 && hasilKerjaIndex !== -1 && hasilKerjaIndex > tahapanStart) {
            let currentStep: { nomor: string; tahapan: string; detail_tahapan: string[] } | null = null;
            for (const rawLine of lines.slice(tahapanStart + 1, hasilKerjaIndex)) {
              const stepMatch = rawLine.match(/^(\d+)\.\s+(.*)$/);
              const detailMatch = rawLine.match(/^[-•]\s+(.*)$/);

              if (stepMatch) {
                if (currentStep) {
                  parsedSteps.push(currentStep);
                }
                currentStep = {
                  nomor: stepMatch[1],
                  tahapan: stepMatch[2].trim(),
                  detail_tahapan: [],
                };
                continue;
              }

              if (detailMatch && currentStep) {
                currentStep.detail_tahapan.push(detailMatch[1].trim());
              }
            }

            if (currentStep) {
              parsedSteps.push(currentStep);
            }
          }

          return {
            nomor: nomorMatch?.[1] || '',
            uraian_tugas: formatStoredTaskText(nomorMatch?.[2] || lines[0] || '-'),
            uraian_tugas_steps: parsedSteps,
            hasil_kerja: parseStoredHasilKerjaNodes(hasilKerjaMatch?.[1] || lines[1] || '-'),
            usulan_uraian_tugas: formatStoredTaskText((usulanUraianIndex !== -1 ? lines[usulanUraianIndex].slice('Usulan Uraian Tugas:'.length).trim() : '-')),
            usulan_hasil_kerja: formatStoredTaskText((usulanHasilIndex !== -1 ? lines[usulanHasilIndex].slice('Usulan Hasil Kerja:'.length).trim() : '-')),
          };
        })
        .filter((row) => row.nomor || row.uraian_tugas !== '-');
    }

    if (generalStart !== -1) {
      result.generalText = normalized.slice(generalStart + generalHeading.length).trim();
    }

    if (!result.generalText && taskStart === -1) {
      result.generalText = normalized;
    }

    return result;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'diterima':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Selesai</span>;
      case 'ditolak':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Ditolak</span>;
      case 'ditindaklanjuti':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Ditindaklanjuti</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Diusulkan</span>;
    }
  };

  const StarRating = ({ value, onChange, interactive = false }: { value: number, onChange?: (val: number) => void, interactive?: boolean }) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => interactive && onChange && onChange(star)}
            className={`${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform focus:outline-none`}
            disabled={!interactive}
          >
            <svg className={`w-7 h-7 ${value >= star ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        ))}
      </div>
    );
  };

  // Derived counts for badges & notifs
  // User: items with new admin activity not yet seen
  const unreadCount = !isActualAdmin ? feedbackList.filter(isUnread).length : 0;


  // User: how many finished items still need a rating
  // Admin: items with a rating not yet opened
  const newRatedCount = feedbackList.filter(isRatingUnread).length;

  // Filter + Sort
  const filteredAndSorted = feedbackList
    .filter((f) => filterUpdatesOnly || filterStatus === 'all' || f.status === filterStatus || (!f.status && filterStatus === 'diusulkan'))
    .filter((f) => {
      if (!filterUpdatesOnly) return true;
      // Keep item visible while expanded even if already marked as seen
      return isActualAdmin ? (isRatingUnread(f) || expandedIds.has(f.id)) : (isUnread(f) || expandedIds.has(f.id));
    })
    .sort((a, b) => {
      const aVal = new Date(sortBy === 'updated_at' ? (a.updated_at || a.created_at) : a.created_at).getTime();
      const bVal = new Date(sortBy === 'updated_at' ? (b.updated_at || b.created_at) : b.created_at).getTime();
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

  // Pagination
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFeedback = filteredAndSorted.slice(startIndex, endIndex);

  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memuat...</p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md text-center">
          <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Akses Ditolak</h3>
          <p className="text-red-600 dark:text-red-300 text-sm">
            Anda harus login untuk mengakses halaman ini
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 pt-6">
      {/* Header */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Usulan Perbaikan Dokumen Anjab
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400">
            {isActualAdmin
              ? 'Lihat dan kelola usulan perbaikan dokumen anjab dari pengguna'
              : 'Kirim usulan perbaikan dokumen anjab dan lihat riwayat usulan Anda'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-2 sm:space-x-8">
          {isActualAdmin ? (
            // Admin only sees "Usulan Masuk" tab
            <button
              className="border-brand-500 text-brand-600 dark:text-brand-400 flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm"
            >
              Usulan Masuk
            </button>
          ) : (
            // Regular users see both tabs
            <>
              <button
                onClick={() => setActiveTab('history')}
                className={`${
                  activeTab === 'history'
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors inline-flex items-center gap-2`}
              >
                Riwayat Usulan
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-red-500 text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('submit')}
                className={`${
                  activeTab === 'submit'
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                } flex-1 sm:flex-initial whitespace-nowrap py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors`}
              >
                Kirim Usulan
              </button>
            </>
          )}
          {!isActualAdmin && activeTab === 'history' && (
            <div className="ml-auto flex items-center">
              <button
                onClick={() => setActiveTab('submit')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-all font-medium shadow-sm hover:shadow-md active:scale-95 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Buat Usulan Baru</span>
              </button>
            </div>
          )}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'submit' && !isActualAdmin ? (
        /* Submit Form */
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Unit Kerja - searchable dropdown */}
            <div>
              <label
                htmlFor="unit_kerja_trigger"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Unit Kerja <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={unitKerjaRef}>
                {/* Display/trigger button */}
                <button
                  type="button"
                  id="unit_kerja_trigger"
                  onClick={() => setShowUnitKerjaDropdown((prev) => !prev)}
                  className={`w-full px-4 py-2 text-left border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 transition-colors flex items-center justify-between ${
                    formData.unit_kerja
                      ? 'text-gray-900 dark:text-white border-gray-300 dark:border-gray-600'
                      : 'text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <span className="truncate">
                    {formData.unit_kerja || 'Pilih atau cari unit kerja...'}
                  </span>
                  <ChevronDownIcon
                    className={`w-4 h-4 flex-shrink-0 ml-2 text-gray-400 transition-transform duration-200 ${
                      showUnitKerjaDropdown ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Dropdown panel */}
                {showUnitKerjaDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
                    {/* Search inside dropdown */}
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                      <input
                        type="text"
                        autoFocus
                        value={unitKerjaFilter}
                        onChange={(e) => setUnitKerjaFilter(e.target.value)}
                        placeholder="Cari unit kerja..."
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:text-white outline-none"
                      />
                    </div>

                    {/* Options list */}
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {unitKerjaLoading ? (
                        <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand-500"></div>
                          Memuat unit kerja...
                        </li>
                      ) : filteredUnitKerja.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {unitKerjaFilter ? 'Tidak ditemukan' : 'Tidak ada data unit kerja'}
                        </li>
                      ) : (
                        filteredUnitKerja.map((u, i) => (
                          <li
                            key={i}
                            onMouseDown={() => {
                              setFormData((prev) => ({ ...prev, unit_kerja: u, nama_jabatan: '' }));
                              setUnitKerjaFilter('');
                              setShowUnitKerjaDropdown(false);
                              setJabatanFilter('');
                              setJabatanSelectedLabel('');
                              setSelectedPetaJabatanId('');
                              setJabatanDetail(null);
                              setTaskSuggestionMap({});
                              setShowJabatanDropdown(false);
                            }}
                            className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                              formData.unit_kerja === u
                                ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-medium'
                                : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {u}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
              {/* Hidden input for accessibility */}
              <input type="hidden" id="unit_kerja" value={formData.unit_kerja} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Pilih unit kerja dari daftar atau ketik untuk mencari unit kerja yang tersedia.
              </p>
            </div>

            {/* Nama Jabatan - dropdown filtered by selected unit kerja */}
            <div>
              <label
                htmlFor="nama_jabatan_trigger"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Nama Jabatan <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={jabatanRef}>
                <button
                  type="button"
                  id="nama_jabatan_trigger"
                  disabled={!formData.unit_kerja.trim()}
                  onClick={() => {
                    if (!formData.unit_kerja.trim()) return;
                    setShowJabatanDropdown((prev) => !prev);
                  }}
                  className={`w-full px-4 py-2 text-left border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 transition-colors flex items-center justify-between ${
                    formData.nama_jabatan
                      ? 'text-gray-900 dark:text-white border-gray-300 dark:border-gray-600'
                      : 'text-gray-400 dark:text-gray-500 border-gray-300 dark:border-gray-600'
                  } ${!formData.unit_kerja.trim() ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <span className="truncate">
                    {jabatanSelectedLabel || (formData.unit_kerja.trim() ? 'Pilih nama jabatan...' : 'Pilih unit kerja terlebih dahulu')}
                  </span>
                  <ChevronDownIcon
                    className={`w-4 h-4 flex-shrink-0 ml-2 text-gray-400 transition-transform duration-200 ${
                      showJabatanDropdown ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showJabatanDropdown && formData.unit_kerja.trim() && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                      <input
                        type="text"
                        autoFocus
                        value={jabatanFilter}
                        onChange={(e) => setJabatanFilter(e.target.value)}
                        placeholder="Cari nama jabatan..."
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:text-white outline-none"
                      />
                    </div>
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {jabatanLoading ? (
                        <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-brand-500"></div>
                          Memuat nama jabatan...
                        </li>
                      ) : filteredJabatan.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {jabatanFilter ? 'Tidak ditemukan' : 'Tidak ada jabatan untuk unit kerja ini'}
                        </li>
                      ) : (
                        filteredJabatan.map((j, i) => (
                          <li
                            key={i}
                            onMouseDown={() => {
                              setFormData((prev) => ({
                                ...prev,
                                nama_jabatan: j.value,
                                unit_kerja: j.unit_kerja || prev.unit_kerja,
                              }));
                              setJabatanSelectedLabel(j.label);
                              setSelectedPetaJabatanId(j.peta_jabatan_id);
                              setJabatanFilter('');
                              setShowJabatanDropdown(false);
                            }}
                            className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                              formData.nama_jabatan === j.value
                                ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-medium'
                                : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {j.label}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Daftar nama jabatan berdasarkan unit kerja yang dipilih.
              </p>
            </div>

            {selectedPetaJabatanId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Usulan Perbaikan Uraian Tugas & Hasil Kerja
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Isi usulan pada untuk Uraian Tugas & Hasil Kerja yang tampil (Tidak Wajib).
                    </p>
                  </div>
                  {jabatanDetailLoading && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Memuat rincian anjab...</span>
                  )}
                </div>

                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/60">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200 w-[28%]">
                          Uraian Tugas
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200 w-[22%]">
                          Hasil Kerja
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200 w-[25%]">
                          Usulan Perbaikan Uraian Tugas
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200 w-[25%]">
                          Usulan Perbaikan Hasil Kerja
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                      {jabatanDetailLoading ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                            Memuat data tugas pokok...
                          </td>
                        </tr>
                      ) : (jabatanDetail?.tugas_pokok?.length || 0) === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                            Tidak ada tugas pokok untuk jabatan ini.
                          </td>
                        </tr>
                      ) : (
                        jabatanDetail?.tugas_pokok.map((row, index) => {
                          const suggestion = taskSuggestionMap[row.id_tugas] || { uraian_tugas: '', hasil_kerja: '' };
                          const rowRows = estimateTaskRows(row);
                          const hasilKerjaNodes = normalizeHasilKerjaNodes(row.hasil_kerja);

                          return (
                            <tr key={row.id_tugas} className="align-top">
                              <td className="px-4 py-4 text-gray-800 dark:text-gray-200">
                                <div className="font-medium">
                                  {row.nomor_tugas ? `${row.nomor_tugas}. ` : `${index + 1}. `}
                                  {formatTaskText(row.uraian_tugas)}
                                </div>
                                {row.detail_uraian_tugas.length > 0 && (
                                  <ul className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400 list-disc pl-4">
                                    {row.detail_uraian_tugas.map((detail) => (
                                      <li key={detail.id_tahapan}>
                                        <span className="font-medium text-gray-600 dark:text-gray-300">
                                          {detail.nomor_tahapan ? `${detail.nomor_tahapan}. ` : ''}
                                          {detail.tahapan}
                                        </span>
                                        {detail.detail_tahapan.length > 0 && (
                                          <span className="block mt-1">{detail.detail_tahapan.join('; ')}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                              <td className="px-4 py-4 text-gray-800 dark:text-gray-200">
                                <div className="whitespace-pre-wrap leading-relaxed">
                                  {hasilKerjaNodes.length > 0 ? renderHasilKerjaNodes(hasilKerjaNodes) : '-'}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <textarea
                                  value={suggestion.uraian_tugas}
                                  onChange={(e) => updateTaskSuggestion(row.id_tugas, 'uraian_tugas', e.target.value)}
                                  rows={rowRows}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none min-h-full"
                                  placeholder="Isi usulan untuk uraian tugas..."
                                />
                              </td>
                              <td className="px-4 py-4">
                                <textarea
                                  value={suggestion.hasil_kerja}
                                  onChange={(e) => updateTaskSuggestion(row.id_tugas, 'hasil_kerja', e.target.value)}
                                  rows={rowRows}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none min-h-full"
                                  placeholder="Isi usulan untuk hasil kerja..."
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Usulan Perbaikan */}
            <div>
              <label
                htmlFor="usulan_perbaikan"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Usulan Perbaikan Lainnya
              </label>
              <textarea
                id="usulan_perbaikan"
                value={formData.usulan_perbaikan}
                onChange={(e) => setFormData((prev) => ({ ...prev, usulan_perbaikan: e.target.value }))}
                rows={10}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-y"
                placeholder="Jelaskan usulan perbaikan dokumen anjab secara detail..."
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Jelaskan secara detail usulan perbaikan yang Anda inginkan.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="px-6 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
              >
                Kirim Usulan
                <ArrowRightIcon className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* History / Admin View - List View */
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Filter & Sort Controls */}
          {!loading && (
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
              {/* Status Filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Status:</span>
                {[
                  { value: 'all', label: 'Semua' },
                  { value: 'diusulkan', label: 'Diusulkan' },
                  { value: 'ditindaklanjuti', label: 'Ditindaklanjuti' },
                  { value: 'diterima', label: 'Selesai' },
                  { value: 'ditolak', label: 'Ditolak' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilterStatus(opt.value)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      filterStatus === opt.value
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-5 bg-gray-200 dark:bg-gray-700" />

              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Urutkan:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'created_at' | 'updated_at')}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="created_at">Tgl Dikirim</option>
                  <option value="updated_at">Tgl Diperbarui</option>
                </select>
                <button
                  onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  title={sortOrder === 'desc' ? 'Terbaru dahulu' : 'Terlama dahulu'}
                  className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  {sortOrder === 'desc' ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                      Terbaru
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>
                      Terlama
                    </>
                  )}
                </button>
              </div>

              {/* Result count */}
              {filterStatus !== 'all' && (
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {filteredAndSorted.length} hasil
                </span>
              )}
            </div>
          )}

          {/* User Notification Banner */}
          {!isActualAdmin && !loading && unreadCount > 0 && (
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <div className="flex-1 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    <span className="font-semibold">{unreadCount} usulan</span> memiliki pembaruan baru dari admin.
                  </p>
                  <button
                    onClick={() => setFilterUpdatesOnly((prev) => !prev)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors whitespace-nowrap bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-800/50 dark:text-blue-300 dark:hover:bg-blue-800"
                  >
                    {filterUpdatesOnly ? 'Tampilkan semua' : 'Tampilkan'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Admin Notification Banners */}
          {isActualAdmin && !loading && newRatedCount > 0 && (
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <div className="flex-1 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-green-800 dark:text-green-300">
                    <span className="font-semibold">{newRatedCount} penilaian baru</span> belum dibuka dari pengguna.
                  </p>
                  <button
                    onClick={() => setFilterUpdatesOnly((prev) => !prev)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors whitespace-nowrap bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-800/50 dark:text-green-300 dark:hover:bg-green-800"
                  >
                    {filterUpdatesOnly ? 'Tampilkan semua' : 'Tampilkan'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
          ) : filteredAndSorted.length === 0 ? (
            filterUpdatesOnly ? (
              <div className="p-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Semua notifikasi telah dibaca
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Tidak ada pembaruan baru yang belum dibaca.
                </p>
                <button
                  onClick={() => setFilterUpdatesOnly(false)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium text-sm"
                >
                  Tampilkan semua usulan
                </button>
              </div>
            ) : (
            <div className="p-16 text-center">
              <svg
                className="w-20 h-20 mx-auto mb-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                Belum ada usulan perbaikan
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                {filterStatus !== 'all'
                  ? 'Tidak ada usulan dengan status yang dipilih.'
                  : isActualAdmin
                  ? 'Belum ada usulan perbaikan anjab yang dikirim oleh pengguna'
                  : 'Anda belum mengirim usulan perbaikan anjab apapun. Silakan buat usulan baru jika Anda ingin memberikan masukan atau usulan perbaikan dokumen Anjab.'}
              </p>
              {!isActualAdmin && (
                <button
                  onClick={() => setActiveTab('submit')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Buat Usulan Baru
                </button>
              )}
            </div>
            )
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedFeedback.map((item, index) => (
                <div
                  key={item.id}
                  className="p-5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Row Number — with unread dot indicator */}
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-sm">
                        {startIndex + index + 1}
                      </div>
                      {!isActualAdmin && isUnread(item) && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800" />
                      )}
                      {isActualAdmin && isRatingUnread(item) && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-500 border-2 border-white dark:border-gray-800" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header Info */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base sm:text-lg text-gray-900 dark:text-white break-words">
                              {item.nama_jabatan}
                            </h3>
                            {!isActualAdmin && isUnread(item) && (
                              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">• Baru</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400 break-words">
                              {item.unit_kerja}
                            </span>
                            {!isActualAdmin && (item.status === 'diterima' || item.status === 'ditolak') && !item.rating && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-400 dark:bg-green-900/30 dark:text-green-300 whitespace-nowrap"><svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>Belum dinilai</span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 mt-1">
                          {getStatusBadge(item.status)}
                        </div>
                      </div>

                      {/* Date and Author */}
                      <p className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-3 mb-3">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {formatDate(item.created_at)}
                        </span>
                      </p>

                      {/* Expandable Section */}
                      {expandedIds.has(item.id) && (
                        <div className="mt-4 space-y-4">
                          
                          {/* Usulan Content */}
                          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Usulan Perbaikan:</p>
                            {(() => {
                              const parsed = parseUsulanPerbaikan(item.usulan_perbaikan || '');

                              return (
                                <div className="space-y-4">
                                  {parsed.taskRows.length > 0 && (
                                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                        <thead className="bg-gray-100 dark:bg-gray-800">
                                          <tr>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">No</th>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 min-w-[18rem]">Uraian Tugas</th>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 min-w-[18rem]">Hasil Kerja</th>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 min-w-[18rem]">Usulan Uraian Tugas</th>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 min-w-[18rem]">Usulan Hasil Kerja</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                          {parsed.taskRows.map((row) => (
                                            <tr key={`${item.id}-${row.nomor}-${row.uraian_tugas}`} className="align-top">
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.nomor || '-'}</td>
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 align-top">
                                                <div className="space-y-2 leading-relaxed">
                                                  <div className="flex gap-2">
                                                    <span className="mt-2 inline-flex h-2 w-2 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400" aria-hidden="true" />
                                                    <span className="whitespace-pre-wrap">{row.uraian_tugas}</span>
                                                  </div>
                                                  {row.uraian_tugas_steps.length > 0 && (
                                                    <div className="ml-4 space-y-2 border-l border-gray-200 dark:border-gray-700 pl-4">
                                                      {row.uraian_tugas_steps.map((step) => (
                                                        <div key={`${item.id}-${row.nomor}-${step.nomor}-${step.tahapan}`} className="space-y-1">
                                                          <div className="flex gap-2">
                                                            <span className="mt-0.5 shrink-0 font-semibold text-brand-700 dark:text-brand-300">
                                                              {step.nomor}.
                                                            </span>
                                                            <span className="whitespace-pre-wrap">{step.tahapan}</span>
                                                          </div>
                                                          {step.detail_tahapan.length > 0 && (
                                                            <ul className="ml-5 space-y-1 list-disc pl-4 text-xs text-gray-600 dark:text-gray-400">
                                                              {step.detail_tahapan.map((detail, detailIndex) => (
                                                                <li key={`${item.id}-${row.nomor}-${step.nomor}-${detailIndex}`} className="whitespace-pre-wrap">
                                                                  {detail}
                                                                </li>
                                                              ))}
                                                            </ul>
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 leading-relaxed">
                                                {row.hasil_kerja.length > 0 ? renderHasilKerjaNodes(row.hasil_kerja) : '-'}
                                              </td>
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{row.usulan_uraian_tugas}</td>
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{row.usulan_hasil_kerja}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}

                                  {parsed.generalText && (
                                    <div>
                                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Usulan Perbaikan Dokumen Anjab Lainnya:</p>
                                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{parsed.generalText}</p>
                                    </div>
                                  )}

                                  {parsed.taskRows.length === 0 && !parsed.generalText && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{item.usulan_perbaikan}</p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Admin Edit Form */}
                          {isActualAdmin && adminEditId === item.id ? (
                            <div className="p-4 bg-brand-50 dark:bg-brand-900/20 rounded-lg border border-brand-200 dark:border-brand-800 space-y-4">
                              <h4 className="text-sm font-semibold text-brand-800 dark:text-brand-300">Ubah Status Usulan</h4>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                                <select
                                  value={adminFormData.status}
                                  onChange={(e) => setAdminFormData(prev => ({ ...prev, status: e.target.value }))}
                                  className="w-full sm:w-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700"
                                >
                                  <option value="ditindaklanjuti">Ditindaklanjuti</option>
                                  <option value="ditolak">Ditolak</option>
                                  {item.status !== 'diusulkan' && (
                                    <option value="diterima">Selesai</option>
                                  )}
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan Admin (Opsional)</label>
                                <textarea
                                  value={adminFormData.admin_notes}
                                  onChange={(e) => setAdminFormData(prev => ({ ...prev, admin_notes: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700 resize-y"
                                  rows={3}
                                  placeholder="Tambahkan catatan terkait perubahan status ini..."
                                />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleAdminUpdate(item.id)}
                                  disabled={adminSubmitting}
                                  className="px-4 py-2 bg-brand-600 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-60"
                                >
                                  {adminSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                                <button
                                  onClick={() => setAdminEditId(null)}
                                  className="px-4 py-2 bg-gray-200 text-gray-800 text-sm rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            isActualAdmin && (item.status !== 'diterima' && item.status !== 'ditolak') && (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => {
                                    setAdminFormData({ status: 'ditindaklanjuti', admin_notes: '' });
                                    setAdminEditId(item.id);
                                  }}
                                  className="text-sm px-3 py-1.5 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors font-medium"
                                >
                                  Ubah Status
                                </button>
                              </div>
                            )
                          )}

                          {/* Status History Timeline - Admin View */}
                          {isActualAdmin && item.status_history && item.status_history.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Riwayat Perubahan Status</p>
                              <div className="space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                {item.status_history.map((h, i) => (
                                  <div key={i} className="relative">
                                    <div className={`absolute -left-[1.1rem] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${
                                      h.status === 'diterima' ? 'bg-green-500' :
                                      h.status === 'ditolak' ? 'bg-red-500' :
                                      h.status === 'ditindaklanjuti' ? 'bg-yellow-500' : 'bg-blue-500'
                                    }`} />
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 capitalize">
                                          {h.status === 'diterima' ? 'Selesai' : h.status}
                                        </span>
                                        <span className="text-xs text-gray-400">·</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(h.changed_at)}</span>
                                        <span className="text-xs text-gray-400">·</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{h.changed_by}</span>
                                      </div>
                                      {h.notes && (
                                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300 italic">&ldquo;{h.notes}&rdquo;</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Status Timeline - User View */}
                          {!isActualAdmin && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Perkembangan Usulan</p>
                              <div className="space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                                {/* Initial submission */}
                                <div className="relative">
                                  <div className="absolute -left-[1.3rem] top-1 w-3 h-3 rounded-full bg-blue-400 border-2 border-white dark:border-gray-800" />
                                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Usulan Terkirim</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                                </div>
                                {/* History entries */}
                                {item.status_history && item.status_history.map((h, i) => {
                                  const label =
                                    h.status === 'diterima' ? 'Usulan Selesai' :
                                    h.status === 'ditolak' ? 'Usulan Ditolak' :
                                    'Sedang Ditindaklanjuti';
                                  const dotColor =
                                    h.status === 'diterima' ? 'bg-green-500' :
                                    h.status === 'ditolak' ? 'bg-red-500' : 'bg-yellow-500';
                                  return (
                                    <div key={i} className="relative">
                                      <div className={`absolute -left-[1.3rem] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${dotColor}`} />
                                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{label}</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(h.changed_at)}</p>
                                      {h.notes && (
                                        <p className="mt-1.5 text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/60 rounded-md px-3 py-2 italic border-l-2 border-gray-300 dark:border-gray-600">
                                          {h.notes}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* User Rating Section */}
                          {(!isActualAdmin && (item.status === 'diterima' || item.status === 'ditolak')) && (
                            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Penilaian Layanan Usulan Perbaikan Anjab dan ABK</h4>
                              
                              {item.rating ? (
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                  <div className="mb-2">
                                    <StarRating value={item.rating} />
                                  </div>
                                  {item.rating_comment && (
                                    <p className="text-sm text-gray-600 dark:text-gray-300 italic">&quot;{item.rating_comment}&quot;</p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-4 max-w-lg">
                                  <p className="text-sm text-gray-600 dark:text-gray-400">Bagaimana tingkat kepuasan Anda terhadap penanganan usulan ini oleh admin?</p>
                                  <StarRating 
                                    value={ratingValues[item.id]?.rating || 0} 
                                    interactive={true}
                                    onChange={(val) => setRatingValues(prev => ({ ...prev, [item.id]: { ...prev[item.id], rating: val } }))}
                                  />
                                  <textarea
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-700"
                                    placeholder="Tambahkan komentar penilaian (opsional)..."
                                    rows={2}
                                    value={ratingValues[item.id]?.comment || ''}
                                    onChange={(e) => setRatingValues(prev => ({ ...prev, [item.id]: { ...prev[item.id], comment: e.target.value } }))}
                                  />
                                  <button
                                    onClick={() => handleRatingSubmit(item.id)}
                                    disabled={ratingSubmitting[item.id]}
                                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium text-sm rounded-md transition-colors"
                                  >
                                    {ratingSubmitting[item.id] ? 'Mengirim...' : 'Kirim Penilaian'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Completed Rating View for Admin */}
                          {isActualAdmin && item.rating && (
                            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-lg">
                              <h4 className="text-xs font-bold text-yellow-800 dark:text-yellow-600 uppercase mb-2">Penilaian dari Pengguna</h4>
                              <div className="mb-2">
                                <StarRating value={item.rating} />
                              </div>
                              {item.rating_comment && (
                                <p className="text-sm text-gray-700 dark:text-gray-300 italic">&quot;{item.rating_comment}&quot;</p>
                              )}
                            </div>
                          )}
                          
                        </div>
                      )}
                    </div>

                    {/* Toggle Button */}
                    <button
                      onClick={() => toggleExpanded(item.id)}
                      className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors mt-1"
                      title={expandedIds.has(item.id) ? 'Sembunyikan' : 'Tampilkan detail ppenuh'}
                    >
                      {expandedIds.has(item.id) ? (
                        <ChevronUpIcon className="w-5 h-5" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && filteredAndSorted.length > 0 && totalPages > 1 && (
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Page Info */}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Menampilkan {startIndex + 1} - {Math.min(endIndex, filteredAndSorted.length)} dari {filteredAndSorted.length} usulan
                </div>

                {/* Pagination Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Sebelumnya
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              currentPage === page
                                ? 'bg-brand-600 text-white'
                                : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <span key={page} className="px-2 text-gray-500">
                            ...
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
