import React, { useState, useEffect } from 'react';
import { BookOpen, FileText, Upload, Plus, X, Folder, Eye, Trash2 } from 'lucide-react';
import { API_BASE } from '../utils/api';

type Document = {
  id: string;
  filename: string;
  scope_tag: string;
  created_at: string;
};

export function KnowledgeBase({ userId }: { userId: string }) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadScope, setUploadScope] = useState('general');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // File Preview Modal
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/kb/documents`, {
        headers: { 'x-user-id': userId }
      });
      const data = await response.json();
      if (response.ok) {
        setDocuments(data);
      }
    } catch (e) {
      console.error('Failed to fetch documents:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [userId]);

  const handleFileUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file first.');
      return;
    }

    setIsUploading(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.onerror = (err) => reject(err);
        reader.readAsText(selectedFile);
      });

      const response = await fetch(`${API_BASE}/api/kb/upload`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          content,
          scope: uploadScope,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to upload');

      alert(`File ${selectedFile.name} successfully uploaded to folder 'fixtures/${uploadScope}/' and indexed.`);
      setShowUploadModal(false);
      setSelectedFile(null);
      fetchDocuments();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreviewFile = async (doc: Document) => {
    setPreviewDoc(doc);
    setLoadingPreview(true);
    setPreviewContent('');
    try {
      // Re-use debate retrieval path or custom endpoint, but we can fetch details from debate:
      const res = await fetch(`${API_BASE}/api/debates/mock_doc_id`); // Wait, we can fetch all details from a general doc loader or by retrieving the file:
      // Since it's a demo, we can fetch the doc content from the server if we add a GET /api/kb/documents/:id, or we can just mock a nice content review or query it.
      // Let's add GET /api/kb/documents/:id endpoint to the server, or we can write a simple document detail endpoint!
      const resDoc = await fetch(`${API_BASE}/api/kb/documents/${doc.id}`);
      const data = await resDoc.json();
      if (resDoc.ok) {
        setPreviewContent(data.content);
      } else {
        setPreviewContent('Failed to load document content.');
      }
    } catch (e) {
      setPreviewContent('Failed to fetch document content.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDeleteFile = async (doc: Document) => {
    if (!confirm(`Are you sure you want to delete "${doc.filename}"? This will physically remove it and un-index it from SQLite.`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/kb/documents/${doc.id}`, { 
        method: 'DELETE',
        headers: { 'x-user-id': userId }
      });
      const data = await res.json();
      if (res.ok) {
        alert('Document deleted and un-indexed successfully.');
        fetchDocuments();
      } else {
        throw new Error(data.error || 'Failed delete');
      }
    } catch (e: any) {
      alert(`Deletion failed: ${e.message}`);
    }
  };

  // Group documents by scope tag
  const groupedDocs = documents.reduce<Record<string, Document[]>>((acc, doc) => {
    const scope = doc.scope_tag;
    if (!acc[scope]) acc[scope] = [];
    acc[scope].push(doc);
    return acc;
  }, {});

  const scopeColorClasses: Record<string, string> = {
    marketing: 'text-emerald-500 bg-emerald-50 border-emerald-100',
    finance: 'text-blue-500 bg-blue-50 border-blue-100',
    tech: 'text-violet-500 bg-violet-50 border-violet-100',
    ops: 'text-amber-500 bg-amber-50 border-amber-100',
    general: 'text-gray-500 bg-gray-50 border-gray-100',
    decisions: 'text-red-500 bg-red-50 border-red-100',
  };

  return (
    <main className="flex-1 bg-white relative overflow-hidden flex flex-col h-screen pt-[72px] pl-0 md:pl-64">
      {/* Top Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50/50">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            Knowledge Base
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage files grouped by C-level advisor subfolders.</p>
        </div>
        <button 
          onClick={() => setShowUploadModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Ingest Document
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-400">Loading ingested files...</span>
          </div>
        ) : Object.keys(groupedDocs).length === 0 ? (
          <div className="py-20 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 max-w-xl mx-auto mt-10">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-700 text-sm">No Documents Ingested</h3>
            <p className="text-xs text-gray-400 max-w-xs mx-auto mt-1">Upload CSV P&L tables or markdown documents in respective advisor scopes to get started.</p>
            <button 
              onClick={() => setShowUploadModal(true)}
              className="mt-4 bg-gray-950 text-white text-xs px-3.5 py-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Add First File
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(Object.entries(groupedDocs) as [string, Document[]][]).map(([scope, docs]) => (
              <div key={scope} className="border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col bg-white">
                <div className={`px-4 py-3 border-b flex items-center gap-2.5 font-bold uppercase text-[11px] tracking-wider ${scopeColorClasses[scope] || scopeColorClasses.general}`}>
                  <Folder className="w-4 h-4 shrink-0" />
                  <span>{scope} Subfolder ({docs.length} files)</span>
                </div>
                <div className="divide-y divide-gray-100 flex-1 overflow-y-auto no-scrollbar">
                  {docs.map(doc => (
                    <div key={doc.id} className="p-3.5 flex justify-between items-center hover:bg-gray-50 transition-colors group">
                      <div className="flex gap-2.5 items-start max-w-[70%]">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-gray-800 truncate leading-tight group-hover:text-blue-500 transition-colors" title={doc.filename}>
                            {doc.filename}
                          </span>
                          <span className="text-[9px] text-gray-400 mt-1">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button 
                          onClick={() => handlePreviewFile(doc)}
                          className="text-gray-400 hover:text-blue-500 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                          title="View File Content"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteFile(doc)}
                          className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                          title="Delete File"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Ingest Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-md flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-500" />
                Ingest Context Document
              </h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Select File</label>
                <input 
                  type="file" 
                  accept=".txt,.md,.csv,.json"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-sm border border-gray-200 rounded-lg p-2.5 bg-gray-50 cursor-pointer focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Assign Advisor Folder / Scope</label>
                <select 
                  value={uploadScope}
                  onChange={(e) => setUploadScope(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="marketing">CMO Scope (fixtures/marketing/)</option>
                  <option value="finance">CFO Scope (fixtures/finance/)</option>
                  <option value="tech">CTO Scope (fixtures/tech/)</option>
                  <option value="ops">COO Scope (fixtures/ops/)</option>
                  <option value="general">General Scope (fixtures/general/)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
              <button 
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleFileUpload}
                disabled={isUploading}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isUploading ? 'Ingesting...' : 'Ingest & Index'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview File Content Drawer/Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-2xl flex flex-col h-[550px] gap-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                Document Viewer: {previewDoc.filename}
              </h3>
              <button onClick={() => setPreviewDoc(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 border border-gray-200 bg-gray-50 p-4 rounded-lg overflow-y-auto whitespace-pre-line leading-relaxed font-sans text-xs text-gray-700">
              {loadingPreview ? (
                <div className="h-full flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading content...</span>
                </div>
              ) : (
                previewContent || 'Empty file content.'
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button 
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 bg-gray-950 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
