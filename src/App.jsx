import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Settings, FileArchive, Image, Trash2, AlertCircle, CheckCircle2, RefreshCw, Layers, Tag, Crop, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SIZES = [
  { w: 1080, h: 1080, fit: 'cover',   label: '1080 × 1080', ratio: '1 / 1'  },
  { w: 1080, h: 1080, fit: 'contain', label: '1080 × 1080', ratio: '1 / 1'  },
  { w: 1920, h: 1080, fit: 'cover',   label: '1920 × 1080', ratio: '16 / 9' },
  { w: 1920, h: 1080, fit: 'contain', label: '1920 × 1080', ratio: '16 / 9' },
];

const MAX_IMAGES = 10;
const OFFSET_OPTIONS = [0,1,2,3,4,5,6,7,8,9,10,15,20];
const BG_PRESETS = ['#ffffff', '#f3f4f6', '#1f2937', '#000000'];

const RES_OPTIONS = [
  { value: '1080', label: '1080', sub: '1080 × 1080' },
  { value: '1920', label: '1920', sub: '1920 × 1080' },
];
const MODE_OPTIONS = [
  { value: 'crop',   label: 'Crop',   sub: '裁切填滿', Icon: Crop,      active: 'border-blue-500 bg-blue-500/10 text-blue-300',   dot: 'bg-blue-500'   },
  { value: 'fit',    label: 'Fit',    sub: '等比置中', Icon: Maximize2, active: 'border-purple-500 bg-purple-500/10 text-purple-300', dot: 'bg-purple-500' },
  { value: 'rename', label: 'Rename', sub: '只重命名', Icon: Tag,        active: 'border-amber-500 bg-amber-500/10 text-amber-300',  dot: 'bg-amber-500'  },
];

const buildPrefix = (brand, sku) => {
  const b = brand.trim(), s = sku.trim();
  if (b && s) return `${b}-${s}`;
  return b || s || '';
};
const buildImageName = (brand, sku, index, offset = 0) => {
  const num = String(index + 1 + offset).padStart(2, '0');
  const prefix = buildPrefix(brand, sku);
  return prefix ? `${prefix}-${num}.jpg` : `${num}.jpg`;
};
const buildZipName = (brand, sku) => {
  const prefix = buildPrefix(brand, sku);
  return prefix ? `${prefix}.zip` : 'images.zip';
};

const resizeImageToCanvas = async (url, size, fitBg) => {
  const res = await fetch(url);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (size.fit === 'contain') {
    ctx.fillStyle = fitBg;
    ctx.fillRect(0, 0, size.w, size.h);
    const scale = Math.min(size.w / bitmap.width, size.h / bitmap.height);
    const dw = bitmap.width * scale, dh = bitmap.height * scale;
    ctx.drawImage(bitmap, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
  } else {
    const scale = Math.max(size.w / bitmap.width, size.h / bitmap.height);
    const dw = bitmap.width * scale, dh = bitmap.height * scale;
    ctx.drawImage(bitmap, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
  }
  bitmap.close();
  return canvas;
};

const resizeForMerge = async (url, targetW) => {
  const res = await fetch(url);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = targetW / bitmap.width;
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = targetW; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, targetW, h);
  bitmap.close();
  return canvas;
};

export default function App() {
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [selectedRes, setSelectedRes] = useState('1080');
  const [selectedMode, setSelectedMode] = useState('crop');
  const [fitBg, setFitBg] = useState('#ffffff');
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [justCleared, setJustCleared] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [startOffset, setStartOffset] = useState(0);
  const fileInputRef = useRef(null);

  const renameOnly = selectedMode === 'rename';
  const isFitMode  = selectedMode === 'fit';
  const currentSize = SIZES.find(s =>
    selectedRes === '1080'
      ? s.w === 1080 && (isFitMode ? s.fit === 'contain' : s.fit === 'cover')
      : s.w === 1920 && (isFitMode ? s.fit === 'contain' : s.fit === 'cover')
  );

  const remaining = MAX_IMAGES - images.length;
  const atLimit   = images.length >= MAX_IMAGES;
  const isBusy    = isDownloading || isZipping || isMerging;

  const addImages = files => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, remaining);
    setImages(prev => [...prev, ...valid.map((file, i) => ({ id: Date.now() + i, url: URL.createObjectURL(file), file }))]);
  };

  const handleClearAll = useCallback(() => {
    setImages([]); setJustCleared(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setJustCleared(false), 1800);
  }, []);

  const getBlobForImage = async img => {
    if (renameOnly) return img.file;
    const canvas = await resizeImageToCanvas(img.url, currentSize, fitBg);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  };

  const handleDownloadAll = async () => {
    if (!images.length || isBusy) return;
    setIsDownloading(true); setDownloadProgress(0);
    for (let i = 0; i < images.length; i++) {
      const blob = await getBlobForImage(images[i]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = buildImageName(brand, sku, i, startOffset); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadProgress(i + 1);
      await new Promise(r => setTimeout(r, 350));
    }
    setIsDownloading(false); setDownloadProgress(0);
  };

  const handleDownloadZip = async () => {
    if (!images.length || isBusy) return;
    setIsZipping(true); setZipProgress(0);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (let i = 0; i < images.length; i++) {
        zip.file(buildImageName(brand, sku, i, startOffset), await getBlobForImage(images[i]));
        setZipProgress(i + 1);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url; a.download = buildZipName(brand, sku); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.error('ZIP failed:', e); }
    setIsZipping(false); setZipProgress(0);
  };

  const handleMergeLong = async () => {
    if (!images.length || isBusy || renameOnly) return;
    setIsMerging(true);
    try {
      const canvases = [];
      for (const img of images) canvases.push(await resizeForMerge(img.url, currentSize.w));
      const totalH = canvases.reduce((s, c) => s + c.height, 0);
      const merged = document.createElement('canvas');
      merged.width = currentSize.w; merged.height = totalH;
      const ctx = merged.getContext('2d');
      let y = 0;
      for (const c of canvases) { ctx.drawImage(c, 0, y); y += c.height; }
      const blob = await new Promise(resolve => merged.toBlob(resolve, 'image/jpeg', 0.92));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const prefix = buildPrefix(brand, sku);
      a.href = url; a.download = `${prefix ? prefix + '-' : ''}long.jpg`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.error('Merge failed:', e); }
    setIsMerging(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Image size={15} /></div>
          <span className="font-bold tracking-tight">IMG Resizer</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">Beta</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold ${atLimit ? 'bg-red-500/15 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
            {images.length} / {MAX_IMAGES}
          </div>
          <AnimatePresence mode="wait">
            {justCleared ? (
              <motion.div key="cleared"
                initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-xl font-semibold">
                <CheckCircle2 size={13} /> 已清除，可重新上傳
              </motion.div>
            ) : (
              <motion.button key="clearBtn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={handleClearAll} disabled={!images.length}
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

        {/* ── STEP 1 ── */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">1</div>
            <Settings size={13} className="text-blue-400" />
            <span className="text-sm font-semibold text-gray-200">命名 ＆ 尺寸設定</span>
          </div>

          {/* Naming row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left: Brand + SKU side by side, Offset below */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">品牌</label>
                  <input type="text" placeholder="品牌名稱" value={brand} onChange={e => setBrand(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">SKU</label>
                  <input type="text" placeholder="e.g. E3451" value={sku} onChange={e => setSku(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">Start Number Offset</label>
                <select value={startOffset} onChange={e => setStartOffset(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition cursor-pointer">
                  {OFFSET_OPTIONS.map(o => (
                    <option key={o} value={o} style={{ background: '#111827' }}>
                      {o === 0 ? '從 01 開始（預設）' : `從 ${String(o + 1).padStart(2, '0')} 開始  (+${o})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right: Name preview → ZIP preview stacked */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">命名預覽</label>
                <div className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 h-11 flex items-center overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.span key={buildImageName(brand, sku, 0, startOffset)}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                      className="text-sm font-mono text-blue-300 truncate">
                      {buildImageName(brand, sku, 0, startOffset)}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5">ZIP 檔名</label>
                <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-4 h-11 overflow-hidden">
                  <FileArchive size={13} className="text-purple-400 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    <motion.span key={buildZipName(brand, sku)}
                      initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.15 }}
                      className="text-sm font-mono text-purple-300 truncate">
                      {buildZipName(brand, sku)}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Resolution cards: 1080 | 1920 */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">解析度</label>
            <div className="grid grid-cols-2 gap-3">
              {RES_OPTIONS.map(res => {
                const active = selectedRes === res.value;
                return (
                  <button key={res.value} onClick={() => setSelectedRes(res.value)}
                    className={`flex flex-col items-center justify-center py-3.5 rounded-xl border-2 transition-all ${
                      active ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}>
                    <span className="text-xl font-bold font-mono leading-tight">{res.label}</span>
                    <span className="text-xs font-mono opacity-50 mt-0.5">{res.sub}</span>
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode cards: Crop | Fit | Rename */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">模式</label>
            <div className="grid grid-cols-3 gap-3">
              {MODE_OPTIONS.map(({ value, label, sub, Icon, active: activeClass, dot }) => {
                const isActive = selectedMode === value;
                return (
                  <button key={value} onClick={() => setSelectedMode(value)}
                    className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border-2 transition-all ${
                      isActive ? activeClass : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                    }`}>
                    <Icon size={16} />
                    <span className="text-sm font-bold">{label}</span>
                    <span className="text-xs opacity-50">{sub}</span>
                    {isActive && <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fit bg picker */}
          <AnimatePresence>
            {isFitMode && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="border border-purple-500/30 bg-purple-500/5 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4">
                  <div>
                    <p className="text-xs text-purple-300 font-semibold mb-0.5">Fit 補背景色</p>
                    <p className="text-xs text-gray-500">圖片等比縮放置中，四邊補色</p>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-gray-500">補色：</span>
                    {BG_PRESETS.map(c => (
                      <button key={c} onClick={() => setFitBg(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${fitBg === c ? 'border-purple-400 scale-110' : 'border-gray-600'}`}
                        style={{ background: c }} />
                    ))}
                    <input type="color" value={fitBg} onChange={e => setFitBg(e.target.value)}
                      className="w-7 h-7 rounded-full border-2 border-gray-700 bg-transparent cursor-pointer overflow-hidden" title="自訂顏色" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── STEP 2 Upload ── */}
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
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); if (!atLimit) addImages(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl py-10 text-center cursor-pointer transition-colors ${
                  isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 bg-gray-900 hover:bg-gray-900/60'
                }`}>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                  onChange={e => { addImages(e.target.files); e.target.value = ''; }} />
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

        {/* ── STEP 3 Preview — 5 per row, no large focus ── */}
        <AnimatePresence>
          {images.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">3</div>
                <span className="text-sm font-semibold text-gray-200">全部預覽</span>
                {renameOnly && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Rename Only</span>}
                {!renameOnly && isFitMode && <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">Fit 模式</span>}
                <button onClick={handleClearAll} className="ml-auto flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition">
                  <Trash2 size={12} /> 全部清除
                </button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <motion.div layout className="grid grid-cols-5 gap-2">
                  <AnimatePresence>
                    {images.map((img, index) => (
                      <motion.div key={img.id} layout
                        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.18 }}
                        className="relative group rounded-xl overflow-hidden bg-gray-800 ring-1 ring-gray-700/60">
                        <div className="w-full relative overflow-hidden"
                          style={{
                            aspectRatio: renameOnly ? '1 / 1' : currentSize?.ratio,
                            background: !renameOnly && isFitMode ? fitBg : '#111'
                          }}>
                          <img src={img.url} alt="" className="w-full h-full"
                            style={{ objectFit: renameOnly ? 'cover' : currentSize?.fit }} />
                          {/* Hover delete overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={e => { e.stopPropagation(); setImages(p => p.filter(x => x.id !== img.id)); }}
                              className="w-7 h-7 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center">
                              <X size={12} />
                            </button>
                          </div>
                          {/* Index badge */}
                          <div className="absolute top-1 left-1 bg-black/70 text-white rounded px-1 leading-none font-mono font-bold"
                            style={{ fontSize: '10px', paddingTop: '2px', paddingBottom: '2px' }}>
                            {String(index + 1 + startOffset).padStart(2, '0')}
                          </div>
                        </div>
                        {/* Filename bar */}
                        <div className="bg-gray-900/90 px-1.5 py-1">
                          <p className="font-mono text-blue-300 truncate" style={{ fontSize: '9px' }}>
                            {buildImageName(brand, sku, index, startOffset)}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── STEP 4 Download ── */}
        <AnimatePresence>
          {images.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">

              {/* Header */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">4</div>
                <span className="text-sm font-semibold text-gray-200">下載</span>
                <span className="text-xs text-gray-500">
                  {images.length} 張 · {renameOnly ? 'Rename Only' : `${currentSize?.label} · ${isFitMode ? 'Fit' : 'Crop'}`}
                  {startOffset > 0 && ` · 從 ${String(1 + startOffset).padStart(2, '0')} 開始`}
                </span>
                <span className="ml-auto text-xs font-mono text-purple-400">{buildZipName(brand, sku)}</span>
              </div>

              {/* Progress bars */}
              <AnimatePresence>
                {isDownloading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span className="text-xs text-blue-400 font-mono">逐張下載 {downloadProgress} / {images.length}</span>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                      <motion.div className="h-full bg-blue-500 rounded-full" initial={{ width: 0 }}
                        animate={{ width: `${(downloadProgress / images.length) * 100}%` }} transition={{ duration: 0.3 }} />
                    </div>
                  </motion.div>
                )}
                {isZipping && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span className="text-xs text-purple-400 font-mono">壓縮中 {zipProgress} / {images.length}</span>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                      <motion.div className="h-full bg-purple-500 rounded-full" initial={{ width: 0 }}
                        animate={{ width: `${(zipProgress / images.length) * 100}%` }} transition={{ duration: 0.3 }} />
                    </div>
                  </motion.div>
                )}
                {isMerging && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <span className="text-xs text-green-400 font-mono">合併長圖中…</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Row 1: 清除重來 */}
              <button onClick={handleClearAll} disabled={isBusy}
                className="w-full flex items-center justify-center gap-2 border border-gray-700 bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">
                <RefreshCw size={14} /> 清除重來
              </button>

              {/* Row 2: Merge | ZIP | 逐張 */}
              <div className="grid grid-cols-3 gap-3">
                <button onClick={handleMergeLong} disabled={isBusy || renameOnly}
                  title={renameOnly ? 'Rename Only 模式下無法合併長圖' : `合併 ${images.length} 張 → 垂直長圖`}
                  className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold transition-all ${
                    isBusy || renameOnly
                      ? 'opacity-40 cursor-not-allowed bg-green-800'
                      : 'bg-green-700 hover:bg-green-600 active:scale-95 cursor-pointer'
                  }`}>
                  <Layers size={18} />
                  <span className="leading-none">{isMerging ? '合併中…' : 'Merge Long'}</span>
                </button>

                <button onClick={handleDownloadZip} disabled={isBusy}
                  className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold transition-all disabled:cursor-not-allowed ${
                    isZipping ? 'bg-purple-700 opacity-70' : 'bg-purple-600 hover:bg-purple-500 active:scale-95'
                  }`}>
                  <FileArchive size={18} />
                  <span className="leading-none">{isZipping ? `壓縮中… ${zipProgress}/${images.length}` : '下載 ZIP'}</span>
                </button>

                <button onClick={handleDownloadAll} disabled={isBusy}
                  className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl text-sm font-bold transition-all disabled:cursor-not-allowed ${
                    isDownloading ? 'bg-blue-700 opacity-70' : 'bg-blue-600 hover:bg-blue-500 active:scale-95'
                  }`}>
                  <FileArchive size={18} />
                  <span className="leading-none">{isDownloading ? `下載中… ${downloadProgress}/${images.length}` : '逐張下載'}</span>
                </button>
              </div>

            </motion.section>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
