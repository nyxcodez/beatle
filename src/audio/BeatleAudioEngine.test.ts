import { beforeEach, describe, expect, it, vi } from "vitest";
import { BeatleAudioEngine } from "./BeatleAudioEngine";
import type { RhythmPattern } from "../lib/types";

const tone = vi.hoisted(() => {
  type Event = {
    callback: (time: number) => void;
    interval?: string;
    start: number;
    duration?: number;
  };
  const events = new Map<number, Event>();
  let nextId = 0;
  const transport = {
    bpm: { value: 120 },
    seconds: 0,
    scheduleOnce: vi.fn((callback: Event["callback"], start: number) => {
      const id = nextId++;
      events.set(id, { callback, start });
      return id;
    }),
    scheduleRepeat: vi.fn(
      (
        callback: Event["callback"],
        interval: string,
        start: number,
        duration?: number,
      ) => {
        const id = nextId++;
        events.set(id, { callback, interval, start, duration });
        return id;
      },
    ),
    clear: vi.fn((id: number) => events.delete(id)),
    start: vi.fn(),
    stop: vi.fn(),
  };
  class AudioNode {
    connect() {
      return this;
    }
    toDestination() {
      return this;
    }
    triggerAttackRelease = vi.fn();
    triggerRelease = vi.fn();
    dispose = vi.fn();
  }
  return {
    AudioNode,
    transport,
    events,
    start: vi.fn(async () => {}),
    draw: { schedule: vi.fn((callback: () => void) => callback()) },
  };
});

vi.mock("tone", () => ({
  start: tone.start,
  now: () => 1,
  getTransport: () => tone.transport,
  getDraw: () => tone.draw,
  Gain: tone.AudioNode,
  Limiter: tone.AudioNode,
  Compressor: tone.AudioNode,
  Filter: tone.AudioNode,
  MembraneSynth: tone.AudioNode,
  NoiseSynth: tone.AudioNode,
  Synth: tone.AudioNode,
}));

const pattern: RhythmPattern = {
  kick: Array<boolean>(16).fill(true),
  snare: Array<boolean>(16).fill(false),
  hihat: Array<boolean>(16).fill(false),
};

beforeEach(() => {
  vi.clearAllMocks();
  tone.events.clear();
  tone.start.mockResolvedValue();
});

describe("BeatleAudioEngine", () => {
  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid loop count %s before initializing audio",
    async (maxLoops) => {
      const engine = new BeatleAudioEngine();
      await expect(engine.play(pattern, 120, { maxLoops })).rejects.toThrow(
        "positive integer",
      );
      expect(tone.start).not.toHaveBeenCalled();
    },
  );

  it("counts whole loops at their ends and never schedules a seventh loop's notes", async () => {
    const engine = new BeatleAudioEngine();
    const steps: number[] = [];
    const loops: number[] = [];
    const complete = vi.fn();
    await engine.play(pattern, 120, {
      maxLoops: 6,
      countIn: false,
      onStep: (step) => steps.push(step),
      onLoopComplete: (loop) => loops.push(loop),
      onComplete: complete,
    });
    const stepEvent = [...tone.events.values()].find(
      (event) => event.interval === "16n",
    )!;
    const loopEvent = [...tone.events.values()].find(
      (event) => event.interval === "1m",
    )!;
    expect(stepEvent.start).toBe(0);
    expect(stepEvent.duration).toBe(12);
    expect(loopEvent.start).toBe(2);
    for (let loop = 0; loop < 6; loop += 1) {
      for (let step = 0; step < 16; step += 1) {
        stepEvent.callback(loop * 2 + step / 8);
      }
      // A lookahead callback at the seventh bar must not enqueue any notes.
      if (loop === 5) stepEvent.callback(12);
      expect(loops).toHaveLength(loop);
      loopEvent.callback((loop + 1) * 2);
      expect(loops).toEqual(Array.from({ length: loop + 1 }, (_, i) => i + 1));
    }
    expect(steps.filter((step) => step >= 0)).toHaveLength(96);
    expect(steps.at(-1)).toBe(-1);
    expect(complete).toHaveBeenCalledOnce();
    expect(tone.events.size).toBe(0);
    // Even callbacks already queued before stop cannot update a later round.
    stepEvent.callback(13);
    loopEvent.callback(14);
    expect(complete).toHaveBeenCalledOnce();
    expect(loops).toHaveLength(6);
  });

  it("skips the count-in for own playback and leaves it enabled by default", async () => {
    const engine = new BeatleAudioEngine();
    const countIn = vi.fn();
    await engine.play(pattern, 120, { countIn: false, onCountIn: countIn });
    expect(tone.transport.scheduleOnce).not.toHaveBeenCalled();
    const stepEvent = [...tone.events.values()].find(
      (event) => event.interval === "16n",
    )!;
    expect(stepEvent.start).toBe(0);
    expect(countIn).not.toHaveBeenCalled();
    stepEvent.callback(1);
    expect(countIn).toHaveBeenCalledWith(null);

    await engine.play(pattern, 120);
    expect(tone.transport.scheduleOnce).toHaveBeenCalledTimes(4);
    const targetStep = [...tone.events.values()].find(
      (event) => event.interval === "16n",
    )!;
    expect(targetStep.start).toBe(2);
  });

  it("does not complete a partially played loop when stopped", async () => {
    const engine = new BeatleAudioEngine();
    const onLoopComplete = vi.fn();
    const onComplete = vi.fn();
    await engine.play(pattern, 120, {
      maxLoops: 6,
      onLoopComplete,
      onComplete,
    });
    const callbacks = [...tone.events.values()].map((event) => event.callback);
    engine.stop();
    for (const callback of callbacks) callback(20);
    expect(tone.events.size).toBe(0);
    expect(onLoopComplete).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not start a pending play after stop cancels audio initialization", async () => {
    let resume!: () => void;
    tone.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        }),
    );
    const engine = new BeatleAudioEngine();
    const pending = engine.play(pattern, 120, { maxLoops: 6 });
    engine.stop();
    resume();
    await pending;
    expect(tone.transport.start).not.toHaveBeenCalled();
    expect(tone.events.size).toBe(0);
  });

  it("allows repeated previews even when audio time does not advance", async () => {
    const engine = new BeatleAudioEngine();
    const hit = vi.spyOn(tone.AudioNode.prototype, "connect");
    await Promise.all(
      Array.from({ length: 20 }, () => engine.preview("hihat")),
    );
    const nodes = hit.mock.results.map(
      (result) => result.value as InstanceType<typeof tone.AudioNode>,
    );
    const hats = nodes.filter(
      (node) => node.triggerAttackRelease.mock.calls.length === 20,
    );
    expect(hats).toHaveLength(1);
    const times = hats[0].triggerAttackRelease.mock.calls.map(
      (call) => call[1] as number,
    );
    expect(times[0]).toBe(1);
    expect(times.every((time, i) => i === 0 || time > times[i - 1])).toBe(true);
    hit.mockRestore();
  });
});
