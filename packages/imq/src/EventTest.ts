type FooEvent = {
  event: 'foo';
  data: string;
};

type BarEvent = {
  event: 'bar';
  data: number;
};

type BazEvent = {
  event: 'baz';
  data: string;
  timestamp: number;
};

// ...

type Events = FooEvent | BarEvent | BazEvent; // ...

type EventNameToType<
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

const eventHandlers: EventHandlers<Events, 'event'> = {
  foo: (event) => event, // EventNameToType<Events, 'event', 'foo'> = FooEvent
  bar: (event) => event, // EventNameToType<Events, 'event', 'bar'> = BarEvent
  baz: (event) => event, // EventNameToType<Events, 'event', 'baz'> = BazEvent
  // ...
};

const handleEvent = <K extends Events['event']>(
  name: K,
  event: EventNameToType<Events, 'event', K>
): EventNameToType<Events, 'event', K> => {
  const handler = eventHandlers[name]; //  EventHandler<Events, "event", "foo"> | EventHandler<Events, "event", "bar"> | EventHandler<Events, "event", "baz">

  /*
    TS2345: Argument of type 'Events' is not assignable to parameter of type 'never'.
    The intersection 'FooEvent & BarEvent & BazEvent' was reduced to 'never' because property 'event' has conflicting types in some constituents.
    Type 'FooEvent' is not assignable to type 'never'.
   */
  return handler(event); // We know that this should work, but TS is not smart enough to figure it out?
};
