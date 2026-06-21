import React, { useCallback, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Camera, ZoomIn, ZoomOut, Loader2, Check, X } from 'lucide-react';

type Area = { x: number; y: number; width: number; height: number };

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (err) => reject(err));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}

// Gera a imagem recortada (quadrada — exibida em círculo via CSS) como data URL JPEG,
// mantendo o mesmo formato de armazenamento que o perfil já usa (avatar_url = base64).
async function getCroppedDataUrl(imageSrc: string, pixelCrop: Area, maxSize = 480): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não suportado neste navegador.');
  const size = Math.max(1, Math.min(maxSize, Math.round(pixelCrop.width)));
  canvas.width = size;
  canvas.height = size;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, size, size,
  );
  return canvas.toDataURL('image/jpeg', 0.9);
}

interface AvatarCropperProps {
  value: string;
  onChange: (dataUrl: string) => void;
  fallbackSrc?: string;
  disabled?: boolean;
  onError?: (message: string) => void;
}

export const AvatarCropper: React.FC<AvatarCropperProps> = ({
  value,
  onChange,
  fallbackSrc,
  disabled,
  onError,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => setAreaPixels(areaPx), []);

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError?.('Selecione uma imagem (PNG, JPG ou WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(String(reader.result || ''));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
    // permite re-selecionar o mesmo arquivo numa próxima vez
    if (inputRef.current) inputRef.current.value = '';
  };

  const apply = async () => {
    if (!imageSrc || !areaPixels) return;
    setBusy(true);
    try {
      const out = await getCroppedDataUrl(imageSrc, areaPixels);
      onChange(out);
      setImageSrc(null);
    } catch (e: any) {
      onError?.(e?.message || 'Não foi possível recortar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setImageSrc(null);
    setBusy(false);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      {imageSrc ? (
        <div className="space-y-4">
          <div className="relative w-full h-64 rounded-2xl overflow-hidden bg-surface-2 border border-line">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div className="flex items-center gap-3 px-1">
            <ZoomOut className="w-4 h-4 text-muted shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom da foto"
              className="flex-1 accent-accent cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-muted shrink-0" />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-primary text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={busy || !areaPixels}
              className="flex-1 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {busy ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="group relative w-24 h-24 rounded-full overflow-hidden border border-line-strong bg-surface/40 shrink-0 disabled:opacity-60"
            aria-label="Alterar foto do perfil"
          >
            <img
              src={value || fallbackSrc || '/logo-LA-colapsed.png'}
              alt="Avatar"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/logo-LA-colapsed.png';
              }}
            />
            <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white">
              <Camera className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-wide">Alterar</span>
            </span>
          </button>
          <div className="min-w-0">
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled}
              className="text-sm font-bold text-accent hover:underline disabled:opacity-60"
            >
              Clique na foto para alterar
            </button>
            <p className="text-[11px] text-muted mt-1 leading-snug">
              Envie uma imagem e ajuste o recorte com zoom. Aparece no header e nos relatórios.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
