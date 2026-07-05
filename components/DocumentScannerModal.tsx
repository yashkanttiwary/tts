import React, { useState, useRef } from 'react';
import { X, FileText, Upload, Loader2, FileCheck, Image as ImageIcon, FileType } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import { extractTextFromImage } from '../services/geminiService';

// Use UNPKG for the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtract: (text: string) => void;
  apiKey: string | null;
}

type FileTypeCategory = 'pdf' | 'docx' | 'text' | 'image' | 'unknown';

export default function DocumentScannerModal({ isOpen, onClose, onExtract, apiKey }: DocumentScannerModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileCategory, setFileCategory] = useState<FileTypeCategory>('unknown');
  
  // PDF specific state
  const [numPages, setNumPages] = useState<number>(0);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  
  // OCR specific state
  const [ocrProgress, setOcrProgress] = useState<{status: string, progress: number} | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const getFileTypeCategory = (file: File): FileTypeCategory => {
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) return 'docx';
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) return 'text';
    if (file.type.startsWith('image/')) return 'image';
    return 'unknown';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      const category = getFileTypeCategory(selected);
      if (category === 'unknown') {
        setError('Unsupported file format. Please upload PDF, DOCX, TXT, MD, or an Image.');
        return;
      }

      setFile(selected);
      setFileCategory(category);
      setError('');
      
      if (category === 'pdf') {
        try {
          const arrayBuffer = await selected.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          setNumPages(pdf.numPages);
          setStartPage(1);
          setEndPage(pdf.numPages);
        } catch (err: any) {
          setError('Failed to load PDF. It might be corrupted or encrypted.');
          setFile(null);
          setNumPages(0);
        }
      } else {
        setNumPages(0);
        setStartPage(1);
        setEndPage(1);
      }
    }
  };

  const handleExtract = async () => {
    if (!file) return;
    
    setIsExtracting(true);
    setError('');
    setOcrProgress(null);
    
    try {
      let fullText = '';

      if (fileCategory === 'pdf') {
        const parsedStart = parseInt(startPage as any, 10);
        const parsedEnd = parseInt(endPage as any, 10);

        if (isNaN(parsedStart) || isNaN(parsedEnd) || parsedStart < 1 || parsedEnd > numPages || parsedStart > parsedEnd) {
          throw new Error('Invalid page range.');
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        for (let i = parsedStart; i <= parsedEnd; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          const pageText = strings.join(' ');
          fullText += pageText + '\n\n';
        }
      } else if (fileCategory === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        fullText = result.value;
      } else if (fileCategory === 'text') {
        fullText = await file.text();
      } else if (fileCategory === 'image') {
        if (apiKey) {
          setOcrProgress({ status: 'Using Gemini Vision AI...', progress: 100 });
          fullText = await extractTextFromImage(file, apiKey);
        } else {
          const result = await Tesseract.recognize(
            file,
            'eng',
            {
              logger: m => {
                if (m.status === 'recognizing text') {
                  setOcrProgress({ status: 'Recognizing text...', progress: Math.round(m.progress * 100) });
                } else {
                  setOcrProgress({ status: m.status, progress: 0 });
                }
              }
            }
          );
          fullText = result.data.text;
        }
      }
      
      if (!fullText.trim()) {
        throw new Error("No extractable text found in this document.");
      }

      onExtract(fullText.trim());
      onClose();
      // Reset
      setFile(null);
      setFileCategory('unknown');
      setNumPages(0);
      setStartPage(1);
      setEndPage(1);
      setOcrProgress(null);
    } catch (err: any) {
      setError(err.message || 'Error extracting text from document.');
    } finally {
      setIsExtracting(false);
      setOcrProgress(null);
    }
  };

  const getFileIcon = () => {
    switch(fileCategory) {
      case 'image': return <ImageIcon className="w-8 h-8 text-indigo-600 dark:text-indigo-400 shrink-0 mt-1" />;
      case 'pdf': return <FileCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400 shrink-0 mt-1" />;
      case 'docx': 
      case 'text':
      default:
        return <FileType className="w-8 h-8 text-indigo-600 dark:text-indigo-400 shrink-0 mt-1" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Import Document</h3>
          </div>
          <button 
            onClick={onClose}
            disabled={isExtracting}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!file ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group text-center"
            >
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Click to upload Document</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">PDF, DOCX, TXT, MD, Images (OCR)</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange}
                accept=".pdf,.docx,text/plain,.md,.txt,image/*"
                className="hidden" 
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                {getFileIcon()}
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 capitalize">
                    {fileCategory === 'pdf' ? `${numPages} ${numPages === 1 ? 'page' : 'pages'}` : `${fileCategory} Document`}
                  </p>
                </div>
                <button 
                  onClick={() => setFile(null)}
                  disabled={isExtracting}
                  className="ml-auto text-xs font-medium text-slate-500 hover:text-red-500 transition-colors"
                >
                  Remove
                </button>
              </div>

              {fileCategory === 'pdf' && numPages > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-4 border border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Page Range</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">From Page</label>
                      <input 
                        type="number" 
                        min="1" 
                        max={endPage}
                        value={startPage}
                        onChange={(e) => setStartPage(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">To Page</label>
                      <input 
                        type="number" 
                        min={startPage} 
                        max={numPages}
                        value={endPage}
                        onChange={(e) => setEndPage(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {fileCategory === 'image' && ocrProgress && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2 border border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{ocrProgress.status}</span>
                    {ocrProgress.progress > 0 && <span className="font-semibold text-indigo-600 dark:text-indigo-400">{ocrProgress.progress}%</span>}
                  </div>
                  {ocrProgress.progress > 0 && (
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${ocrProgress.progress}%` }}></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isExtracting}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExtract}
            disabled={!file || isExtracting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600 shadow-md shadow-indigo-500/20"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting...</span>
              </>
            ) : (
              <span>Import Text</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
