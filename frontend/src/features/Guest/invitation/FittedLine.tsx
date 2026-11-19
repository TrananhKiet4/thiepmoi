import {useLayoutEffect, useRef, type ReactNode} from 'react';

export function FittedLine({text, children}: {text: string; children?: ReactNode}) {
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
        content.style.fontSize = `${Math.max(10, fitted)}px`;
        if (fitted < 10) content.style.whiteSpace = '';
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
  }, [text]);
  return <span className="invite-fitted-line" ref={line}><span ref={label}>{children??text}</span></span>;
}
