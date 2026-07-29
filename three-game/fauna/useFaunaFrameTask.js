'use client';

import { useEffect, useRef } from 'react';
import { faunaFrameScheduler } from './faunaFrameScheduler';

export function useFaunaFrameTask(id, task) {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => faunaFrameScheduler.register(id, {
    getPosition: () => taskRef.current.getPosition?.(),
    shouldRunEveryFrame: () => taskRef.current.shouldRunEveryFrame?.() === true,
    // Only forwarded when the task actually implements it, so tasks without a
    // gaze opinion stay out of look-at selection entirely.
    getGazeInterest: taskRef.current.getGazeInterest
      ? () => taskRef.current.getGazeInterest?.()
      : undefined,
    update: frame => taskRef.current.update(frame),
  }), [id]);
}
