import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Shows every page of a PDF one below the other (scroll top to bottom), as it is in the file: nothing is
 * retyped or changed. Pages are drawn at the width of the page area (sharp on phones and high-DPI screens).
 */
export default function PdfPages({ data, onError }) {
  const box = useRef(null);
  const [pages, setPages] = useState(0);
  const [done, setDone] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let doc = null;
    const el = box.current;
    el.innerHTML = '';
    setDone(0);
    (async () => {
      try {
        doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
        if (cancelled) return;
        setPages(doc.numPages);
        const width = Math.max(320, el.clientWidth);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages && !cancelled; i += 1) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'block rounded-lg border border-ink-200 bg-white shadow-sm';
          canvas.setAttribute('aria-label', `Page ${i}`);
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          if (!cancelled) setDone(i);
        }
      } catch (e) {
        if (!cancelled) onError?.(e.message || 'Could not open the PDF');
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [data, onError]);

  return (
    <div>
      {pages > 0 && done < pages && <p className="mb-2 text-[13px] text-ink-500" role="status">Loading page {done + 1} of {pages}…</p>}
      <div ref={box} className="mx-auto flex max-w-5xl flex-col gap-4" />
    </div>
  );
}
