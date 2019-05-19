// eslint-disable-next-line
export interface IMQEvent {
  record: string;
}

export interface Metadata extends IMQEvent { record: 'metadata'; key: string; value: string }

export interface StateProperty extends IMQEvent { record: 'state_property'; key: string; value: string }

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
  record: 'msg_c2g_unsubscribe';
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
      message: JSON.parse(Buffer.from(data.message, 'base64').toString()),
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

export const encodeIMQComponent = (value: any): string => {
  return Buffer.from(unescape(encodeURIComponent(value))).toString('base64');
};

const state_property = (a: any[]): any[] => {
  return a.reduce((a, c, b) => {
    a.push({
      record: "state_property",
      key: b,
      value: encodeIMQComponent(c)
    });
    return a;
  }, []);
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
      cookie: encodeIMQComponent(data.cookie),
      metadata: Object.entries(data.metadata).map(([key, value]: [any, any]): Metadata => {
        return {
          record: "metadata",
          key,
          value: encodeIMQComponent(value)
        };
      })
    };
  },
};

export function encode<T extends IMQEvent>(data: T): T {
  return messages[data.record](data) as T;
}
