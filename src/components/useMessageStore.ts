import { useSyncExternalStore } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  metadata?: Record<string, any>;
  status?: 'streaming' | 'complete' | 'error';
}

class MessageStore {
  private messages: Record<string, Message> = {};
  private order: string[] = [];
  private listeners: Set<() => void> = new Set();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    this.listeners.forEach((l) => l());
  }

  getSnapshot = () => this.order;

  getMessage = (id: string) => this.messages[id];

  addMessage(msg: Message) {
    this.messages[msg.id] = msg;
    this.order = [...this.order, msg.id];
    this.notify();
  }

  appendContent(id: string, delta: string) {
    if (this.messages[id]) {
      this.messages[id] = {
        ...this.messages[id],
        content: this.messages[id].content + delta,
      };
      this.notify();
    }
  }

  updateMessage(id: string, updates: Partial<Message>) {
    if (this.messages[id]) {
      this.messages[id] = { ...this.messages[id], ...updates };
      this.notify();
    }
  }
}

export const messageStore = new MessageStore();

export function useMessageOrder() {
  return useSyncExternalStore(messageStore.subscribe, messageStore.getSnapshot);
}

export function useMessage(id: string) {
  return useSyncExternalStore(messageStore.subscribe, () => messageStore.getMessage(id));
}