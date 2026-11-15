import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { cn } from '@/utils/cn';
import { IconButton, Segmented, panelClass } from './primitives';

const Icon = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function WorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const { saveToBrowser, loadFromBrowser, exportJson, importJson, resetWorkspace, notify } = useStore.getState();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (label: string, onClick: () => void, icon: string) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] text-neutral-100 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
    >
      <Icon d={icon} />
      {label}
    </button>
  );

  const doExport = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nicque-workspace.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Workspace exported', 'success');
  };

  return (
    <div ref={wrap} className="relative">
      <IconButton aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} active={open}>
        Workspace
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </IconButton>
      {open && (
        <div role="menu" aria-label="Workspace" className={cn(panelClass, 'absolute right-0 top-11 w-52 p-1.5')}>
          {item('Save', saveToBrowser, 'M3 2h8l2 2v9H3zM5.5 2v4h4V2M5.5 13V9h5v4')}
          {item('Load saved', loadFromBrowser, 'M2 4h4l1.5 1.5H14V13H2z')}
          {item('Export file', doExport, 'M8 2v8M5 7l3 3 3-3M3 13h10')}
          {item('Import file', () => file.current?.click(), 'M8 10V2M5 5l3-3 3 3M3 13h10')}
          <div className="my-1 h-px bg-white/10" />
          {item(
            'Reset workspace',
            () => {
              if (window.confirm('Reset the workspace to the default three-block arrangement?')) resetWorkspace();
            },
            'M3 8a5 5 0 1 0 1.8-3.8M3 2.5v3h3',
          )}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Import workspace file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            importJson(await f.text());
          } catch {
            notify('Import failed. The file could not be read.', 'error');
          }
        }}
      />
    </div>
  );
}

export function TopBar() {
  const quality = useStore((s) => s.quality);
  const snap = useStore((s) => s.snap);
  const { setQuality, setSnap, resetCamera } = useStore.getState();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
      <div className={cn(panelClass, 'pointer-events-auto flex h-11 items-center px-4')}>
        <span className="text-[17px] font-semibold tracking-[0.02em]" aria-label="Nicque">
          nicque
        </span>
      </div>
      <nav
        aria-label="Tools"
        className={cn(panelClass, 'pointer-events-auto flex h-11 flex-wrap items-center gap-1 px-1.5')}
      >
        <IconButton onClick={resetCamera} aria-label="Reset camera">
          <Icon d="M8 2v2M8 12v2M2 8h2M12 8h2M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
          <span className="max-sm:hidden">Reset view</span>
        </IconButton>
        <IconButton onClick={() => setSnap(!snap)} aria-pressed={snap} active={snap} aria-label="Grid snapping">
          <Icon d="M2 6h12M2 10h12M6 2v12M10 2v12" />
          <span className="max-sm:hidden">Snap</span>
        </IconButton>
        <Segmented
          label="Rendering quality"
          value={quality}
          onChange={setQuality}
          options={[
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'performance', label: 'Fast' },
          ]}
        />
        <WorkspaceMenu />
      </nav>
    </header>
  );
}
