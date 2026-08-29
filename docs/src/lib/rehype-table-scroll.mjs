/*
 * Wraps every content table in a scroll container. A reference table has more
 * columns than a phone is wide; squeezing it there shreds identifiers like
 * `SnapshotCapture` into one letter per line. Scrolling the table inside its own
 * box keeps the columns readable and still leaves the page itself unscrollable
 * sideways — the same thing code blocks already do.
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

export default function tableScroll() {
  return visit;
}
