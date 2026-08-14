import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Settings, FileArchive, Image, Trash2, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SIZES = [
  { label: '1080 × 1080', value: '1080x1080', desc: 'Square / Crop', ratio: '1 / 1', fit: 'cover', w: 1080, h: 1080 },
  { label: '1920 × 1080', value: '1920x1080', desc: 'Landscape / Crop', ratio: '16 / 9', fit: 'cover', w: 1920, h: 1080 },
  { label: '1920 × 1080', value: '1920x1080-fit', desc: 'Landscape / Fit ✦', ratio: '16 / 9', fit: 'contain', w: 1920, h: 1080 },
];

const MAX_IMAGES = 10;

const buildPrefix = (brand, sku) => {
  const b = brand.trim();
  const s = sku.trim();
  if (b && s) return `${b}-${s}`;
  if (b) return b;
  if (s) return s;
  return '';
};

const buildImageName = (brand, sku, index) => {
  const num = String(index + 1).padStart(2, '0');
  const prefix = buildPrefix(brand, sku);
  return prefix ? `${prefix}-${num}.jpg` : `${num}.jpg`;
};

const buildZipName = (brand, sku) => {
  const prefix = buildPrefix(brand, sku);
  return prefix ? `${prefix}.zip` : 'images.zip';
};

// ── 優化：用 createImageBitmap 取代 new Image()，GPU 解碼更快 ──
const resizeImageToCanvas = async (url, size, fitBg) => {
  const res = await fetch(url);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  if (size.fit === 'contain') {
    ctx.fillStyle = fitBg;
    ctx.fillRect(0, 0, size.w, size.h);
    const scale = Math.min(size.w / bitmap.width, size.h / bitmap.height);
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    ctx.drawImage(bitmap, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
  } else {
    const scale = Math.max(size.w / bitmap.width, size.h / bitmap.height);
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    ctx.drawImage(bitmap, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
  }
  bitmap.close(); // 釋放記憶體
  return canvas;
};

export default function App() {
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [selectedSize, setSelectedSize] = useState('1080x1080');
  const [fitBg, setFitBg] = useState('#ffffff');
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [focusIndex, setFocusIndex] = useState(null);
  const [justCleared, setJustCleared] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const currentSize = SIZES.find((s) => s.value === selectedSize);
  const isFitMode = currentSize?.fit === 'contain';
  const remaining = MAX_IMAGES - images.length;
  const atLimit = images.length >= MAX_IMAGES;

  const addImages = (files) => {
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, remaining);
    const mapped = valid.map((file, i) => ({
      id: Date.now() + i,
      url: URL.createObjectURL(file),
      file,
    }));
    setImages((prev) => [...prev, ...mapped]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!atLimit) addImages(e.dataTransfer.files);
  };

  const removeImage = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setFocusIndex(null);
  };

  const handleClearAll = useCallback(() => {
    setImages([]);
    setFocusIndex(null);
    setJustCleared(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setJustCleared(false), 1800);
  }, []);

  // ── 逐張下載 ──────────────────────────────────────────
  const handleDownloadAll = async () => {
    if (images.length === 0 || isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const canvas = await resizeImageToCanvas(img.url, currentSize, fitBg);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildImageName(brand, sku, i);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadProgress(i + 1);
      await new Promise((r) => setTimeout(r, 350));
    }
    setIsDownloading(false);
    setDownloadProgress(0);
  };

  // ── ZIP 下載（JSZip 用到才載入）─────────────────────────
  const handleDownloadZip = async () => {
    if (images.length === 0 || isZipping) return;
    setIsZipping(true);
    setZipProgress(0);
    const { default: JSZip } = await import('jszip'); // ← 動態載入，減少初始 bundle
    const zip = new JSZip();
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const canvas = await resizeImageToCanvas(img.url, currentSize, fitBg);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      zip.file(buildImageName(brand, sku, i), blob);
      setZipProgress(i + 1);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildZipName(brand, sku);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setIsZipping(false);
    setZipProgress(0);
  };

  const focusedImage = focusIndex !== null ? images[focusIndex] : null;
  const BG_PRESETS = ['#ffffff', '#f3f4f6', '#1f2937', '#000000'];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Image size={15} />
          </div>
          <span className="font-bold tracking-tight">IMG Resizer</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">Beta</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold ${atLimit ? 'bg-red-500/15 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
            {images.length} / {MAX_IMAGES}
          </div>
          <AnimatePresence mode="wait">
            {justCleared ? (
              <motion.div key="cleared" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-xl font-semibold">
                <CheckCircle2 size={13} /> 已清除，可重新上傳
              </motion.div>
            ) : (
              <motion.button key="clearBtn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={handleClearAll} disabled={images.length === 0}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all ${
                  images.length > 0
                    ? 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 active:scale-95 cursor-pointer'
                    : 'text-gray-700 border-gray-800 bg-transparent cursor-not-allowed'
                }`}>
                <RefreshCw size={12} className={images.length > 0 ? 'text-red-400' : 'text-gray-700'} />
                一鍵清除
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">

        {/* STEP 1 */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">1</div>
            <Settings size={13} className="text-blue-400" />
            <span className="text-sm font-semibold text-gray-200">命名 ＆ 尺寸設定</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">品牌名稱</label>
              <input type="text" placeholder="e.g. HAPE" value={brand} onChange={(e) => setBrand(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">SKU</label>
              <input type="text" placeholder="e.g. E3451" value={sku} onChange={(e) => setSku(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">命名預覽</label>
              <div className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 h-11 flex items-center overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.span key={buildImageName(brand, sku, 0)}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                    className="text-sm font-mono text-blue-300 truncate">
                    {buildImageName(brand, sku, 0)}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* ZIP 名預覽 */}
          <div className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-4 py-2.5">
            <FileArchive size={13} className="text-purple-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 flex-shrink-0">ZIP 檔名：</span>
            <AnimatePresence mode="wait">
              <motion.span key={buildZipName(brand, sku)}
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.15 }}
                className="text-xs font-mono text-purple-300 truncate">
                {buildZipName(brand, sku)}
              </motion.span>
            </AnimatePresence>
            <span className="text-xs text-gray-600 ml-auto flex-shrink-0">※ ZIP 或逐張，檔名規則相同</span>
          </div>

          {/* Size Selector */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-widest mb-3">輸出尺寸</label>
            <div className="flex gap-3 flex-wrap">
              {SIZES.map((size) => {
                const active = selectedSize === size.value;
                const isSquare = size.value === '1080x1080';
                const isFit = size.fit === 'contain';
                return (
                  <button key={size.value} onClick={() => setSelectedSize(size.value)}
                    className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 transition-all ${
                      active
                        ? isFit ? 'border-purple-500 bg-purple-500/10 text-purple-300' : 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}>
                    <div className="relative flex-shrink-0" style={{ width: isSquare ? 26 : 46, height: 26 }}>
                      <div className={`w-full h-full border-2 rounded ${active ? (isFit ? 'border-purple-400' : 'border-blue-400') : 'border-gray-600'}`} />
                      {isFit && (
                        <div className={`absolute border rounded-sm ${active ? 'border-purple-400' : 'border-gray-500'}`}
                          style={{ top: 4, bottom: 4, left: 6, right: 6 }} />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold leading-tight">{size.label}</p>
                      <p className={`text-xs opacity-60 ${isFit && active ? 'text-purple-300' : ''}`}>{size.desc}</p>
                    </div>
                    {active && (
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ml-1 ${isFit ? 'bg-purple-500' : 'bg-blue-500'}`}>
                        <svg viewBox="0 0 10 10" width="8" height="8">
                          <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fit mode bg picker */}
          <AnimatePresence>
            {isFitMode && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="border border-purple-500/30 bg-purple-500/5 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4">
                  <div>
                    <p className="text-xs text-purple-300 font-semibold mb-0.5">Fit 模式</p>
                    <p className="text-xs text-gray-500">圖片完整顯示，左右貼齊邊界，上下補背景色</p>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-gray-500">補色：</span>
                    {BG_PRESETS.map((c) => (
                      <button key={c} onClick={() => setFitBg(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${fitBg === c ? 'border-purple-400 scale-110' : 'border-gray-600'}`}
                        style={{ background: c }} />
                    ))}
                    <input type="color" value={fitBg} onChange={(e) => setFitBg(e.target.value)}
                      className="w-7 h-7 rounded-full border-2 border-gray-700 bg-transparent cursor-pointer overflow-hidden" title="自訂顏色" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* STEP 2 Upload */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">2</div>
            <span className="text-sm font-semibold text-gray-200">上傳圖片</span>
            <span className="text-xs text-gray-600 ml-1">最多 {MAX_IMAGES} 張</span>
          </div>

          <AnimatePresence mode="wait">
            {atLimit ? (
              <motion.div key="limit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="border-2 border-dashed border-red-700 bg-red-500/5 rounded-2xl py-8 flex flex-col items-center gap-2">
                <AlertCircle size={22} className="text-red-400" />
                <p className="text-sm font-semibold text-red-400">已達上限 {MAX_IMAGES} 張</p>
                <p className="text-xs text-gray-600 mb-1">請先清除圖片再上傳</p>
                <button onClick={handleClearAll}
                  className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 rounded-xl font-semibold transition active:scale-95">
                  <RefreshCw size={12} /> 一鍵清除，重新開始
                </button>
              </motion.div>
            ) : (
              <motion.div key="upload" animate={{ scale: isDragging ? 1.01 : 1 }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl py-10 text-center cursor-pointer transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 bg-gray-900 hover:bg-gray-900/60'
                }`}>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
                <div className="flex flex-col items-center gap-3 pointer-events-none">
                  <motion.div animate={{ y: isDragging ? -5 : 0 }}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDragging ? 'bg-blue-500/20' : 'bg-gray-800'}`}>
                    <Upload size={22} className={isDragging ? 'text-blue-400' : 'text-gray-500'} />
                  </motion.div>
                  <div>
                    <p className={`text-sm font-semibold ${isDragging ? 'text-blue-300' : 'text-gray-300'}`}>
                      {isDragging ? '放開以上傳圖片 ✦' : '拖到這邊上傳'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">或點擊選擇檔案 · JPG / PNG · 可多選 · 尚可上傳 {remaining} 張</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* STEP 3 Preview */}
        <AnimatePresence>
          {images.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">3</div>
                <span className="text-sm font-semibold text-gray-200">全部預覽</span>
                {isFitMode && <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">Fit 模式</span>}
                <button onClick={handleClearAll} className="ml-auto flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition">
                  <Trash2 size={12} /> 全部清除
                </button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <AnimatePresence>
                  {focusedImage && (
                    <motion.div key={`focus-${focusedImage.id}-${selectedSize}-${fitBg}`}
                      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2 }}
                      className={`mb-4 relative overflow-hidden rounded-xl border-2 ${isFitMode ? 'border-purple-500' : 'border-blue-500'}`}>
                      <div className="relative w-full overflow-hidden" style={{ aspectRatio: currentSize?.ratio, background: isFitMode ? fitBg : '#000' }}>
                        <img src={focusedImage.url} alt="focused preview" className="w-full h-full" style={{ objectFit: currentSize?.fit }} />
                        <div className="absolute bottom-2 left-2 bg-black/70 text-xs font-mono text-blue-300 px-2 py-0.5 rounded-full">
                          {buildImageName(brand, sku, focusIndex)}
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/70 text-xs text-gray-400 px-2 py-0.5 rounded-full font-mono">
                          {currentSize?.label} · {isFitMode ? 'Fit' : 'Crop'}
                        </div>
                        <button onClick={() => setFocusIndex(null)}
                          className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-black rounded-full flex items-center justify-center transition">
                          <X size={13} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <AnimatePresence>
                    {images.map((img, index) => {
                      const isFocused = focusIndex === index;
                      return (
                        <motion.div key={img.id} layout
                          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.2 }}
                          className={`relative group rounded-xl overflow-hidden bg-gray-800 cursor-pointer ring-2 transition-all ${
                            isFocused ? (isFitMode ? 'ring-purple-500' : 'ring-blue-500') : 'ring-transparent hover:ring-gray-600'
                          }`}
                          onClick={() => setFocusIndex(isFocused ? null : index)}>
                          <div className="w-full relative overflow-hidden" style={{ aspectRatio: currentSize?.ratio, background: isFitMode ? fitBg : '#111' }}>
                            <img src={img.url} alt="" className="w-full h-full" style={{ objectFit: currentSize?.fit }} />
                            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                                className="w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center">
                                <X size={13} />
                              </button>
                            </div>
                            <div className={`absolute top-1.5 left-1.5 text-xs font-mono font-bold px-1.5 py-0.5 rounded-md leading-none ${
                              isFocused ? (isFitMode ? 'bg-purple-500 text-white' : 'bg-blue-500 text-white') : 'bg-black/70 text-gray-300'
                            }`}>
                              {String(index + 1).padStart(2, '0')}
                            </div>
                            {isFocused && <div className="absolute top-1.5 right-1.5"><CheckCircle2 size={14} className={isFitMode ? 'text-purple-400' : 'text-blue-400'} /></div>}
                          </div>
                          <div className="bg-gray-900/90 px-2 py-1.5">
                            <p className="text-xs font-mono text-blue-300 truncate">{buildImageName(brand, sku, index)}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>

                {!focusedImage && (
                  <p className="text-xs text-gray-600 text-center mt-4">點擊任何圖片可放大預覽 · 切換尺寸後所有預覽即時更新</p>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* STEP 4 Download */}
        <AnimatePresence>
          {images.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">4</div>
                  <span className="text-sm font-semibold text-gray-200">下載</span>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                  {images.length} 張 · {selectedSize.replace('x', ' × ').replace('-fit', '')} · {isFitMode ? 'Fit 模式' : 'Crop 模式'}
                </p>
                <p className="text-xs font-mono text-purple-300 ml-7 mt-0.5">{buildZipName(brand, sku)}</p>

                {/* 逐張進度條 */}
                {isDownloading && (
                  <div className="ml-7 mt-2">
                    <span className="text-xs text-blue-400 font-mono">逐張下載 {downloadProgress} / {images.length}</span>
                    <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                      <motion.div className="h-full bg-blue-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(downloadProgress / images.length) * 100}%` }}
                        transition={{ duration: 0.3 }} />
                    </div>
                  </div>
                )}

                {/* ZIP 進度條 */}
                {isZipping && (
                  <div className="ml-7 mt-2">
                    <span className="text-xs text-purple-400 font-mono">壓縮中 {zipProgress} / {images.length}</span>
                    <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                      <motion.div className="h-full bg-purple-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(zipProgress / images.length) * 100}%` }}
                        transition={{ duration: 0.3 }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-shrink-0">
                <button onClick={handleClearAll} disabled={isDownloading || isZipping}
                  className="flex items-center justify-center gap-2 border border-gray-700 bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all px-5 py-3 rounded-xl text-sm font-semibold text-gray-300 w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed">
                  <RefreshCw size={14} /> 清除重來
                </button>
                <button onClick={handleDownloadZip} disabled={isZipping || isDownloading}
                  className={`flex items-center justify-center gap-2 active:scale-95 transition-all px-6 py-3 rounded-xl text-sm font-bold w-full sm:w-auto disabled:cursor-not-allowed ${
                    isZipping ? 'bg-purple-700 opacity-70' : 'bg-purple-600 hover:bg-purple-500'
                  }`}>
                  <FileArchive size={15} />
                  {isZipping ? `壓縮中… ${zipProgress}/${images.length}` : `下載 ZIP`}
                </button>
                <button onClick={handleDownloadAll} disabled={isDownloading || isZipping}
                  className={`flex items-center justify-center gap-2 active:scale-95 transition-all px-8 py-3 rounded-xl text-sm font-bold w-full sm:w-auto disabled:cursor-not-allowed ${
                    isDownloading ? 'bg-blue-700 opacity-70' : 'bg-blue-600 hover:bg-blue-500'
                  }`}>
                  <FileArchive size={15} />
                  {isDownloading ? `下載中… ${downloadProgress}/${images.length}` : `逐張下載`}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
