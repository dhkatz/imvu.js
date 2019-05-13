export interface IMQEvent {
  record: string;
}

export interface Metadata extends IMQEvent { record: 'metadata'; key: string; value: string; }

export interface StateProperty extends IMQEvent { record: 'state_property'; key: string; value: string; }
