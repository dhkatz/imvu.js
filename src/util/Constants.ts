export enum Status {
  DISCONNECTED,
  CONNECTING,
  AUTHENTICATING,
  READY,
  IDLE
}

export const API = {
  AVATAR: '/avatar',
  USER: '/user',
  PRODUCT: '/product',
  GET_MATCHED: '/get_matched',
  HOLIDAYS: '/holidays',
  SHOUTOUT: '/shoutout',
};

export const Subscriptions = [
  'inv:/user/user-%d',
  'private:/user/user-%d',
  '/user/%d',
  'inv:/profile/%d',
];
