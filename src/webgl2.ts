/** Checks whether this document can create a WebGL2 context without retaining it. */
export function supportsWebGL2(ownerDocument: Document) {
  const canvas = ownerDocument.createElement('canvas');
  let context: WebGL2RenderingContext | null = null;
  try {
    context = canvas.getContext('webgl2');
    return context !== null;
  } catch {
    return false;
  } finally {
    try {
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // The probe must not affect the operation when the context cannot be explicitly released.
    }
  }
}
