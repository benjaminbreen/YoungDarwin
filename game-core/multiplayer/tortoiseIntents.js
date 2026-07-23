export const TORTOISE_COMMUNICATION_INTENTS = Object.freeze({
  curious_look: Object.freeze({
    id: 'curious_look',
    label: 'Look curiously',
    text: 'The tortoise looks at you curiously.',
    actionId: 'signalCurious',
    animationAction: 'animalSignalCurious',
    duration: 2.4,
  }),
  withdraw_cautiously: Object.freeze({
    id: 'withdraw_cautiously',
    label: 'Withdraw cautiously',
    text: 'The tortoise withdraws cautiously into its shell.',
    actionId: 'signalWithdraw',
    animationAction: 'animalSignalWithdraw',
    duration: 2.8,
  }),
  continue_grazing: Object.freeze({
    id: 'continue_grazing',
    label: 'Continue grazing',
    text: 'The tortoise lowers its head and continues grazing.',
    actionId: 'signalGraze',
    animationAction: 'animalEat',
    duration: 3.2,
  }),
  settle_to_rest: Object.freeze({
    id: 'settle_to_rest',
    label: 'Settle to rest',
    text: 'The tortoise settles into a patient rest.',
    actionId: 'signalRest',
    animationAction: 'animalSleep',
    duration: 3.6,
  }),
});

export const TORTOISE_COMMUNICATION_INTENT_LIST = Object.freeze(
  Object.values(TORTOISE_COMMUNICATION_INTENTS),
);

export function getTortoiseCommunicationIntent(intentId) {
  return TORTOISE_COMMUNICATION_INTENTS[intentId] || null;
}
