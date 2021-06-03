import {EventEmitter} from "events";
import {IMQManager, JoinedQueueEvent, LeftQueueEvent, StateChangedEvent} from "@/client";

export class IMQQueue extends EventEmitter {
  public subscribers: Record<string, Set<(data: any) => void>> = {};

  public constructor(public manager: IMQManager) {
    super();

    manager.on('subscriber_joined', this.onSubscriberJoined.bind(this));
    manager.on('subscriber_left', this.onSubscriberLeft.bind(this));
  }

  public notify(): void {

  }

  private onMessage(): void {

  }

  public onStateChanged(event: StateChangedEvent): void {

  }

  public onSubscriberJoined(event: JoinedQueueEvent): void {

  }

  public onSubscriberLeft(event: LeftQueueEvent): void {

  }
}
