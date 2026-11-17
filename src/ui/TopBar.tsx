import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { cn } from '@/utils/cn';
import { ConfirmDialog, IconButton, Segmented, panelClass } from './primitives';

const Icon = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function WorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
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
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] text-neutral-100 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none max-md:min-h-11 max-md:text-[14px]"
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
      <IconButton
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Workspace menu"
        onClick={() => setOpen((v) => !v)}
        active={open}
      >
        <span className="md:hidden">
          <Icon d="M3 4h10M3 8h10M3 12h10" />
        </span>
        <span className="max-md:hidden">Workspace</span>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className="max-md:hidden">
          <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </IconButton>
      {open && (
        <div
          role="menu"
          aria-label="Workspace"
          className={cn(panelClass, 'absolute right-0 top-11 z-50 w-52 p-1.5 max-md:top-12 max-md:w-56')}
        >
          {item('Save', saveToBrowser, 'M3 2h8l2 2v9H3zM5.5 2v4h4V2M5.5 13V9h5v4')}
          {item('Load saved', loadFromBrowser, 'M2 4h4l1.5 1.5H14V13H2z')}
          {item('Export file', doExport, 'M8 2v8M5 7l3 3 3-3M3 13h10')}
          {item('Import file', () => file.current?.click(), 'M8 10V2M5 5l3-3 3 3M3 13h10')}
          <div className="my-1 h-px bg-white/10" />
          {item(
            'Reset workspace',
            () => setConfirmReset(true),
            'M3 8a5 5 0 1 0 1.8-3.8M3 2.5v3h3',
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        title="Reset workspace?"
        message="This replaces everything on the workspace with the default three-block arrangement. Unsaved changes are lost."
        confirmLabel="Reset"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetWorkspace();
        }}
      />
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

const ADDABLE = [
  { type: 'keyboard', label: 'Keyboard', hint: 'Types into a Text Block' },
  { type: 'keypad', label: 'Keypad', hint: 'Digits and symbols for a Text Block' },
  { type: 'text', label: 'Text', hint: 'Holds and sends text' },
  { type: 'integer', label: 'Integer', hint: 'Holds and sends a whole number' },
  { type: 'adder', label: 'Adder', hint: 'Operator: adds' },
  { type: 'subtractor', label: 'Subtractor', hint: 'Operator: subtracts' },
  { type: 'multiplier', label: 'Multiplier', hint: 'Operator: multiplies' },
  { type: 'divisor', label: 'Divisor', hint: 'Operator: divides' },
  { type: 'display', label: 'Display', hint: 'Shows text on LEDs' },
  { type: 'power', label: 'Power', hint: 'Supplies other blocks' },
] as const;

function AddMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const addModule = useStore((s) => s.addModule);

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

  return (
    <div ref={wrap} className="relative">
      <IconButton aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} active={open}>
        <Icon d="M8 3v10M3 8h10" />
        <span className="max-md:hidden">Add block</span>
      </IconButton>
      {open && (
        <div
          role="menu"
          aria-label="Add block"
          className={cn(
            panelClass,
            'absolute right-0 top-11 z-50 w-56 overflow-y-auto overscroll-contain p-1.5 max-md:top-12 max-md:w-[min(14rem,calc(100vw-1.5rem))]',
            'max-h-[calc(100dvh-6rem)] max-md:max-h-[calc(100dvh-9rem)]',
          )}
        >
          {ADDABLE.map((a) => (
            <button
              key={a.type}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                addModule(a.type);
              }}
              className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none max-md:min-h-11 max-md:justify-center"
            >
              <span className="text-[13px] text-neutral-100">{a.label} Block</span>
              <span className="text-xs text-neutral-400">{a.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const quality = useStore((s) => s.quality);
  const snap = useStore((s) => s.snap);
  const { setQuality, setSnap, resetCamera } = useStore.getState();

  const qualityControl = (
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
  );

  return (
    <header className="nq-safe-top pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start justify-between gap-2 p-3 max-md:gap-x-2 max-md:gap-y-2 max-md:px-2 max-md:pt-2">
      <div className={cn(panelClass, 'pointer-events-auto flex h-11 items-center px-4 max-md:h-12 max-md:px-3.5')}>
        <span className="text-[17px] font-semibold tracking-[0.02em]" aria-label="Nicque">
          nicque
        </span>
      </div>
      <nav
        aria-label="Tools"
        className={cn(
          panelClass,
          'pointer-events-auto flex h-11 items-center gap-1 px-1.5 max-md:h-12 max-md:gap-0.5',
        )}
      >
        <IconButton onClick={resetCamera} aria-label="Reset camera">
          <Icon d="M8 2v2M8 12v2M2 8h2M12 8h2M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
          <span className="max-md:hidden">Reset view</span>
        </IconButton>
        <IconButton onClick={() => setSnap(!snap)} aria-pressed={snap} active={snap} aria-label="Grid snapping">
          <Icon d="M2 6h12M2 10h12M6 2v12M10 2v12" />
          <span className="max-md:hidden">Snap</span>
        </IconButton>
        {/* on phones the quality switch moves to its own row below (see the mobile panel) */}
        <div className="max-md:hidden">{qualityControl}</div>
        <AddMenu />
        <WorkspaceMenu />
      </nav>
      <div
        className={cn(panelClass, 'pointer-events-auto flex h-12 w-full items-center justify-between gap-3 px-3 md:hidden')}
      >
        <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-neutral-400">Quality</span>
        {qualityControl}
      </div>
    </header>
  );
}
