// @polsia:user-owned
'use client';

// WordRotate — one headline keyword that cycles through a few words, each rising out of
// a mask, letter by letter (translate only: never faded or blurred).
// When to use: the ONE variable word of a hero headline ("Clôturez en [3 heures |
// un clic | toute sérénité]"). 2–5 short words, ideally at the end of the line.
// When not to: body copy, long phrases, or more than one rotating word per screen.
// Width is reserved for the longest word (no layout shift), so a very short word next
// to a very long one leaves a gap; keep the words of similar length.
// SSR/no-JS/reduced motion: the first word, static. Screen readers read `srText`
// (default: the first word) once; the animated layer is aria-hidden and not live.

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { readableText } from './contrast';
import { clamp, cssEase, EASE_OUT_EXPO } from './easing';
import { type StyleWithVars, useShouldReduceMotion } from './hooks';
import { useSurface } from './surface';

export type WordRotateProps = {
  /** Words to cycle through, in order. The first one is the SSR/reduced-motion word. */
  words: readonly string[];
  /** Seconds each word stays on screen. Default 2.6 (min 1.2). */
  interval?: number;
  /** Seconds of one transition. Default 0.7. */
  duration?: number;
  /** Animate letter by letter (default) or the whole word at once. */
  by?: 'char' | 'word';
  /** Seconds between letters in `char` mode. Default 0.028, capped at 0.05. */
  stagger?: number;
  /** Horizontal alignment of shorter words inside the reserved width. Default `start`. */
  align?: 'start' | 'center' | 'end';
  /** What screen readers read. Default: the first word. */
  srText?: string;
  /**
   * Accent color of the words (e.g. `var(--primary)`). Rendered as a readable
   * large-text derivative (≥ 3:1, for headline sizes ≥ 24px), so a pastel or dark brand
   * color still reads. Prefer it to a `text-primary` class in `wordClassName`, which is
   * used as is. Default: inherits the headline color.
   */
  color?: string;
  className?: string;
  /** Classes for each visible word (gradient text…). */
  wordClassName?: string;
};

type WordPhase = 'in' | 'out' | 'wait';

const alignClass = {
  start: 'justify-items-start',
  center: 'justify-items-center',
  end: 'justify-items-end',
};

export function WordRotate({
  words,
  interval = 2.6,
  duration = 0.7,
  by = 'char',
  stagger = 0.028,
  align = 'start',
  srText,
  color,
  className,
  wordClassName,
}: WordRotateProps) {
  const reduce = useShouldReduceMotion();
  const [element, setElement] = useState<HTMLSpanElement | null>(null);
  useSurface(element);
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const count = words.length;
  const period = Math.max(interval, 1.2) * 1000;

  useEffect(() => {
    if (!element || reduce || count < 2) {
      setIndex(0);
      setPrevious(null);
      return;
    }
    let inView = false;
    let timer = 0;
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const start = () => {
      if (timer || !inView || document.visibilityState !== 'visible') return;
      timer = window.setInterval(() => {
        setIndex((current) => {
          setPrevious(current);
          return (current + 1) % count;
        });
      }, period);
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = Boolean(entry?.isIntersecting);
      if (inView) start();
      else stop();
    });
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());
    observer.observe(element);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [element, reduce, count, period]);

  if (count === 0) return null;
  const gap = clamp(stagger, 0, 0.05);
  const rootStyle: StyleWithVars = {
    '--mk-wr-duration': `${duration}s`,
    '--mk-wr-ease': cssEase(EASE_OUT_EXPO),
  };
  if (color) rootStyle.color = readableText(color, 'large');

  return (
    <span
      ref={setElement}
      className={cn('relative inline-grid align-bottom', className)}
      style={rootStyle}
    >
      <span className="sr-only">{srText ?? words[0]}</span>
      <span
        aria-hidden="true"
        className={cn(
          'inline-grid [clip-path:inset(-0.2em_-0.12em_-0.28em_-0.12em)]',
          alignClass[align],
        )}
      >
        {words.map((word, i) => {
          const phase: WordPhase = i === index ? 'in' : i === previous ? 'out' : 'wait';
          const pieces = by === 'char' ? Array.from(word) : [word];
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: words may repeat; order is stable
              key={`${word}-${i}`}
              data-phase={phase}
              className={cn(
                'group/word whitespace-nowrap [grid-area:1/1]',
                // Reserve space for every word; only the active one is painted.
                i === index ? 'visible' : 'invisible data-[phase=out]:visible',
                wordClassName,
              )}
            >
              {pieces.map((piece, j) => {
                const pieceStyle: StyleWithVars = { '--mk-wr-delay': `${j * gap}s` };
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: letters of a fixed word
                    key={j}
                    style={pieceStyle}
                    className={cn(
                      // Not `inline-block`: the theme's --spacing-block turns it into an inline-size utility.
                      '[display:inline-block] whitespace-pre',
                      // Letters travel fully out of the clip mask instead of fading or
                      // blurring, so a word is never shown half-transparent.
                      'motion-safe:group-data-[phase=wait]/word:translate-y-[1.35em]',
                      'motion-safe:group-data-[phase=out]/word:-translate-y-[1.5em]',
                      'motion-safe:group-data-[phase=in]/word:transition-[translate] motion-safe:group-data-[phase=out]/word:transition-[translate]',
                      'motion-safe:group-data-[phase=in]/word:[transition-duration:var(--mk-wr-duration)] motion-safe:group-data-[phase=out]/word:[transition-duration:calc(var(--mk-wr-duration)*0.7)]',
                      'motion-safe:[transition-delay:var(--mk-wr-delay)] motion-safe:[transition-timing-function:var(--mk-wr-ease)]',
                    )}
                  >
                    {piece}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </span>
  );
}
