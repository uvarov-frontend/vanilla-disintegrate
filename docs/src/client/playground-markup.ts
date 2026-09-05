import type { Locale } from '../i18n';
import {
  copies,
  helps,
  createRanges,
  presetNames,
  presetDescriptions,
  curveOptionLabels,
  releaseOptionLabels,
  soundOptionLabels,
} from './playground-copy';
import {
  stateFromBuiltInPreset,
  configurationFromPreset,
  presetKeys,
  formatEditableRangeValue,
  builtInSoundKeys,
  soundNumericKeys,
  curves,
  releases,
  type PlaygroundCustomSounds,
  type NumericKey,
} from './playground-state';
import type { ParticleCurve, ParticleRelease } from '../../../src/snapdom';
import { formatNumber, highlightedEffectSource } from './playground-code';
import { demoCardContent } from './demo-card';

/** Renders the complete playground markup into the initial HTML response. */
export function renderParticlePlayground(locale: Locale) {
  const copy = copies[locale];
  const help = helps[locale];
  const ranges = createRanges(copy, help);
  const initialState = stateFromBuiltInPreset('dust', 'remove');
  const initialConfiguration = configurationFromPreset('dust');
  const initialCustomSounds: PlaygroundCustomSounds = [];
  const presetMarkup = presetKeys
    .map((key) => {
      return `<button type="button" data-preset="${key}" data-preset-effect="${key}" aria-pressed="${String(key === 'dust')}"><i aria-hidden="true"></i><span><b>${presetNames[key]}</b><small>${presetDescriptions[locale][key]}</small></span></button>`;
    })
    .join('');
  const selectOptions = (key: 'curve' | 'release', values: readonly string[]) =>
    values
      .map((value) => {
        const label =
          key === 'curve'
            ? curveOptionLabels[locale][value as ParticleCurve]
            : releaseOptionLabels[locale][value as ParticleRelease];
        return `<option value="${value}">${label}</option>`;
      })
      .join('');
  const selectMarkup = (key: 'curve' | 'release', label: string, description: string, values: readonly string[]) =>
    `<div class="playground-select-field"><span class="playground-field-heading"><label for="playground-${key}">${label}</label><small>${description}</small></span><select id="playground-${key}" data-${key}>${selectOptions(key, values)}</select></div>`;
  const rangeMarkup = (keys: readonly NumericKey[]) =>
    keys
      .map((key) => {
        const range = ranges.find((definition) => definition.key === key);
        if (!range) throw new Error(`Missing particle playground range: ${key}`);
        const value = initialState[range.key];
        const progress = ((value - range.min) / (range.max - range.min)) * 100;
        const scale = range.key === 'soundVolume' ? 100 : 1;
        const unit = range.unit === '' ? '' : `<span aria-hidden="true">${range.unit}</span>`;
        return `<div class="playground-range"><div class="playground-range-heading"><span><label for="playground-${range.key}">${range.label}</label><small>${range.description}</small></span><span class="playground-range-value"><input id="playground-${range.key}-value" type="number" min="${formatNumber(range.min * scale)}" max="${formatNumber(range.max * scale)}" step="any" value="${formatEditableRangeValue(range, value)}" data-value="${range.key}" aria-label="${range.label}">${unit}</span></div><input id="playground-${range.key}" type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" data-option="${range.key}" style="--range-progress: ${progress}%"></div>`;
      })
      .join('');
  const groupPanel = (
    id: 'timing' | 'horizontal' | 'vertical' | 'particles',
    keys: readonly NumericKey[],
    hidden = false,
  ) =>
    `<section id="playground-group-panel-${id}" class="playground-settings-panel" role="tabpanel" data-group-panel="${id}" aria-labelledby="playground-group-tab-${id}"${hidden ? ' hidden' : ''}><div class="playground-control-list">${rangeMarkup(keys)}</div></section>`;
  const soundOptions = builtInSoundKeys
    .map((key) => `<option value="${key}">${soundOptionLabels[locale][key]}</option>`)
    .join('');
  const fileIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 10.75V3.5m0 0L5.25 6.25M8 3.5l2.75 2.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M3 10.5v1.25A1.25 1.25 0 0 0 4.25 13h7.5A1.25 1.25 0 0 0 13 11.75V10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>`;
  const previewIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.75 8s2.25-4 6.25-4 6.25 4 6.25 4-2.25 4-6.25 4-6.25-4-6.25-4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path><circle cx="8" cy="8" r="1.75" fill="none" stroke="currentColor" stroke-width="1.5"></circle></svg>`;
  const codeIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m5.75 5.5-3 2.5 3 2.5m4.5-5 3 2.5-3 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  const resetIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M12.5 8a4.5 4.5 0 1 1-1.32-3.18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path><path d="M12.5 3v2.5H10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  const undoIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 7.5h6.25a2.75 2.75 0 0 1 0 5.5H7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M6 4.5 3 7.5l3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  const clearIcon = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m5 5 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>`;
  const soundMarkup = `<section id="playground-group-panel-sound" class="playground-settings-panel playground-sound-panel" role="tabpanel" data-group-panel="sound" aria-labelledby="playground-group-tab-sound" hidden>
    <div class="playground-sound-toggles">
      <div class="playground-sound-enabled"><span>${copy.soundEnabled}</span><label class="playground-switch"><input type="checkbox" data-sound-enabled checked><span aria-hidden="true"></span><output data-sound-state>${copy.on}</output></label></div>
      <div class="playground-sound-reverse"><b>${copy.soundReverse}</b><label class="playground-switch playground-switch-compact"><input type="checkbox" data-sound-reverse><span aria-hidden="true"></span></label></div>
    </div>
    <div class="playground-sound-source playground-select-field">
      <div class="playground-sound-heading">
        <span class="playground-field-heading"><label for="playground-sound-source">${copy.soundSource}</label><small>${help.soundSource}</small></span>
        <button type="button" class="playground-sound-remove" data-local-audio-remove hidden>${clearIcon}<span>${copy.removeSound}</span></button>
      </div>
      <div class="playground-sound-picker">
        <div class="playground-sound-select"><select id="playground-sound-source" data-sound-source>${soundOptions}</select></div>
        <input id="playground-local-audio-file" type="file" accept="audio/*" data-local-audio-input hidden>
        <label class="playground-sound-file" for="playground-local-audio-file" data-local-audio-choose title="${copy.chooseSound}">${fileIcon}<span>${copy.customSound}</span></label>
      </div>
      <small class="playground-local-audio-note" data-local-audio-meta>${copy.bundledSoundNote}</small>
    </div>
    <div class="playground-control-list playground-sound-ranges">${rangeMarkup(soundNumericKeys)}</div>
  </section>`;
  const copyIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.5"></rect><path d="M10.75 5.25V4.5A1.5 1.5 0 0 0 9.25 3h-4.5A1.75 1.75 0 0 0 3 4.75v4.5a1.5 1.5 0 0 0 1.5 1.5h.75"></path></svg>`;
  const linkIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 9.75 9.75 6.25"></path><path d="M5.25 11.75H4.5a3 3 0 0 1 0-6h2"></path><path d="M10.75 4.25h.75a3 3 0 0 1 0 6h-2"></path></svg>`;
  const copiedIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.25 2.75 2.75 6.25-6.25"></path></svg>`;

  return `
    <div class="particle-playground">
      <section class="playground-preset-bar">
        <div class="playground-preset-heading">
          <strong>${copy.readyEffects}</strong>
          <div class="playground-phase"><span>${copy.operation}</span><div class="playground-operation-tabs" role="tablist" aria-label="${copy.operation}"><button id="playground-operation-tab-remove" type="button" role="tab" data-operation="remove" aria-controls="playground-operation-panel" aria-selected="true">${copy.removeMode}</button><button id="playground-operation-tab-restore" type="button" role="tab" data-operation="restore" aria-controls="playground-operation-panel" aria-selected="false" tabindex="-1">${copy.restoreMode}</button></div></div>
        </div>
        <div class="playground-presets" role="group" aria-label="${copy.presetTitle}">${presetMarkup}</div>
      </section>
      <div class="playground-workspace">
        <section class="playground-preview">
          <div class="playground-stage-header">
            <div class="playground-window-controls" aria-hidden="true"><i></i><i></i><i></i></div>
            <div class="playground-stage-tools"><button class="playground-icon-button" type="button" data-action="undo" title="${copy.undo}" aria-label="${copy.undo}" disabled>${undoIcon}</button><button class="playground-icon-button" type="button" data-action="reset" title="${copy.reset}" aria-label="${copy.reset}">${resetIcon}</button></div>
            <div class="playground-view-tabs" role="tablist" aria-label="${copy.preview}">
              <button id="playground-view-tab-preview" type="button" role="tab" data-view-tab="preview" aria-controls="playground-view-panel-preview" aria-selected="true" title="${copy.preview}" aria-label="${copy.preview}">${previewIcon}<span>${copy.preview}</span></button>
              <button id="playground-view-tab-code" type="button" role="tab" data-view-tab="code" aria-controls="playground-view-panel-code" aria-selected="false" tabindex="-1" title="${copy.codeTab}" aria-label="${copy.codeTab}">${codeIcon}<span>${copy.codeTab}</span></button>
            </div>
          </div>
          <div id="playground-view-panel-preview" class="playground-view-panel playground-preview-panel" role="tabpanel" data-view-panel="preview" aria-labelledby="playground-view-tab-preview">
            <div class="playground-width-tabs" role="group" aria-label="${copy.cardShape}">
              <button type="button" data-width-option="narrow" aria-pressed="true" aria-label="${copy.cardShapeUpright}" title="${copy.cardShapeUpright}"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="4" y="3.25" width="8" height="9.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.5"></rect><path d="M4 8.25h8" stroke="currentColor" stroke-width="1.5"></path></svg></button>
              <button type="button" data-width-option="wide" aria-pressed="false" aria-label="${copy.cardShapeWide}" title="${copy.cardShapeWide}"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="1.75" y="4.75" width="12.5" height="6.5" rx="1.75" fill="none" stroke="currentColor" stroke-width="1.5"></rect><path d="M6.25 4.75v6.5" stroke="currentColor" stroke-width="1.5"></path></svg></button>
            </div>
            <div class="playground-stage" data-slot><article class="demo-card playground-card" data-card-width="narrow">${demoCardContent}</article></div>
          </div>
          <section id="playground-view-panel-code" class="playground-view-panel playground-code code-block" role="tabpanel" data-view-panel="code" aria-labelledby="playground-view-tab-code" hidden>
            <div class="code-toolbar playground-code-heading">
              <span>TypeScript</span>
              <div><button type="button" data-copy="effect" aria-label="${copy.copyEffect}" title="${copy.copyEffect}"><span class="playground-copy-icon playground-copy-icon-default">${copyIcon}</span><span class="playground-copy-icon playground-copy-icon-success">${copiedIcon}</span><span>${copy.copyEffectShort}</span></button><button type="button" data-copy="link" aria-label="${copy.copyLink}" title="${copy.copyLink}"><span class="playground-copy-icon playground-copy-icon-default">${linkIcon}</span><span class="playground-copy-icon playground-copy-icon-success">${copiedIcon}</span><span>${copy.copyLinkShort}</span></button></div>
            </div>
            <pre class="language-typescript"><code data-code>${highlightedEffectSource(initialConfiguration, initialCustomSounds)}</code></pre>
          </section>
          <div class="playground-commandbar">
            <output data-status aria-live="polite">${copy.preparing}</output>
            <div class="playground-actions">
              <button class="button-primary" type="button" data-action="remove">${copy.remove}</button>
              <button class="button-secondary" type="button" data-action="restore">${copy.restore}</button>
            </div>
          </div>
        </section>
        <form id="playground-operation-panel" class="playground-controls" role="tabpanel" aria-labelledby="playground-operation-tab-remove">
          <div class="playground-selectors">
            ${selectMarkup('curve', copy.curve, help.curve, curves)}
            ${selectMarkup('release', copy.release, help.release, releases)}
          </div>
          <div class="playground-settings-tabs" role="tablist" aria-label="${copy.settingsLabel}">
            <button id="playground-group-tab-timing" type="button" role="tab" data-group-tab="timing" aria-controls="playground-group-panel-timing" aria-selected="true">${copy.timing}</button>
            <button id="playground-group-tab-horizontal" type="button" role="tab" data-group-tab="horizontal" aria-controls="playground-group-panel-horizontal" aria-selected="false" tabindex="-1">${copy.horizontal}</button>
            <button id="playground-group-tab-vertical" type="button" role="tab" data-group-tab="vertical" aria-controls="playground-group-panel-vertical" aria-selected="false" tabindex="-1">${copy.vertical}</button>
            <button id="playground-group-tab-particles" type="button" role="tab" data-group-tab="particles" aria-controls="playground-group-panel-particles" aria-selected="false" tabindex="-1">${copy.particles}</button>
            <button id="playground-group-tab-sound" type="button" role="tab" data-group-tab="sound" aria-controls="playground-group-panel-sound" aria-selected="false" tabindex="-1">${copy.sound}</button>
          </div>
          <div class="playground-settings-panels">
            ${groupPanel('timing', ['duration', 'stagger', 'releaseRandomness', 'fadeStart', 'layoutRelease'])}
            ${groupPanel('horizontal', ['horizontalDrift', 'horizontalMin', 'horizontalMax', 'convergence'], true)}
            ${groupPanel('vertical', ['verticalMin', 'verticalMax', 'swirl', 'waveTurns'], true)}
            ${groupPanel('particles', ['particleSize', 'alphaThreshold', 'endScale', 'rotationMin', 'rotationMax'], true)}
            ${soundMarkup}
          </div>
        </form>
      </div>
    </div>`;
}
