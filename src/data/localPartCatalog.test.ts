import { describe, expect, it } from 'vitest';
import { localRobotArmPartCatalog, matchLocalPartCatalog } from './localPartCatalog';

describe('local robot-arm part catalog matching', () => {
  it('matches unknown joint motor language to the servo actuator deterministically', () => {
    const [match] = matchLocalPartCatalog('joint motor for the shoulder axis');

    expect(match?.item.id).toBe('catalog-shoulder-servo-actuator-80mm');
    expect(match?.confidence).toBe('high');
    expect(match?.score).toBeGreaterThanOrEqual(70);
    expect(match?.reasoning).toMatch(/joint|motor|servo|actuator/i);
    expect(match?.item.primitive).toBe('motor_block');
    expect(match?.item.manufacturing.process).toBe('off_the_shelf');
  });

  it('matches sleeve, arm link, gripper bracket, and base plate descriptions to editable typed parts', () => {
    const sleeve = matchLocalPartCatalog('lightweight sleeve with diagonal slots')[0];
    expect(sleeve?.item.id).toBe('catalog-lightened-joint-sleeve-coupler');
    expect(sleeve?.item.featureRecipe?.history.map((step) => step.kind)).toEqual(['sketch', 'extrude', 'cut', 'finish', 'placement']);
    expect(matchLocalPartCatalog('round arm connector')[0]?.item.id).toBe('catalog-lightened-joint-sleeve-coupler');
    expect(matchLocalPartCatalog('arm link segment')[0]?.item.id).toBe('catalog-pocketed-aluminum-arm-link-285mm');
    expect(matchLocalPartCatalog('gripper bracket')[0]?.item.id).toBe('catalog-sheet-metal-gripper-bracket');
    expect(matchLocalPartCatalog('base plate')[0]?.item.id).toBe('catalog-cnc-base-pedestal-plate');
  });

  it('keeps uncertain labels explainable instead of pretending the catalog knows', () => {
    const matches = matchLocalPartCatalog('mystery thing');

    expect(matches).toHaveLength(3);
    expect(matches.every((match) => match.confidence === 'low')).toBe(true);
    expect(matches[0]?.reasoning).toMatch(/No strong local catalog term matched/i);
  });

  it('keeps catalog records small, local, and unit-explicit', () => {
    expect(localRobotArmPartCatalog.every((item) => item.source.license.includes('MIT'))).toBe(true);
    expect(localRobotArmPartCatalog.every((item) => item.defaultDimensionsMm.lengthMm != null || item.defaultDimensionsMm.diameterMm != null)).toBe(true);
    expect(localRobotArmPartCatalog.map((item) => item.id)).toEqual([...new Set(localRobotArmPartCatalog.map((item) => item.id))]);
  });
});
