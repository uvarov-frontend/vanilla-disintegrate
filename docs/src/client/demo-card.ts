// Keep artwork colors and alpha in SVG only, so loading CSS cannot change them.
export const demoCardContent = `
  <div class="demo-card-frame">
    <div class="demo-card-cover" aria-hidden="true">
      <svg class="demo-card-art" width="100%" height="100%" fill="none" stroke="white" stroke-opacity="0.35" stroke-width="1" focusable="false">
        <circle class="demo-card-ring" cx="65" cy="62" r="37.5" />
        <circle class="demo-card-ring" cx="63.5" cy="59.5" r="15" fill="white" fill-opacity="0.08" />
        <circle class="demo-card-ring" cx="100%" cy="100%" r="56.5" transform="translate(-33 -23)" />
        <circle class="demo-card-dot" cx="100%" cy="28" r="2" transform="translate(-33 0)" fill="white" stroke="none" />
        <circle class="demo-card-dot" cx="100%" cy="86" r="1" transform="translate(-58 0)" fill="white" stroke="none" opacity="0.58" />
        <circle class="demo-card-dot" cx="100%" cy="109" r="1" transform="translate(-18 0)" fill="white" stroke="none" opacity="0.45" />
      </svg>
    </div>
    <div class="demo-card-copy">
      <div class="demo-card-heading">
        <span class="demo-card-kicker">Particle laboratory</span>
        <h3>Shape the motion</h3>
      </div>
      <div class="demo-card-meta"><small>DOM element</small><small>WebGL2</small></div>
    </div>
  </div>
`;

export function createDemoCard(className: 'example-card' | 'playground-card') {
  const card = document.createElement('article');
  card.className = `demo-card ${className}`;
  card.innerHTML = demoCardContent;
  return card;
}
