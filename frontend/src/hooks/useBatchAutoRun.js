import { useEffect, useState } from 'react';
import api from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';

const EMPTY = {
  enabled: false,
  running: false,
  phase: 'idle',
  step: -1,
  totalSteps: 3,
  stepLabel: null,
  cycleCount: 0,
  batchIndex: 0,
  totalBatches: 0,
  totalContacts: 0,
  batchOffset: 0,
  lastUpdatedAt: null,
  logs: [],
};

let currentState = { ...EMPTY };
const subs = new Set();
let socketBound = false;

function notify() {
  subs.forEach(fn => fn(currentState));
}

async function loadStatus() {
  try {
    const { data } = await api.get('/facebook/auto-pipeline/status');
    currentState = { ...EMPTY, ...data };
    notify();
  } catch {
    // keep last known state
  }
}

function ensureSocket() {
  connectSocket();
  const socket = getSocket();
  if (!socket || socketBound) return;
  socketBound = true;

  socket.on('auto_pipeline_state', (state) => {
    currentState = { ...EMPTY, ...state };
    notify();
  });

  socket.on('connect', () => {
    loadStatus();
  });
}

export async function triggerPipelineNow() {
  await api.post('/facebook/auto-pipeline/start');
  await loadStatus();
}

export async function toggleBatchAuto() {
  if (currentState.enabled || currentState.running) {
    await api.post('/facebook/auto-pipeline/stop');
  } else {
    await api.post('/facebook/auto-pipeline/start');
  }
  await loadStatus();
}

export function formatCountdown() {
  return '';
}

export function useBatchAuto() {
  const [state, setState] = useState(currentState);

  useEffect(() => {
    const handler = (next) => setState({ ...next });
    subs.add(handler);
    ensureSocket();
    loadStatus();
    return () => subs.delete(handler);
  }, []);

  return state;
}
