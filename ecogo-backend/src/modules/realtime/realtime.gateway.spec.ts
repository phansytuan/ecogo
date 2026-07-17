import { Socket } from "socket.io";
import { RealtimeGateway } from "./realtime.gateway";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RIDE_ID = "22222222-2222-4222-8222-222222222222";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";

function socket() {
  return {
    data: { user: { id: USER_ID, roles: ["driver"] } },
    join: jest.fn(),
    leave: jest.fn(),
  } as unknown as Socket;
}

describe("RealtimeGateway authorization", () => {
  const jwt = { verify: jest.fn() };
  const presence = { setLocation: jest.fn() };
  const db = { one: jest.fn() };
  let gateway: RealtimeGateway;
  let emit: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new RealtimeGateway(jwt as never, presence as never, db as never);
    emit = jest.fn();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;
  });

  it("rejects unauthorized ride and chat room joins", async () => {
    const client = socket();
    db.one.mockResolvedValue({ allowed: false });

    await expect(
      gateway.onRideJoin(client, { rideId: RIDE_ID }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    await expect(
      gateway.onChatJoin(client, { bookingId: BOOKING_ID }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("joins authorized ride and chat rooms", async () => {
    const client = socket();
    db.one.mockResolvedValue({ allowed: true });

    await expect(
      gateway.onRideJoin(client, { rideId: RIDE_ID }),
    ).resolves.toEqual({ ok: true });
    await expect(
      gateway.onChatJoin(client, { bookingId: BOOKING_ID }),
    ).resolves.toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith(`ride:${RIDE_ID}`);
    expect(client.join).toHaveBeenCalledWith(`chat:${BOOKING_ID}`);
  });

  it("rejects malformed and unauthorized location updates without fanout", async () => {
    const client = socket();

    await expect(
      gateway.onDriverLocation(client, { rideId: RIDE_ID, lat: 91, lng: 105 }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(db.one).not.toHaveBeenCalled();

    db.one.mockResolvedValue({ allowed: false });
    await expect(
      gateway.onDriverLocation(client, {
        rideId: RIDE_ID,
        lat: 21.02,
        lng: 105.84,
      }),
    ).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(presence.setLocation).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("persists and fans out an authorized driver location", async () => {
    const client = socket();
    db.one.mockResolvedValue({ allowed: true });

    await expect(
      gateway.onDriverLocation(client, {
        rideId: RIDE_ID,
        lat: 21.02,
        lng: 105.84,
        heading: 90,
      }),
    ).resolves.toEqual({ ok: true });

    expect(db.one).toHaveBeenCalledWith(expect.stringContaining("status = ANY"), [
      RIDE_ID,
      USER_ID,
      ["open", "full", "ongoing"],
    ]);

    expect(presence.setLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        driverId: USER_ID,
        lat: 21.02,
        lng: 105.84,
        heading: 90,
      }),
    );
    expect(emit).toHaveBeenCalledWith("ride:location", expect.any(Object));
    expect(emit).toHaveBeenCalledWith("driver:location", expect.any(Object));
  });

  it("leaves valid ride and chat rooms", () => {
    const client = socket();

    expect(gateway.onRideLeave(client, { rideId: RIDE_ID })).toEqual({
      ok: true,
    });
    expect(gateway.onChatLeave(client, { bookingId: BOOKING_ID })).toEqual({
      ok: true,
    });
    expect(client.leave).toHaveBeenCalledWith(`ride:${RIDE_ID}`);
    expect(client.leave).toHaveBeenCalledWith(`chat:${BOOKING_ID}`);
  });
});
