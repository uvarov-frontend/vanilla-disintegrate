function relTokens(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  return [];
}

function visit(node) {
  if (node.type === 'element' && node.tagName === 'a') {
    const href = node.properties?.href;

    if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
      const rel = new Set([...relTokens(node.properties.rel), 'noopener', 'noreferrer']);
      node.properties.target = '_blank';
      node.properties.rel = [...rel];
    }
  }

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) visit(child);
}

export default function externalLinks() {
  return visit;
}
