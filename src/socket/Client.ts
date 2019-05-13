import { IMQEvent, Metadata, StateProperty } from './Events';

export type ClientMessage = 'msg_c2g_send_message' | 'msg_c2g_state_change' | 'msg_c2g_unsubscribe' | 'msg_c2g_subscribe' | 'msg_c2g_connect' | 'msg_c2g_open_floodgates' | 'msg_c2g_ping';

export type ClientEvent = ConnectEvent | OpenFloodgatesEvent | PingEvent | SubscribeEvent | UnsubscribeEvent | StateChangeEvent | SendMessageEvent;

export interface ConnectEvent extends IMQEvent {
  record: 'msg_c2g_connect';
  user_id: string;
  cookie: string;
  metadata: Metadata[] | Record<string, any>;
}

export interface OpenFloodgatesEvent extends IMQEvent {
  record: 'msg_c2g_open_floodgates';
}

export interface PingEvent extends IMQEvent {
  record: 'msg_c2g_ping';
}

export interface SubscribeEvent extends IMQEvent {
  record: 'msg_c2g_subscribe';
  queues: string[];
}

export interface UnsubscribeEvent extends IMQEvent {
  record: 'msg_c2g_unsubscribe',
  queues: string[];
}

export interface StateChangeEvent extends IMQEvent {
  record: 'msg_c2g_state_change';
  queue: string;
  mount: string;
  properties: StateProperty[];
  delta?: any[];
}

export interface SendMessageEvent extends IMQEvent {
  record: 'msg_c2g_send_message';
  queue: string;
  mount: string;
  message: string;
}

const escape = (value: any) => {
  return Buffer.from(unescape(encodeURIComponent(value))).toString('base64');
};

const state_property = (a: any[]) => {
  return a.reduce((a, c, b) => {
    a.push({
      record: "state_property",
      key: b,
      value: escape(c)
    });
    return a
  }, [])
};

const messages: Record<string, (data: IMQEvent) => IMQEvent> = {
  msg_c2g_send_message: (data: SendMessageEvent): SendMessageEvent => ({ ...data, message: escape(data.message) }),
  msg_c2g_state_change: (data: StateChangeEvent): StateChangeEvent => ({ ...data, properties: state_property(data.delta) }),
  msg_c2g_unsubscribe: (data: UnsubscribeEvent) => data,
  msg_c2g_subscribe: (data: SubscribeEvent) => data,
  msg_c2g_open_floodgates: (data: OpenFloodgatesEvent) => data,
  msg_c2g_ping: (data: PingEvent) => data,
  msg_c2g_connect: (data: ConnectEvent) => {
    return {
      ...data,
      cookie: escape(data.cookie),
      metadata: Object.entries(data.metadata).map(([key, value]: [any, any]): Metadata => {
        return {
          record: "metadata",
          key,
          value: escape(value)
        }
      })
    }
  },
};

export function encode<T extends IMQEvent>(data: T): T {
  return messages[data.record](data) as T;
}
