import { onMessage } from '@shared/extension/on-message';

const listeners: Partial<Record<keyof BroadcastEvents, EventFunctions<BroadcastEvents>[]>> = {};

onMessage<BroadcastEvents, keyof BroadcastEvents>(
  (event, _, ...args) => {
    if (!listeners[event]) {
      return;
    }

    listeners[event].forEach((listener) => void listener(...args));
  },
  ({ isBroadcast }) => isBroadcast,
);

export const onBroadcast = <TEvent extends keyof BroadcastEvents>(
  event: TEvent,
  listener: EventFunction<BroadcastEvents, TEvent>,
): void => {
  if (!listeners[event]) {
    listeners[event] = [];
  }

  listeners[event].push(listener);
};
