import {useLayoutEffect, useRef, type ReactNode} from 'react';

export function FittedLine({text, children, minimumFontSize = 10}: {text: string; children?: ReactNode; minimumFontSize?: number}) {
  const line = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const frame = line.current!, content = label.current!;
    let active = true;
    let resizeFrame = 0;
    function fit() {
      if (!active) return;
      content.style.fontSize = '';
      content.style.whiteSpace = 'nowrap';
      const available = frame.getBoundingClientRect().width;
      const width = content.getBoundingClientRect().width;
      if (available > 0 && width > available) {
        const fontSize = Number.parseFloat(getComputedStyle(frame).fontSize);
        const fitted = Math.floor(fontSize * available / width * 10) / 10;
        content.style.fontSize = `${Math.max(minimumFontSize, fitted)}px`;
        if (fitted < minimumFontSize) content.style.whiteSpace = '';
      }
    }
    fit();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(fit);
    });
    observer.observe(frame);
    void document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); cancelAnimationFrame(resizeFrame); };
  }, [text, minimumFontSize]);
  return <span className="invite-fitted-line" ref={line}><span ref={label}>{children??text}</span></span>;
}
