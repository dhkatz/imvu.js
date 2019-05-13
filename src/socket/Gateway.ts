import { IMQEvent } from './Events';

export type GatewayMessage = 'msg_g2c_result' | 'msg_g2c_joined_queue' | 'msg_g2c_left_queue' | 'msg_g2c_create_mount' | 'msg_g2c_send_message' | 'msg_g2c_state_change' | 'msg_g2c_pong';

export type GatewayEvent = ResultEvent | JoinedQueueEvent | LeftQueueEvent | CreateMountEvent | SentMessageEvent | StateChangedEvent | PongEvent;

export interface ResultEvent extends IMQEvent {
  record: 'msg_g2c_result';
  op_id: number;
  status: number;
  error?: string;
}

export interface JoinedQueueEvent extends IMQEvent {
  record: 'msg_g2c_joined_queue';
  user_id: string;
  queue: string;
}

export interface LeftQueueEvent extends IMQEvent {
  record: 'msg_g2c_left_queue';
  user_id: string;
  queue: string;
}

export interface CreateMountEvent extends IMQEvent {
  record: 'msg_g2c_create_mount';
  queue: string;
  mount: string;
  type: number;
  sequence?: number;
}

export interface SentMessageEvent extends IMQEvent {
  record: 'msg_g2c_send_message';
  user_id: string;
  queue: string;
  mount: string;
  message: string;
}

export interface StateChangedEvent extends IMQEvent {
  record: 'msg_g2c_state_change';
  user_id: string;
  queue: string;
  mount: string;

  delta?: any;
  properties: any[];
}

export interface PongEvent extends IMQEvent {
  record: 'msg_g2c_pong';
}

const responses: Record<string, (data: IMQEvent) => IMQEvent> = {
  msg_g2c_result: (data: ResultEvent) => data,
  msg_g2c_joined_queue: (data: JoinedQueueEvent) => data,
  msg_g2c_left_queue: (data: LeftQueueEvent) => data,
  msg_g2c_create_mount: (data: CreateMountEvent) => {
    // var b = { 1: "message", 2: "state" }[a.type],
    //   d = {};
    // if ("undefined" === typeof b)
    //   throw new c("Mount created of unknown type: " + a.type);
    // d.type = b;
    // d.queueName = a.queue;
    // d.mountName = a.mount;
    // "state" === b && (d.state = k._property_list(a.properties));
    // return d;

    return data;
  },
  msg_g2c_send_message: (data: SentMessageEvent) => {
    return {
      ...data,
      user_id: Buffer.from(data.user_id, 'base64').toString(),
      message: Buffer.from(data.message, 'base64').toString()
    };
  },
  msg_g2c_state_change: (data: StateChangedEvent): StateChangedEvent => {
    return data;
  },
  msg_g2c_pong: (data: PongEvent) => data,
};

export function decode<T extends IMQEvent>(data: T): T {
  return responses[data.record](data) as T;
}
