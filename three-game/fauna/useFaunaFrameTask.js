'use client';

import { useEffect, useRef } from 'react';
import { faunaFrameScheduler } from './faunaFrameScheduler';

export function useFaunaFrameTask(id, task) {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => faunaFrameScheduler.register(id, {
    getPosition: () => taskRef.current.getPosition?.(),
    shouldRunEveryFrame: () => taskRef.current.shouldRunEveryFrame?.() === true,
    update: frame => taskRef.current.update(frame),
  }), [id]);
}
