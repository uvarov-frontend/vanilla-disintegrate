/**
 * Replaces every `table` in the tree with a `div.table-scroll` wrapping it.
 *
 * @param {import('hast').Node} node Node to walk; its children are replaced in place.
 */
function visit(node) {
  if (!Array.isArray(node.children)) return;

  for (const [index, child] of node.children.entries()) {
    if (child.type === 'element' && child.tagName === 'table') {
      node.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'] },
        children: [child],
      };
      continue;
    }
    visit(child);
  }
}

/**
 * Rehype plugin that puts each content table in its own horizontal scroll
 * container.
 *
 * A reference table has more columns than a phone is wide. Left to fit, the
 * columns are squeezed until identifiers such as `SnapshotCapture` break one
 * letter per line; left to overflow, the page itself scrolls sideways. Scrolling
 * inside the container avoids both, and matches how code blocks already behave.
 *
 * @returns {(tree: import('hast').Root) => void} Transformer for the MDX pipeline.
 */
export default function tableScroll() {
  return visit;
}
