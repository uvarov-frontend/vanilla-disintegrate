export const demoCardContent = `
  <div class="demo-card-frame">
    <div class="demo-card-cover" aria-hidden="true"><span></span><span></span><span></span></div>
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
