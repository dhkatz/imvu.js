import { IMQEvent } from './Events';

export interface GatewayEvent extends IMQEvent {
  record: 'msg_g2c_result' | 'msg_g2c_joined_queue' | 'msg_g2c_left_queue' | 'msg_g2c_create_mount' | 'msg_g2c_send_message' | 'msg_g2c_state_change' | 'msg_g2c_pong';
}
