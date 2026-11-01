import { EventEmitter } from 'node:events';

// Invalidation only. Subscribers always re-read through current membership and
// channel permissions. Periodic reads cover changes made by other Node workers.
const state = globalThis as typeof globalThis & { hymnChatEvents?: EventEmitter };
const events = state.hymnChatEvents ??= new EventEmitter();
events.setMaxListeners(0);
export function publishChatChange(workspaceId: string, channelId: string) { events.emit(workspaceId, channelId); }
export function onChatChange(workspaceId: string, listener: (channelId: string) => void) {
  events.on(workspaceId, listener);
  return () => { events.off(workspaceId, listener); };
}
