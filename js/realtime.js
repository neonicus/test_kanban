import { refreshBoardState } from "./boardStore.js";

let pollHandle = null;

export function subscribeToRoomUpdates(intervalMs = 4000) {
  if (pollHandle) {
    clearInterval(pollHandle);
  }

  pollHandle = setInterval(() => {
    refreshBoardState().catch(() => {});
  }, intervalMs);

  return () => {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  };
}
