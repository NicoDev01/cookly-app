import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ImageEditorProps {
  imageUrl: string | null;
  onApply: (editedImage: Blob) => void;
  onCancel: () => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ImageEditor: React.FC<ImageEditorProps> = ({
  imageUrl,
  onApply,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });

  // Container-Größe überwachen
  useEffect(() => {
    if (!containerRef.current) return;

    const updateContainerSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateContainerSize();
    const resizeObserver = new ResizeObserver(updateContainerSize);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Bild laden und initialisieren
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    // Berechne angezeigte Größe (contain)
    const containerAspect = containerSize.width / containerSize.height;
    const imageAspect = naturalWidth / naturalHeight;
    
    let displayWidth, displayHeight;
    
    if (containerAspect > imageAspect) {
      displayHeight = containerSize.height;
      displayWidth = displayHeight * imageAspect;
    } else {
      displayWidth = containerSize.width;
      displayHeight = displayWidth / imageAspect;
    }

    setImageSize({
      width: displayWidth,
      height: displayHeight,
      naturalWidth,
      naturalHeight
    });

    // Initial Crop Area (80% der Bildgröße)
    const cropWidth = displayWidth * 0.8;
    const cropHeight = displayHeight * 0.8;
    
    setCropArea({
      x: (containerSize.width - displayWidth) / 2 + (displayWidth - cropWidth) / 2,
      y: (containerSize.height - displayHeight) / 2 + (displayHeight - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight
    });
  };

  // Wenn Container sich ändert, Bildgröße neu berechnen
  useEffect(() => {
    if (imageRef.current && containerSize.width > 0 && containerSize.height > 0) {
      // Trigger image load logic again manually if needed, or rely on state updates
      // Hier vereinfacht: Wir setzen cropArea zurück wenn Container sich drastisch ändert
      // Aber besser ist es, handleImageLoad Logik zu extrahieren.
      // Für jetzt lassen wir es so, da handleImageLoad beim ersten Render feuert.
    }
  }, [containerSize]);

  // Maus/Touch Handler für Crop Area
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!cropArea) return;
    e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Check Handles
    const handleSize = 20; // Größerer Hit-Bereich
    const handles = {
      'nw': { x: cropArea.x, y: cropArea.y },
      'ne': { x: cropArea.x + cropArea.width, y: cropArea.y },
      'sw': { x: cropArea.x, y: cropArea.y + cropArea.height },
      'se': { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height },
    };

    for (const [handle, pos] of Object.entries(handles)) {
      if (Math.abs(x - pos.x) < handleSize && Math.abs(y - pos.y) < handleSize) {
        setIsResizing(true);
        setResizeHandle(handle);
        setDragStart({ x, y });
        return;
      }
    }

    // Check Drag
    if (x >= cropArea.x && x <= cropArea.x + cropArea.width &&
        y >= cropArea.y && y <= cropArea.y + cropArea.height) {
      setIsDragging(true);
      setDragStart({ x: x - cropArea.x, y: y - cropArea.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging && !isResizing) return;
    if (!cropArea || !containerRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (isResizing && resizeHandle) {
      const minSize = 50;
      let newCrop = { ...cropArea };

      switch (resizeHandle) {
        case 'nw':
          newCrop.width = cropArea.x + cropArea.width - x;
          newCrop.height = cropArea.y + cropArea.height - y;
          newCrop.x = x;
          newCrop.y = y;
          break;
        case 'ne':
          newCrop.width = x - cropArea.x;
          newCrop.height = cropArea.y + cropArea.height - y;
          newCrop.y = y;
          break;
        case 'sw':
          newCrop.width = cropArea.x + cropArea.width - x;
          newCrop.height = y - cropArea.y;
          newCrop.x = x;
          break;
        case 'se':
          newCrop.width = x - cropArea.x;
          newCrop.height = y - cropArea.y;
          break;
      }

      if (newCrop.width >= minSize && newCrop.height >= minSize) {
        setCropArea(newCrop);
      }
    } else if (isDragging) {
      const newX = Math.max(0, Math.min(containerSize.width - cropArea.width, x - dragStart.x));
      const newY = Math.max(0, Math.min(containerSize.height - cropArea.height, y - dragStart.y));
      setCropArea({ ...cropArea, x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  // Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  // Apply Crop
  const applyCrop = async () => {
    if (!imageRef.current || !cropArea) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Berechne die Position des Bildes im Container
    const displayX = (containerSize.width - imageSize.width) / 2;
    const displayY = (containerSize.height - imageSize.height) / 2;

    // Relativer Crop zum Bild-Ursprung (oben links vom Bild im Container)
    const relCropX = cropArea.x - displayX;
    const relCropY = cropArea.y - displayY;

    // Skalierungsfaktor zwischen Anzeigegröße und Originalgröße
    const scaleFactor = imageSize.naturalWidth / imageSize.width;

    // Crop-Koordinaten auf Originalbild umrechnen
    const originalCropX = relCropX * scaleFactor;
    const originalCropY = relCropY * scaleFactor;
    const originalCropWidth = cropArea.width * scaleFactor;
    const originalCropHeight = cropArea.height * scaleFactor;

    // Wenn Rotation vorhanden ist, müssen wir das Bild zuerst rotieren
    if (rotation !== 0) {
      // Canvas für rotiertes Bild erstellen
      const rotatedCanvas = document.createElement('canvas');
      const rotatedCtx = rotatedCanvas.getContext('2d');
      if (!rotatedCtx) return;

      // Neue Größe für rotiertes Bild berechnen
      const radians = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));
      
      const newWidth = imageSize.naturalWidth * cos + imageSize.naturalHeight * sin;
      const newHeight = imageSize.naturalWidth * sin + imageSize.naturalHeight * cos;
      
      rotatedCanvas.width = newWidth;
      rotatedCanvas.height = newHeight;
      
      // Bild rotieren
      rotatedCtx.translate(newWidth / 2, newHeight / 2);
      rotatedCtx.rotate(radians);
      rotatedCtx.drawImage(img, -imageSize.naturalWidth / 2, -imageSize.naturalHeight / 2);
      
      // Crop-Koordinaten für rotiertes Bild anpassen
      let finalCropX = originalCropX;
      let finalCropY = originalCropY;
      let finalCropWidth = originalCropWidth;
      let finalCropHeight = originalCropHeight;

      const normalizedRotation = ((rotation % 360) + 360) % 360;
      if (normalizedRotation === 90) {
        finalCropX = originalCropY;
        finalCropY = imageSize.naturalWidth - originalCropX - originalCropWidth;
        finalCropWidth = originalCropHeight;
        finalCropHeight = originalCropWidth;
      } else if (normalizedRotation === 180) {
        finalCropX = imageSize.naturalWidth - originalCropX - originalCropWidth;
        finalCropY = imageSize.naturalHeight - originalCropY - originalCropHeight;
      } else if (normalizedRotation === 270) {
        finalCropX = imageSize.naturalHeight - originalCropY - originalCropHeight;
        finalCropY = originalCropX;
        finalCropWidth = originalCropHeight;
        finalCropHeight = originalCropWidth;
      }

      // Finalen Canvas erstellen
      canvas.width = finalCropWidth;
      canvas.height = finalCropHeight;
      
      ctx.drawImage(
        rotatedCanvas,
        finalCropX,
        finalCropY,
        finalCropWidth,
        finalCropHeight,
        0,
        0,
        finalCropWidth,
        finalCropHeight
      );
    } else {
      // Keine Rotation - direkt aus Originalbild croppen
      canvas.width = originalCropWidth;
      canvas.height = originalCropHeight;
      
      ctx.drawImage(
        img,
        originalCropX,
        originalCropY,
        originalCropWidth,
        originalCropHeight,
        0,
        0,
        originalCropWidth,
        originalCropHeight
      );
    }
    
    canvas.toBlob((blob) => {
      if (blob) onApply(blob);
    }, 'image/jpeg', 0.95);
  };

  if (!imageUrl) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div 
        className="bg-white dark:bg-[#1e3031] rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Bild bearbeiten</h2>
          <button onClick={onCancel} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Editor Area */}
        <div 
          ref={containerRef}
          className="flex-1 relative bg-gray-900 overflow-hidden select-none"
          style={{ minHeight: '400px', touchAction: 'none' }}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          {/* Image Layer */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Edit"
              onLoad={handleImageLoad}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                transform: `rotate(${rotation}deg) scale(${scale})`,
                transition: isDragging || isResizing ? 'none' : 'transform 0.2s ease-out',
                objectFit: 'contain'
              }}
              crossOrigin="anonymous"
            />
          </div>

          {/* Crop Overlay Layer */}
          {cropArea && (
            <>
              {/* Darkened Background around Crop Area */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: 'rgba(0, 0, 0, 0.5)',
                clipPath: `polygon(0% 0%, 0% 100%, ${cropArea.x}px 100%, ${cropArea.x}px ${cropArea.y}px, ${cropArea.x + cropArea.width}px ${cropArea.y}px, ${cropArea.x + cropArea.width}px ${cropArea.y + cropArea.height}px, ${cropArea.x}px ${cropArea.y + cropArea.height}px, ${cropArea.x}px 100%, 100% 100%, 100% 0%)`
              }} />

              {/* Active Crop Area */}
              <div
                className="absolute border-2 border-white cursor-move"
                style={{
                  left: cropArea.x,
                  top: cropArea.y,
                  width: cropArea.width,
                  height: cropArea.height,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.5)'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
              >
                {/* Grid Lines (Optional) */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-50">
                  <div className="border-r border-white/50" />
                  <div className="border-r border-white/50" />
                  <div className="border-b border-white/50 col-span-3 row-start-1" />
                  <div className="border-b border-white/50 col-span-3 row-start-2" />
                </div>

                {/* Handles */}
                <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white border border-gray-400 cursor-nw-resize" />
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border border-gray-400 cursor-ne-resize" />
                <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-white border border-gray-400 cursor-sw-resize" />
                <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border border-gray-400 cursor-se-resize" />
              </div>
            </>
          )}
          
          {/* Info Badges */}
          <div className="absolute top-4 left-4 flex gap-2">
            <span className="bg-black/60 text-white px-2 py-1 rounded text-xs backdrop-blur-sm">
              Zoom: {Math.round(scale * 100)}%
            </span>
            <span className="bg-black/60 text-white px-2 py-1 rounded text-xs backdrop-blur-sm">
              Rot: {rotation}°
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 justify-center bg-white dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={() => setRotation(r => r - 90)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white">
            ↺ Links
          </button>
          <button onClick={() => setRotation(r => r + 90)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white">
            ↻ Rechts
          </button>
          <button onClick={() => { setRotation(0); setScale(1); }} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-white">
            Reset
          </button>
          <div className="w-px h-8 bg-gray-300 dark:bg-gray-600 mx-2" />
          <button onClick={onCancel} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
            Abbrechen
          </button>
          <button onClick={applyCrop} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 shadow-lg">
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageEditor;
