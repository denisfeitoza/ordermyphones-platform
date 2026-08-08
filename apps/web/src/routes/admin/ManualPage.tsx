import { useRef, useState } from 'react';
import doc from './manual.doc.html?raw';

/**
 * System manual — an admin-gated reference doc (option B). Rendered inside an
 * isolated <iframe srcDoc> so the manual's own CSS + bilingual-toggle script
 * can't leak into the console. The real test password is intentionally NOT
 * embedded — a client bundle ships to everyone, so it would leak regardless of
 * the route guard; the doc shows a "shared separately" placeholder instead.
 */
export default function ManualPage() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1400);

  function onLoad() {
    try {
      const d = ref.current?.contentDocument;
      if (d) setHeight(d.documentElement.scrollHeight + 24);
    } catch {
      /* srcDoc is same-origin; guard is defensive only */
    }
  }

  return (
    <iframe
      ref={ref}
      title="OrderMyPhones manual"
      srcDoc={doc}
      onLoad={onLoad}
      className="w-full rounded-2xl border border-border bg-transparent"
      style={{ height, border: 0 }}
    />
  );
}
