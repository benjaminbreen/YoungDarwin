// A private browser for appearance QA: does not claim or restart the shared
// npm play daemon while another agent is using it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { openSession, bootToGameplay } from './perf-lab/driver.mjs';

const out = path.resolve('test-results/darwin-look');
await fs.mkdir(out, { recursive: true });
const session = await openSession({ width: 1280, height: 900, deviceScaleFactor: 1 });
const { page } = session;
const verifyDefault = process.argv.includes('--default');
try {
  console.log('Opening independent appearance review.');
  await bootToGameplay(page, { zone: 'POST_OFFICE_BAY', params: { ...(verifyDefault ? {} : { darwinLook: 'codex' }), noCloudShade: '1', time: '10' } });
  console.log('Gameplay ready.');
  if (verifyDefault) {
    await page.waitForFunction(() => {
      let ready = false;
      window.__darwinScene?.scene.traverse(o => [].concat(o.material || []).forEach(m => {
        if (m.userData?.playerSkinShading && m.map?.image?.src?.includes('darwin5-albedo-codex')) ready = true;
      }));
      return ready;
    }, null, { timeout: 20000 });
    const result = await page.evaluate(() => {
      const uniforms = window.__darwinSkinHair().skin;
      let detailEnabled = false;
      window.__darwinScene.scene.traverse(o => [].concat(o.material || []).forEach(m => {
        if (m.name === 'Darwin5 skin') detailEnabled = m.userData.codexFaceDetail?.enabled.value === 1;
      }));
      return { noLookParameter: !new URL(location.href).searchParams.has('darwinLook'), panelHidden: !document.querySelector('[data-darwin-look-comparison]'), helperHidden: !window.__darwinLookComparison, codexWrap: uniforms.uSkinWrap.value.x === 0.12, detailEnabled, audit: window.__darwinE2E.renderAudit({ summaryOnly: true }) };
    });
    if (!result.noLookParameter || !result.panelHidden || !result.helperHidden || !result.codexWrap || !result.detailEnabled || !result.audit.ok || session.consoleErrors.length) throw new Error(`Default look failed: ${JSON.stringify(result)} ${session.consoleErrors.join('\n')}`);
    await fs.writeFile(path.join(out, 'default-review.json'), JSON.stringify(result, null, 2));
    console.log('Default B texture, uniforms, face detail, hidden comparison controls and render integrity passed.');
  } else {
  await page.waitForFunction(() => Boolean(window.__darwinLookComparison), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    // The shared sky debug handle can be removed by concurrent Fast Refresh.
    window.__darwinScene ||= window.__darwinLookComparison.runtime;
    const { THREE, camera } = window.__darwinScene;
    window.__darwinGaze?.(false);
    window.__darwinBlinkOverride = 0;
    THREE.AnimationMixer.prototype.update = function() { return this; };
    let faceMesh = null;
    window.__darwinScene.scene.traverse(o => {
      if (o.isSkinnedMesh && [].concat(o.material || []).some(m => m.name === 'Darwin5 skin') && o.geometry.attributes.position.count > 1000) faceMesh = o;
    });
    if (!faceMesh) throw new Error('Darwin face mesh not found');
    const position = faceMesh.geometry.attributes.position;
    const point = new THREE.Vector3();
    const landmark = (x, y, z) => {
      let closest = 0; let best = Infinity;
      const desired = new THREE.Vector3(x, y, z);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        const distance = point.distanceToSquared(desired);
        if (distance < best) { best = distance; closest = i; }
      }
      return faceMesh.localToWorld(faceMesh.getVertexPosition(closest, new THREE.Vector3()));
    };
    const up = landmark(0.0105, 1.84, 0.1).sub(landmark(0.0105, 1.69, 0.09)).normalize();
    const right = landmark(0.055, 1.79, 0.09).sub(landmark(-0.035, 1.79, 0.09)).normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();
    up.crossVectors(forward, right).normalize();
    const target = landmark(0.0105, 1.785, 0.115);
    const eye = target.clone().addScaledVector(forward, 0.85).addScaledVector(up, 0.025);
    const update = camera.updateMatrixWorld;
    camera.updateMatrixWorld = function(force) {
      this.position.copy(eye); this.up.copy(up); this.lookAt(target);
      this.fov = 34; this.updateProjectionMatrix(); return update.call(this, force);
    };
    // Remove the normal HUD only; retain the comparison panel and its buttons.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyH', key: 'h', bubbles: true }));
  });
  for (const [name, label] of [['opus', 'A · Opus'], ['codex', 'B · Codex']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(500);
    const audit = await page.evaluate(() => window.__darwinE2E.renderAudit({ summaryOnly: true }));
    if (!audit.ok) throw new Error(JSON.stringify(audit));
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log(`${name}: ${path.join(out, `${name}.png`)}`);
  }
  const roundTrip = await page.evaluate(() => {
    const materials = new Set();
    window.__darwinScene.scene.traverse(o => [].concat(o.material || []).forEach(m => { if (m.userData?.codexFaceDetail || m.userData?.playerSkinShading) materials.add(m); }));
    const snapshot = () => JSON.stringify([...materials].map(m => ({ name: m.name, map: m.map?.uuid, roughness: m.roughness, specular: m.specularIntensity, clearcoat: m.clearcoat, skin: m.userData.playerSkinShading, hair: m.userData.playerHairShading, detail: m.userData.codexFaceDetail?.enabled.value })));
    const control = window.__darwinLookComparison;
    control.set('opus'); const a = snapshot(); control.set('codex'); const b = snapshot(); control.set('opus');
    return { distinct: a !== b, restoredExactly: snapshot() === a };
  });
  if (!roundTrip.distinct || !roundTrip.restoredExactly) throw new Error(`A/B failed: ${JSON.stringify(roundTrip)}`);
  if (session.consoleErrors.length) throw new Error(session.consoleErrors.join('\n'));
  await fs.writeFile(path.join(out, 'review.json'), JSON.stringify({ renderer: session.rendererInfo, ...roundTrip, consoleErrors: session.consoleErrors }, null, 2));
  console.log('Appearance render audit and exact A/B restoration passed.');
  }
} catch (error) {
  console.error('Browser errors:', session.consoleErrors);
  await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  throw error;
} finally {
  await session.browser.close();
}
