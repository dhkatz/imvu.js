import WebSocket from 'ws';
import { EventEmitter } from 'events';

import { Client } from '../IMVU';
import { ClientMessage } from './Events';

export enum IMQState {
  CLOSED,
  CONNECTING,
  AUTHENTICATING,
  AUTHENTICATED,
  WAITING
}

export class IMQStream extends EventEmitter {
  public socket: WebSocket;
  public client: Client;

  public state: IMQState;

  public constructor(client: Client) {
    super();

    this.state = IMQState.CONNECTING;

    this.client = client;
    this.socket = new WebSocket('wss://imq.imvu.com:444/streaming/imvu_pre');

    const metadata = {
      app: 'imvu_next',
      platform_type: 'big'
    };

    const user_id = String(this.client.user.id);

    const cookie: string = this.client.cookies.toJSON().cookies.find((value) => String(value.key).toLowerCase() === 'oscsid').value;

    this.socket.on('open', () => {
      this.state = IMQState.AUTHENTICATING;
      this.send('msg_c2g_connect', {
        user_id,
        cookie,
        metadata,
      });
    });

    this.socket.on('message', (data: WebSocket.Data) => {
      const message = this.decode(data.toString());

      if (this.state === IMQState.AUTHENTICATING) {

      }
    })
  }

  public encode(message: ClientMessage, data: Record<string, any>): string {
    const encoder = messages[message];
    return JSON.stringify([encoder(data)]);
  }

  public decode(message: string) {
    return decodeURIComponent(global.escape(atob(message)));
  }

  public send(message: ClientMessage, data: Record<string, any>): void {
    this.socket.send(this.encode(message, data));
  }
}

const escape = (value: any) => {
  return Buffer.from(unescape(encodeURIComponent(value))).toString('base64');
};

const messages: Record<string, (...args: any[]) => any> = {
  msg_c2g_send_message: (a: any) => {
    return {
      record: "msg_c2g_send_message",
      queue: a.queueName,
      mount: a.mountName,
      message: escape(a.message)
    }
  },
  msg_c2g_state_change: (a: any) => {
    return {
      record: "msg_c2g_state_change",
      queue: a.queueName,
      mount: a.mountName,
      properties: messages.state_property(a.delta)
    }
  },
  state_property: (a: any[]) => {
    return a.reduce((a, c, b) => {
      a.push({
        record: "state_property",
        key: b,
        value: escape(c)
      });
      return a
    }, [])
  },
  msg_c2g_unsubscribe: function(a) {
    return {
      record: "msg_c2g_unsubscribe",
      queues: a
    }
  },
  msg_c2g_subscribe: function(a) {
    return {
      record: "msg_c2g_subscribe",
      queues: a
    }
  },
  msg_c2g_connect: (a: any) => {
    return {
      record: "msg_c2g_connect",
      user_id: a.user_id,
      cookie: escape(a.cookie),
      metadata: Object.entries(a.metadata).map(([key, value]: [any, any]) => {
        return {
          record: "metadata",
          key,
          value: escape(value)
        }
      })
    }
  },
  msg_c2g_open_floodgates: (a: any) => {
    return {
      record: "msg_c2g_open_floodgates"
    }
  },
  msg_c2g_ping: (a: any) => {
    return {
      record: "msg_c2g_ping"
    }
  }
};

// const responses = {
//   msg_g2c_result: (a) => {
//     return {
//       opId: a.op_id,
//       error: 0 === a.status ? null : a.error_message
//     };
//   },
//   msg_g2c_joined_queue: function(a) {
//     return { queueName: a.queue, userId: a.user_id };
//   },
//   msg_g2c_left_queue: function(a) {
//     return { queueName: a.queue, userId: a.user_id };
//   },
//   msg_g2c_create_mount: function(a) {
//     var b = { 1: "message", 2: "state" }[a.type],
//       d = {};
//     if ("undefined" === typeof b)
//       throw new c("Mount created of unknown type: " + a.type);
//     d.type = b;
//     d.queueName = a.queue;
//     d.mountName = a.mount;
//     "state" === b && (d.state = k._property_list(a.properties));
//     return d;
//   },
//   _property_list: function(a) {
//     return _(a).reduce(function(a, c) {
//       var d = b(c);
//       a[d.data.key] = d.data.value;
//       return a;
//     }, {});
//   },
//   state_property: function(a) {
//     return { key: a.key, value: h(a.value) };
//   },
//   msg_g2c_send_message: function(a) {
//     return {
//       queueName: a.queue,
//       mountName: a.mount,
//       userId: h(a.user_id),
//       message: h(a.message)
//     };
//   },
//   msg_g2c_state_change: function(a) {
//     return {
//       queueName: a.queue,
//       mountName: a.mount,
//       userId: a.user_id,
//       delta: k._property_list(a.properties)
//     };
//   },
//   msg_g2c_pong: (message: any) => {
//     return {};
//   }
// };
