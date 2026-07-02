/**
 * 边缘系统层模块入口
 */
export { HeartStateStore } from './HeartStateStore.js';
export { applyEmotionStimulus, transitionRelation, updateDesires, computeAtmosphere } from './bionic-hooks.js';
export { getStimulusDelta, getBaseStimulus, DECAY_HALFLIFE } from './stimulus-table.js';
export { applyDecay, applyDecayOnly } from './emotion-decay.js';
export { classifyEmotion } from './emotion-label.js';
export { updateSynapse, computeSynapseStrength, strengthToStage, defaultSynapseState } from './relation-synapse.js';
export { updateDesireStack, defaultDesireStack } from './desire-stack.js';
export { checkEmergence, emergenceToHint } from './emotional-emergence.js';
export { applyReconsolidation, evaluateLibraryPromotion } from './reconsolidation.js';
export * from './types.js';
