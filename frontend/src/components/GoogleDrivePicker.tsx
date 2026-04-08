import { useState, useEffect } from 'react';
import { useApiClient } from '../lib/api-client';
import { VS } from '../lib/theme';
import { Search, File, FileText, Image, Table, Presentation, X, ExternalLink, ChevronRight, HardDrive } from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  iconLink?: string;
  thumbnailLink?: string;
}

interface Props {
  onSelect: (file: DriveFile) => void;
  onClose: () => void;
}

const MIME_ICONS: Record<string, { icon: typeof File; color: string }> = {
  'image/': { icon: Image, color: '#c586c0' },
  'application/pdf': { icon: FileText, color: '#f44747' },
  'application/vnd.google-apps.spreadsheet': { icon: Table, color: '#4ec9b0' },
  'application/vnd.google-apps.presentation': { icon: Presentation, color: '#dcdcaa' },
  'application/vnd.google-apps.document': { icon: FileText, color: '#569cd6' },
  'application/vnd.openxmlformats': { icon: FileText, color: '#569cd6' },
};

function getFileIcon(mimeType: string) {
  for (const [key, val] of Object.entries(MIME_ICONS)) {
    if (mimeType.startsWith(key) || mimeType.includes(key)) return val;
  }
  return { icon: File, color: VS.text2 };
}

function fmtSize(bytes?: string) {
  if (!bytes) return '';
  const b = parseInt(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function GoogleDrivePicker({ onSelect, onClose }: Props) {
  const api = useApiClient();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Check connection status
  useEffect(() => {
    api.fetch('/api/integrations/drive/status')
      .then(d => setConnected(d.connected ?? false))
      .catch(() => setConnected(false));
  }, []);

  // Fetch files
  useEffect(() => {
    if (connected === false) { setLoading(false); return; }
    if (connected === null) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (searchDebounce) params.set('q', searchDebounce);
    api.fetch(`/api/integrations/drive/files?${params}`)
      .then(d => {
        setFiles(d.files || []);
        setNextPageToken(d.nextPageToken || null);
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [connected, searchDebounce]);

  const loadMore = async () => {
    if (!nextPageToken) return;
    try {
      const params = new URLSearchParams({ pageToken: nextPageToken });
      if (searchDebounce) params.set('q', searchDebounce);
      const d = await api.fetch(`/api/integrations/drive/files?${params}`);
      setFiles(prev => [...prev, ...(d.files || [])]);
      setNextPageToken(d.nextPageToken || null);
    } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: VS.bg1, border: `1px solid ${VS.border}`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: `1px solid ${VS.border}` }}>
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-5 w-5" style={{ color: VS.accent }} />
            <h3 className="text-[14px] font-bold" style={{ color: VS.text0 }}>Google Drive</h3>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: VS.text2 }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Not connected */}
        {connected === false && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-6">
            <HardDrive className="h-10 w-10 mb-4 opacity-30" style={{ color: VS.text2 }} />
            <p className="text-[14px] font-semibold mb-2" style={{ color: VS.text0 }}>Google Drive not connected</p>
            <p className="text-[12px] mb-6 text-center" style={{ color: VS.text2 }}>
              Connect your Google account in Settings → Integrations to browse and attach files from Google Drive.
            </p>
            <a href="/settings?tab=integrations"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white"
              style={{ background: VS.accent, textDecoration: 'none' }}>
              Go to Settings <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {/* Connected — search + file list */}
        {connected && (
          <>
            {/* Search */}
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${VS.border}` }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: VS.text2 }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search files..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] focus:outline-none"
                  style={{ background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text0 }}
                  autoFocus
                />
              </div>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: VS.accent }} />
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <File className="h-8 w-8 mb-3 opacity-30" style={{ color: VS.text2 }} />
                  <p className="text-[13px]" style={{ color: VS.text2 }}>
                    {search ? 'No files match your search' : 'No files found'}
                  </p>
                </div>
              ) : (
                <div>
                  {files.map(f => {
                    const { icon: FIcon, color } = getFileIcon(f.mimeType);
                    return (
                      <button
                        key={f.id}
                        onClick={() => onSelect(f)}
                        className="flex items-center gap-3 w-full px-5 py-3 text-left transition-colors hover:bg-white/[0.04]"
                        style={{ borderBottom: `1px solid ${VS.border}22` }}
                      >
                        {f.thumbnailLink ? (
                          <img src={f.thumbnailLink} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0"
                            style={{ border: `1px solid ${VS.border}` }} />
                        ) : (
                          <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${color}15` }}>
                            <FIcon className="h-4 w-4" style={{ color }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: VS.text0 }}>{f.name}</p>
                          <p className="text-[10px]" style={{ color: VS.text2 }}>
                            {fmtSize(f.size)}
                            {f.modifiedTime && ` · ${new Date(f.modifiedTime).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-40" style={{ color: VS.text2 }} />
                      </button>
                    );
                  })}
                  {nextPageToken && (
                    <button onClick={loadMore}
                      className="w-full py-3 text-[12px] font-medium text-center transition-colors hover:bg-white/[0.04]"
                      style={{ color: VS.accent }}>
                      Load more files
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
