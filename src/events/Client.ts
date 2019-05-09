import { IMQEvent, Metadata, StateProperty } from './Events';

export type ClientMessage = 'msg_c2g_send_message' | 'msg_c2g_state_change' | 'msg_c2g_unsubscribe' | 'msg_c2g_subscribe' | 'msg_c2g_connect' | 'msg_c2g_open_floodgates' | 'msg_c2g_ping';

export interface ClientEvent extends IMQEvent {
  record: ClientMessage;
}

export interface ConnectEvent extends ClientEvent {
  record: 'msg_c2g_connect';
  user_id: string;
  cookie: string;
  metadata: Metadata[];
}

export interface OpenFloodgatesEvent extends ClientEvent {
  record: 'msg_c2g_open_floodgates';
}

export interface PingEvent extends ClientEvent {
  record: 'msg_c2g_ping';
}

export interface SubscribeEvent extends ClientEvent {
  record: 'msg_c2g_subscribe';
  queues: string[];
}

export interface UnsubscribeEvent extends ClientEvent {
  record: 'msg_c2g_unsubscribe',
  queues: string[];
}

export interface StateChangeEvent extends ClientEvent {
  record: 'msg_c2g_state_change';
  queue: string;
  mount: string;
  properties: StateProperty[];
}

export interface SendMessageEvent extends ClientEvent {

}
