import { appendElement } from './append-element';
import { DOMElementOptions, DOMElementTagOptions } from './dom.types';

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: DOMElementOptions,
): HTMLElementTagNameMap[K];
export function createElement<K extends keyof HTMLElementTagNameMap>(
  options: DOMElementTagOptions<K>,
): HTMLElementTagNameMap[K];

export function createElement(
  p0: string | DOMElementTagOptions,
  p1?: DOMElementOptions,
): HTMLElement {
  if (!('ajb' in document)) {
    Object.assign(document, { ajb: { id: 0 } });
  }

  (document as any).ajb.id++;

  const tag = typeof p0 === 'string' ? p0 : p0.tag;
  const options = (p1 ?? p0 ?? {}) as DOMElementOptions;

  const e = document.createElement(tag);
  const id = options.id ?? `${tag}-${(document as any).ajb.id}`;

  if (options.id !== false) {
    e.setAttribute('id', id as string);
  }

  if (options.innerText !== undefined) {
    e.innerText = String(options.innerText);
  }

  if (options.innerHTML) {
    e.innerHTML = options.innerHTML;
  }

  if (options.handler) {
    e.onclick = options.handler;
  }

  if (options.events) {
    for (const key of Object.keys(options.events)) {
      (e as any)[key] = options.events[key];
    }
  }

  if (options.attributes) {
    for (const key of Object.keys(options.attributes)) {
      const value = options.attributes[key];

      if (value !== false) {
        e.setAttribute(key, value as string);
      }
    }
  }

  if (options.style) {
    for (const key of Object.keys(options.style)) {
      const style = options.style[key as keyof CSSStyleDeclaration];

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (e.style as any)[key] = style;
    }
  }

  if (options.class) {
    options.class = Array.isArray(options.class) ? options.class : [options.class];
    e.classList.add(...options.class.filter(Boolean));
  }

  (options.children ?? [])
    .filter((ch) => ch)
    .forEach((ch: HTMLElement | DOMElementTagOptions<keyof HTMLElementTagNameMap>) =>
      appendElement(e, ch instanceof HTMLElement ? ch : createElement(ch)),
    );

  return e;
}
