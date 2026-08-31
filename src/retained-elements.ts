import type { EffectDefinition, RemovalId, SoundSelection } from './types';

export interface ElementPresentation {
  readonly effect: EffectDefinition;
  readonly sound: false | SoundSelection | undefined;
}

interface RetainedElement {
  readonly element: HTMLElement;
  readonly presentation: ElementPresentation;
}

export class RetainedElements {
  private readonly entries = new Map<RemovalId, RetainedElement>();
  private readonly pending = new Map<RemovalId, boolean>();
  private readonly presentations = new WeakMap<HTMLElement, ElementPresentation>();
  private nextId = 0;

  createId(): RemovalId {
    this.nextId += 1;
    const id = `vd-${this.nextId.toString(36)}` as RemovalId;
    this.pending.set(id, true);
    return id;
  }

  associate(element: HTMLElement, presentation: ElementPresentation) {
    this.presentations.set(element, presentation);
  }

  presentationFor(element: HTMLElement) {
    return this.presentations.get(element);
  }

  retain(id: RemovalId, element: HTMLElement, presentation: ElementPresentation) {
    const shouldRetain = this.pending.get(id);
    this.pending.delete(id);
    if (shouldRetain !== true) {
      this.presentations.delete(element);
      return;
    }
    this.presentations.set(element, presentation);
    this.entries.set(id, { element, presentation });
  }

  take(id: RemovalId) {
    const retained = this.entries.get(id);
    if (retained === undefined) return null;
    this.entries.delete(id);
    return retained.element;
  }

  has(id: RemovalId, element: HTMLElement) {
    return this.entries.get(id)?.element === element;
  }

  elementFor(id: RemovalId) {
    return this.entries.get(id)?.element ?? null;
  }

  elements() {
    return [...this.entries.values()].map(({ element }) => element);
  }

  discard(id: RemovalId) {
    const retained = this.entries.get(id);
    if (retained !== undefined) {
      this.entries.delete(id);
      this.presentations.delete(retained.element);
      return true;
    }
    if (this.pending.get(id) !== true) return false;
    this.pending.set(id, false);
    return true;
  }

  discardAll() {
    let count = this.entries.size;
    for (const { element } of this.entries.values()) this.presentations.delete(element);
    this.entries.clear();
    for (const [id, retained] of this.pending) {
      if (retained) count += 1;
      this.pending.set(id, false);
    }
    return count;
  }
}
