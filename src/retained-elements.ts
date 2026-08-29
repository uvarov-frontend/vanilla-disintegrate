import type { EffectDefinition, RemovalId } from './types';

interface RetainedElement {
  readonly element: HTMLElement;
  readonly effect: EffectDefinition;
}

export class RetainedElements {
  private readonly entries = new Map<RemovalId, RetainedElement>();
  private readonly pending = new Map<RemovalId, boolean>();
  private readonly effects = new WeakMap<HTMLElement, EffectDefinition>();
  private nextId = 0;

  createId(): RemovalId {
    this.nextId += 1;
    const id = `vd-${this.nextId.toString(36)}` as RemovalId;
    this.pending.set(id, true);
    return id;
  }

  associate(element: HTMLElement, effect: EffectDefinition) {
    this.effects.set(element, effect);
  }

  effectFor(element: HTMLElement) {
    return this.effects.get(element);
  }

  retain(id: RemovalId, element: HTMLElement, effect: EffectDefinition) {
    const shouldRetain = this.pending.get(id);
    this.pending.delete(id);
    if (shouldRetain !== true) {
      this.effects.delete(element);
      return;
    }
    this.effects.set(element, effect);
    this.entries.set(id, { element, effect });
  }

  take(id: RemovalId) {
    const retained = this.entries.get(id);
    if (retained === undefined) return null;
    this.entries.delete(id);
    return retained.element;
  }

  discard(id: RemovalId) {
    const retained = this.entries.get(id);
    if (retained !== undefined) {
      this.entries.delete(id);
      this.effects.delete(retained.element);
      return true;
    }
    if (this.pending.get(id) !== true) return false;
    this.pending.set(id, false);
    return true;
  }

  discardAll() {
    let count = this.entries.size;
    for (const { element } of this.entries.values()) this.effects.delete(element);
    this.entries.clear();
    for (const [id, retained] of this.pending) {
      if (retained) count += 1;
      this.pending.set(id, false);
    }
    return count;
  }
}
