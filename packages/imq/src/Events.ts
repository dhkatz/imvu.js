export interface RecordEvent {
  record: string;
}

export type EventNameToType<
  Events_,
  EventKey_ extends keyof Events_,
  T extends Events_[EventKey_]
> = Extract<Events_, { [key in EventKey_]: T }>;

export type EventHandler<Events_, EventKey_ extends keyof Events_, T extends Events_[EventKey_]> = (
  event: EventNameToType<Events_, EventKey_, T>
) => EventNameToType<Events_, EventKey_, T>;

export type EventHandlers<
  Events_,
  EventKey_ extends keyof Events_
> = Events_[EventKey_] extends string
  ? {
      [EventName in Events_[EventKey_]]: EventHandler<Events_, EventKey_, EventName>;
    }
  : never;

export interface Metadata extends RecordEvent {
  record: 'metadata';
  key: string;
  value: string;
}

export interface StateProperty extends RecordEvent {
  record: 'state_property';
  key: string;
  value: string;
}

export type ClientEvent =
  | ConnectEvent
  | OpenFloodgatesEvent
  | PingEvent
  | SubscribeEvent
  | UnsubscribeEvent
  | StateChangeEvent
  | SendMessageEvent;

export type ClientMessage = ClientEvent['record'];

export interface ConnectEvent extends RecordEvent {
  record: 'msg_c2g_connect';
  user_id: string;
  cookie: string;
  metadata: Metadata[] | Record<string, any>;
}

export interface OpenFloodgatesEvent extends RecordEvent {
  record: 'msg_c2g_open_floodgates';
}

export interface PingEvent extends RecordEvent {
  record: 'msg_c2g_ping';
}

export interface SubscribeEvent extends RecordEvent {
  record: 'msg_c2g_subscribe';
  queues: string[];
}

export interface UnsubscribeEvent extends RecordEvent {
  record: 'msg_c2g_unsubscribe';
  queues: string[];
}

export interface StateChangeEvent extends RecordEvent {
  record: 'msg_c2g_state_change';
  queue: string;
  mount: string;
  properties: StateProperty[];
  delta?: any[];
}

export interface SendMessageEvent extends RecordEvent {
  record: 'msg_c2g_send_message';
  queue: string;
  mount: string;
  message: string;
}

export type GatewayEvent =
  | ResultEvent
  | JoinedQueueEvent
  | LeftQueueEvent
  | CreateMountEvent
  | SentMessageEvent
  | StateChangedEvent
  | PongEvent;

export type GatewayMessage = GatewayEvent['record'];

export interface ResultEvent extends RecordEvent {
  record: 'msg_g2c_result';
  op_id: number;
  status: number;
  error?: string;
}

export interface JoinedQueueEvent extends RecordEvent {
  record: 'msg_g2c_joined_queue';
  user_id: string;
  queue: string;
}

export interface LeftQueueEvent extends RecordEvent {
  record: 'msg_g2c_left_queue';
  user_id: string;
  queue: string;
}

export interface CreateMountEvent extends RecordEvent {
  record: 'msg_g2c_create_mount';
  queue: string;
  mount: string;
  type: 'message' | 'state';
  sequence?: number;
}

export interface SentMessageEvent extends RecordEvent {
  record: 'msg_g2c_send_message';
  user_id: string;
  queue: string;
  mount: string;
  message: string;
}

export interface StateChangedEvent extends RecordEvent {
  record: 'msg_g2c_state_change';
  user_id: string;
  queue: string;
  mount: string;

  delta?: any;
  properties: any[];
}

export interface PongEvent extends RecordEvent {
  record: 'msg_g2c_pong';
}

export type IMQEvent = ClientEvent | GatewayEvent;

const responses: EventHandlers<GatewayEvent, 'record'> = {
  msg_g2c_result: (data) => data,
  msg_g2c_joined_queue: (data) => data,
  msg_g2c_left_queue: (data) => data,
  msg_g2c_create_mount: (data) => {
    // var b = { 1: "message", 2: "state" }[a.type],
    //   d = {};
    // if ("undefined" === typeof b)
    //   throw new c("Mount created of unknown type: " + a.type);
    // d.type = b;
    // d.queueName = a.queue;
    // d.mountName = a.mount;
    // "state" === b && (d.state = k._property_list(a.properties));
    // return d;

    return {
      ...data,
    };
  },
  msg_g2c_send_message: (data) => {
    return {
      ...data,
      user_id: Buffer.from(data.user_id, 'base64').toString(),
      message: JSON.parse(Buffer.from(data.message, 'base64').toString()),
    };
  },
  msg_g2c_state_change: (data) => data,
  msg_g2c_pong: (data) => data,
};

export function decode<T extends GatewayEvent['record']>(
  event: T,
  data: EventNameToType<GatewayEvent, 'record', T>
): EventNameToType<GatewayEvent, 'record', T> {
  const handler = responses[event];

  return handler(data);
}

export const encodeIMQComponent = (value: string | number | boolean): string => {
  return Buffer.from(unescape(encodeURIComponent(value))).toString('base64');
};

const state_property = (a: any[]): any[] => {
  return a.reduce((a, c, b) => {
    a.push({
      record: 'state_property',
      key: b,
      value: encodeIMQComponent(c),
    });
    return a;
  }, []);
};

const messages: EventHandlers<ClientEvent, 'record'> = {
  msg_c2g_send_message: (data) => ({
    ...data,
    message: escape(data.message),
  }),
  msg_c2g_state_change: (data) => ({
    ...data,
    properties: data.delta ? state_property(data.delta) : [],
  }),
  msg_c2g_unsubscribe: (data) => data,
  msg_c2g_subscribe: (data) => data,
  msg_c2g_open_floodgates: (data) => data,
  msg_c2g_ping: (data) => data,
  msg_c2g_connect: (data) => {
    return {
      ...data,
      cookie: encodeIMQComponent(data.cookie),
      metadata: Object.entries(data.metadata).map(([key, value]: [any, any]): Metadata => {
        return {
          record: 'metadata',
          key,
          value: encodeIMQComponent(value),
        };
      }),
    };
  },
};

export function encode<T extends ClientEvent['record']>(
  event: T,
  data: EventNameToType<ClientEvent, 'record', T>
): EventNameToType<ClientEvent, 'record', T> {
  return messages[event](data);
}
